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

import { execFile } from "node:child_process";
import { appendFileSync, chmodSync } from "node:fs";
import path from "node:path";
import type {
  GenerateBundleCliResult,
  GenerateBundleReviewPauseCliResult,
  MutateBundleNodeCliResult,
} from "../../../../../contracts/types/cliOperations.js";
import {
  SENSITIVE_FILE,
  TRANSITION_FILE,
} from "../scenarios/curateSensitiveFile.js";
import type { OperatorLaunchContext } from "../runtime/StandaloneTrialRuntime.js";
import type { AgentAdapter, AgentProfile, AgentTurnResult, TrialPhase } from "../types.js";

interface CommandResult {
  stdout: string;
  stderr: string;
}

export class ScriptedSensitiveCurationAdapter implements AgentAdapter {
  readonly profile: AgentProfile = {
    adapter: "scripted",
    model: "scripted-sensitive-curation-operator",
    reasoningEffort: "none",
    profileVersion: 1,
  };
  readonly version = "scripted-sensitive-curation-adapter-v1";
  private readonly transcriptLines: string[] = [];
  private started = false;

  constructor(private readonly launchContext: () => OperatorLaunchContext) {}

  async start(prompt: string, phase: TrialPhase): Promise<AgentTurnResult> {
    if (this.started) throw new Error("Scripted sensitive-curation adapter already started");
    this.started = true;
    this.transcriptLines.push(`[${phase}] task: ${prompt}`);
    const context = this.launchContext();
    await this.run([
      "bundles", "create", "--source", context.sourceDirectory,
      "--entry", "Notable Mental Models.md",
    ], context);

    await this.run([
      "bundle", "node", "track", "notable-mental-models",
      "--path", SENSITIVE_FILE,
    ], context, 1);
    const sensitiveFirst = this.parse<MutateBundleNodeCliResult>((await this.run([
      "bundle", "node", "track", "notable-mental-models",
      "--path", SENSITIVE_FILE, "--include-sensitive",
    ], context)).stdout);
    await this.run([
      "bundle", "node", "track", "notable-mental-models",
      "--id", sensitiveFirst.node.bundleNodeId!, "--include-sensitive",
    ], context);

    this.simulateExternalSourceEdit(context);
    await this.run([
      "bundle", "node", "track", "notable-mental-models",
      "--id", sensitiveFirst.node.bundleNodeId!, "--include-sensitive",
    ], context);

    const transition = this.parse<MutateBundleNodeCliResult>((await this.run([
      "bundle", "node", "track", "notable-mental-models",
      "--path", TRANSITION_FILE,
    ], context)).stdout);
    await this.run([
      "bundle", "node", "mark-sensitive", "notable-mental-models",
      "--id", transition.node.bundleNodeId!,
    ], context);
    const pause = this.parse<GenerateBundleReviewPauseCliResult>((await this.run([
      "bundle", "generate", "notable-mental-models",
    ], context, 2)).stdout);
    await this.run([
      "bundle", "node", "track", "notable-mental-models",
      "--id", transition.node.bundleNodeId!, "--include-sensitive",
    ], context);
    const generated = this.parse<GenerateBundleCliResult>((await this.run([
      "bundle", "generate", "notable-mental-models",
    ], context)).stdout);

    const message = [
      "Completed sensitive curation for notable-mental-models.",
      `Sensitive node ${sensitiveFirst.node.bundleNodeId}.`,
      `Transition node ${transition.node.bundleNodeId}.`,
      `Resolved ${pause.reviewRequest.reviewRequestId}.`,
      `Generated ${generated.versionId}.`,
    ].join(" ");
    this.transcriptLines.push(`[${phase}] result: ${message}`);
    return { status: "completed", message };
  }

  async continue(prompt: string, phase: TrialPhase): Promise<AgentTurnResult> {
    this.transcriptLines.push(`[${phase}] task: ${prompt}`);
    return {
      status: "completed",
      message: [
        "The structured refusal supplied the exact explicit retry.",
        "The generation pause supplied a stable review request and reaffirmation path.",
        "The same one-node track operation resolved the transition without a browser.",
      ].join(" "),
    };
  }

  async stop(): Promise<void> {}

  terminalTranscript(): string {
    return this.transcriptLines.join("\n");
  }

  private parse<T>(stdout: string): T {
    return JSON.parse(stdout) as T;
  }

  private simulateExternalSourceEdit(context: OperatorLaunchContext): void {
    const sourcePath = path.join(context.sourceDirectory, SENSITIVE_FILE);
    chmodSync(sourcePath, 0o644);
    appendFileSync(sourcePath, "\nExternal source edit after the first inclusion decision.\n", "utf8");
    chmodSync(sourcePath, 0o444);
    this.transcriptLines.push(`[fixture] source editor changed ${SENSITIVE_FILE}`);
  }

  private run(
    args: string[],
    context: OperatorLaunchContext,
    expectedExitCode = 0,
  ): Promise<CommandResult> {
    const executable = path.join(context.commandBinDirectory, "meadow");
    this.transcriptLines.push(`$ meadow ${args.join(" ")}`);
    return new Promise((resolve, reject) => {
      execFile(executable, args, {
        cwd: context.workingDirectory,
        encoding: "utf8",
        env: {
          ...process.env,
          MEADOW_COMMAND_BROKER_SOCKET: context.commandBrokerSocket,
          PATH: `${context.commandBinDirectory}:${process.env.PATH ?? ""}`,
        },
        maxBuffer: 1024 * 1024,
      }, (error, stdout, stderr) => {
        this.transcriptLines.push(stdout.trimEnd());
        if (stderr) this.transcriptLines.push(stderr.trimEnd());
        const actualExitCode = typeof error?.code === "number" ? error.code : 0;
        if (actualExitCode !== expectedExitCode) {
          reject(error ?? new Error(
            `Meadow exited ${actualExitCode}; expected ${expectedExitCode}: ${args.join(" ")}`,
          ));
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }
}
