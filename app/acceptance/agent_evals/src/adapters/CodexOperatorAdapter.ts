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

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OperatorLaunchContext } from "../runtime/StandaloneTrialRuntime.js";
import type { AgentAdapter, AgentProfile, AgentTurnResult, AgentUsage, TrialPhase } from "../types.js";
import { CodexProcess, type CodexSandboxProbe } from "./codexProcess.js";
import { AdapterFailure } from "./scriptedAdapter.js";

interface OperatorResponse {
  status: "completed" | "question" | "gave-up";
  message: string;
}

const OPERATOR_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "message"],
  properties: {
    status: { type: "string", enum: ["completed", "question", "gave-up"] },
    message: { type: "string" },
  },
};

export class CodexOperatorAdapter implements AgentAdapter {
  readonly profile: AgentProfile;
  readonly version = "codex-operator-adapter-v2";
  private process: CodexProcess<OperatorResponse> | null = null;

  constructor(
    profile: AgentProfile,
    private readonly launchContext: () => OperatorLaunchContext,
    private readonly limits: { timeoutMs: number; idleMs: number },
  ) {
    this.profile = profile;
  }

  async start(prompt: string, _phase: TrialPhase): Promise<AgentTurnResult> {
    await this.initializeAndVerify();
    const output = await this.process!.start(prompt);
    return { ...output.value, threadId: output.threadId, usage: output.usage, rawEvents: output.rawEvents };
  }

  /** Deterministic no-model proof that the live operator boundary is enforced. */
  async verifyIsolationOnly(): Promise<void> {
    await this.initializeAndVerify();
  }

  private async initializeAndVerify(): Promise<void> {
    if (this.process) return;
    const context = this.launchContext();
    const runtimeRoot = mkdtempSync(path.join(os.tmpdir(), "meadow-codex-operator-"));
    mkdirSync(context.workingDirectory, { recursive: true });
    writeFileSync(path.join(context.workingDirectory, "AGENTS.md"), [
      "You are the operator in a command-line usability evaluation.",
      "Use only the public `meadow` executable and its own help for Meadow inspection and mutations.",
      "Do not use a GUI, direct HTTP requests, or edit application state. Do not inspect product implementations or tests.",
      "The supplied source graph is read-only. Work autonomously until the requested outcome is complete or a genuine user preference is required.",
      "In your final response, report the bundle identity and every preview or public URL returned by Meadow for the requested work.",
      "Do not reveal credentials, environment values, or internal runtime data.",
      "",
    ].join("\n"), "utf8");
    const pathValue = [context.commandBinDirectory, "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].join(":");
    const filesystemPermissions: Record<string, "read" | "write" | "deny"> = {
      [context.workingDirectory]: "write",
      [context.sourceDirectory]: "read",
      [context.commandBinDirectory]: "read",
      ["/opt/homebrew/bin"]: "read",
      ["/opt/homebrew/opt"]: "read",
      ["/opt/homebrew/Cellar"]: "read",
      ["/opt/homebrew/etc/openssl@3"]: "read",
      [path.dirname(path.dirname(realpathSync(process.execPath)))]: "read",
    };
    for (const forbidden of context.forbiddenReadPaths) filesystemPermissions[forbidden] = "deny";
    for (const forbidden of context.forbiddenWritePaths) {
      if (!(forbidden in filesystemPermissions)) filesystemPermissions[forbidden] = "deny";
    }
    this.process = new CodexProcess<OperatorResponse>({
      runtimeRoot,
      workingDirectory: context.workingDirectory,
      model: this.profile.model,
      reasoningEffort: this.profile.reasoningEffort,
      outputSchema: OPERATOR_OUTPUT_SCHEMA,
      permissionProfileName: "meadow_operator",
      filesystemPermissions,
      unixSocketPaths: [context.commandBrokerSocket],
      shellEnvironment: {
        PATH: pathValue,
        HOME: context.workingDirectory,
        TMPDIR: context.workingDirectory,
        MEADOW_COMMAND_BROKER_SOCKET: context.commandBrokerSocket,
        LANG: "en_US.UTF-8",
      },
      timeoutMs: this.limits.timeoutMs,
      idleMs: this.limits.idleMs,
    });
    await this.verifyConfinement(context);
  }

  async continue(prompt: string, _phase: TrialPhase): Promise<AgentTurnResult> {
    if (!this.process) throw new Error("Codex operator has not started");
    const output = await this.process.resume(prompt);
    return { ...output.value, threadId: output.threadId, usage: output.usage, rawEvents: output.rawEvents };
  }

  async stop(): Promise<void> {
    this.process?.stop();
  }

  terminalTranscript(): string {
    return this.process?.transcript() ?? "";
  }

  usageSummary(): AgentUsage {
    return this.process?.usageSummary() ?? {
      turns: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      maxIdleMs: 0,
    };
  }

  private async verifyConfinement(context: OperatorLaunchContext): Promise<void> {
    if (!this.process) throw new Error("Codex operator process was not initialized");
    const workProbe = path.join(context.workingDirectory, "operator-write-probe");
    const sourceProbe = path.join(context.sourceDirectory, "operator-write-probe");
    const cases: Array<{
      id: string;
      command: string[];
      expectSuccess: boolean;
      stdoutIncludes?: string;
    }> = [
      {
        id: "working-directory-write-allowed",
        command: ["/usr/bin/touch", workProbe],
        expectSuccess: true,
      },
      {
        id: "source-read-allowed",
        command: ["/bin/cat", path.join(context.sourceDirectory, "Notable Mental Models.md")],
        expectSuccess: true,
      },
      {
        id: "source-write-denied",
        command: ["/usr/bin/touch", sourceProbe],
        expectSuccess: false,
      },
      {
        id: "repository-read-denied",
        command: ["/bin/cat", context.repositoryProbePath],
        expectSuccess: false,
      },
      {
        id: "meadow-home-read-denied",
        command: ["/bin/cat", context.homeProbePath],
        expectSuccess: false,
      },
      {
        id: "runtime-capability-read-denied",
        command: ["/bin/cat", context.runtimeSessionPath],
        expectSuccess: false,
      },
      {
        id: "codex-auth-read-denied",
        command: ["/bin/cat", path.join(this.process.codexHome, "auth.json")],
        expectSuccess: false,
      },
      {
        id: "private-backend-tcp-denied",
        command: ["/usr/bin/curl", "--fail", "--max-time", "2", context.privateBackendUrl],
        expectSuccess: false,
      },
      {
        id: "public-meadow-broker-allowed",
        command: [path.join(context.commandBinDirectory, "meadow"), "--help"],
        expectSuccess: true,
        stdoutIncludes: "Usage:\n  meadow",
      },
    ];
    const evidence: Array<CodexSandboxProbe & { id: string; passed: boolean }> = [];
    for (const probeCase of cases) {
      const probe = await this.process.sandboxProbe(probeCase.command);
      const passed = (probe.exitCode === 0) === probeCase.expectSuccess
        && (!probeCase.stdoutIncludes || probe.stdout.includes(probeCase.stdoutIncludes));
      evidence.push({ id: probeCase.id, passed, ...probe });
    }
    rmSync(workProbe, { force: true });
    rmSync(sourceProbe, { force: true });
    writeFileSync(context.isolationEvidencePath, `${JSON.stringify({
      schemaVersion: 1,
      kind: "operator-isolation-verification",
      passed: evidence.every(item => item.passed),
      assertions: evidence,
    }, null, 2)}\n`, "utf8");
    const failed = evidence.filter(item => !item.passed);
    if (failed.length > 0) {
      throw new AdapterFailure(
        "safety-violation",
        `Operator confinement verification failed: ${failed.map(item => item.id).join(", ")}`,
      );
    }
  }
}
