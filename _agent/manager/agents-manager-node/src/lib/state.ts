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

import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import type { Agent } from "./types.js";
import { loadSettings, worktreePrefix } from "./settings.js";

const INFO_DIR = "_agent/agent/.agent_info";

/** Scan worktree directories and read _agent/agent/.agent_info from each. */
export function discoverAgents(): Agent[] {
  const { worktreePathRoot } = loadSettings();
  const wtPrefix = worktreePrefix();
  let entries: string[];
  try {
    entries = readdirSync(worktreePathRoot);
  } catch {
    return [];
  }

  const agents: Agent[] = [];
  for (const entry of entries) {
    if (!entry.startsWith(wtPrefix)) continue;
    const wtPath = join(worktreePathRoot, entry);
    const infoDir = join(wtPath, INFO_DIR);
    if (!existsSync(infoDir)) continue;

    const id = entry.replace(wtPrefix, "");
    const name = readInfoFile(infoDir, "name") ?? id;
    const phase = readInfoFile(infoDir, "phase");
    const tmuxSession = readInfoFile(infoDir, "tmux_session");

    agents.push({
      id: name,
      phase: phase === "preparing" ? "preparing" : "ready",
      branch: `wt-${id}`,
      worktreePath: wtPath,
      tmuxSessionName: tmuxSession ?? null,
    });
  }

  return agents;
}

function readInfoFile(infoDir: string, filename: string): string | null {
  const filePath = join(infoDir, filename);
  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, "utf-8").trim() || null;
  } catch {
    return null;
  }
}

/** Write agent info files into <worktreePath>/_agent/agent/.agent_info/ */
export function writeAgentInfo(
  worktreePath: string,
  info: { name: string; phase: string; tmuxSession: string },
): void {
  const infoDir = join(worktreePath, INFO_DIR);
  mkdirSync(infoDir, { recursive: true });
  writeFileSync(join(infoDir, "name"), info.name + "\n");
  writeFileSync(join(infoDir, "phase"), info.phase + "\n");
  writeFileSync(join(infoDir, "tmux_session"), info.tmuxSession + "\n");
}

/** Update a single info file in the agent's _agent/agent/.agent_info directory. */
export function updateAgentInfoFile(worktreePath: string, filename: string, value: string): void {
  const infoDir = join(worktreePath, INFO_DIR);
  if (!existsSync(infoDir)) {
    mkdirSync(infoDir, { recursive: true });
  }
  writeFileSync(join(infoDir, filename), value + "\n");
}

/** Remove _agent/agent/.agent_info directory from a worktree. */
export function removeAgentInfo(worktreePath: string): void {
  const infoDir = join(worktreePath, INFO_DIR);
  if (existsSync(infoDir)) {
    rmSync(infoDir, { recursive: true, force: true });
  }
}

/** Derive the worktree directory name (agent key) from a worktree path. */
export function worktreeKey(wtPath: string): string {
  return basename(wtPath).replace(worktreePrefix(), "");
}
