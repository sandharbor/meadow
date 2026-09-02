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
import {
  appendFileSync,
  closeSync,
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
import { RuntimeSupervisor } from "../../../../../runtime/supervisor/src/runtimeSupervisor.js";
import { getRuntimePaths } from "../../../../../runtime/supervisor/src/runtimePaths.js";
import { createSourceRuntimeLaunchSpec } from "../../../../../runtime/supervisor/src/sourceLaunchSpec.js";
import { MeadowCommandBroker } from "../broker/MeadowCommandBroker.js";
import { evaluateCreateSafeBundle } from "../oracles/createSafeBundleOracle.js";
import { evaluateCurateSpecificNodes } from "../oracles/curateSpecificNodesOracle.js";
import { evaluateCurateSensitiveFile } from "../oracles/curateSensitiveFileOracle.js";
import {
  CREATE_SAFE_BUNDLE_SCENARIO,
  materializeCreateSafeBundleSource,
} from "../scenarios/createSafeBundle.js";
import { SENSITIVE_FILE } from "../scenarios/curateSensitiveFile.js";
import type {
  AgentEvalScenario,
  FrozenOutcome,
  OracleResult,
  TrialPhase,
  TrialRuntime,
  TrialRuntimeExtension,
  TrialRuntimeExtensionContext,
} from "../types.js";

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
  readonly sourceFixture: ReturnType<typeof materializeCreateSafeBundleSource>;
  readonly isolationRoot = mkdtempSync(path.join(os.tmpdir(), "meadow-agent-eval-isolation-"));
  readonly operatorWorkingDirectory = path.join(this.isolationRoot, "operator-workdir");
  readonly brokerRoot = path.join(this.isolationRoot, "broker");
  readonly brokerSocketPath = path.join(this.brokerRoot, "meadow.sock");
  readonly brokerBinDirectory = path.join(this.brokerRoot, "bin");
  private phase: TrialPhase = "autonomous";
  private configDir = "";
  private runtimeSessionPath = "";
  private runtimeSupervisor: RuntimeSupervisor | null = null;
  private broker: MeadowCommandBroker | null = null;
  private stopped = false;
  private sensitiveSourceEditApplied = false;

  constructor(private readonly options: {
    artifactDirectory: string;
    scenario?: AgentEvalScenario;
    backendExtraEnv?: Record<string, string>;
    extension?: TrialRuntimeExtension;
  }) {
    this.sourceFixture = materializeCreateSafeBundleSource({
      readOnly: options.scenario?.id !== "curate-sensitive-file",
    });
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
    const backendLogPath = path.join(this.options.artifactDirectory, "backend.log");
    const backendLogFd = openSync(backendLogPath, "a");
    const appVersion = "0.5.41-agent-eval";
    const perspective = process.env.MEADOW_BUILD_PERSPECTIVE === "composed"
      ? "composed"
      : "standalone";
    const launchSpec = createSourceRuntimeLaunchSpec({
      projectRoot: REPO_ROOT,
      homeDirectory: this.configDir,
      appVersion,
      payloadIdentity: `source-${perspective}-${appVersion}`,
      perspective,
    });
    launchSpec.service.environment = {
      ...launchSpec.service.environment,
      ...this.options.backendExtraEnv,
      ...extensionSetup?.backendEnvironment,
    };
    this.runtimeSupervisor = new RuntimeSupervisor(launchSpec, {
      childStdio: () => ["ignore", backendLogFd, backendLogFd],
      ownershipLogPath: path.join(this.options.artifactDirectory, "meadow.log"),
    });
    this.runtimeSupervisor.leases.acquire("client", `agent-eval-${process.pid}`, process.pid);
    await this.runtimeSupervisor.start();
    closeSync(backendLogFd);
    this.runtimeSessionPath = getRuntimePaths(this.configDir).sessionDescriptor;

    this.broker = new MeadowCommandBroker({
      socketPath: this.brokerSocketPath,
      binDirectory: this.brokerBinDirectory,
      cliExecutable: CLI_EXECUTABLE,
      cliWorkingDirectory: REPO_ROOT,
      runtimeSessionPath: this.runtimeSessionPath,
      phase: () => this.phase,
      afterCommand: command => this.applyScenarioSourceEvent(command),
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
      : this.scenario.id === "curate-sensitive-file"
        ? await evaluateCurateSensitiveFile({ configDir: this.configDir, outcome })
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
    if (this.runtimeSupervisor) {
      this.runtimeSupervisor.leases.release("client", `agent-eval-${process.pid}`);
      await this.runtimeSupervisor.shutdown("requested");
      this.runtimeSupervisor = null;
    }
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

  private applyScenarioSourceEvent(command: FrozenOutcome["commands"][number]): void {
    if (
      this.scenario.id !== "curate-sensitive-file"
      || this.sensitiveSourceEditApplied
      || command.exitCode !== 0
      || !command.args.includes("--include-sensitive")
    ) return;
    try {
      const result = JSON.parse(command.stdout) as {
        operation?: string;
        changed?: boolean;
        node?: { bundleNodeName?: string };
      };
      if (
        result.operation !== "bundle.node.track"
        || result.changed !== false
        || result.node?.bundleNodeName !== path.parse(SENSITIVE_FILE).name
      ) return;
    } catch {
      return;
    }
    appendFileSync(
      path.join(this.sourceFixture.directory, SENSITIVE_FILE),
      "\nExternal source edit after the first inclusion decision.\n",
      "utf8",
    );
    this.sensitiveSourceEditApplied = true;
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
