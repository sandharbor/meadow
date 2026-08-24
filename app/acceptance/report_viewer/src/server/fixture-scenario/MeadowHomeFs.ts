/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

import { readFileSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { StateRepoBase } from "./StateRepoBase.js";
import { TickStamp } from "./Ticker.js";

// MeadowHomeFs models the user's MeadowHome directory tree. Files and edits
// are stamped with the tick at which they happened so the artifact is
// visually self-checking — `T<n>-foo.md` is a file added at T<n>, and
// `// T<n> appended` annotates a line added at T<n>.

export class MeadowHomeFs extends StateRepoBase {
  constructor(testDir: string) {
    super(testDir, "meadowHome-state-repo");
  }

  // Add a brand-new file. The tick number is woven into the filename so
  // the file's origin is visible in the FS pane without opening it.
  addFile(tick: TickStamp, baseName: string, body: string): string {
    const stampedName = `T${tick.tickIndex}-${baseName}`;
    const header = `# created at T${tick.tickIndex} (${tick.atIso})\n`;
    this.writeRepoFile(stampedName, header + body);
    return stampedName;
  }

  // Append a line to an existing tracked file. The line is annotated with
  // the tick that added it, so the diff view shows where in the timeline
  // each edit happened.
  appendLine(tick: TickStamp, repoRelPath: string, line: string): void {
    const full = path.join(this.repoDir, repoRelPath);
    const prior = readFileSync(full, "utf8");
    const ensureNewline = prior.endsWith("\n") ? "" : "\n";
    const annotated = `${line}  // appended at T${tick.tickIndex}\n`;
    writeFileSync(full, prior + ensureNewline + annotated);
  }

  deleteFile(repoRelPath: string): void {
    const full = path.resolve(this.repoDir, repoRelPath);
    if (!full.startsWith(path.resolve(this.repoDir) + path.sep)) {
      throw new Error(`Refusing to delete MeadowHome file outside repo: ${repoRelPath}`);
    }
    rmSync(full, { force: true });
  }

  // Write the tracked .gitignore. Filename is fixed (it has to be exactly
  // ".gitignore" for git to honour it), so the tick stamp is encoded in a
  // comment header rather than the basename.
  setGitignore(tick: TickStamp, body: string): void {
    const header = `# created at T${tick.tickIndex} (${tick.atIso})\n`;
    this.writeRepoFile(".gitignore", header + body);
  }

  // Write a file at a stable repo-relative path. Unlike addFile, the path
  // is NOT prefixed with T<n> — the caller chooses the path so a .gitignore
  // pattern can match it deterministically across ticks. Use this for
  // gitignored files: the .gitignore matches by path, so the path must
  // stay constant even as appendLine edits the body.
  writeIgnoredFile(tick: TickStamp, repoRelPath: string, body: string): string {
    const header = `# created at T${tick.tickIndex} (${tick.atIso})\n`;
    this.writeRepoFile(repoRelPath, header + body);
    return repoRelPath;
  }
}
