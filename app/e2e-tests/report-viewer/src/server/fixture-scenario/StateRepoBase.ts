/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

import { execSync } from "child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import path from "path";
import { TickStamp } from "./Ticker.js";

// timeline.jsonl carries millisecond-precision commit timestamps for the
// assembler to read, but it lives inside the repo so commits don't track
// each other's timeline appends as fresh modifications. Using
// .git/info/exclude (rather than a tracked .gitignore) keeps the repo's
// working tree free of any extra files that would otherwise show up in
// the first commit's changedFiles list.
const TIMELINE_FILENAME = "timeline.jsonl";
const MAX_TICK_FILE_CONTENT_BYTES = 256 * 1024;

// StateRepoBase: shared plumbing for the *-state-repo directories the
// assembler discovers. Each repo is a real git repo; commits use the
// fixture's fake clock so the timeline is coherent end-to-end.
//
// Subclasses (MeadowHomeFs, MinioStore, StateStore) layer their own
// content semantics on top — choosing where files land within the repo,
// what gets stamped with tick numbers, etc.

export interface StateRepoMetaJson {
  displayName?: string;
  pathPrefix?: string;
  tableNameSuffixRegex?: string;
  recordKeyMap?: Record<string, string[]>;
  eventsLikeTables?: string[];
}

export class StateRepoBase {
  readonly repoDir: string;
  private readonly timelinePath: string;

  constructor(testDir: string, repoName: string, meta?: StateRepoMetaJson) {
    this.repoDir = path.join(testDir, repoName);
    mkdirSync(this.repoDir, { recursive: true });
    this.timelinePath = path.join(this.repoDir, "timeline.jsonl");

    execSync("git init -q", { cwd: this.repoDir });
    execSync(`git config user.email "fixture@meadow"`, { cwd: this.repoDir });
    execSync(`git config user.name "fixture"`, { cwd: this.repoDir });

    // Exclude timeline.jsonl from the working tree's git view via the
    // private .git/info/exclude file. That keeps it from showing up as a
    // phantom uncommitted file in every tick row, and avoids dragging it
    // into commits' changedFiles lists.
    const excludePath = path.join(this.repoDir, ".git", "info", "exclude");
    appendFileSync(excludePath, `${TIMELINE_FILENAME}\n`);

    if (meta) {
      writeFileSync(
        path.join(this.repoDir, "_meta.json"),
        JSON.stringify(meta, null, 2)
      );
    }
  }

  // Write a file under the repo (intermediate dirs created on demand).
  // Path is relative to the repo root.
  writeRepoFile(relPath: string, content: string | Buffer): void {
    const full = path.join(this.repoDir, relPath);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }

  // Commit anything currently in the working tree at the given tick. The
  // fake clock's ISO timestamp is forced into both author and committer
  // dates via env vars, so the assembler sees a self-consistent timeline.
  // Records the commit in timeline.jsonl with millisecond precision (git
  // itself only retains second precision in commit objects).
  commit(tick: TickStamp, message: string): string | null {
    execSync("git add -A", { cwd: this.repoDir });
    const status = execSync("git status --porcelain", {
      cwd: this.repoDir,
      encoding: "utf8",
    }).trim();
    if (status.length === 0) return null;

    // Escape double-quotes in the commit message for the shell.
    const safeMessage = message.replace(/"/g, '\\"');
    execSync(`git commit -q -m "${safeMessage}"`, {
      cwd: this.repoDir,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: tick.atIso,
        GIT_COMMITTER_DATE: tick.atIso,
      },
    });
    const hash = execSync("git rev-parse HEAD", {
      cwd: this.repoDir,
      encoding: "utf8",
    }).trim();
    appendFileSync(
      this.timelinePath,
      JSON.stringify({ timestamp: tick.atIso, commitHash: hash, message }) + "\n"
    );
    return hash;
  }

  headSha(): string | null {
    try {
      return execSync("git rev-parse HEAD", {
        cwd: this.repoDir,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim();
    } catch {
      return null;
    }
  }

  // git status --porcelain → [{ status, path }]. Don't trim the raw
  // output — leading single spaces are part of the porcelain format
  // (` M file.txt` = "modified in worktree, not staged"), so trimming
  // would shift the slice indices and chew the first character off the
  // path.
  uncommittedFiles(): { status: string; path: string }[] {
    const out = execSync("git status --porcelain", {
      cwd: this.repoDir,
      encoding: "utf8",
    });
    const files: { status: string; path: string }[] = [];
    for (const line of out.split("\n").filter((l) => l.length > 0)) {
      const status = line.slice(0, 2).trim();
      const relPath = line.slice(3);
      if (status === "??" && relPath.endsWith("/")) {
        const expanded = this.listRepoFiles(relPath);
        if (expanded.length > 0) {
          files.push(...expanded.map((path) => ({ status, path })));
          continue;
        }
      }
      files.push({ status, path: relPath });
    }
    return files;
  }

  uncommittedFileContents(): Record<string, string> {
    const contents: Record<string, string> = {};
    for (const file of this.uncommittedFiles()) {
      if (file.path.endsWith("/") || file.status.includes("D")) continue;
      const resolved = path.resolve(this.repoDir, file.path);
      if (!resolved.startsWith(this.repoDir + path.sep)) continue;
      if (!existsSync(resolved)) continue;
      try {
        const stat = statSync(resolved);
        if (!stat.isFile() || stat.size > MAX_TICK_FILE_CONTENT_BYTES) continue;
        contents[file.path] = readFileSync(resolved, "utf8");
      } catch {
        // Skip files that cannot be read as tick-local text content.
      }
    }
    return contents;
  }

  // List every file currently tracked in HEAD.
  trackedFiles(): string[] {
    try {
      const out = execSync("git ls-tree -r --name-only HEAD", {
        cwd: this.repoDir,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim();
      if (out.length === 0) return [];
      return out.split("\n").sort();
    } catch {
      return [];
    }
  }

  private listRepoFiles(repoRelDir: string): string[] {
    const repoRoot = path.resolve(this.repoDir);
    const start = path.resolve(this.repoDir, repoRelDir);
    if (!start.startsWith(repoRoot + path.sep) || !existsSync(start)) return [];

    const files: string[] = [];
    const visit = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) visit(full);
        else if (stat.isFile()) {
          files.push(path.relative(repoRoot, full).split(path.sep).join("/"));
        }
      }
    };
    visit(start);
    return files.sort();
  }
}
