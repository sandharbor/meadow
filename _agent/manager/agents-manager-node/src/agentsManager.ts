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

import { writeFileSync, chmodSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { runInteractive, capture } from "./lib/exec.js";
import { discoverAgents } from "./lib/state.js";
import { restoreAgent } from "./lib/agentLifecycle.js";
import * as tmux from "./lib/tmux.js";

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main(): Promise<void> {
  // Check tmux installed
  if (!tmux.isTmuxInstalled()) {
    console.error("Error: tmux is not installed. Install with: brew install tmux");
    process.exit(1);
  }

  // If session exists, prompt to attach
  if (tmux.sessionExists()) {
    const answer = await prompt(`Session '${tmux.sessionName()}' already exists. a) attach  k) kill and start again: `);
    if (answer.toLowerCase() === "a") {
      runInteractive("tmux", ["attach-session", "-t", tmux.sessionName()]);
      return;
    }
    if (answer.toLowerCase() !== "k") {
      console.log("Cancelled.");
      return;
    }
    console.log("Killing existing session...");
    tmux.killSession();
  }

  // Resolve repo root so the sidebar runs in the right cwd
  const repoRoot = capture("git", ["rev-parse", "--show-toplevel"]);

  // Resolve paths for tsx scripts
  const srcDir = fileURLToPath(new URL(".", import.meta.url));
  const sidebarScript = join(srcDir, "sidebar.ts");

  // Create temp bash launcher script
  const tmpDir = mkdtempSync(join(tmpdir(), "mw-agents-"));
  const nodeModulesDir = join(srcDir, "..", "node_modules");
  const tsxBin = join(nodeModulesDir, ".bin", "tsx");

  const sidebarLauncher = join(tmpDir, "sidebar.sh");
  writeFileSync(sidebarLauncher, `#!/usr/bin/env bash\ncd '${repoRoot}'\nexec "${tsxBin}" "${sidebarScript}"\n`);
  chmodSync(sidebarLauncher, 0o755);

  // Create single-pane tmux session running the sidebar
  tmux.newSession(`bash '${sidebarLauncher}'`);

  // Enable mouse support
  tmux.run(`set-option -t ${tmux.sessionName()} -g mouse on`);

  // Restore agents: scan for worktrees missing tmux sessions
  const agents = discoverAgents();
  for (const agent of agents) {
    if (!tmux.agentSessionExists(agent.id)) {
      try {
        restoreAgent(agent);
        console.log(`Restored agent '${agent.id}'`);
      } catch (e) {
        console.error(`Warning: Could not restore agent '${agent.id}': ${String(e)}`);
      }
    }
  }

  // Attach to session
  runInteractive("tmux", ["attach-session", "-t", tmux.sessionName()]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
