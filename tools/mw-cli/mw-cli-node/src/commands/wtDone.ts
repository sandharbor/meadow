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

import * as readline from "node:readline";
import { runInteractive } from "../lib/exec.js";
import {
  abortMerge,
  deleteBranch,
  getCurrentBranch,
  getRepoRoot,
  getWorktreeBranches,
  isCleanWorkingTree,
  mergeBranch,
  removeWorktree,
} from "../lib/git.js";

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function wtDone(): Promise<void> {
  const repoRoot = getRepoRoot();
  process.chdir(repoRoot);

  // Verify on main
  const branch = getCurrentBranch();
  if (branch !== "main") {
    console.error(`Error: Must be on main branch. Currently on: ${branch}`);
    process.exit(1);
  }

  // Verify clean working tree
  if (!isCleanWorkingTree()) {
    console.error("Error: Working tree has uncommitted changes. Commit or stash them first.");
    process.exit(1);
  }

  // Find wt-* branches
  const wtBranches = getWorktreeBranches();
  if (wtBranches.length === 0) {
    console.error("Error: No wt-* branches found. Nothing to merge.");
    process.exit(1);
  }

  let selectedBranch: string;
  if (wtBranches.length === 1) {
    selectedBranch = wtBranches[0];
    console.log(`Found branch: ${selectedBranch}`);
  } else {
    console.log("Multiple wt-* branches found:");
    wtBranches.forEach((b, i) => console.log(`  ${i + 1}) ${b}`));
    const answer = await prompt("Select branch number: ");
    const idx = parseInt(answer, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= wtBranches.length) {
      console.error("Invalid selection.");
      process.exit(1);
    }
    selectedBranch = wtBranches[idx];
  }

  // Merge
  console.log(`\nMerging ${selectedBranch} into main...`);
  const mergeCode = mergeBranch(selectedBranch);

  if (mergeCode !== 0) {
    abortMerge();
    console.error(`\nMerge conflicts detected. Use the /merge skill in claude to resolve:`);
    console.error(`  cd ${repoRoot} && claude`);
    console.error(`  Then type: /merge`);
    process.exit(1);
  }

  // Run checks
  console.log("\nRunning ./quickcheck...");
  const checkCode = runInteractive("./quickcheck", []);

  if (checkCode !== 0) {
    console.error("\n./quickcheck failed. The merge commit is kept so you can fix issues.");
    console.error("After fixing, you can manually clean up:");
    console.error(`  git worktree remove --force /tmp/meadow_wt_${selectedBranch.replace("wt-", "")}`);
    console.error(`  git branch -D ${selectedBranch}`);
    process.exit(1);
  }

  // Clean up: remove worktree + delete branch
  const wtName = selectedBranch.replace("wt-", "");
  const wtPath = `/tmp/meadow_wt_${wtName}`;
  console.log("\nCleaning up...");
  removeWorktree(wtPath);
  deleteBranch(selectedBranch);

  console.log(`\nDone! ${selectedBranch} merged into main and cleaned up.`);
}
