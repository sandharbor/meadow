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

import * as pty from "node-pty";
import { AdapterFailure } from "./scriptedAdapter.js";

export interface DirectPtyResult {
  rawTranscript: string;
  exitCode: number;
  durationMs: number;
  maxIdleMs: number;
}

/** Run a command with one owned pseudoterminal as the authoritative byte stream. */
export class DirectPtyProcess {
  async run(options: {
    executable: string;
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
    idleMs: number;
  }): Promise<DirectPtyResult> {
    const startedAt = Date.now();
    const child = pty.spawn(options.executable, options.args, {
      name: "xterm-256color",
      cols: 160,
      rows: 40,
      cwd: options.cwd,
      env: options.env as Record<string, string>,
    });
    let rawTranscript = "";
    let lastActivityAt = startedAt;
    let maxIdleMs = 0;
    let timedOut: "timeout" | "idle" | null = null;
    let idleTimer: NodeJS.Timeout | undefined;
    const resetIdle = (): void => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        timedOut = "idle";
        child.kill("SIGTERM");
      }, options.idleMs);
    };
    resetIdle();
    const timeoutTimer = setTimeout(() => {
      timedOut = "timeout";
      child.kill("SIGTERM");
    }, options.timeoutMs);
    const capture = (chunk: string): void => {
      const activityAt = Date.now();
      maxIdleMs = Math.max(maxIdleMs, activityAt - lastActivityAt);
      lastActivityAt = activityAt;
      rawTranscript += chunk;
      resetIdle();
    };
    child.onData(capture);
    const result = await new Promise<{ exitCode: number; signal?: number }>(resolve => {
      child.onExit(({ exitCode, signal }) => resolve({ exitCode, signal }));
    });
    if (idleTimer) clearTimeout(idleTimer);
    clearTimeout(timeoutTimer);
    if (timedOut) {
      throw new AdapterFailure(
        "timeout",
        timedOut === "idle"
          ? `Codex PTY was idle for ${options.idleMs}ms`
          : `Codex PTY exceeded ${options.timeoutMs}ms`,
        rawTranscript,
      );
    }
    const exitCode = result.exitCode;
    if (exitCode !== 0) {
      throw new AdapterFailure(
        "crash",
        `Codex PTY exited with code ${exitCode}${result.signal ? ` (signal ${result.signal})` : ""}`,
        rawTranscript,
      );
    }
    maxIdleMs = Math.max(maxIdleMs, Date.now() - lastActivityAt);
    return { rawTranscript, exitCode, durationMs: Date.now() - startedAt, maxIdleMs };
  }
}
