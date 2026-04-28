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

import { join } from "node:path";
import { existsSync } from "node:fs";
import { runInteractive } from "./lib/exec.js";
import { MEADOW_HOME_DIR, MEADOW_LOGS_DIR } from "./lib/paths.js";
import { wt } from "./commands/wt.js";
import { wtDone } from "./commands/wtDone.js";
import { gitDashboard } from "./commands/gitDashboard.js";
import { agents } from "./commands/agents.js";

const EDITOR = process.env.EDITOR ?? "open";

function showHelp(): void {
  console.log(`mw - Meadow developer tooling CLI

Usage: mw <command>

Commands:
  h       Change to MeadowHome directory
  l       Change to Meadow logs directory
  tl      Tail the meadow.log file
  ac      Open app_config.yaml in default editor
  a       Agents manager (tmux multi-agent workspace)
  g       Git status dashboard (tmux 3-column view)
  wt      Create worktree + launch claude  [mw wt <name>]
  wt-done Merge worktree branch into main + cleanup
  help    Show this help message
`);
}

function cmdH(): void {
  process.chdir(MEADOW_HOME_DIR);
  runInteractive("zsh", ["-l"]);
}

function cmdL(): void {
  process.chdir(MEADOW_LOGS_DIR);
  runInteractive("zsh", ["-l"]);
}

function cmdTl(): void {
  process.chdir(MEADOW_LOGS_DIR);
  runInteractive("ls", ["-l"]);
  console.log("---");
  runInteractive("tail", ["-f", "meadow.log"]);
}

function cmdAc(): void {
  const configPath = join(MEADOW_HOME_DIR, "app", "app_config.yaml");
  if (!existsSync(configPath)) {
    console.error(`Error: app_config.yaml not found at ${configPath}`);
    process.exit(1);
  }
  runInteractive(EDITOR, [configPath]);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0] ?? "help";

  switch (cmd) {
    case "h":
      cmdH();
      break;
    case "l":
      cmdL();
      break;
    case "tl":
      cmdTl();
      break;
    case "ac":
      cmdAc();
      break;
    case "a":
      agents();
      break;
    case "g":
      gitDashboard();
      break;
    case "wt":
      wt(args[1]);
      break;
    case "wt-done":
      await wtDone();
      break;
    case "help":
    case "--help":
    case "-h":
      showHelp();
      break;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      showHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
