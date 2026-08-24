/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { execFileSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createLocalRuntimeSession,
  MEADOW_RUNTIME_SESSION_ENV,
  removeLocalRuntimeSession,
} from "../../../../../shared_code/utils/localRuntimeSession.js";
import { MeadowCommandBroker } from "../broker/MeadowCommandBroker.js";
import { evaluateCreateSafeBundle } from "../oracles/createSafeBundleOracle.js";
import { evaluateCurateSpecificNodes } from "../oracles/curateSpecificNodesOracle.js";
import {
  CREATE_SAFE_BUNDLE_SCENARIO,
  materializeCreateSafeBundleSource,
} from "../scenarios/createSafeBundle.js";
import type {
  AgentEvalScenario,
  FrozenOutcome,
  OracleResult,
  TrialPhase,
  TrialRuntime,
  TrialRuntimeExtension,
  TrialRuntimeExtensionContext,
} from "../types.js";
import { waitForHttpReady } from "../../run/test-fixtures.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../..");
const BACKEND_DIR = path.join(REPO_ROOT, "app", "runtime", "service");
const CLI_EXECUTABLE = path.join(REPO_ROOT, "app", "clients", "cli", "bin", "meadow");

export interface OperatorLaunchContext {
  workingDirectory: string;
  sourceDirectory: string;
  commandBrokerSocket: string;
  commandBinDirectory: string;
  forbiddenReadPaths: string[];
  forbiddenWritePaths: string[];
  isolationEvidencePath: string;
  privateBackendUrl: string;
  homeProbePath: string;
  runtimeSessionPath: string;
  repositoryProbePath: string;
}

export class StandaloneTrialRuntime implements TrialRuntime {
  readonly sourceFixture = materializeCreateSafeBundleSource({ readOnly: true });
  readonly isolationRoot = mkdtempSync(path.join(os.tmpdir(), "meadow-agent-eval-isolation-"));
  readonly operatorWorkingDirectory = path.join(this.isolationRoot, "operator-workdir");
  readonly brokerRoot = path.join(this.isolationRoot, "broker");
  readonly brokerSocketPath = path.join(this.brokerRoot, "meadow.sock");
  readonly brokerBinDirectory = path.join(this.brokerRoot, "bin");
  private phase: TrialPhase = "autonomous";
  private configDir = "";
  private runtimeSessionPath = "";
  private backendProc: ChildProcess | null = null;
  private broker: MeadowCommandBroker | null = null;
  private stopped = false;

  constructor(private readonly options: {
    artifactDirectory: string;
    scenario?: AgentEvalScenario;
    backendExtraEnv?: Record<string, string>;
    extension?: TrialRuntimeExtension;
  }) {
    mkdirSync(this.operatorWorkingDirectory, { recursive: true, mode: 0o700 });
    mkdirSync(this.options.artifactDirectory, { recursive: true });
  }

  get scenario(): AgentEvalScenario {
    return this.options.scenario ?? CREATE_SAFE_BUNDLE_SCENARIO;
  }

  operatorLaunchContext(): OperatorLaunchContext {
    if (!this.configDir) throw new Error("Trial runtime has not started");
    return {
      workingDirectory: this.operatorWorkingDirectory,
      sourceDirectory: this.sourceFixture.directory,
      commandBrokerSocket: this.brokerSocketPath,
      commandBinDirectory: this.brokerBinDirectory,
      forbiddenReadPaths: [REPO_ROOT, this.configDir, this.runtimeSessionPath],
      forbiddenWritePaths: [this.sourceFixture.directory, REPO_ROOT, this.configDir],
      isolationEvidencePath: path.join(this.options.artifactDirectory, "operator-isolation.json"),
      privateBackendUrl: this.privateBackendUrl(),
      homeProbePath: path.join(this.configDir, "app", "app_config.yaml"),
      runtimeSessionPath: this.runtimeSessionPath,
      repositoryProbePath: path.join(REPO_ROOT, "README.md"),
    };
  }

  async start(): Promise<void> {
    if (this.configDir) throw new Error("Trial runtime already started");
    this.configDir = execFileSync(
      "npx",
      ["tsx", "src/shared/scripts/setup_worktree_resources_config.ts"],
      { cwd: BACKEND_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    const appDir = path.join(this.configDir, "app");
    mkdirSync(appDir, { recursive: true });
    writeFileSync(path.join(appDir, "app_config.yaml"), "version: 1.0.0\n", "utf8");
    const extensionSetup = await this.options.extension?.prepare(this.extensionContext());
    const { session, sessionPath } = await createLocalRuntimeSession({
      homeDirectory: this.configDir,
      ownerPid: process.pid,
    });
    this.runtimeSessionPath = sessionPath;

    const backendLogPath = path.join(this.options.artifactDirectory, "backend.log");
    const backendLogFd = openSync(backendLogPath, "a");
    this.backendProc = spawn(
      process.execPath,
      ["--import", "tsx", "src/shared/app-shell/index.ts"],
      {
        cwd: BACKEND_DIR,
        env: {
          ...process.env,
          MEADOW_HOME_DIRECTORY_OVERRIDE: this.configDir,
          MEADOW_IS_DEV: "true",
          MEADOW_APP_VERSION: "0.5.41-agent-eval",
          [MEADOW_RUNTIME_SESSION_ENV]: this.runtimeSessionPath,
          ...this.options.backendExtraEnv,
          ...extensionSetup?.backendEnvironment,
        },
        stdio: ["ignore", backendLogFd, backendLogFd],
      },
    );
    this.backendProc.on("exit", (code, signal) => {
      appendFileSync(backendLogPath, `backend process exited: code=${String(code)} signal=${String(signal)}\n`);
    });
    await waitForHttpReady(
      session.backendPort,
      "/api/app-config",
      60_000,
      this.backendProc,
      true,
      { "x-meadow-capability": session.capability },
    );

    this.broker = new MeadowCommandBroker({
      socketPath: this.brokerSocketPath,
      binDirectory: this.brokerBinDirectory,
      cliExecutable: CLI_EXECUTABLE,
      cliWorkingDirectory: REPO_ROOT,
      runtimeSessionPath: this.runtimeSessionPath,
      phase: () => this.phase,
    });
    await this.broker.start();
    this.captureFocusedState("pre-task-state");
  }

  async freeze(operatorFinalResponse: string): Promise<FrozenOutcome> {
    this.phase = "frozen";
    const stateSnapshotPath = this.captureFocusedState("frozen-state");
    const generatedEvidencePaths: string[] = [];
    const generateCommand = [...(this.broker?.records ?? [])].reverse().find(command => {
      try {
        return (JSON.parse(command.stdout) as { operation?: string }).operation === "bundle.generate";
      } catch {
        return false;
      }
    });
    if (generateCommand) {
      try {
        const versionId = (JSON.parse(generateCommand.stdout) as { versionId?: string }).versionId;
        const entrySource = versionId
          ? path.join(
            this.configDir,
            "bundles",
            this.scenario.inferredSlug,
            "html",
            "generated_bundle_versions",
            versionId,
            "Notable Mental Models.html",
          )
          : "";
        if (entrySource && existsSync(entrySource)) {
          const evidenceDir = path.join(this.options.artifactDirectory, "generated-evidence");
          mkdirSync(evidenceDir, { recursive: true });
          const entryEvidence = path.join(evidenceDir, "Notable Mental Models.html");
          cpSync(entrySource, entryEvidence);
          generatedEvidencePaths.push(path.relative(this.options.artifactDirectory, entryEvidence));
        }
      } catch {
        // The generation contract oracle reports malformed command output.
      }
    }
    const outcome: FrozenOutcome = {
      capturedAt: new Date().toISOString(),
      operatorFinalResponse,
      commands: [...(this.broker?.records ?? [])],
      stateSnapshotPath: path.relative(this.options.artifactDirectory, stateSnapshotPath),
      generatedEvidencePaths,
    };
    const extensionEvidence = await this.options.extension?.capture?.(
      outcome,
      this.extensionContext(),
    );
    return {
      ...outcome,
      ...(extensionEvidence?.publishedEvidencePaths
        ? { publishedEvidencePaths: extensionEvidence.publishedEvidencePaths }
        : {}),
    };
  }

  async evaluate(outcome: FrozenOutcome): Promise<OracleResult[]> {
    const baseResults = this.scenario.id === "curate-specific-nodes"
      ? await evaluateCurateSpecificNodes({ configDir: this.configDir, outcome })
      : await evaluateCreateSafeBundle({
          scenario: this.scenario,
          configDir: this.configDir,
          sourceDirectory: this.sourceFixture.directory,
          outcome,
          requirePreviewRelay: !this.options.extension,
        });
    const extensionResults = await this.options.extension?.evaluate?.(
      outcome,
      this.extensionContext(),
    ) ?? [];
    return [...baseResults, ...extensionResults];
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    await this.broker?.stop();
    if (this.backendProc?.exitCode === null) {
      this.backendProc.kill("SIGTERM");
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => {
          if (this.backendProc?.exitCode === null) this.backendProc.kill("SIGKILL");
          resolve();
        }, 3_000);
        this.backendProc!.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    if (this.runtimeSessionPath) removeLocalRuntimeSession(this.runtimeSessionPath, process.pid);
    await this.options.extension?.stop();
    if (this.configDir) rmSync(this.configDir, { recursive: true, force: true });
    this.sourceFixture.cleanup();
    rmSync(this.isolationRoot, { recursive: true, force: true });
  }

  private extensionContext(): TrialRuntimeExtensionContext {
    return {
      artifactDirectory: this.options.artifactDirectory,
      homeDirectory: this.configDir,
      sourceDirectory: this.sourceFixture.directory,
      scenario: this.scenario,
    };
  }

  private captureFocusedState(name: string): string {
    const destination = path.join(this.options.artifactDirectory, name);
    rmSync(destination, { recursive: true, force: true });
    mkdirSync(destination, { recursive: true });
    for (const relativePath of ["meadow_home.yaml", "app/global_custom_filters.json", "bundles"]) {
      const source = path.join(this.configDir, relativePath);
      if (!existsSync(source)) continue;
      const target = path.join(destination, relativePath);
      mkdirSync(path.dirname(target), { recursive: true });
      cpSync(source, target, { recursive: true });
    }
    const gitEvidence = {
      status: this.git(["status", "--porcelain", "--untracked-files=all"]),
      head: this.git(["rev-parse", "HEAD"]),
      log: this.git(["log", "--format=%H%x09%s", "-20"]),
      files: this.listFiles(destination),
    };
    writeFileSync(path.join(destination, "git-evidence.json"), `${JSON.stringify(gitEvidence, null, 2)}\n`);
    return destination;
  }

  private privateBackendUrl(): string {
    const contents = JSON.parse(readFileSync(this.runtimeSessionPath, "utf8")) as { backendPort: number };
    return `http://127.0.0.1:${contents.backendPort}/api/app-config`;
  }

  private git(args: string[]): string {
    try {
      return execFileSync("git", args, { cwd: this.configDir, encoding: "utf8" }).trim();
    } catch {
      return "";
    }
  }

  private listFiles(directory: string): string[] {
    const files: string[] = [];
    const visit = (current: string): void => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) visit(entryPath);
        else if (statSync(entryPath).isFile()) files.push(path.relative(directory, entryPath));
      }
    };
    visit(directory);
    return files.sort();
  }
}
