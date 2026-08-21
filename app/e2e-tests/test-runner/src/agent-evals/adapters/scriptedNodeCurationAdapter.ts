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
import type { MutateBundleNodeCliResult } from "../../../../../shared_code/types/cliOperations.js";
import type { OperatorLaunchContext } from "../runtime/StandaloneTrialRuntime.js";
import type { AgentAdapter, AgentProfile, AgentTurnResult, TrialPhase } from "../types.js";

export class ScriptedNodeCurationAdapter implements AgentAdapter {
  readonly profile: AgentProfile = {
    adapter: "scripted",
    model: "scripted-node-curation-operator",
    reasoningEffort: "none",
    profileVersion: 1,
  };
  readonly version = "scripted-node-curation-adapter-v1";
  private readonly transcriptLines: string[] = [];
  private started = false;

  constructor(private readonly launchContext: () => OperatorLaunchContext) {}

  async start(prompt: string, phase: TrialPhase): Promise<AgentTurnResult> {
    if (this.started) throw new Error("Scripted node-curation adapter already started");
    this.started = true;
    this.transcriptLines.push(`[${phase}] task: ${prompt}`);
    const context = this.launchContext();
    await this.run(["bundle", "node", "--help"], context);
    await this.run([
      "bundles", "create", "--source", context.sourceDirectory,
      "--entry", "Notable Mental Models.md",
    ], context);
    const charlie = JSON.parse(await this.run([
      "bundle", "node", "track", "notable-mental-models",
      "--path", "Charlie Munger.md",
    ], context)) as MutateBundleNodeCliResult;
    await this.run([
      "bundle", "node", "blacklist", "notable-mental-models",
      "--id", charlie.node.bundleNodeId!,
    ], context);
    const warren = JSON.parse(await this.run([
      "bundle", "node", "track", "notable-mental-models",
      "--path", "Warren Buffett.md",
    ], context)) as MutateBundleNodeCliResult;
    await this.run([
      "bundle", "node", "set-depths", "notable-mental-models",
      "--id", warren.node.bundleNodeId!, "--outlinks", "1", "--inlinks", "0",
    ], context);
    const message = [
      `Curated notable-mental-models.`,
      `Charlie Munger ${charlie.node.bundleNodeId} is blacklisted.`,
      `Warren Buffett ${warren.node.bundleNodeId} is tracked with outlinks 1 and inlinks 0.`,
    ].join(" ");
    this.transcriptLines.push(`[${phase}] result: ${message}`);
    return { status: "completed", message };
  }

  async continue(prompt: string, phase: TrialPhase): Promise<AgentTurnResult> {
    this.transcriptLines.push(`[${phase}] task: ${prompt}`);
    return {
      status: "completed",
      message: [
        "Choosing paths for initially unconfigured nodes and IDs afterward was the key distinction.",
        "The node help and returned nextActions were useful.",
        "I did not have to guess the depth syntax.",
        "Examples combining track and blacklist would help most.",
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
        if (error) reject(error);
        else resolve(stdout);
      });
    });
  }
}
