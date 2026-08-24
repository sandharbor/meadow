/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

import { StateRepoBase } from "./StateRepoBase.js";
import { TickStamp } from "./Ticker.js";
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from "fs";
import path from "path";

// StateStore mirrors the discovery pattern used by the live extension state
// repos (e.g. "<provider>-state-repo"). The fixture writes a generically-
// labeled "State" repo so the report viewer renders a populated tab without
// implying any particular backing store. Records are YAML-ish text files
// under records/<table>/<id>.yaml, with the tick number stamped into both
// filename and body so the pane is self-checking.
//
// `_meta.json` declares displayName="State" and pathPrefix="records/", which
// is what the viewer reads to label the tab and filter the file list.

const REPO_NAME = "fixture-state-repo";
const PATH_PREFIX = "records/";
const DISPLAY_NAME = "State";

export class StateStore extends StateRepoBase {
  constructor(testDir: string) {
    super(testDir, REPO_NAME, {
      displayName: DISPLAY_NAME,
      pathPrefix: PATH_PREFIX,
    });
  }

  // Set/overwrite a record. The tick number is stamped into the filename
  // and a `# updated at T<n>` header is prepended to the body.
  setRecord(tick: TickStamp, table: string, recordId: string, body: string): string {
    const stampedId = `T${tick.tickIndex}-${recordId}`;
    const relPath = `${PATH_PREFIX}${table}/${stampedId}.yaml`;
    const header = `# table: ${table}\n# updated at T${tick.tickIndex} (${tick.atIso})\n`;
    this.writeRepoFile(relPath, header + body);
    return relPath;
  }

  updateRecord(tick: TickStamp, repoRelPath: string, body: string): void {
    const relPath = this.normalizeRecordPath(repoRelPath);
    const table = relPath.slice(PATH_PREFIX.length).split("/")[0] ?? "unknown";
    const header = `# table: ${table}\n# updated at T${tick.tickIndex} (${tick.atIso})\n`;
    this.writeRepoFile(relPath, header + body);
  }

  deleteRecord(repoRelPath: string): void {
    const relPath = this.normalizeRecordPath(repoRelPath);
    const full = path.resolve(this.repoDir, relPath);
    if (existsSync(full)) unlinkSync(full);
  }

  recordContents(): Record<string, string> {
    const recordsRoot = path.join(this.repoDir, PATH_PREFIX);
    if (!existsSync(recordsRoot)) return {};

    const contents: Record<string, string> = {};
    const visit = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          visit(full);
        } else if (stat.isFile() && entry.endsWith(".yaml")) {
          const rel = path
            .relative(recordsRoot, full)
            .split(path.sep)
            .join("/")
            .replace(/\.yaml$/, "");
          contents[rel] = readFileSync(full, "utf8");
        }
      }
    };
    visit(recordsRoot);
    return Object.fromEntries(Object.entries(contents).sort(([a], [b]) => a.localeCompare(b)));
  }

  private normalizeRecordPath(repoRelPath: string): string {
    const normalized = repoRelPath.split(path.sep).join("/");
    if (!normalized.startsWith(PATH_PREFIX) || !normalized.endsWith(".yaml")) {
      throw new Error(`State record path must be under ${PATH_PREFIX}: ${repoRelPath}`);
    }
    const repoRoot = path.resolve(this.repoDir);
    const resolved = path.resolve(this.repoDir, normalized);
    if (!resolved.startsWith(repoRoot + path.sep)) {
      throw new Error(`State record path escapes repo: ${repoRelPath}`);
    }
    return normalized;
  }
}
