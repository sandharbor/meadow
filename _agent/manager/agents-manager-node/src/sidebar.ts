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

import { discoverAgents } from "./lib/state.js";
import { createAgent, deleteAgent, mergeAgent, renameAgent } from "./lib/agentLifecycle.js";
import * as tmux from "./lib/tmux.js";
import * as ansi from "./lib/ansi.js";
import type { Agent } from "./lib/types.js";

let selectedIndex = 0;
let messages: string[] = [];
let renameMode = false;
let renameBuffer = "";
let deleteConfirmId: string | null = null;

const MAX_MESSAGES = 5;

function addMessage(msg: string): void {
  messages.push(msg);
  if (messages.length > MAX_MESSAGES) {
    messages = messages.slice(-MAX_MESSAGES);
  }
}

function getAgents(): Agent[] {
  const agents = discoverAgents();
  // Check session liveness in batch
  const liveSessions = new Set(tmux.listAgentSessions());
  return agents.map((a) => ({
    ...a,
    tmuxSessionName: a.tmuxSessionName && liveSessions.has(a.tmuxSessionName)
      ? a.tmuxSessionName
      : null,
  }));
}

function render(): void {
  const agents = getAgents();
  const rows = process.stdout.rows || 24;
  const cols = process.stdout.columns || 40;

  // Clamp selectedIndex
  const maxIndex = agents.length; // 0 = [new], 1..N = agents
  if (selectedIndex > maxIndex) selectedIndex = maxIndex;

  let output = ansi.CLEAR_SCREEN;
  output += ansi.moveTo(1, 1);
  output += ansi.bold("  Agents");
  output += ansi.moveTo(2, 1);
  output += ansi.dim("\u2500".repeat(cols));

  // [new] entry
  const newSelected = selectedIndex === 0;
  output += ansi.moveTo(3, 1);
  if (newSelected) {
    output += ansi.inverse(ansi.green("  [new]".padEnd(cols)));
  } else {
    output += ansi.green("  [new]");
  }

  // Agent list
  const listEnd = rows - MAX_MESSAGES - 3; // leave room for separator + messages + help
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const row = 4 + i;
    if (row >= listEnd) break;

    const isSelected = selectedIndex === i + 1;
    const phaseTag = agent.phase === "preparing" ? " [Preparing]" : " [Ready]";
    const deadTag = agent.tmuxSessionName === null ? " [Dead]" : "";
    const label = `  ${agent.id}${phaseTag}${deadTag}`;

    output += ansi.moveTo(row, 1);
    if (isSelected) {
      output += ansi.inverse(label.padEnd(cols));
    } else {
      output += label.slice(0, cols);
    }
  }

  // Separator before messages
  const msgStart = rows - MAX_MESSAGES - 2;
  output += ansi.moveTo(msgStart, 1);
  output += ansi.dim("\u2500".repeat(cols));

  // Help line
  output += ansi.moveTo(msgStart + 1, 1);
  if (renameMode) {
    output += ansi.yellow(`  Rename: ${renameBuffer}\u2588`);
  } else {
    output += ansi.dim("  n:new d:del m:merge r:rename ?:help");
  }

  // Messages
  for (let i = 0; i < MAX_MESSAGES; i++) {
    const row = msgStart + 2 + i;
    if (row > rows) break;
    output += ansi.moveTo(row, 1);
    const msg = messages[messages.length - MAX_MESSAGES + i];
    if (msg) {
      output += `  ${msg}`.slice(0, cols);
    }
  }

  process.stdout.write(output);
}

function getSelectedAgent(): Agent | null {
  if (selectedIndex === 0) return null;
  const agents = getAgents();
  const idx = selectedIndex - 1;
  if (idx >= 0 && idx < agents.length) return agents[idx];
  return null;
}

function handleCreateAgent(): void {
  try {
    const agent = createAgent();
    addMessage(`Created ${agent.id}`);
    // Move selection to the new agent
    const agents = getAgents();
    const idx = agents.findIndex((a) => a.id === agent.id);
    if (idx >= 0) selectedIndex = idx + 1;
  } catch (e) {
    addMessage(`Error: ${String(e)}`);
  }
  render();
}

function handleDelete(): void {
  const agent = getSelectedAgent();
  if (!agent) {
    addMessage("No agent selected.");
    render();
    return;
  }

  // Double-press confirmation
  if (deleteConfirmId === agent.id) {
    const result = deleteAgent(agent.id);
    addMessage(result.message);
    deleteConfirmId = null;
    // Adjust selection
    const agents = getAgents();
    if (selectedIndex > agents.length) selectedIndex = agents.length;
  } else {
    deleteConfirmId = agent.id;
    addMessage(`Press d again to confirm delete ${agent.id}`);
  }
  render();
}

function handleMerge(): void {
  const agent = getSelectedAgent();
  if (!agent) {
    addMessage("No agent selected.");
    render();
    return;
  }

  addMessage(`Merging ${agent.id}...`);
  render();

  const result = mergeAgent(agent.id);
  addMessage(result.message);

  // Adjust selection
  const agents = getAgents();
  if (selectedIndex > agents.length) selectedIndex = agents.length;

  render();
}

function handleEnter(): void {
  if (selectedIndex === 0) {
    handleCreateAgent();
    return;
  }

  const agent = getSelectedAgent();
  if (!agent) return;

  if (!agent.tmuxSessionName) {
    addMessage(`${agent.id} session is dead — cannot attach.`);
    render();
    return;
  }

  try {
    tmux.openAgentPane(agent.id);
    addMessage(`Opened ${agent.id}`);
  } catch (e) {
    addMessage(`Error opening: ${String(e)}`);
  }
  render();
}

function showHelp(): void {
  messages = [
    "n:new  d:del  m:merge  r:rename",
    "Enter: show attach cmd  s:status",
    "j/k or arrows: navigate  q:quit",
    "Mouse click to select",
  ];
  render();
}

function showStatus(): void {
  const agent = getSelectedAgent();
  if (!agent) {
    addMessage("No agent selected.");
    render();
    return;
  }
  addMessage(`${agent.id} branch:${agent.branch} phase:${agent.phase}`);
  addMessage(`  wt:${agent.worktreePath}`);
  render();
}

function handleRenameChar(ch: string): void {
  if (ch === "\r" || ch === "\n") {
    // Submit rename
    const agent = getSelectedAgent();
    if (agent && renameBuffer.length > 0) {
      const success = renameAgent(agent.id, renameBuffer);
      if (success) {
        addMessage(`Renamed ${agent.id} to ${renameBuffer}`);
      } else {
        addMessage(`Failed to rename. Name may be in use.`);
      }
    }
    renameMode = false;
    renameBuffer = "";
    render();
    return;
  }

  if (ch === "\x1b" || ch === "\x03") {
    // Escape or Ctrl-C cancels
    renameMode = false;
    renameBuffer = "";
    render();
    return;
  }

  if (ch === "\x7f") {
    // Backspace
    renameBuffer = renameBuffer.slice(0, -1);
    render();
    return;
  }

  // Only accept printable ASCII for names
  if (ch.length === 1 && ch >= " " && ch <= "~") {
    renameBuffer += ch;
    render();
  }
}

// Enable SGR mouse tracking
const ENABLE_MOUSE = "\x1b[?1000h\x1b[?1006h";
const DISABLE_MOUSE = "\x1b[?1000l\x1b[?1006l";

function handleMouseClick(row: number): void {
  const agents = getAgents();
  const maxIndex = agents.length;

  if (row === 3) {
    selectedIndex = 0;
    handleEnter();
  } else if (row >= 4) {
    const agentIdx = row - 4;
    if (agentIdx < agents.length) {
      selectedIndex = Math.min(agentIdx + 1, maxIndex);
      handleEnter();
    }
  }
}

function handleInput(key: Buffer): void {
  const agents = getAgents();
  const maxIndex = agents.length;
  const str = key.toString();

  // If in rename mode, handle differently
  if (renameMode) {
    // Handle special sequences first (escape, enter, backspace)
    if (str === "\x1b" || str === "\x03" || str === "\r" || str === "\n" || str === "\x7f") {
      handleRenameChar(str);
    } else {
      // Iterate over each character to support pasted/multi-char input
      for (const ch of str) {
        handleRenameChar(ch);
        if (!renameMode) break; // Stop if rename was completed/cancelled
      }
    }
    return;
  }

  // Clear delete confirmation on any key that isn't 'd'
  if (str !== "d") {
    deleteConfirmId = null;
  }

  // SGR mouse event
  // eslint-disable-next-line no-control-regex
  const mouseMatch = str.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
  if (mouseMatch) {
    const button = parseInt(mouseMatch[1], 10);
    const row = parseInt(mouseMatch[3], 10);
    const isPress = mouseMatch[4] === "M";
    if (button === 0 && isPress) {
      handleMouseClick(row);
    }
    return;
  }

  // Ctrl-C or q to exit
  if (str === "\x03" || str === "q") {
    process.stdout.write(DISABLE_MOUSE + ansi.SHOW_CURSOR);
    process.exit(0);
  }

  // j or down arrow
  if (str === "j" || str === "\x1b[B") {
    selectedIndex = Math.min(selectedIndex + 1, maxIndex);
    render();
    return;
  }

  // k or up arrow
  if (str === "k" || str === "\x1b[A") {
    selectedIndex = Math.max(selectedIndex - 1, 0);
    render();
    return;
  }

  // Enter or space
  if (str === "\r" || str === "\n" || str === " ") {
    handleEnter();
    return;
  }

  // n - create new agent
  if (str === "n") {
    handleCreateAgent();
    return;
  }

  // d - delete agent
  if (str === "d") {
    handleDelete();
    return;
  }

  // m - merge agent
  if (str === "m") {
    handleMerge();
    return;
  }

  // r - rename agent
  if (str === "r") {
    const agent = getSelectedAgent();
    if (!agent) {
      addMessage("No agent selected.");
      render();
      return;
    }
    renameMode = true;
    renameBuffer = "";
    render();
    return;
  }

  // s - status
  if (str === "s") {
    showStatus();
    return;
  }

  // ? - help
  if (str === "?") {
    showHelp();
    return;
  }
}

function main(): void {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding("utf-8");

  process.stdout.write(ansi.HIDE_CURSOR + ENABLE_MOUSE);

  render();

  // Refresh periodically to pick up phase changes from agents
  const refreshInterval = setInterval(() => {
    try {
      render();
    } catch {
      // Ignore render errors
    }
  }, 2000);

  process.stdin.on("data", (data: Buffer | string) => {
    try {
      const buf = typeof data === "string" ? Buffer.from(data) : data;
      handleInput(buf);
    } catch {
      // Ignore input handling errors
    }
  });

  process.on("SIGINT", () => {
    clearInterval(refreshInterval);
    process.stdout.write(DISABLE_MOUSE + ansi.SHOW_CURSOR);
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    clearInterval(refreshInterval);
    process.stdout.write(DISABLE_MOUSE + ansi.SHOW_CURSOR);
    process.exit(0);
  });
}

main();
