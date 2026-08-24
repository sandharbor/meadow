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
import path from "node:path";
import type {
  GenerateBundleCliResult,
  PublishBundleCliResult,
} from "../../../../../contracts/types/cliOperations.js";
import type { OperatorLaunchContext } from "../runtime/StandaloneTrialRuntime.js";
import type { AgentAdapter, AgentProfile, AgentTurnResult, TrialPhase } from "../types.js";

export class ScriptedCliAdapter implements AgentAdapter {
  readonly profile: AgentProfile = {
    adapter: "scripted",
    model: "scripted-cli-operator",
    reasoningEffort: "none",
    profileVersion: 1,
  };
  readonly version = "scripted-cli-adapter-v1";
  private readonly transcriptLines: string[] = [];
  private started = false;

  constructor(
    private readonly launchContext: () => OperatorLaunchContext,
    private readonly publishing = false,
  ) {}

  async start(prompt: string, phase: TrialPhase): Promise<AgentTurnResult> {
    if (this.started) throw new Error("Scripted CLI adapter already started");
    this.started = true;
    this.transcriptLines.push(`[${phase}] task: ${prompt}`);
    const context = this.launchContext();
    await this.run(["--help"], context);
    await this.run([
      "bundles",
      "create",
      "--source",
      context.sourceDirectory,
      "--entry",
      "Notable Mental Models.md",
    ], context);
    await this.run(["bundle", "track", "notable-mental-models", "--all-safe"], context);
    const generated = JSON.parse(await this.run([
      "bundle",
      "generate",
      "notable-mental-models",
    ], context)) as GenerateBundleCliResult;
    await this.run([
      "bundle",
      "save-generation",
      "notable-mental-models",
      "--version",
      generated.versionId,
    ], context);
    let published: PublishBundleCliResult | null = null;
    if (this.publishing) {
      published = JSON.parse(await this.run([
        "bundle",
        "publish",
        "notable-mental-models",
        "--version",
        generated.versionId,
      ], context)) as PublishBundleCliResult;
    }
    const message = [
      `Created and saved notable-mental-models. Preview: ${generated.previewUrl}`,
      ...(published ? [`Published: ${published.url}`] : []),
    ].join(" ");
    this.transcriptLines.push(`[${phase}] result: ${message}`);
    return { status: "completed", message };
  }

  async continue(prompt: string, phase: TrialPhase): Promise<AgentTurnResult> {
    this.transcriptLines.push(`[${phase}] task: ${prompt}`);
    return {
      status: "completed",
      message: [
        "The distinction between tracking and generation was the hardest part.",
        "The nested help and nextActions output were useful.",
        "I did not have to guess any command flags.",
        "A short explanation of tracked-but-unreachable pages would help most.",
      ].join(" "),
    };
  }

  async stop(): Promise<void> {}

  terminalTranscript(): string {
    return this.transcriptLines.join("\n");
  }

  private run(args: string[], context: OperatorLaunchContext): Promise<string> {
    const executable = path.join(context.commandBinDirectory, "meadow");
    this.transcriptLines.push(`$ meadow ${args.join(" ")}`);
    return new Promise((resolve, reject) => {
      execFile(
        executable,
        args,
        {
          cwd: context.workingDirectory,
          encoding: "utf8",
          env: {
            ...process.env,
            MEADOW_COMMAND_BROKER_SOCKET: context.commandBrokerSocket,
            PATH: `${context.commandBinDirectory}:${process.env.PATH ?? ""}`,
          },
          maxBuffer: 1024 * 1024,
        },
        (error, stdout, stderr) => {
          this.transcriptLines.push(stdout.trimEnd());
          if (stderr) this.transcriptLines.push(stderr.trimEnd());
          if (error) reject(error);
          else resolve(stdout);
        },
      );
    });
  }
}
