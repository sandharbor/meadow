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
import type { SourcingReview } from "../../../../../contracts/types/sourcing.js";
import type {
  GenerateBundleCliResult,
} from "../../../../../contracts/types/cliOperations.js";
import {
  SENSITIVE_FILE,
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
  readonly version = "scripted-sensitive-curation-adapter-v3";
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

    await this.run(["bundle", "track", "notable-mental-models", "--all-safe"], context);
    await this.includePrivateNote(context);
    return this.generate(context);
  }

  async continue(prompt: string, phase: TrialPhase): Promise<AgentTurnResult> {
    this.transcriptLines.push(`[${phase}] task: ${prompt}`);
    if (phase !== "autonomous") {
      return { status: "completed", message: "Source review connects edits to site updates." };
    }
    const context = this.launchContext();
    await this.acceptSourceUpdate(context);
    await this.includePrivateNote(context);
    return this.generate(context);
  }

  private async includePrivateNote(context: OperatorLaunchContext): Promise<void> {
    await this.run([
      "bundle", "node", "track", "notable-mental-models",
      "--path", SENSITIVE_FILE, "--include-sensitive",
    ], context);
  }

  private async generate(context: OperatorLaunchContext): Promise<AgentTurnResult> {
    const generated = this.parse<GenerateBundleCliResult>((await this.run([
      "bundle", "generate", "notable-mental-models",
    ], context)).stdout);
    const message = `Here is the local site: ${generated.previewUrl}`;
    this.transcriptLines.push(message);
    return { status: "completed", message };
  }

  async stop(): Promise<void> {}

  terminalTranscript(): string {
    return this.transcriptLines.join("\n");
  }

  private parse<T>(stdout: string): T {
    return JSON.parse(stdout) as T;
  }

  private async acceptSourceUpdate(context: OperatorLaunchContext): Promise<void> {
    const review = this.parse<SourcingReview>((await this.run([
      "bundle", "sources", "refresh", "notable-mental-models",
    ], context)).stdout);
    if (!review.candidate) throw new Error("Expected a source update to accept");
    await this.run([
      "bundle", "sources", "accept", "notable-mental-models",
      "--snapshot", review.candidate.id, "--review-token", review.reviewToken,
    ], context);
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
