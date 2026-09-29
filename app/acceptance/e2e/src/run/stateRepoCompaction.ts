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

// Scenario state repositories are mostly the same fixture content, copied
// into every scenario of a run. These helpers keep each repository fully
// readable through git while storing its objects once per run, in the object
// store the checkpoint repositories already share, instead of as plain files.

import { execFileSync } from "child_process";
import { createHash } from "crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import os from "os";
import path from "path";
import { deflateSync } from "zlib";

const MAX_GIT_OUTPUT = 1024 * 1024 * 1024;

/** Run-level object store, beside the scenario directories. */
export const SHARED_OBJECTS_DIRECTORY = "__checkpoint-objects";

function git(
  args: string[],
  options: { cwd?: string; env?: Record<string, string>; input?: string | Buffer } = {}
): Buffer {
  return execFileSync("git", args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    input: options.input,
    maxBuffer: MAX_GIT_OUTPUT,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function gitText(args: string[], options: Parameters<typeof git>[1] = {}): string {
  return git(args, options).toString("utf8").trim();
}

/**
 * Copy every object in `sourceGitDir` into the shared store (skipping those
 * already there) and point `targetGitDir` at the store through alternates.
 * Unreachable objects are included: artifact refs may name replaced commits.
 */
function shareObjects(sourceGitDir: string, targetGitDir: string, sharedObjectsDirectory: string): void {
  mkdirSync(sharedObjectsDirectory, { recursive: true });
  const ids = git(["--git-dir", sourceGitDir, "cat-file", "--batch-all-objects", "--batch-check=%(objectname)"]);
  if (ids.length > 0) {
    const pack = git(["--git-dir", sourceGitDir, "pack-objects", "--stdout", "-q"], { input: ids });
    // unpack-objects leaves objects the store already holds untouched, so
    // concurrent scenarios share one copy of the fixture.
    git(["--git-dir", targetGitDir, "unpack-objects", "-q"], {
      env: { GIT_OBJECT_DIRECTORY: sharedObjectsDirectory },
      input: pack,
    });
  }
  const objects = path.join(targetGitDir, "objects");
  mkdirSync(path.join(objects, "info"), { recursive: true });
  writeFileSync(path.join(objects, "info", "alternates"), `${path.relative(objects, sharedObjectsDirectory)}\n`);
}

/** Replace a repository's own objects with the run's shared store. */
export function moveObjectsToSharedStore(gitDir: string, sharedObjectsDirectory: string): void {
  shareObjects(gitDir, gitDir, sharedObjectsDirectory);
  const objects = path.join(gitDir, "objects");
  for (const entry of readdirSync(objects)) {
    if (entry !== "info") rmSync(path.join(objects, entry), { recursive: true, force: true });
  }
}

/** Git's id for a blob holding `bytes`. */
export function gitBlobId(bytes: Buffer): string {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

/**
 * Write `bytes` as a loose blob into an object directory and return its id.
 * Safe to call concurrently: an existing object is left alone and new ones
 * appear atomically.
 */
export function writeLooseBlob(objectsDirectory: string, bytes: Buffer): string {
  const id = gitBlobId(bytes);
  const target = path.join(objectsDirectory, id.slice(0, 2), id.slice(2));
  if (existsSync(target)) return id;
  mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(temporary, deflateSync(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])));
  renameSync(temporary, target);
  return id;
}

/** Where a repository writes new objects: its first alternate, if any. */
export function objectsDirectoryOf(gitDir: string): string {
  const objects = path.join(gitDir, "objects");
  const alternates = path.join(objects, "info", "alternates");
  if (existsSync(alternates)) {
    const first = readFileSync(alternates, "utf8").split("\n").find(Boolean);
    if (first) return path.resolve(objects, first);
  }
  return objects;
}

/** The live home's `git status --porcelain` at teardown, beside the snapshot. */
export const MEADOW_HOME_FINAL_STATUS_FILE = "meadowHome-final-status.txt";

/** Ref holding the home's complete working tree at teardown. */
export const FINAL_WORKTREE_REF = "refs/meadow-e2e/final-worktree";

/**
 * Snapshot a live Meadow Home (a git work tree) into `destination` as a
 * compact repository: every ref and object, plus a commit at
 * FINAL_WORKTREE_REF holding every file in the working tree at teardown
 * (tracked, modified, untracked and ignored). Nothing is left on disk
 * beside `.git`, which has no index: the live home's `git status
 * --porcelain` is written to `finalStatusPath` instead, because status
 * cannot be recomputed without the files.
 */
export function snapshotHomeRepository(options: {
  homeDirectory: string;
  destination: string;
  sharedObjectsDirectory: string;
  /** Top-level names left out of the snapshot (glob, e.g. "logs*"). */
  excludedTopLevel: readonly string[];
  finalStatusPath: string;
}): void {
  const { homeDirectory, destination, sharedObjectsDirectory, excludedTopLevel, finalStatusPath } = options;
  const sourceGitDir = path.join(homeDirectory, ".git");
  const targetGitDir = path.join(destination, ".git");
  mkdirSync(destination, { recursive: true });
  // An empty template leaves out sample hooks and other boilerplate.
  git(["init", "--quiet", "--template=", destination]);
  shareObjects(sourceGitDir, targetGitDir, sharedObjectsDirectory);

  const refs = gitText(["--git-dir", sourceGitDir, "for-each-ref", "--format=%(objectname) %(refname)"]);
  if (refs) {
    const commands = refs.split("\n").map(line => {
      const [sha, ref] = line.split(" ");
      return `update ${ref} ${sha}\n`;
    }).join("");
    git(["--git-dir", targetGitDir, "update-ref", "--stdin"], { input: commands });
  }
  try {
    git(["--git-dir", targetGitDir, "symbolic-ref", "HEAD", gitText(["--git-dir", sourceGitDir, "symbolic-ref", "-q", "HEAD"])]);
  } catch {
    // Detached HEAD: record the commit itself.
    try {
      writeFileSync(path.join(targetGitDir, "HEAD"), `${gitText(["--git-dir", sourceGitDir, "rev-parse", "HEAD"])}\n`);
    } catch {
      // No commits yet; the snapshot keeps its unborn default branch.
    }
  }
  let head: string | null = null;
  try { head = gitText(["--git-dir", targetGitDir, "rev-parse", "--verify", "-q", "HEAD"]); } catch { /* unborn */ }

  writeFileSync(finalStatusPath, git(["status", "--porcelain"], { cwd: homeDirectory }));

  const objectEnv = { GIT_OBJECT_DIRECTORY: sharedObjectsDirectory };
  const index = path.join(os.tmpdir(), `meadow-home-snapshot-index-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    let tree = "";
    // The application may still be settling at teardown, so a generated
    // file can vanish between listing and reading. Retry until one pass
    // sees a consistent tree.
    for (let attempt = 1; ; attempt++) {
      try {
        rmSync(index, { force: true });
        const env = { ...objectEnv, GIT_INDEX_FILE: index };
        git(["--git-dir", targetGitDir, "--work-tree", homeDirectory, "add", "--all", "--force", "--", ".",
          // A glob matches the entry itself, `/**` everything beneath it.
          ...excludedTopLevel.flatMap(name => [`:(exclude,glob)${name}`, `:(exclude,glob)${name}/**`])], { env });
        tree = gitText(["--git-dir", targetGitDir, "write-tree"], { env });
        break;
      } catch (error) {
        const vanished = /unable to stat|No such file or directory|unable to index file/.test(String((error as { stderr?: unknown }).stderr ?? error));
        if (!vanished || attempt >= 5) throw error;
      }
    }
    const commit = gitText(["--git-dir", targetGitDir, "commit-tree", tree, ...(head ? ["-p", head] : []), "-m", "Working tree at teardown"], {
      env: {
        ...objectEnv,
        GIT_AUTHOR_NAME: "meadow-e2e", GIT_AUTHOR_EMAIL: "e2e@meadow.invalid",
        GIT_COMMITTER_NAME: "meadow-e2e", GIT_COMMITTER_EMAIL: "e2e@meadow.invalid",
      },
    });
    git(["--git-dir", targetGitDir, "update-ref", FINAL_WORKTREE_REF, commit]);
  } finally {
    rmSync(index, { force: true });
  }

}

function markAllSkipWorktree(repository: string, keep: readonly string[]): void {
  const gitDir = path.join(repository, ".git");
  const tracked = git(["--git-dir", gitDir, "--work-tree", repository, "ls-files", "-z"]).toString("utf8")
    .split("\0").filter(p => p && !keep.includes(p));
  if (tracked.length > 0) {
    git(["--git-dir", gitDir, "--work-tree", repository, "update-index", "-z", "--skip-worktree", "--stdin"], {
      input: tracked.map(p => `${p}\0`).join(""),
    });
  }
}

/**
 * Drop a state repository's working tree once its history is committed.
 * Readers use git; files listed in `keep` (such as a timeline) stay on disk.
 */
export function dropCommittedWorkTree(repository: string, keep: readonly string[]): void {
  markAllSkipWorktree(repository, keep);
  for (const entry of readdirSync(repository)) {
    if (entry !== ".git" && !keep.includes(entry)) rmSync(path.join(repository, entry), { recursive: true, force: true });
  }
}

/**
 * Pack the loose objects scenarios wrote into the run's shared store. One
 * delta-compressed pack replaces tens of thousands of small files. Every
 * loose object is packed, reachable or not, so no repository loses anything.
 */
export function packSharedObjectStore(sharedObjectsDirectory: string): { packedObjects: number } {
  if (!existsSync(sharedObjectsDirectory)) return { packedObjects: 0 };
  const ids: string[] = [];
  for (const fanout of readdirSync(sharedObjectsDirectory)) {
    if (!/^[0-9a-f]{2}$/.test(fanout)) continue;
    for (const rest of readdirSync(path.join(sharedObjectsDirectory, fanout))) {
      if (/^[0-9a-f]{38}$/.test(rest)) ids.push(fanout + rest);
    }
  }
  if (ids.length === 0) return { packedObjects: 0 };
  const scratch = path.join(os.tmpdir(), `meadow-object-pack-${process.pid}-${Date.now()}`);
  try {
    git(["init", "--bare", "--quiet", "--template=", scratch]);
    const env = { GIT_OBJECT_DIRECTORY: sharedObjectsDirectory };
    mkdirSync(path.join(sharedObjectsDirectory, "pack"), { recursive: true });
    git(["--git-dir", scratch, "pack-objects", "-q", path.join(sharedObjectsDirectory, "pack", "pack")], {
      env,
      input: ids.map(id => `${id}\n`).join(""),
    });
    git(["--git-dir", scratch, "prune-packed"], { env });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return { packedObjects: ids.length };
}
