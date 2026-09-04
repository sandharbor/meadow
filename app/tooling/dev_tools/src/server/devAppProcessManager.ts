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
import { realpathSync } from "node:fs";

export interface ProcessTableEntry {
  pid: number;
  processGroupId: number;
  command: string;
}

export function parseProcessTable(output: string): ProcessTableEntry[] {
  return output
    .split("\n")
    .map(line => /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(match => ({
      pid: Number(match[1]),
      processGroupId: Number(match[2]),
      command: match[3],
    }));
}

export function findOwnedDevAppProcessGroups(
  entries: ProcessTableEntry[],
  electronAppDirectory: string,
  processCwd: (pid: number) => string | null,
): number[] {
  const targetDirectory = realpathSync(electronAppDirectory);
  return entries
    .filter(entry => (
      entry.pid === entry.processGroupId
      && entry.command.trim() === "npm run electron-dev"
      && processCwd(entry.pid) === targetDirectory
    ))
    .map(entry => entry.processGroupId);
}

function listProcesses(): ProcessTableEntry[] {
  return parseProcessTable(execFileSync("ps", ["-axo", "pid=,pgid=,command="], {
    encoding: "utf8",
  }));
}

function readProcessCwd(pid: number): string | null {
  try {
    const output = execFileSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], {
      encoding: "utf8",
    });
    const cwdLine = output.split("\n").find(line => line.startsWith("n"));
    return cwdLine ? realpathSync(cwdLine.slice(1)) : null;
  } catch {
    return null;
  }
}

function processGroupExists(processGroupId: number): boolean {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    return errorCode(error) !== "ESRCH";
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function signalProcessGroup(
  processGroupId: number,
  signal: Parameters<typeof process.kill>[1],
): void {
  try {
    process.kill(-processGroupId, signal);
  } catch (error) {
    if (errorCode(error) !== "ESRCH") throw error;
  }
}

async function waitForProcessGroupsToExit(processGroupIds: number[], timeoutMs: number): Promise<number[]> {
  const deadline = Date.now() + timeoutMs;
  let running = processGroupIds.filter(processGroupExists);
  while (running.length > 0 && Date.now() < deadline) {
    await new Promise(resolve => globalThis.setTimeout(resolve, 50));
    running = running.filter(processGroupExists);
  }
  return running;
}

export async function stopOwnedDevAppProcesses(electronAppDirectory: string): Promise<number[]> {
  const processGroupIds = findOwnedDevAppProcessGroups(
    listProcesses(),
    electronAppDirectory,
    readProcessCwd,
  );
  if (processGroupIds.length === 0) return [];

  processGroupIds.forEach(processGroupId => signalProcessGroup(processGroupId, "SIGTERM"));
  const stubbornProcessGroups = await waitForProcessGroupsToExit(processGroupIds, 3_000);
  stubbornProcessGroups.forEach(processGroupId => signalProcessGroup(processGroupId, "SIGKILL"));

  const survivingProcessGroups = await waitForProcessGroupsToExit(stubbornProcessGroups, 1_000);
  if (survivingProcessGroups.length > 0) {
    throw new Error(
      `Could not stop existing Meadow dev process groups: ${survivingProcessGroups.join(", ")}`,
    );
  }
  return processGroupIds;
}
