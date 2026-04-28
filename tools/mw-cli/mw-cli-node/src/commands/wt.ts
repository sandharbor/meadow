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

import { existsSync } from "node:fs";
import { runInteractive } from "../lib/exec.js";
import { branchExists, createWorktree, getRepoRoot } from "../lib/git.js";

export function wt(name?: string): void {
  const wtName = name ?? String(Math.floor(Date.now() / 1000));
  const branch = `wt-${wtName}`;
  const wtPath = `/tmp/meadow_wt_${wtName}`;

  // Guards
  if (existsSync(wtPath)) {
    console.error(`Error: Worktree path already exists: ${wtPath}`);
    process.exit(1);
  }

  if (branchExists(branch)) {
    console.error(`Error: Branch already exists: ${branch}`);
    process.exit(1);
  }

  const repoRoot = getRepoRoot();

  console.log(`Creating worktree at ${wtPath} (branch: ${branch})...`);
  createWorktree(wtPath, branch, "HEAD");

  console.log(`Launching claude in ${wtPath}...\n`);
  runInteractive("claude", [], { cwd: wtPath });

  console.log(`\n--- claude exited ---`);
  console.log(`Worktree: ${wtPath}`);
  console.log(`Branch:   ${branch}`);
  console.log(`\nWhen ready to merge, go to ${repoRoot} and run:`);
  console.log(`  mw wt-done`);
}
