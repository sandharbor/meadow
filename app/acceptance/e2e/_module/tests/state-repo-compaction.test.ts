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

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import {
  FINAL_WORKTREE_REF,
  dropCommittedWorkTree,
  moveObjectsToSharedStore,
  packSharedObjectStore,
  snapshotHomeRepository,
} from "../../src/run/stateRepoCompaction.js";
import { compactManifest, expandManifest } from "../../src/artifacts/manifestEncoding.js";

function temporaryDirectory(t: TestContext): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "meadow-state-repo-compaction-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
    },
  }).trim();
}

function write(root: string, relativePath: string, content: string | Buffer): void {
  mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
  writeFileSync(path.join(root, relativePath), content);
}

test("a home snapshot keeps history, refs, final files and status without a working tree", t => {
  const root = temporaryDirectory(t);
  const home = path.join(root, "home");
  const shared = path.join(root, "__objects");
  git(root, "init", "-q", "-b", "main", home);
  write(home, ".gitignore", "cache/\nlogs/\n");
  write(home, "tracked.md", "one\n");
  write(home, "deleted.md", "gone soon\n");
  git(home, "add", "-A");
  git(home, "commit", "-q", "-m", "first");
  git(home, "commit", "-q", "--allow-empty", "-m", "replaced");
  const replaced = git(home, "rev-parse", "HEAD");
  git(home, "reset", "-q", "--hard", "HEAD~1");
  git(home, "branch", "side");
  write(home, "tracked.md", "two\n");
  rmSync(path.join(home, "deleted.md"));
  write(home, "untracked.md", "new\n");
  write(home, "cache/index.json", "{\"ignored\":true}\n");
  write(home, "logs/app.log", "left out\n");
  write(home, "image.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]));
  const liveStatus = git(home, "status", "--porcelain");

  const destination = path.join(root, "snapshot");
  const statusPath = path.join(root, "final-status.txt");
  snapshotHomeRepository({
    homeDirectory: home, destination, sharedObjectsDirectory: shared, excludedTopLevel: ["logs*"], finalStatusPath: statusPath,
  });

  assert.deepEqual(readdirSync(destination), [".git"]);
  assert.equal(readFileSync(statusPath, "utf8").trim(), liveStatus);
  assert.equal(git(destination, "rev-parse", "main"), git(home, "rev-parse", "main"));
  assert.equal(git(destination, "rev-parse", "side"), git(home, "rev-parse", "side"));
  assert.equal(git(destination, "symbolic-ref", "HEAD"), "refs/heads/main");
  // Unreachable objects survive, so artifact refs can name replaced commits.
  assert.equal(git(destination, "cat-file", "-t", replaced), "commit");

  const final = (file: string) => git(destination, "show", `${FINAL_WORKTREE_REF}:${file}`);
  assert.equal(final("tracked.md"), "two");
  assert.equal(final("untracked.md"), "new");
  assert.equal(final("cache/index.json"), "{\"ignored\":true}");
  assert.throws(() => final("deleted.md"));
  assert.throws(() => final("logs/app.log"));
  assert.equal(git(destination, "rev-parse", `${FINAL_WORKTREE_REF}^`), git(home, "rev-parse", "HEAD"));

  // The snapshot's own object store is empty: everything lives in the shared store.
  const ownObjects = readdirSync(path.join(destination, ".git", "objects"), { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name !== "alternates");
  assert.deepEqual(ownObjects, []);
  const { packedObjects } = packSharedObjectStore(shared);
  assert.ok(packedObjects > 0);
  assert.deepEqual(readdirSync(shared).filter(entry => /^[0-9a-f]{2}$/.test(entry)), []);
  assert.equal(final("tracked.md"), "two");
  git(destination, "fsck", "--connectivity-only", "--no-dangling");
});

test("a committed state repository reads through git after its files and objects move", t => {
  const root = temporaryDirectory(t);
  const repository = path.join(root, "minio-state-repo");
  const shared = path.join(root, "__objects");
  git(root, "init", "-q", repository);
  write(repository, "objects/bundle/index.html", "<p>published</p>\n");
  write(repository, "timeline.jsonl", "{}\n");
  git(repository, "add", "-A");
  git(repository, "commit", "-q", "-m", "checkpoint");

  moveObjectsToSharedStore(path.join(repository, ".git"), shared);
  dropCommittedWorkTree(repository, ["timeline.jsonl"]);

  assert.deepEqual(readdirSync(repository).sort(), [".git", "timeline.jsonl"]);
  assert.equal(git(repository, "show", "HEAD:objects/bundle/index.html"), "<p>published</p>");
  assert.equal(git(repository, "status", "--porcelain"), "");
  assert.ok(existsSync(path.join(repository, ".git", "objects", "info", "alternates")));
});

test("a compact manifest expands to exactly the manifest it came from", t => {
  const root = temporaryDirectory(t);
  git(root, "init", "-q", path.join(root, "meadowHome-state-repo"));
  const big = "<html>🌻</html>\n".repeat(100);
  const manifest = {
    testName: "compact",
    ticks: [
      { tickIndex: 0, addedFiles: ["a.md", "b.md"], removedFiles: [], uncommittedFiles: [{ path: "a.md", status: "M" }],
        uncommittedFileContents: { "a.md": big }, ignoredFiles: ["cache/x"], ignoredFileContents: { "cache/x": "tiny" } },
      { tickIndex: 1, addedFiles: [], removedFiles: [], uncommittedFiles: [{ path: "a.md", status: "M" }],
        uncommittedFileContents: {}, ignoredFiles: ["cache/x"] },
      { tickIndex: 2, addedFiles: ["c.md"], removedFiles: ["b.md"], uncommittedFiles: [],
        uncommittedFileContents: { "a.md": `${big}more` }, ignoredFiles: [] },
    ],
    tickFileListing: { 0: ["a.md", "b.md"], 2: ["a.md", "c.md"] },
    homeCommits: [{ commitHash: "c1", changedFiles: ["a.md"] }],
    homeCommitMeta: [{ commitHash: "c1", changedFiles: ["a.md"] }],
  };

  const compact = compactManifest(structuredClone(manifest), path.join(root, "meadowHome-state-repo", ".git", "objects"));
  const encoded = JSON.stringify(compact);
  assert.ok(!encoded.includes("🌻"), "large contents are stored as blobs");
  assert.deepEqual(compact.tickFileListing, { 0: ["a.md", "b.md"] });
  assert.equal("uncommittedFiles" in compact.ticks[1], false);
  assert.equal("homeCommitMeta" in compact, false);
  assert.deepEqual(expandManifest(JSON.parse(encoded), root), manifest);
});

test("listings that deltas cannot rebuild stay in the manifest", t => {
  const root = temporaryDirectory(t);
  const manifest = {
    ticks: [{ tickIndex: 0, addedFiles: ["b", "a"], removedFiles: [] }, { tickIndex: 1, addedFiles: ["c"], removedFiles: [] }],
    // Unsorted, so a rebuilt listing would differ.
    tickFileListing: { 0: ["b", "a"], 1: ["b", "a", "c"] },
  };
  const compact = compactManifest(structuredClone(manifest), null);
  assert.deepEqual(compact.tickFileListing, manifest.tickFileListing);
  assert.deepEqual(expandManifest(JSON.parse(JSON.stringify(compact)), root), manifest);
});
