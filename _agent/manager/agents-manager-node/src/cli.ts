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
import { createAgent, deleteAgent, renameAgent } from "./lib/agentLifecycle.js";
import { discoverAgents } from "./lib/state.js";

function usage(): void {
  console.log(`Usage:
  cli create [--name <name>] [--task-file <path>]
  cli delete <agent-name>
  cli list

Commands:
  create       Create a new agent worktree
    --name       Rename the agent from its random default
    --task-file  Path to a file containing the task description to hand off
  delete       Delete an agent (kills session, removes worktree and branch)
  list         List all agents and their status
`);
  process.exit(1);
}

function parseArg(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return null;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();

  const command = args[0];

  if (command === "create") {
    const desiredName = parseArg(args, "--name");
    const taskFile = parseArg(args, "--task-file");

    let task: string | undefined;
    if (taskFile) {
      task = readFileSync(taskFile, "utf-8");
    }

    const agent = createAgent(task);
    console.log(`Created agent: ${agent.id}`);
    console.log(`  Branch: ${agent.branch}`);
    console.log(`  Worktree: ${agent.worktreePath}`);

    if (desiredName && desiredName !== agent.id) {
      const success = renameAgent(agent.id, desiredName);
      if (success) {
        console.log(`  Renamed to: ${desiredName}`);
      } else {
        console.error(`  Warning: Could not rename to '${desiredName}' (name may be in use)`);
      }
    }
  } else if (command === "delete") {
    const agentName = args[1];
    if (!agentName) {
      console.error("Error: agent name required");
      usage();
      return;
    }
    const result = deleteAgent(agentName);
    console.log(result.message);
    if (!result.success) process.exit(1);
  } else if (command === "list") {
    const agents = discoverAgents();
    if (agents.length === 0) {
      console.log("No agents found.");
    } else {
      for (const agent of agents) {
        console.log(`${agent.id}  phase:${agent.phase}  branch:${agent.branch}  wt:${agent.worktreePath}`);
      }
    }
  } else {
    console.error(`Unknown command: ${command}`);
    usage();
  }
}

main();
