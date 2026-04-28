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

import { shell, shellSafe } from "./exec.js";
import { managerSessionName, agentSessionPrefix } from "./settings.js";

export function sessionName(): string {
  return managerSessionName();
}

export function isTmuxInstalled(): boolean {
  return shellSafe("command -v tmux") !== null;
}

export function sessionExists(): boolean {
  return shellSafe(`tmux has-session -t ${sessionName()} 2>/dev/null`) !== null;
}

export function killSession(): void {
  shellSafe(`tmux kill-session -t ${sessionName()}`);
}

export function newSession(cmd: string): void {
  shell(`tmux new-session -d -s ${sessionName()} "${cmd}"`);
}

export function sendKeys(target: string, keys: string): void {
  shell(`tmux send-keys -t '${target}' ${keys}`);
}

export function attachSession(): void {
  // This needs to be interactive - handled by caller via runInteractive
}

/** Run an arbitrary tmux command. */
export function run(cmd: string): string {
  return shell(`tmux ${cmd}`);
}

// --- Agent session helpers ---

export function agentSessionName(id: string): string {
  return `${agentSessionPrefix()}${id}`;
}

export function newAgentSession(id: string, cmd: string): void {
  const name = agentSessionName(id);
  shell(`tmux new-session -d -s '${name}' "${cmd}"`);
}

export function agentSessionExists(id: string): boolean {
  const name = agentSessionName(id);
  return shellSafe(`tmux has-session -t '${name}' 2>/dev/null`) !== null;
}

export function killAgentSession(id: string): void {
  const name = agentSessionName(id);
  shellSafe(`tmux kill-session -t '${name}'`);
}

export function listAgentSessions(): string[] {
  const result = shellSafe(`tmux list-sessions -F '#{session_name}' 2>/dev/null`);
  if (!result) return [];
  const prefix = agentSessionPrefix();
  return result
    .split("\n")
    .filter((s) => s.startsWith(prefix));
}

export function renameSession(oldName: string, newName: string): void {
  shell(`tmux rename-session -t '${oldName}' '${newName}'`);
}

/** Kill the right-hand pane (pane 1) of the sidebar session if it exists. */
export function killAgentPane(): void {
  shellSafe(`tmux kill-pane -t ${sessionName()}:0.1`);
}

/** Open an agent's session in a right-hand split pane of the sidebar. */
export function openAgentPane(agentId: string): void {
  const name = agentSessionName(agentId);
  // Kill existing right pane if any
  killAgentPane();
  // Split horizontally and attach to the agent's tmux session in the new pane
  shell(`tmux split-window -h -t ${sessionName()}:0.0 "TMUX='' tmux attach -t '${name}'"`)
  // Resize sidebar to be narrower (30 cols)
  shellSafe(`tmux resize-pane -t ${sessionName()}:0.0 -x 30`);
}
