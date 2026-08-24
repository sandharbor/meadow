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

import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentUsage } from "../types.js";
import { AdapterFailure } from "./scriptedAdapter.js";
import { DirectPtyProcess, type DirectPtyResult } from "./DirectPtyProcess.js";

export interface CodexTurnOutput<T> {
  value: T;
  threadId: string;
  rawTranscript: string;
  rawEvents: unknown[];
  usage?: { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number };
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

export function tomlInlineStringMap(entries: Record<string, string>): string {
  return `{${Object.entries(entries).map(([key, value]) => `${tomlString(key)}=${tomlString(value)}`).join(",")}}`;
}

export interface CodexSandboxProbe {
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
}

function parseJsonl(raw: string): unknown[] {
  const events: unknown[] = [];
  const normalized = raw.replace(/\r/g, "").replace(/\^D\x08\x08/g, "");
  for (const line of normalized.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      // Raw terminal bytes remain available even if a diagnostic line is not JSON.
    }
  }
  return events;
}

function eventType(event: unknown): string | undefined {
  return event && typeof event === "object" && "type" in event
    ? String((event as { type?: unknown }).type)
    : undefined;
}

function threadIdFrom(events: unknown[], fallback?: string): string {
  for (const event of events) {
    if (eventType(event) !== "thread.started") continue;
    const value = (event as { thread_id?: unknown }).thread_id;
    if (typeof value === "string") return value;
  }
  if (fallback) return fallback;
  throw new AdapterFailure("malformed-output", "Codex did not report a thread ID");
}

function usageFrom(events: unknown[]): CodexTurnOutput<unknown>["usage"] {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index] as { type?: unknown; usage?: Record<string, unknown> };
    if (event.type !== "turn.completed" || !event.usage) continue;
    return {
      inputTokens: typeof event.usage.input_tokens === "number" ? event.usage.input_tokens : undefined,
      cachedInputTokens: typeof event.usage.cached_input_tokens === "number"
        ? event.usage.cached_input_tokens
        : undefined,
      outputTokens: typeof event.usage.output_tokens === "number" ? event.usage.output_tokens : undefined,
    };
  }
  return undefined;
}

export class CodexProcess<T> {
  static readonly executable = (() => {
    const bundled = path.resolve(import.meta.dirname, "../../../node_modules/.bin/codex");
    return existsSync(bundled)
      ? bundled
      : execFileSync("/usr/bin/which", ["codex"], { encoding: "utf8" }).trim();
  })();
  static readonly cliVersion = execFileSync(CodexProcess.executable, ["--version"], { encoding: "utf8" }).trim();
  readonly codexHome: string;
  readonly outputSchemaPath: string;
  private turnIndex = 0;
  private threadId: string | undefined;
  private readonly pty = new DirectPtyProcess();
  private readonly transcripts: string[] = [];
  private readonly aggregateUsage: AgentUsage = {
    turns: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    maxIdleMs: 0,
  };

  constructor(private readonly options: {
    runtimeRoot: string;
    workingDirectory: string;
    model: string;
    reasoningEffort: string;
    outputSchema: object;
    permissionProfileName: string;
    filesystemPermissions: Record<string, "read" | "write" | "deny">;
    unixSocketPaths?: string[];
    shellEnvironment?: Record<string, string>;
    timeoutMs: number;
    idleMs: number;
  }) {
    this.codexHome = path.join(options.runtimeRoot, "codex-home");
    mkdirSync(this.codexHome, { recursive: true, mode: 0o700 });
    const sourceCodexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    copyFileSync(path.join(sourceCodexHome, "auth.json"), path.join(this.codexHome, "auth.json"));
    this.outputSchemaPath = path.join(options.runtimeRoot, "output-schema.json");
    writeFileSync(this.outputSchemaPath, `${JSON.stringify(options.outputSchema, null, 2)}\n`, "utf8");
  }

  async start(prompt: string): Promise<CodexTurnOutput<T>> {
    if (this.threadId) throw new Error("Codex process already started");
    return this.run(prompt, false);
  }

  async resume(prompt: string): Promise<CodexTurnOutput<T>> {
    if (!this.threadId) throw new Error("Codex process has not started");
    return this.run(prompt, true);
  }

  transcript(): string {
    return this.transcripts.join("\n");
  }

  usageSummary(): AgentUsage {
    return { ...this.aggregateUsage };
  }

  stop(): void {
    rmSync(this.options.runtimeRoot, { recursive: true, force: true });
  }

  async sandboxProbe(command: string[]): Promise<CodexSandboxProbe> {
    const { profile, configArgs } = this.permissionArguments();
    const child = spawn(
      CodexProcess.executable,
      [
        "sandbox",
        ...configArgs,
        "--permissions-profile", profile,
        "--cd", this.options.workingDirectory,
        ...command,
      ],
      {
        cwd: this.options.workingDirectory,
        env: {
          ...this.options.shellEnvironment,
          CODEX_HOME: this.codexHome,
          NO_COLOR: "1",
          TERM: "dumb",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", code => resolve(code ?? 70));
    });
    return {
      command,
      exitCode,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    };
  }

  private async run(prompt: string, resume: boolean): Promise<CodexTurnOutput<T>> {
    this.turnIndex++;
    const lastMessagePath = path.join(this.options.runtimeRoot, `turn-${this.turnIndex}-last-message.json`);
    const { profile, configArgs } = this.permissionArguments();
    const common = [
      "--json",
      "--ignore-user-config",
      "--ignore-rules",
      "--skip-git-repo-check",
      "--output-schema", this.outputSchemaPath,
      "--output-last-message", lastMessagePath,
      "--model", this.options.model,
      ...configArgs,
    ];
    const args = resume
      ? ["exec", "resume", ...common, this.threadId!, prompt]
      : ["exec", ...common, "--cd", this.options.workingDirectory, prompt];
    let ptyResult: DirectPtyResult;
    try {
      ptyResult = await this.pty.run({
        executable: CodexProcess.executable,
        args,
        cwd: this.options.workingDirectory,
        env: {
          ...process.env,
          CODEX_HOME: this.codexHome,
          NO_COLOR: "1",
          TERM: "dumb",
        },
        timeoutMs: this.options.timeoutMs,
        idleMs: this.options.idleMs,
      });
    } catch (error) {
      if (error instanceof AdapterFailure && error.rawTranscript) {
        this.transcripts.push(`--- turn ${this.turnIndex} (failed) ---\n${error.rawTranscript}`);
      }
      throw error;
    }
    this.transcripts.push(`--- turn ${this.turnIndex} ---\n${ptyResult.rawTranscript}`);
    const rawEvents = parseJsonl(ptyResult.rawTranscript);
    this.threadId = threadIdFrom(rawEvents, this.threadId);
    const usage = usageFrom(rawEvents);
    this.aggregateUsage.turns++;
    this.aggregateUsage.inputTokens += usage?.inputTokens ?? 0;
    this.aggregateUsage.cachedInputTokens += usage?.cachedInputTokens ?? 0;
    this.aggregateUsage.outputTokens += usage?.outputTokens ?? 0;
    this.aggregateUsage.maxIdleMs = Math.max(this.aggregateUsage.maxIdleMs, ptyResult.maxIdleMs);
    let value: T;
    try {
      value = JSON.parse(readFileSync(lastMessagePath, "utf8")) as T;
    } catch (error) {
      throw new AdapterFailure(
        "malformed-output",
        `Codex final response did not match the required JSON contract: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return {
      value,
      threadId: this.threadId,
      rawTranscript: ptyResult.rawTranscript,
      rawEvents,
      usage,
    };
  }

  private permissionArguments(): { profile: string; configArgs: string[] } {
    const profile = this.options.permissionProfileName;
    const filesystem = tomlInlineStringMap({
      ":minimal": "read",
      ...this.options.filesystemPermissions,
      [this.codexHome]: "deny",
    });
    const unixSockets = Object.fromEntries(
      (this.options.unixSocketPaths ?? []).map(socketPath => [socketPath, "allow"]),
    );
    const network = `{enabled=true,mode="limited",allow_local_binding=false,domains={"127.0.0.1"="deny","localhost"="deny"},unix_sockets=${tomlInlineStringMap(unixSockets)}}`;
    const configArgs = [
      "-c", `model_reasoning_effort=${tomlString(this.options.reasoningEffort)}`,
      "-c", `approval_policy=${tomlString("never")}`,
      "-c", `default_permissions=${tomlString(profile)}`,
      "-c", `permissions.${profile}.filesystem=${filesystem}`,
      "-c", `permissions.${profile}.network=${network}`,
      "-c", "features.network_proxy=true",
      "-c", "allow_login_shell=false",
      "-c", `shell_environment_policy.inherit=${tomlString("none")}`,
      "-c", `shell_environment_policy.set=${tomlInlineStringMap(this.options.shellEnvironment ?? {})}`,
    ];
    return { profile, configArgs };
  }
}
