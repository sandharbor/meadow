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

import { spawnSync, execSync, type SpawnSyncOptions } from "node:child_process";

/** Run a command interactively (inherits stdio). Returns the exit code. */
export function runInteractive(cmd: string, args: string[], opts?: SpawnSyncOptions): number {
  const result = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  return result.status ?? 1;
}

/** Run a command and capture its stdout. Throws on non-zero exit. */
export function capture(cmd: string, args: string[], opts?: SpawnSyncOptions): string {
  const result = spawnSync(cmd, args, { encoding: "utf-8", ...opts });
  if (result.status !== 0) {
    const stderr = (result.stderr as string | undefined)?.trim() ?? "";
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}\n${stderr}`);
  }
  return ((result.stdout as string | undefined) ?? "").trim();
}

/** Run a shell command via execSync. Throws on failure. */
export function shell(command: string, opts?: { cwd?: string; stdio?: "pipe" | "inherit" | "ignore" }): string {
  return execSync(command, { encoding: "utf-8", stdio: opts?.stdio ?? "pipe", cwd: opts?.cwd }).trim();
}

/** Run a shell command, returning null on failure instead of throwing. */
export function shellSafe(command: string, opts?: { cwd?: string }): string | null {
  try {
    return shell(command, opts);
  } catch {
    return null;
  }
}
