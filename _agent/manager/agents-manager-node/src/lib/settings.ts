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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface Settings {
  agentPrefix: string;
  worktreePathRoot: string;
}

let cached: Settings | null = null;

export function loadSettings(): Settings {
  if (cached) return cached;

  const settingsPath = join(
    fileURLToPath(new URL(".", import.meta.url)),
    "..",
    "..",
    "..",
    "settings.yaml",
  );

  const raw = readFileSync(settingsPath, "utf-8");
  const settings: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    settings[key] = value;
  }

  if (!settings["agentPrefix"]) {
    throw new Error("settings.yaml missing required key: agentPrefix");
  }
  if (!settings["worktreePathRoot"]) {
    throw new Error("settings.yaml missing required key: worktreePathRoot");
  }

  cached = {
    agentPrefix: settings["agentPrefix"],
    worktreePathRoot: settings["worktreePathRoot"],
  };
  return cached;
}

/** e.g. "{prefix}agents" */
export function managerSessionName(): string {
  return `${loadSettings().agentPrefix}agents`;
}

/** e.g. "{prefix}agent_" */
export function agentSessionPrefix(): string {
  return `${loadSettings().agentPrefix}agent_`;
}

/** e.g. "{prefix}wt_" */
export function worktreePrefix(): string {
  return `${loadSettings().agentPrefix}wt_`;
}

/** e.g. "{worktreePathRoot}{prefix}wt_<name>" */
export function worktreePath(name: string): string {
  const s = loadSettings();
  return `${s.worktreePathRoot}${s.agentPrefix}wt_${name}`;
}
