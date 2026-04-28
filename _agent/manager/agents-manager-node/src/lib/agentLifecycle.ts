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

import { existsSync, mkdirSync, writeFileSync, chmodSync, mkdtempSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { capture, shell, shellSafe } from "./exec.js";
import { generateName } from "./names.js";
import { discoverAgents, writeAgentInfo, removeAgentInfo, updateAgentInfoFile } from "./state.js";
import { worktreePath } from "./settings.js";
import * as tmux from "./tmux.js";
import type { Agent } from "./types.js";

function getRepoRoot(): string {
  return capture("git", ["rev-parse", "--show-toplevel"]);
}

function branchExists(name: string): boolean {
  try {
    capture("git", ["rev-parse", "--verify", name]);
    return true;
  } catch {
    return false;
  }
}

/** Copy untracked files that are useful in every worktree. */
function copyImportantUntrackedFiles(repoRoot: string, wtPath: string): void {
  const relativePaths = [
    "docs/tools/source_markdown_path.local",
    "app/e2e-tests/test-runner/export-scenarios-to-docs/living-spec_export_dir.local"
  ];

  for (const rel of relativePaths) {
    const src = join(repoRoot, rel);
    if (existsSync(src)) {
      const dest = join(wtPath, rel);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
    }
  }
}

function getTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "mw-agent-"));
  return dir;
}

export function createAgent(task?: string): Agent {
  const repoRoot = getRepoRoot();
  let name = generateName();

  // Ensure unique name
  const existing = discoverAgents();
  const existingIds = new Set(existing.map((a) => a.id));
  while (existingIds.has(name)) {
    name = generateName();
  }

  const branch = `wt-${name}`;
  const wtPath = worktreePath(name);

  // Guard: worktree path
  if (existsSync(wtPath)) {
    throw new Error(`Worktree path already exists: ${wtPath}`);
  }

  // Guard: branch
  if (branchExists(branch)) {
    throw new Error(`Branch already exists: ${branch}`);
  }

  // Create worktree
  capture("git", ["worktree", "add", wtPath, "-b", branch, "HEAD"], { cwd: repoRoot });

  // Copy useful untracked files into the new worktree
  copyImportantUntrackedFiles(repoRoot, wtPath);

  // Write _agent/agent/.agent_info into the worktree
  const sessionName = tmux.agentSessionName(name);
  writeAgentInfo(wtPath, {
    name,
    phase: "preparing",
    tmuxSession: sessionName,
  });

  // If a task was provided, write it to the messages directory
  const messagesInDir = join(wtPath, "_agent/agent/messages/in");
  if (task) {
    mkdirSync(messagesInDir, { recursive: true });
    writeFileSync(join(messagesInDir, "initial_prompt.txt"), task);
  }

  // Write a launcher script
  const launcherDir = getTmpDir();
  const launcherPath = join(launcherDir, `launch-${name}.sh`);

  const initialPromptFile = join(messagesInDir, "initial_prompt.txt");
  const claudeLaunch = task
    ? `claude --dangerously-skip-permissions "$(cat '${initialPromptFile}')"`
    : `claude --dangerously-skip-permissions`;

  writeFileSync(launcherPath, [
    "#!/usr/bin/env bash",
    `cd '${wtPath}'`,
    `# Mark as preparing`,
    `echo "preparing" > _agent/agent/.agent_info/phase`,
    `# Run headless prepare`,
    `unset CLAUDECODE`,
    `claude -p "run ./prepare from the repo root" --dangerously-skip-permissions`,
    `# Mark as ready`,
    `echo "ready" > _agent/agent/.agent_info/phase`,
    `# Launch claude with task or interactive`,
    claudeLaunch,
    "",
  ].join("\n"));
  chmodSync(launcherPath, 0o755);

  // Create independent tmux session for this agent
  tmux.newAgentSession(name, `bash '${launcherPath}'`);

  const agent: Agent = {
    id: name,
    phase: "preparing",
    branch,
    worktreePath: wtPath,
    tmuxSessionName: sessionName,
  };

  return agent;
}

export function restoreAgent(agent: Agent): Agent {
  // For worktrees that exist but have no tmux session, create the session
  const launcherDir = getTmpDir();
  const launcherPath = join(launcherDir, `restore-${agent.id}.sh`);

  writeFileSync(launcherPath, [
    "#!/usr/bin/env bash",
    `cd '${agent.worktreePath}'`,
    `unset CLAUDECODE`,
    `echo "ready" > _agent/agent/.agent_info/phase`,
    `claude --dangerously-skip-permissions`,
    "",
  ].join("\n"));
  chmodSync(launcherPath, 0o755);

  const sessionName = tmux.agentSessionName(agent.id);
  tmux.newAgentSession(agent.id, `bash '${launcherPath}'`);

  // Update info files
  updateAgentInfoFile(agent.worktreePath, "tmux_session", sessionName);
  updateAgentInfoFile(agent.worktreePath, "phase", "ready");

  return {
    ...agent,
    phase: "ready",
    tmuxSessionName: sessionName,
  };
}

export function archiveAgent(agentId: string): void {
  const agents = discoverAgents();
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) return;

  // Kill agent tmux session
  tmux.killAgentSession(agentId);

  // Remove agent info before removing worktree
  removeAgentInfo(agent.worktreePath);

  // Remove worktree
  shellSafe(`git worktree remove --force '${agent.worktreePath}'`);

  // Delete branch
  shellSafe(`git branch -D '${agent.branch}'`);
}

export interface MergeResult {
  success: boolean;
  message: string;
  checkPassed?: boolean;
}

export function mergeAgent(agentId: string): MergeResult {
  const repoRoot = getRepoRoot();
  const agents = discoverAgents();
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) {
    return { success: false, message: `Agent '${agentId}' not found.` };
  }

  // Send Ctrl-C to the agent's tmux session to stop claude
  const sessionName = tmux.agentSessionName(agentId);
  if (tmux.agentSessionExists(agentId)) {
    tmux.sendKeys(sessionName, "C-c");
    shell("sleep 1");
    tmux.sendKeys(sessionName, "C-c");
    shell("sleep 1");
  }

  // Attempt merge on main
  try {
    shell(`git merge '${agent.branch}' --no-edit`, { cwd: repoRoot });
  } catch {
    shellSafe(`git merge --abort`);
    return {
      success: false,
      message: `Merge conflicts detected merging '${agent.branch}'. Merge aborted.\nResolve manually: cd ${repoRoot} && git merge ${agent.branch}`,
    };
  }

  // Rebuild native utils if the merged branch changed them
  const nativeChanged = shellSafe(`git diff HEAD^1 HEAD --name-only -- app/native_utils/`, { cwd: repoRoot });
  if (nativeChanged && nativeChanged.trim().length > 0) {
    const prepareResult = shellSafe(`./prepare`, { cwd: repoRoot });
    if (prepareResult === null) {
      return {
        success: false,
        checkPassed: false,
        message: `Merge succeeded but ./prepare failed (native utils rebuild). Fix issues then clean up manually.`,
      };
    }
  }

  // Run check
  const checkResult = shellSafe(`./quickcheck`, { cwd: repoRoot });
  if (checkResult === null) {
    return {
      success: false,
      checkPassed: false,
      message: `Merge succeeded but ./quickcheck failed. Merge commit kept. Fix issues then clean up manually.`,
    };
  }

  // Success - clean up
  archiveAgent(agentId);

  return {
    success: true,
    checkPassed: true,
    message: `Successfully merged '${agent.branch}' into main. Worktree and branch cleaned up.`,
  };
}

export function deleteAgent(agentId: string): { success: boolean; message: string } {
  const agents = discoverAgents();
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) {
    return { success: false, message: `Agent '${agentId}' not found.` };
  }

  archiveAgent(agentId);

  return { success: true, message: `Deleted agent '${agentId}'. Worktree and branch cleaned up.` };
}

export function renameAgent(agentId: string, newName: string): boolean {
  const agents = discoverAgents();
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) return false;

  // Check uniqueness
  if (agents.some((a) => a.id === newName)) return false;

  // Update _agent/agent/.agent_info/name in worktree
  updateAgentInfoFile(agent.worktreePath, "name", newName);

  // Rename tmux session
  const oldSessionName = tmux.agentSessionName(agentId);
  const newSessionName = tmux.agentSessionName(newName);
  if (tmux.agentSessionExists(agentId)) {
    tmux.renameSession(oldSessionName, newSessionName);
  }
  updateAgentInfoFile(agent.worktreePath, "tmux_session", newSessionName);

  return true;
}
