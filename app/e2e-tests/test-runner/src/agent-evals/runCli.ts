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
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AgentAdapter,
  ManagingAgent,
  TrialRuntimeExtension,
  TrialRuntimeExtensionModule,
} from "./types.js";
import { CodexManagingAgent, MANAGER_PROMPT_VERSION } from "./adapters/CodexManagingAgent.js";
import { CodexOperatorAdapter } from "./adapters/CodexOperatorAdapter.js";
import { CodexProcess } from "./adapters/codexProcess.js";
import { ScriptedManagingAgent } from "./adapters/scriptedAdapter.js";
import { ScriptedCliAdapter } from "./adapters/scriptedCliAdapter.js";
import { ScriptedNodeCurationAdapter } from "./adapters/scriptedNodeCurationAdapter.js";
import {
  hashFixture,
  writeAgentTrialArtifacts,
} from "./artifacts/writeAgentTrialArtifacts.js";
import { runAgentTrial } from "./runAgentTrial.js";
import {
  CREATE_SAFE_BUNDLE_SCENARIO,
  createSafeBundleAnswerSheet,
  resolveCreateSafeBundleRequest,
} from "./scenarios/createSafeBundle.js";
import {
  CURATE_SPECIFIC_NODES_SCENARIO,
  curateSpecificNodesAnswerSheet,
  resolveCurateSpecificNodesRequest,
} from "./scenarios/curateSpecificNodes.js";
import { StandaloneTrialRuntime } from "./runtime/StandaloneTrialRuntime.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const CLI_DIR = path.join(REPO_ROOT, "app", "cli");
const DEFAULT_ARTIFACT_ROOT = path.join(os.homedir(), "meadow-agent-eval-artifacts", "current");
const PUBLISHING_EXTENSION_ENTRYPOINT = path.resolve(
  import.meta.dirname,
  "../run/meadow-extension/agent-evals/index.ts",
);
type AdapterName = "codex" | "scripted";
type ScenarioName = "create-safe-bundle" | "curate-specific-nodes";

function runId(): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseArgs(args: string[]): {
  trials: number;
  adapter: AdapterName;
  publishing: boolean;
  scenario: ScenarioName;
} {
  let trials = 1;
  let adapter: AdapterName = "codex";
  let publishing = false;
  let scenario: ScenarioName = "create-safe-bundle";
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--trials") {
      trials = Number(args[++index]);
      if (!Number.isInteger(trials) || trials < 1 || trials > 20) {
        throw new Error("--trials must be an integer between 1 and 20");
      }
    } else if (arg === "--adapter") {
      const value = args[++index];
      if (value !== "scripted" && value !== "codex") {
        throw new Error("--adapter must be codex or scripted");
      }
      adapter = value;
    } else if (arg === "--publishing") {
      publishing = true;
    } else if (arg === "--scenario") {
      const value = args[++index];
      if (value !== "create-safe-bundle" && value !== "curate-specific-nodes") {
        throw new Error("--scenario must be create-safe-bundle or curate-specific-nodes");
      }
      scenario = value;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write([
        "Usage: npm run agent-eval -- [--scenario <name>] [--trials <count>] [--adapter codex|scripted] [--publishing]",
        "",
        "Scenarios: create-safe-bundle (default), curate-specific-nodes.",
        "Runs clean, isolated trials and writes portable review artifacts.",
        "One trial is the sanity form; --trials 5 is the acceptance form.",
        "",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (publishing && scenario !== "create-safe-bundle") {
    throw new Error("--publishing is only valid with --scenario create-safe-bundle");
  }
  return { trials, adapter, publishing, scenario };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const scenario = options.scenario === "curate-specific-nodes"
    ? CURATE_SPECIFIC_NODES_SCENARIO
    : CREATE_SAFE_BUNDLE_SCENARIO;
  let publishingExtensionFactory: (() => TrialRuntimeExtension) | undefined;
  if (options.publishing) {
    if (!existsSync(PUBLISHING_EXTENSION_ENTRYPOINT)) {
      throw new Error("The base runner has no composed publishing evaluation extension");
    }
    const extensionModule = await import(
      pathToFileURL(PUBLISHING_EXTENSION_ENTRYPOINT).href
    ) as TrialRuntimeExtensionModule;
    if (typeof extensionModule.createTrialRuntimeExtension !== "function") {
      throw new Error("The publishing evaluation extension has no factory");
    }
    publishingExtensionFactory = extensionModule.createTrialRuntimeExtension;
  }
  execFileSync("npm", ["run", "build"], { cwd: CLI_DIR, stdio: "inherit" });
  const currentRunId = runId();
  const artifactRoot = process.env.MEADOW_AGENT_EVAL_ARTIFACTS || DEFAULT_ARTIFACT_ROOT;
  const runDirectory = path.join(artifactRoot, currentRunId);
  mkdirSync(runDirectory, { recursive: true });
  const results = [];

  for (let trialNumber = 1; trialNumber <= options.trials; trialNumber++) {
    const trialName = `${scenario.id}-trial-${String(trialNumber).padStart(2, "0")}`;
    const trialDirectory = path.join(runDirectory, trialName);
    mkdirSync(trialDirectory, { recursive: true });
    const extension = publishingExtensionFactory?.();
    const runtime = new StandaloneTrialRuntime({
      artifactDirectory: trialDirectory,
      scenario,
      ...(extension ? { extension } : {}),
    });
    const exactRequest = options.scenario === "curate-specific-nodes"
      ? resolveCurateSpecificNodesRequest(runtime.sourceFixture.directory)
      : resolveCreateSafeBundleRequest(runtime.sourceFixture.directory, options.publishing);
    const answerSheet = options.scenario === "curate-specific-nodes"
      ? curateSpecificNodesAnswerSheet(runtime.sourceFixture.directory)
      : createSafeBundleAnswerSheet(runtime.sourceFixture.directory, options.publishing);
    const fixtureSha256 = hashFixture(runtime.sourceFixture.directory);
    let manager: ManagingAgent;
    let operator: AgentAdapter;
    if (options.adapter === "codex") {
      manager = new CodexManagingAgent(scenario.profiles.manager, {
        timeoutMs: scenario.limits.durationMs,
        idleMs: scenario.limits.idleMs,
      });
      operator = new CodexOperatorAdapter(
        scenario.profiles.operator,
        () => runtime.operatorLaunchContext(),
        {
          timeoutMs: scenario.limits.durationMs,
          idleMs: scenario.limits.idleMs,
        },
      );
    } else {
      manager = new ScriptedManagingAgent();
      operator = options.scenario === "curate-specific-nodes"
        ? new ScriptedNodeCurationAdapter(() => runtime.operatorLaunchContext())
        : new ScriptedCliAdapter(() => runtime.operatorLaunchContext(), options.publishing);
    }
    const result = await runAgentTrial({
      scenario,
      exactRequest,
      answerSheet,
      publishing: options.publishing,
      manager,
      operator,
      runtime,
      runId: `${currentRunId}/${trialName}`,
    });
    writeAgentTrialArtifacts({
      artifactDirectory: trialDirectory,
      result,
      exactRequest,
      initialManagerPrompt: manager instanceof CodexManagingAgent
        ? manager.initialManagerPrompt()
        : [
          `Manager prompt version: ${MANAGER_PROMPT_VERSION}`,
          "Deliver the supplied scenario request verbatim. During the scored phase, answer only ordinary-user facts from the answer sheet and do not name commands.",
        ].join("\n"),
      operatorTerminalTranscript: operator.terminalTranscript(),
      managerTerminalTranscript: manager.terminalTranscript?.(),
      fixtureSha256,
      adapterVersions: {
        manager: manager.version,
        operator: operator.version,
        ...(options.adapter === "codex" && { codexCli: CodexProcess.cliVersion }),
        managerPromptVersion: MANAGER_PROMPT_VERSION,
        scenarioPromptVersion: scenario.version,
        ...(extension ? { runtimeExtension: `${extension.id}@${extension.version}` } : {}),
      },
    });
    results.push(result);
    process.stdout.write(`${trialName}: ${result.passed ? "passed" : "failed"} (${result.assistanceClass})\n`);
  }

  const passed = results.filter(result => result.passed).length;
  const required = options.trials === 1 ? 1 : Math.ceil(options.trials * 0.8);
  const summary = {
    schemaVersion: 1,
    kind: "agent-eval-run",
    runId: currentRunId,
    scenario: {
      id: scenario.id,
      version: scenario.version,
      publishing: options.publishing,
    },
    trials: results.length,
    passed,
    required,
    accepted: passed >= required,
    trialResults: results.map(result => ({
      runId: result.runId,
      passed: result.passed,
      assistanceClass: result.assistanceClass,
      terminationReason: result.terminationReason,
      elapsedMs: result.metrics.elapsedMs,
    })),
  };
  writeFileSync(path.join(runDirectory, "run-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  process.stdout.write(`Artifacts: ${runDirectory}\n`);
  process.stdout.write(`Acceptance: ${passed}/${results.length} passed; ${required} required.\n`);
  if (!summary.accepted) process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
