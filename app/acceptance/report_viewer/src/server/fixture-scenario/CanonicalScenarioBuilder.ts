/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

import { appendFileSync, writeFileSync } from "fs";
import path from "path";
import { Logger, FrontendLevel, BackendLevel } from "./Logger.js";
import { MeadowHomeFs } from "./MeadowHomeFs.js";
import { MinioStore } from "./MinioStore.js";
import { StateStore } from "./StateStore.js";
import { TickStamp, Ticker } from "./Ticker.js";

// CanonicalScenarioBuilder is the single entrypoint canonical-scenario.ts
// talks to. It owns the fake clock, the log writers, the three state
// repos, and the per-tick journal files (ticks.jsonl,
// meadowHome-uncommitted.jsonl). The class is purpose-built for assembling
// the regenerable fixture scenario — it isn't a general-purpose recorder
// for live test runs.
//
// Authoring style: call `advance(ms)` to move time forward, then use the
// scoped helpers (frontendLog, addMeadowFile, snapshot, etc.) which all
// stamp the current tick into whatever they emit. The caller should never
// need to hold a TickStamp directly unless they want fine-grained control.

export class CanonicalScenarioBuilder {
  readonly testDir: string;
  readonly ticker: Ticker;
  readonly logger: Logger;
  readonly meadowHome: MeadowHomeFs;
  readonly minio: MinioStore;
  readonly state: StateStore;

  private readonly ticksJsonlPath: string;
  private readonly uncommittedJsonlPath: string;
  private readonly keyFrames: { docId: string; filename: string; timestamp: string }[] = [];
  // Tick rows are written lazily so they reflect the *end* state of the
  // tick they describe — events landing at T_n need to be visible in
  // T_n's row, which means we can't write the row at advance() time
  // (state hasn't been touched yet at that moment). The row is flushed
  // when the next tick begins, when a snapshot is taken, or via
  // finalize() at the end of the scenario.
  private pendingRowTick: TickStamp | null = null;

  constructor(testDir: string, epochIso: string) {
    this.testDir = testDir;
    this.ticker = new Ticker(epochIso);
    this.logger = new Logger(testDir);
    this.meadowHome = new MeadowHomeFs(testDir);
    this.minio = new MinioStore(testDir);
    this.state = new StateStore(testDir);

    this.ticksJsonlPath = path.join(testDir, "ticks.jsonl");
    this.uncommittedJsonlPath = path.join(testDir, "meadowHome-uncommitted.jsonl");
    writeFileSync(this.ticksJsonlPath, "");
    writeFileSync(this.uncommittedJsonlPath, "");
  }

  // Advance the fake clock and begin a new tick. Any pending row from
  // the previous tick is flushed first — that row reflects the *end*
  // state of the previous tick, which is exactly what we want
  // (everything that happened during T_n shows up in T_n's row).
  advance(advanceMs = 100): TickStamp {
    this.flushPendingRow();
    const tick = this.ticker.next(advanceMs);
    this.pendingRowTick = tick;
    return tick;
  }

  current(): TickStamp {
    return this.ticker.current();
  }

  // ---- Logs (current tick is implicit) ----

  frontendLog(level: FrontendLevel, message: string): void {
    this.logger.frontend(this.current(), level, message);
  }

  backendLog(level: BackendLevel, message: string): void {
    this.logger.backend(this.current(), level, message);
  }

  // ---- MeadowHome convenience wrappers (tick is implicit) ----

  addMeadowFile(baseName: string, body: string): string {
    return this.meadowHome.addFile(this.current(), baseName, body);
  }

  appendMeadowLine(repoRelPath: string, line: string): void {
    this.meadowHome.appendLine(this.current(), repoRelPath, line);
  }

  deleteMeadowFile(repoRelPath: string): void {
    this.meadowHome.deleteFile(repoRelPath);
  }

  commitMeadowHome(message: string): string | null {
    const tick = this.current();
    return this.meadowHome.commit(tick, `C${tick.tickIndex}: ${message}`);
  }

  // Write the MeadowHome repo's tracked .gitignore. Anything matching the
  // patterns becomes a gitignored working-tree file from this tick on.
  setMeadowGitignore(body: string): void {
    this.meadowHome.setGitignore(this.current(), body);
  }

  // Write a file at a stable repo-relative path (no T<n> prefix). Pair
  // this with setMeadowGitignore to populate ignored working-tree files
  // whose contents the viewer can still diff per tick.
  addIgnoredMeadowFile(repoRelPath: string, body: string): string {
    return this.meadowHome.writeIgnoredFile(this.current(), repoRelPath, body);
  }

  // ---- MinIO convenience wrappers ----

  putObject(baseKey: string, body: string): string {
    return this.minio.putObject(this.current(), baseKey, body);
  }

  updateObject(objectKey: string, body: string): void {
    this.minio.updateObject(objectKey, body);
  }

  deleteObject(objectKey: string): void {
    this.minio.deleteObject(objectKey);
  }

  // ---- State repo convenience wrappers ----

  setStateRecord(table: string, recordId: string, body: string): string {
    return this.state.setRecord(this.current(), table, recordId, body);
  }

  updateStateRecord(recordPath: string, body: string): void {
    this.state.updateRecord(this.current(), recordPath, body);
  }

  deleteStateRecord(recordPath: string): void {
    this.state.deleteRecord(recordPath);
  }

  // ---- Snapshots ----

  // Record a snapshot at the current tick: emit a tick row with
  // isSnapshot=true and snapshotMessage; append to the uncommitted log;
  // commit MinIO and the State repo with a tick-stamped label so their
  // git timelines mirror the snapshot moments.
  //
  // The snapshot row supersedes any pending non-snapshot row at the same
  // tick — we don't want two rows for one tick.
  snapshot(message: string): void {
    const tick = this.current();
    const stamped = `S${tick.tickIndex}: ${message}`;

    if (this.pendingRowTick && this.pendingRowTick.tickIndex === tick.tickIndex) {
      this.pendingRowTick = null;
    } else {
      this.flushPendingRow();
    }
    this.appendTickRow(tick, true, message);
    appendFileSync(
      this.uncommittedJsonlPath,
      JSON.stringify({
        timestamp: tick.atIso,
        message,
        uncommittedFiles: this.meadowHome.uncommittedFiles(),
      }) + "\n"
    );
    this.minio.commit(tick, stamped);
    this.state.commit(tick, stamped);
  }

  // Flush any pending row. The orchestrator should call this at the end
  // of the scenario so the very last tick is recorded.
  finalize(): void {
    this.flushPendingRow();
  }

  private flushPendingRow(): void {
    if (this.pendingRowTick) {
      this.appendTickRow(this.pendingRowTick, false);
      this.pendingRowTick = null;
    }
  }

  // Add a key-frame (e.g. "publish modal opened") that the viewer can pin
  // alongside scenario docs.
  addKeyFrame(docId: string, filename: string): void {
    this.keyFrames.push({ docId, filename, timestamp: this.current().atIso });
  }

  // Write keyframes.json. Called by the orchestrator at the end.
  flushKeyFrames(): void {
    writeFileSync(
      path.join(this.testDir, "keyframes.json"),
      JSON.stringify(this.keyFrames, null, 2)
    );
  }

  // ---- Internals ----

  private appendTickRow(
    tick: TickStamp,
    isSnapshot: boolean,
    snapshotMessage?: string
  ): void {
    const tracked = this.meadowHome.trackedFiles();
    const ignoredFiles = this.meadowHome.ignoredFiles();
    // Working-tree listing for the tree UI: tracked + ignored. The viewer
    // layers uncommitted-new entries on top via uncommittedFiles. Mirrors
    // the production tick-capture invariant that `files` contains every
    // working-tree file regardless of git tracking status.
    const files = Array.from(new Set([...tracked, ...ignoredFiles])).sort();
    const row: Record<string, unknown> = {
      timestamp: tick.atIso,
      tickIndex: tick.tickIndex,
      isSnapshot,
      files,
      uncommittedFiles: this.meadowHome.uncommittedFiles(),
      uncommittedFileContents: this.meadowHome.uncommittedFileContents(),
      ignoredFiles,
      ignoredFileContents: this.meadowHome.ignoredFileContents(),
      gitHeadSha: this.meadowHome.headSha() ?? "",
      s3Keys: this.minio.listObjectKeys(),
      s3ObjectContents: this.minio.objectContents(),
      stateRecordContents: this.state.recordContents(),
    };
    if (isSnapshot && snapshotMessage !== undefined) {
      row.snapshotMessage = snapshotMessage;
    }
    appendFileSync(this.ticksJsonlPath, JSON.stringify(row) + "\n");
  }
}
