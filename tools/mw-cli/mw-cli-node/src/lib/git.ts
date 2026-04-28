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

import { capture, runInteractive } from "./exec.js";

export function getRepoRoot(): string {
  return capture("git", ["rev-parse", "--show-toplevel"]);
}

export function getCurrentBranch(): string {
  return capture("git", ["branch", "--show-current"]);
}

export function isCleanWorkingTree(): boolean {
  const output = capture("git", ["status", "--porcelain"]);
  return output === "";
}

export function branchExists(name: string): boolean {
  try {
    capture("git", ["rev-parse", "--verify", name]);
    return true;
  } catch {
    return false;
  }
}

export function getWorktreeBranches(): string[] {
  const output = capture("git", ["branch", "--list", "wt-*", "--format=%(refname:short)"]);
  if (output === "") return [];
  return output.split("\n");
}

export function createWorktree(path: string, branch: string, ref: string): void {
  capture("git", ["worktree", "add", path, "-b", branch, ref]);
}

export function removeWorktree(path: string): void {
  try {
    capture("git", ["worktree", "remove", "--force", path]);
  } catch {
    // Worktree dir may already be gone
  }
}

export function deleteBranch(name: string): void {
  capture("git", ["branch", "-D", name]);
}

export function mergeBranch(name: string): number {
  return runInteractive("git", ["merge", name, "--no-edit"]);
}

export function abortMerge(): void {
  try {
    capture("git", ["merge", "--abort"]);
  } catch {
    // May not be in a merge state
  }
}
