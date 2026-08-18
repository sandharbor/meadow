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

import { execSync, fork } from "child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  statSync,
  cpSync,
} from "fs";
import os from "os";
import path from "path";
import { performance } from "perf_hooks";
import * as scenarioDocExports from "../scenario-docs/index.ts";
import * as bundleDocExports from "../bundle-docs/index.ts";
import * as appAreaDocExports from "../app-area-docs/index.ts";
import { deriveAppAreaDocIds } from "../app-area-docs/index.ts";
import { isBundleMode, type BundleMode } from "../run/bundleMode.ts";

// Build a map from export name (e.g. "htmlGeneration") to doc ID (e.g. "html-generation")
const exportNameToDocId = new Map<string, string>();
const moduleScenarioDocToAppAreaIds = new Map<string, readonly string[]>();
for (const [key, value] of Object.entries(scenarioDocExports)) {
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
    exportNameToDocId.set(key, value.id);
    if ("appAreaDocIds" in value && Array.isArray(value.appAreaDocIds)) {
      moduleScenarioDocToAppAreaIds.set(value.id, value.appAreaDocIds as string[]);
    }
  }
}

// Merge in extension scenario-doc exports when an extension layer is
// mounted. When no extension is mounted, the folder is gone and we use
// only the base exports.
{
  const extIndex = path.join(import.meta.dirname, "..", "scenario-docs", "meadow-extension", "index.ts");
  if (existsSync(extIndex)) {
    const extPath = "../scenario-docs/meadow-extension/index.ts";
    const mod = await import(extPath) as Record<string, unknown>;
    for (const [key, value] of Object.entries(mod)) {
      if (value && typeof value === "object" && "id" in value && typeof (value as { id: unknown }).id === "string") {
        const scenarioDoc = value as { id: string; appAreaDocIds?: string[] };
        exportNameToDocId.set(key, scenarioDoc.id);
        if (scenarioDoc.appAreaDocIds) {
          moduleScenarioDocToAppAreaIds.set(scenarioDoc.id, scenarioDoc.appAreaDocIds);
        }
      }
    }
  }
}

// Build a parallel map for bundle doc exports
const bundleExportNameToDocId = new Map<string, string>();
for (const [key, value] of Object.entries(bundleDocExports)) {
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
    bundleExportNameToDocId.set(key, value.id);
  }
}

const appAreaExportNameToDocId = new Map<string, string>();
for (const [key, value] of Object.entries(appAreaDocExports)) {
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
    appAreaExportNameToDocId.set(key, value.id);
  }
}

function extractScenarioDocIds(testSource: string): string[] {
  // Tests often import from both the base and an extension scenario-doc
  // barrel, so match every scenario-docs import statement (global flag).
  const re = /import\s+\{([^}]+)\}\s+from\s+["'][^"']*scenario-docs[^"']*["']/g;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of testSource.matchAll(re)) {
    const names = match[1].split(",").map((s) => s.trim()).filter(Boolean);
    for (const name of names) {
      const id = exportNameToDocId.get(name.split(/\s+as\s+/)[0]);
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

function extractBundleDocIds(testSource: string): string[] {
  const match = testSource.match(
    /import\s+\{([^}]+)\}\s+from\s+["'][^"']*bundle-docs[^"']*["']/
  );
  if (!match) return [];

  const names = match[1].split(",").map((s) => s.trim()).filter(Boolean);
  return names
    .map((name) => bundleExportNameToDocId.get(name.split(/\s+as\s+/)[0]))
    .filter((id): id is string => !!id);
}

function extractExplicitAppAreaDocIds(testSource: string): string[] {
  const match = testSource.match(
    /import\s+\{([^}]+)\}\s+from\s+["'][^"']*app-area-docs[^"']*["']/
  );
  if (!match) return [];

  const names = match[1].split(",").map((s) => s.trim()).filter(Boolean);
  return names
    .map((name) => appAreaExportNameToDocId.get(name.split(/\s+as\s+/)[0]))
    .filter((id): id is string => !!id);
}

interface Snapshot {
  timestamp: string;
  commitHash: string;
  commitMessage: string;
  changedFiles: string[];
}

interface SnapshotMeta {
  timestamp: string;
  commitHash: string;
  commitMessage: string;
  changedFiles: string[];
}

interface LogEntry {
  timestamp: string;
  source: string;
  level: string;
  message: string;
}

interface KeyFrame {
  docId: string;
  filename: string;
  timestamp?: string;
}

interface UncommittedEntry {
  timestamp: string;
  message: string;
  uncommittedFiles: { status: string; path: string }[];
}

interface FinalMeadowHomeStateCheck {
  mode: "asserted" | "skipped";
  accepted: boolean;
  timestamp: string;
  allowedUntracked?: string[];
  allowedModified?: string[];
  observedUntracked?: string[];
  observedModified?: { status: string; path: string }[];
}

interface RawTickEntry {
  timestamp: string;
  tickIndex: number;
  isSnapshot: boolean;
  snapshotMessage?: string;
  files: string[];
  uncommittedFiles: { path: string; status: string }[];
  uncommittedFileContents?: Record<string, string>;
  ignoredFiles?: string[];
  ignoredFileContents?: Record<string, string>;
  gitHeadSha?: string;
  s3Keys?: string[];
  s3ObjectContents?: Record<string, string>;
  stateRecordContents?: Record<string, string>;
}

interface ProcessedTick {
  timestamp: string;
  tickIndex: number;
  isSnapshot: boolean;
  snapshotMessage?: string;
  fileCount: number;
  uncommittedCount: number;
  uncommittedFiles: { path: string; status: string }[];
  uncommittedFileContents: Record<string, string>;
  ignoredFiles: string[];
  ignoredFileContents?: Record<string, string>;
  gitHeadSha?: string;
  addedFiles: string[];
  removedFiles: string[];
  changedUncommitted: boolean;
  changedGitHead: boolean;
  s3KeyCount: number;
  s3AddedKeys: string[];
  s3ModifiedKeys: string[];
  s3RemovedKeys: string[];
  s3Changed: boolean;
  s3ObjectContents?: Record<string, string>;
  stateRecordCount: number;
  stateAddedRecords: string[];
  stateModifiedRecords: string[];
  stateRemovedRecords: string[];
  stateChanged: boolean;
  stateRecordContents?: Record<string, string>;
}

interface ConsolidatedTickGroup {
  startIndex: number;
  endIndex: number;
  tickCount: number;
  startTimestamp: string;
  endTimestamp: string;
}

interface TickData {
  ticks: ProcessedTick[];
  consolidatedTicks: ConsolidatedTickGroup[];
  tickFileListing: Record<number, string[]>;
  s3KeyListing: Record<number, string[]>;
  tickConfig: { intervalMs: number; totalTicks: number; totalDurationMs: number };
}

interface Manifest {
  testName: string;
  status: string;
  startTime: string;
  endTime: string;
  snapshots: Snapshot[];
  snapshotMeta: SnapshotMeta[];
  minioSnapshotMeta: SnapshotMeta[];
  /**
   * Snapshot metadata for any extension-contributed state repos found in
   * the test artifact dir, keyed by repo basename. Empty in the
   * standalone base suite.
   */
  extensionSnapshotMeta: Record<string, SnapshotMeta[]>;
  logs: LogEntry[];
  uncommittedEntries: UncommittedEntry[];
  testSourceFile: string;
  testSource: string;
  bundleMode: BundleMode | null;
  scenarioDocIds: string[];
  bundleDocIds: string[];
  appAreaDocIds: string[];
  keyFrames: KeyFrame[];
  ticks: ProcessedTick[];
  consolidatedTicks: ConsolidatedTickGroup[];
  tickFileListing: Record<number, string[]>;
  tickConfig: { intervalMs: number; totalTicks: number; totalDurationMs: number };
}

interface AssemblyTimingStep {
  name: string;
  ms: number;
}

interface AssemblyTiming {
  version: number;
  testName: string;
  status: string;
  startTime: string;
  endTime: string;
  startedAt: string;
  endedAt: string;
  totalMs: number;
  steps: AssemblyTimingStep[];
  artifacts: Record<string, number | string | null>;
}

interface AssemblyTimingSummary {
  version: number;
  runId: string;
  concurrency: number;
  videoCollectMs: number;
  parallelAssemblyMs: number;
  scenarios: (AssemblyTiming & {
    parentForkMs?: number;
    videoCopyMs?: number;
    videoBytes?: number;
  })[];
  totalsByStep: AssemblyTimingStep[];
}

function measured<T>(steps: AssemblyTimingStep[], name: string, fn: () => T): T {
  const start = performance.now();
  try {
    return fn();
  } finally {
    steps.push({ name, ms: performance.now() - start });
  }
}

function fileSizeOrNull(filePath: string): number | null {
  try {
    return statSync(filePath).size;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, value: unknown): number {
  const json = JSON.stringify(value, null, 2);
  writeFileSync(filePath, json);
  return Buffer.byteLength(json);
}

interface ReportMetaHealthPoint {
  pct: number;
  timestamp: string;
  errorCount: number;
  warnCount: number;
  uncommittedTrackedFiles: number;
  uncommittedTrackedFolders: number;
  uncommittedUntrackedFiles: number;
  uncommittedUntrackedFolders: number;
}

interface ScenarioReportMeta {
  version: 1;
  scenarioInfo: {
    testName: string;
    duration: number | null;
    bundleMode: BundleMode | null;
    scenarioDocIds: string[];
    bundleDocIds: string[];
    appAreaDocIds: string[];
    keyFrames: { docId: string; filename: string; timestamp?: string }[];
    failureReason?: string;
  };
  summary: {
    totalErrorCount: number;
    totalWarnCount: number;
    hasUncommittedAtEnd: boolean;
    uncommittedFileCountAtEnd: number;
    hasIssues: boolean;
  };
  health: {
    points: ReportMetaHealthPoint[];
    hasUncommittedAtEnd: boolean;
    hasAnyData: boolean;
  };
}

interface RunReportMeta {
  version: 1;
  totalDurationSeconds: number | null;
  scenarios: Record<
    string,
    {
      totalErrorCount: number;
      totalWarnCount: number;
      hasUncommittedAtEnd: boolean;
      hasIssues: boolean;
    }
  >;
}

// Read timeline.jsonl and return a map of commitHash → { timestamp, message }
// for millisecond-precision timestamps (git author dates are only second-precision).
function readTimeline(
  timelinePath: string
): Map<string, { timestamp: string; message: string }> {
  const map = new Map<string, { timestamp: string; message: string }>();
  if (!existsSync(timelinePath)) return map;
  const content = readFileSync(timelinePath, "utf8").trim();
  if (!content) return map;
  for (const line of content.split("\n")) {
    try {
      const entry = JSON.parse(line) as {
        timestamp: string;
        commitHash: string;
        message: string;
      };
      map.set(entry.commitHash, {
        timestamp: entry.timestamp,
        message: entry.message,
      });
    } catch {
      // skip malformed lines
    }
  }
  return map;
}

const E2E_DIR = path.join(import.meta.dirname, "../..");
const ARTIFACTS_BASE = path.join(os.homedir(), "meadow-e2e-artifacts", "current");
const TEST_RESULTS_DIR = path.join(E2E_DIR, "test-results");

function extractSnapshots(
  stateRepo: string,
  timingSteps?: AssemblyTimingStep[],
  stepPrefix = "snapshots"
): Snapshot[] {
  if (!existsSync(stateRepo)) return [];
  const time = <T>(name: string, fn: () => T): T =>
    timingSteps ? measured(timingSteps, `${stepPrefix}:${name}`, fn) : fn();

  let logOutput: string;
  const timelineMap = readTimeline(path.join(stateRepo, "timeline.jsonl"));
  try {
    logOutput = time("git log", () => execSync('git log --format="%H %aI %s" --reverse', {
      cwd: stateRepo,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim());
  } catch {
    return [];
  }

  if (!logOutput) return [];

  const lines = logOutput.split("\n");
  const snapshots: Snapshot[] = [];
  let prevHash: string | null = null;

  for (const line of lines) {
    const [hash, gitTimestamp, ...msgParts] = line.split(" ");
    const commitMessage = msgParts.join(" ");
    const timelineEntry = timelineMap.get(hash);
    const timestamp = timelineEntry?.timestamp ?? gitTimestamp;

    // Get changed files vs previous commit
    let changedFiles: string[] = [];
    if (prevHash) {
      changedFiles = time("diff-tree", () =>
        execSync(
          `git diff-tree --no-commit-id --name-only -r ${prevHash} ${hash}`,
          { cwd: stateRepo, encoding: "utf8" }
        )
          .trim()
          .split("\n")
          .filter(Boolean)
      );
    } else {
      // First commit: all files are "changed"
      changedFiles = time("ls-tree", () =>
        execSync(`git ls-tree -r --name-only ${hash}`, {
          cwd: stateRepo,
          encoding: "utf8",
        })
          .trim()
          .split("\n")
          .filter(Boolean)
      );
    }

    snapshots.push({ timestamp, commitHash: hash, commitMessage, changedFiles });
    prevHash = hash;
  }

  return snapshots;
}

/**
 * Discover any extension-contributed state-repo directories in a test
 * artifact dir. The two built-in state repos (`meadowHome-state-repo`,
 * `minio-state-repo`) are excluded — extensions add others (e.g. for
 * structured backing stores) that this function picks up generically.
 */
function listExtensionStateRepos(testDir: string): string[] {
  if (!existsSync(testDir)) return [];
  return readdirSync(testDir)
    .filter((name) => name.endsWith("-state-repo"))
    .filter((name) => name !== "meadowHome-state-repo" && name !== "minio-state-repo")
    .filter((name) => {
      try { return statSync(path.join(testDir, name)).isDirectory(); }
      catch { return false; }
    });
}

/**
 * Optional metadata file an extension can drop at the root of its state
 * repo to declare how the repo should be interpreted. Currently used for
 * the path prefix under which tracked records live; the report viewer
 * may also read it for display purposes.
 */
interface StateRepoMeta {
  pathPrefix?: string;
}

function readStateRepoMeta(repoPath: string): StateRepoMeta {
  const metaPath = path.join(repoPath, "_meta.json");
  if (!existsSync(metaPath)) return {};
  try {
    return JSON.parse(readFileSync(metaPath, "utf8")) as StateRepoMeta;
  } catch {
    return {};
  }
}

function extractSnapshotMeta(stateRepo: string, pathPrefix = "home/"): SnapshotMeta[] {
  if (!existsSync(stateRepo)) return [];

  let logOutput: string;
  const timelineMap = readTimeline(path.join(stateRepo, "timeline.jsonl"));
  try {
    logOutput = execSync('git log --format="%H %aI %s" --reverse', {
      cwd: stateRepo,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return [];
  }

  if (!logOutput) return [];

  const lines = logOutput.split("\n");
  const metas: SnapshotMeta[] = [];
  let prevHash: string | null = null;

  for (const line of lines) {
    const [hash, gitTimestamp, ...msgParts] = line.split(" ");
    const commitMessage = msgParts.join(" ");
    const timelineEntry = timelineMap.get(hash);
    const timestamp = timelineEntry?.timestamp ?? gitTimestamp;

    let changedFiles: string[] = [];
    if (prevHash) {
      const diffOutput = execSync(
        `git diff-tree --no-commit-id --name-only -r ${prevHash} ${hash}`,
        { cwd: stateRepo, encoding: "utf8" }
      )
        .trim()
        .split("\n")
        .filter(Boolean);
      changedFiles = pathPrefix
        ? diffOutput
            .filter((f) => f.startsWith(pathPrefix))
            .map((f) => f.slice(pathPrefix.length))
        : diffOutput;
    } else {
      // First commit: list all files
      const fileList = execSync(`git ls-tree -r --name-only ${hash}`, {
        cwd: stateRepo,
        encoding: "utf8",
      })
        .trim()
        .split("\n")
        .filter(Boolean);
      changedFiles = pathPrefix
        ? fileList
            .filter((f) => f.startsWith(pathPrefix))
            .map((f) => f.slice(pathPrefix.length))
        : fileList;
    }

    metas.push({ timestamp, commitHash: hash, commitMessage, changedFiles });
    prevHash = hash;
  }

  return metas;
}

// Normalize Playwright console message types to match backend log level convention.
// Playwright's msg.type() returns 'warning' (not 'warn'), and lowercase values.
function normalizeFrontendLevel(raw: string): string {
  switch (raw) {
    case "warning":
      return "WARN";
    default:
      return raw.toUpperCase();
  }
}

// Browser resource-loading 403/404 from preview iframe are expected in e2e
// (e.g. iframe reloads while a new preview is being generated).
// Must stay in sync with the same patterns in test-fixtures.ts.
const benignPatterns = [
  /Failed to load resource: the server responded with a status of 403/,
  /Failed to load resource: the server responded with a status of 404/,
];

interface ExpectedErrorWindow {
  pattern: string;
  startTime: string;
  endTime: string | null;
}

function isBenignLogEntry(log: LogEntry, expectedWindows?: ExpectedErrorWindow[]): boolean {
  if (benignPatterns.some((p) => p.test(log.message))) return true;
  if (expectedWindows) {
    return expectedWindows.some(w =>
      new RegExp(w.pattern).test(log.message) &&
      log.timestamp >= w.startTime &&
      (w.endTime === null || log.timestamp <= w.endTime)
    );
  }
  return false;
}

function readFinalMeadowHomeStateCheck(testDir: string): FinalMeadowHomeStateCheck | null {
  const checkPath = path.join(testDir, "final-meadowhome-state-check.json");
  if (!existsSync(checkPath)) return null;
  try {
    return JSON.parse(readFileSync(checkPath, "utf8")) as FinalMeadowHomeStateCheck;
  } catch {
    return null;
  }
}

function parseFrontendLog(logPath: string): LogEntry[] {
  if (!existsSync(logPath)) return [];
  const content = readFileSync(logPath, "utf8").trim();
  if (!content) return [];

  const entries: LogEntry[] = [];
  for (const line of content.split("\n")) {
    // Format: 2026-02-26T12:00:00.000Z [level] message
    const match = line.match(/^(\S+)\s+\[(\w+)]\s+(.*)$/);
    if (match) {
      entries.push({
        timestamp: match[1],
        source: "frontend",
        level: normalizeFrontendLevel(match[2]),
        message: match[3],
      });
    } else if (entries.length > 0) {
      entries[entries.length - 1].message += `\n${line}`;
    } else {
      entries.push({ timestamp: "", source: "frontend", level: "INFO", message: line });
    }
  }
  return entries;
}

function parseBackendLog(logPath: string): LogEntry[] {
  if (!existsSync(logPath)) return [];
  const content = readFileSync(logPath, "utf8").trim();
  if (!content) return [];

  return content.split("\n").map((line) => {
    // Format: 2026-02-26T12:00:00.000Z - [INFO ] message
    const match = line.match(/^(\S+)\s+-\s+\[(\w+)\s*]\s+(.*)$/);
    if (match) {
      return {
        timestamp: match[1],
        source: "backend",
        level: match[2].toUpperCase(),
        message: match[3],
      };
    }
    return { timestamp: "", source: "backend", level: "INFO", message: line };
  });
}

function readUncommittedLog(logPath: string): UncommittedEntry[] {
  if (!existsSync(logPath)) return [];
  const content = readFileSync(logPath, "utf8").trim();
  if (!content) return [];
  return content.split("\n").map((line) => JSON.parse(line) as UncommittedEntry);
}

function processTickLog(testDir: string): TickData {
  const tickLogPath = path.join(testDir, "ticks.jsonl");
  const tickConfigPath = path.join(testDir, "tick-config.json");

  const defaultConfig = { intervalMs: 500, totalTicks: 0, totalDurationMs: 0 };
  const emptyResult: TickData = {
    ticks: [],
    consolidatedTicks: [],
    tickFileListing: {},
    s3KeyListing: {},
    tickConfig: defaultConfig,
  };

  if (!existsSync(tickLogPath)) return emptyResult;

  const content = readFileSync(tickLogPath, "utf8").trim();
  if (!content) return emptyResult;

  const rawTicks: RawTickEntry[] = content
    .split("\n")
    .map((line) => {
      try { return JSON.parse(line) as RawTickEntry; }
      catch { return null; }
    })
    .filter((t): t is RawTickEntry => t !== null);

  if (rawTicks.length === 0) return emptyResult;

  // Read tick config
  let intervalMs = 500;
  if (existsSync(tickConfigPath)) {
    try {
      const cfg = JSON.parse(readFileSync(tickConfigPath, "utf8"));
      intervalMs = cfg.intervalMs || 500;
    } catch { /* use default */ }
  }

  // Process ticks: compute diffs between consecutive entries
  const processedTicks: ProcessedTick[] = [];
  const tickFileListing: Record<number, string[]> = {};
  const s3KeyListing: Record<number, string[]> = {};
  let prevFiles: Set<string> | null = null;
  let prevS3Keys: Set<string> | null = null;
  let prevS3ObjectContents: Record<string, string> | null = null;
  let prevStateRecords: Set<string> | null = null;
  let prevStateRecordContents: Record<string, string> | null = null;
  let latestUncommittedFileContents: Record<string, string> = {};
  let latestIgnoredFileContents: Record<string, string> = {};
  let latestStateRecordContents: Record<string, string> | null = null;
  let prevUncommittedKey = "";
  let prevGitHead = "";

  for (const raw of rawTicks) {
    const currentFiles = new Set(raw.files);
    const rawS3 = raw.s3Keys || [];
    const currentS3Keys = new Set(rawS3);
    if (raw.stateRecordContents !== undefined) {
      latestStateRecordContents = raw.stateRecordContents;
    }
    const currentStateRecordContents = latestStateRecordContents;
    const rawStateRecords = Object.keys(currentStateRecordContents ?? {}).sort();
    const currentStateRecords = new Set(rawStateRecords);
    if (raw.uncommittedFileContents !== undefined) {
      latestUncommittedFileContents = {
        ...latestUncommittedFileContents,
        ...raw.uncommittedFileContents,
      };
    }
    const activeUncommittedPaths = new Set(
      raw.uncommittedFiles
        .filter((f) => !f.path.endsWith("/") && !f.status.includes("D") && f.status !== "deleted")
        .map((f) => f.path)
    );
    latestUncommittedFileContents = Object.fromEntries(
      Object.entries(latestUncommittedFileContents).filter(([filePath]) =>
        activeUncommittedPaths.has(filePath)
      )
    );
    if (raw.ignoredFileContents !== undefined) {
      latestIgnoredFileContents = {
        ...latestIgnoredFileContents,
        ...raw.ignoredFileContents,
      };
    }
    const activeIgnoredPaths = new Set(raw.ignoredFiles ?? []);
    latestIgnoredFileContents = Object.fromEntries(
      Object.entries(latestIgnoredFileContents).filter(([filePath]) =>
        activeIgnoredPaths.has(filePath)
      )
    );
    const currentUncommittedKey = JSON.stringify(
      [
        ...raw.uncommittedFiles.map((f) => `${f.status}:${f.path}`),
        ...Object.entries(latestUncommittedFileContents).map(([filePath, content]) => `content:${filePath}:${content}`),
        ...Object.entries(latestIgnoredFileContents).map(([filePath, content]) => `ignored:${filePath}:${content}`),
      ].sort()
    );
    const currentGitHead = raw.gitHeadSha || "";

    let addedFiles: string[] = [];
    let removedFiles: string[] = [];
    let changedUncommitted = false;
    let changedGitHead = false;
    let s3AddedKeys: string[] = [];
    let s3ModifiedKeys: string[] = [];
    let s3RemovedKeys: string[] = [];
    let s3Changed = false;
    let stateAddedRecords: string[] = [];
    let stateModifiedRecords: string[] = [];
    let stateRemovedRecords: string[] = [];
    let stateChanged = false;

    if (prevFiles === null) {
      // First tick: all files are "added"
      addedFiles = raw.files;
      changedUncommitted = raw.uncommittedFiles.length > 0;
      changedGitHead = currentGitHead !== "";
      tickFileListing[raw.tickIndex] = raw.files;

      s3AddedKeys = rawS3;
      s3Changed = s3AddedKeys.length > 0;
      if (s3Changed || s3AddedKeys.length > 0) {
        s3KeyListing[raw.tickIndex] = rawS3;
      }

      stateAddedRecords = rawStateRecords;
      stateChanged = stateAddedRecords.length > 0;
    } else {
      addedFiles = raw.files.filter((f) => !prevFiles!.has(f));
      removedFiles = [...prevFiles].filter((f) => !currentFiles.has(f));
      changedUncommitted = currentUncommittedKey !== prevUncommittedKey;
      changedGitHead = currentGitHead !== prevGitHead;

      // Store file listing only at change points
      if (addedFiles.length > 0 || removedFiles.length > 0) {
        tickFileListing[raw.tickIndex] = raw.files;
      }

      // S3 diffs
      s3AddedKeys = rawS3.filter((k) => !prevS3Keys!.has(k));
      if (raw.s3ObjectContents && prevS3ObjectContents) {
        s3ModifiedKeys = rawS3.filter((k) =>
          prevS3Keys!.has(k) &&
          raw.s3ObjectContents?.[k] !== undefined &&
          prevS3ObjectContents?.[k] !== undefined &&
          raw.s3ObjectContents[k] !== prevS3ObjectContents[k]
        );
      }
      s3RemovedKeys = [...prevS3Keys!].filter((k) => !currentS3Keys.has(k));
      s3Changed = s3AddedKeys.length > 0 || s3ModifiedKeys.length > 0 || s3RemovedKeys.length > 0;

      if (s3Changed) {
        s3KeyListing[raw.tickIndex] = rawS3;
      }

      if (currentStateRecordContents) {
        if (prevStateRecordContents === null) {
          stateAddedRecords = rawStateRecords;
          stateChanged = stateAddedRecords.length > 0;
        } else {
          const previousContents = prevStateRecordContents;
          stateAddedRecords = rawStateRecords.filter((record) => !prevStateRecords!.has(record));
          stateModifiedRecords = rawStateRecords.filter((record) =>
            prevStateRecords!.has(record) &&
            currentStateRecordContents[record] !== undefined &&
            previousContents[record] !== undefined &&
            currentStateRecordContents[record] !== previousContents[record]
          );
          stateRemovedRecords = [...prevStateRecords!].filter((record) => !currentStateRecords.has(record));
          stateChanged = stateAddedRecords.length > 0 || stateModifiedRecords.length > 0 || stateRemovedRecords.length > 0;
        }
      }
    }

    processedTicks.push({
      timestamp: raw.timestamp,
      tickIndex: raw.tickIndex,
      isSnapshot: raw.isSnapshot,
      ...(raw.snapshotMessage !== undefined && { snapshotMessage: raw.snapshotMessage }),
      fileCount: raw.files.length,
      uncommittedCount: raw.uncommittedFiles.length,
      uncommittedFiles: raw.uncommittedFiles,
      uncommittedFileContents: raw.uncommittedFileContents ?? {},
      ignoredFiles: raw.ignoredFiles ?? [],
      ...(raw.ignoredFileContents !== undefined && { ignoredFileContents: raw.ignoredFileContents }),
      ...(raw.gitHeadSha !== undefined && { gitHeadSha: raw.gitHeadSha }),
      addedFiles,
      removedFiles,
      changedUncommitted,
      changedGitHead,
      s3KeyCount: currentS3Keys.size,
      s3AddedKeys,
      s3ModifiedKeys,
      s3RemovedKeys,
      s3Changed,
      ...(raw.s3ObjectContents !== undefined && { s3ObjectContents: raw.s3ObjectContents }),
      stateRecordCount: currentStateRecords.size,
      stateAddedRecords,
      stateModifiedRecords,
      stateRemovedRecords,
      stateChanged,
      ...(raw.stateRecordContents !== undefined && { stateRecordContents: raw.stateRecordContents }),
    });

    prevFiles = currentFiles;
    prevS3Keys = currentS3Keys;
    prevS3ObjectContents = raw.s3ObjectContents ?? null;
    prevStateRecords = currentStateRecords;
    prevStateRecordContents = currentStateRecordContents;
    prevUncommittedKey = currentUncommittedKey;
    prevGitHead = currentGitHead;
  }

  // Build consolidated tick groups: merge consecutive no-change ticks
  const consolidatedTicks: ConsolidatedTickGroup[] = [];
  let groupStart: number | null = null;

  for (let i = 0; i < processedTicks.length; i++) {
    const t = processedTicks[i];
    const hasChange =
      t.addedFiles.length > 0 ||
      t.removedFiles.length > 0 ||
      t.changedUncommitted ||
      t.changedGitHead ||
      t.s3Changed ||
      t.stateChanged ||
      t.isSnapshot;

    if (!hasChange) {
      if (groupStart === null) groupStart = i;
    } else {
      if (groupStart !== null) {
        consolidatedTicks.push({
          startIndex: processedTicks[groupStart].tickIndex,
          endIndex: processedTicks[i - 1].tickIndex,
          tickCount: i - groupStart,
          startTimestamp: processedTicks[groupStart].timestamp,
          endTimestamp: processedTicks[i - 1].timestamp,
        });
        groupStart = null;
      }
    }
  }
  // Close trailing group
  if (groupStart !== null) {
    const last = processedTicks.length - 1;
    consolidatedTicks.push({
      startIndex: processedTicks[groupStart].tickIndex,
      endIndex: processedTicks[last].tickIndex,
      tickCount: last - groupStart + 1,
      startTimestamp: processedTicks[groupStart].timestamp,
      endTimestamp: processedTicks[last].timestamp,
    });
  }

  const totalDurationMs =
    rawTicks.length >= 2
      ? new Date(rawTicks[rawTicks.length - 1].timestamp).getTime() -
        new Date(rawTicks[0].timestamp).getTime()
      : 0;

  return {
    ticks: processedTicks,
    consolidatedTicks,
    tickFileListing,
    s3KeyListing,
    tickConfig: {
      intervalMs,
      totalTicks: rawTicks.length,
      totalDurationMs,
    },
  };
}

interface VideoInfo {
  path: string;
  dirName: string;
  size: number;
}

/** Walk TEST_RESULTS_DIR once and return all .webm videos. */
function collectAllVideos(): VideoInfo[] {
  if (!existsSync(TEST_RESULTS_DIR)) return [];
  const videos: VideoInfo[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".webm")) {
        videos.push({
          path: full,
          dirName: path.basename(path.dirname(full)).toLowerCase(),
          size: statSync(full).size,
        });
      }
    }
  }
  walk(TEST_RESULTS_DIR);
  return videos;
}

/** Match a test slug to the video captured in that test's dedicated context directory. */
function findVideoFromList(videos: VideoInfo[], testSlug: string): string | null {
  const exactDirName = `${testSlug}-context`;
  const exactMatches = videos.filter((video) => video.dirName === exactDirName);
  return exactMatches.sort((a, b) => b.size - a.size)[0]?.path ?? null;
}

/** Run async tasks with bounded concurrency. */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const item = queue.shift()!;
          await fn(item);
        }
      })()
    );
  }
  await Promise.all(workers);
}

/** Fork a child process to run assembly for a single test directory. */
function forkAssembly(workerScript: string, testDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = fork(workerScript, [testDir], { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Assembly failed for ${path.basename(testDir)} (exit ${code})`));
    });
    child.on("error", reject);
  });
}

function computeScenarioReportMeta(
  testDir: string,
  manifest: Manifest
): ScenarioReportMeta {
  const { testName, startTime, endTime, logs, uncommittedEntries, bundleMode, scenarioDocIds, bundleDocIds, appAreaDocIds, keyFrames } = manifest;

  // Compute duration
  const duration = (startTime && endTime)
    ? (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000
    : null;

  // Read failure reason if present
  const failureReasonPath = path.join(testDir, "failure-reason.txt");
  const failureReason = existsSync(failureReasonPath)
    ? readFileSync(failureReasonPath, "utf8").trim()
    : undefined;

  const scenarioInfo = { testName, duration, bundleMode, scenarioDocIds, bundleDocIds, appAreaDocIds, keyFrames, ...(failureReason && { failureReason }) };

  // Load expected error windows (written by the expectLogErrors fixture)
  const expectedWindowsPath = path.join(testDir, "expected-error-windows.json");
  const expectedWindows: ExpectedErrorWindow[] = existsSync(expectedWindowsPath)
    ? JSON.parse(readFileSync(expectedWindowsPath, "utf8"))
    : [];

  // Compute summary totals (skip benign browser resource errors)
  let totalErrorCount = 0;
  let totalWarnCount = 0;
  for (const log of logs) {
    if (isBenignLogEntry(log, expectedWindows)) continue;
    if (log.level === "ERROR") totalErrorCount++;
    else if (log.level === "WARN") totalWarnCount++;
  }
  const hasUncommittedAtEnd =
    uncommittedEntries.length > 0 &&
    uncommittedEntries[uncommittedEntries.length - 1].uncommittedFiles.length > 0;
  const uncommittedFileCountAtEnd =
    uncommittedEntries.length > 0
      ? uncommittedEntries[uncommittedEntries.length - 1].uncommittedFiles.length
      : 0;
  const finalMeadowHomeStateCheck = readFinalMeadowHomeStateCheck(testDir);
  const hasUnacceptedUncommittedAtEnd =
    hasUncommittedAtEnd && finalMeadowHomeStateCheck?.accepted !== true;
  const hasIssues = totalErrorCount > 0 || totalWarnCount > 0 || hasUnacceptedUncommittedAtEnd;

  // Build snapshot timestamps from minio + any extension state repos'
  // timeline.jsonl (same as server health endpoint).
  const snapshotTimestamps: string[] = [];
  const seenMessages = new Set<string>();

  const repoNamesForHealth = ["minio-state-repo", ...listExtensionStateRepos(testDir)];
  for (const repoName of repoNamesForHealth) {
    const repoPath = path.join(testDir, repoName);
    if (!existsSync(repoPath)) continue;
    const timelineMap = readTimeline(path.join(repoPath, "timeline.jsonl"));
    try {
      const logOutput = execSync('git log --format="%H %aI %s" --reverse', {
        cwd: repoPath,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      if (!logOutput) continue;
      for (const line of logOutput.split("\n")) {
        const [hash, gitTimestamp, ...msgParts] = line.split(" ");
        const commitMessage = msgParts.join(" ");
        if (seenMessages.has(commitMessage)) continue;
        seenMessages.add(commitMessage);
        const timelineEntry = timelineMap.get(hash);
        snapshotTimestamps.push(timelineEntry?.timestamp ?? gitTimestamp);
      }
    } catch {
      // skip
    }
  }

  snapshotTimestamps.sort();

  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  const durationMs = endMs - startMs;

  if (snapshotTimestamps.length === 0 || durationMs <= 0) {
    return {
      version: 1,
      scenarioInfo,
      summary: { totalErrorCount, totalWarnCount, hasUncommittedAtEnd: hasUnacceptedUncommittedAtEnd, uncommittedFileCountAtEnd, hasIssues },
      health: { points: [], hasUncommittedAtEnd: hasUnacceptedUncommittedAtEnd, hasAnyData: false },
    };
  }

  // Compute health points (same algorithm as server's /health endpoint)
  const points: ReportMetaHealthPoint[] = [];
  let prevTimeMs = startMs;

  for (const ts of snapshotTimestamps) {
    const snapMs = new Date(ts).getTime();
    const pct = Math.min(100, Math.max(0, ((snapMs - startMs) / durationMs) * 100));

    let errorCount = 0;
    let warnCount = 0;
    for (const log of logs) {
      if (!log.timestamp) continue;
      if (isBenignLogEntry(log, expectedWindows)) continue;
      const logMs = new Date(log.timestamp).getTime();
      if (logMs > prevTimeMs && logMs <= snapMs) {
        if (log.level === "ERROR") errorCount++;
        else if (log.level === "WARN") warnCount++;
      }
    }

    let uncommittedTrackedFiles = 0;
    let uncommittedTrackedFolders = 0;
    let uncommittedUntrackedFiles = 0;
    let uncommittedUntrackedFolders = 0;
    for (const entry of uncommittedEntries) {
      const entryMs = new Date(entry.timestamp).getTime();
      if (entryMs <= snapMs) {
        uncommittedTrackedFiles = 0;
        uncommittedTrackedFolders = 0;
        uncommittedUntrackedFiles = 0;
        uncommittedUntrackedFolders = 0;
        for (const f of entry.uncommittedFiles) {
          const isFolder = f.path.endsWith("/");
          const isUntracked = f.status === "?";
          if (isUntracked) {
            if (isFolder) uncommittedUntrackedFolders++;
            else uncommittedUntrackedFiles++;
          } else {
            if (isFolder) uncommittedTrackedFolders++;
            else uncommittedTrackedFiles++;
          }
        }
      } else break;
    }

    points.push({ pct, timestamp: ts, errorCount, warnCount, uncommittedTrackedFiles, uncommittedTrackedFolders, uncommittedUntrackedFiles, uncommittedUntrackedFolders });
    prevTimeMs = snapMs;
  }

  const healthHasAnyData = points.some(
    (p) =>
      p.errorCount > 0 || p.warnCount > 0 ||
      p.uncommittedTrackedFiles > 0 || p.uncommittedTrackedFolders > 0 ||
      p.uncommittedUntrackedFiles > 0 || p.uncommittedUntrackedFolders > 0
  );

  return {
    version: 1,
    scenarioInfo,
    summary: { totalErrorCount, totalWarnCount, hasUncommittedAtEnd: hasUnacceptedUncommittedAtEnd, uncommittedFileCountAtEnd, hasIssues },
    health: { points, hasUncommittedAtEnd: hasUnacceptedUncommittedAtEnd, hasAnyData: healthHasAnyData },
  };
}

/**
 * Assemble per-test artifacts (everything except video).
 * Called during each test's fixture teardown so it runs in parallel.
 */
export function assembleTestArtifacts(testDir: string): void {
  const testName = path.basename(testDir);
  console.log(`Assembling artifacts for: ${testName}`);
  const assemblyStartedAt = new Date().toISOString();
  const assemblyStart = performance.now();
  const assemblySteps: AssemblyTimingStep[] = [];

  const { startTime, endTime, status } = measured(assemblySteps, "read lifecycle files", () => ({
    startTime: existsSync(path.join(testDir, "start-time.txt"))
      ? readFileSync(path.join(testDir, "start-time.txt"), "utf8").trim()
      : "",
    endTime: existsSync(path.join(testDir, "end-time.txt"))
      ? readFileSync(path.join(testDir, "end-time.txt"), "utf8").trim()
      : "",
    status: existsSync(path.join(testDir, "status.txt"))
      ? readFileSync(path.join(testDir, "status.txt"), "utf8").trim()
      : "unknown",
  }));

  // Extract snapshots from git repo
  const meadowHomeStateRepo = path.join(testDir, "meadowHome-state-repo");
  const snapshots = extractSnapshots(meadowHomeStateRepo, assemblySteps, "meadowHome snapshots");
  const snapshotMeta = measured(assemblySteps, "meadowHome snapshot meta", () =>
    extractSnapshotMeta(meadowHomeStateRepo, "")
  );

  // Extract MinIO S3 snapshot metadata
  const minioStateRepo = path.join(testDir, "minio-state-repo");
  const minioSnapshotMeta = measured(assemblySteps, "minio snapshot meta", () =>
    extractSnapshotMeta(minioStateRepo, "objects/")
  );

  // Extract snapshot metadata for any extension-contributed state repos.
  // Each repo's optional _meta.json declares the path prefix under which
  // its tracked records live; missing or unreadable meta defaults to "".
  const extensionSnapshotMeta: Record<string, SnapshotMeta[]> = {};
  for (const repoName of listExtensionStateRepos(testDir)) {
    const repoPath = path.join(testDir, repoName);
    const repoMeta = readStateRepoMeta(repoPath);
    extensionSnapshotMeta[repoName] = measured(
      assemblySteps,
      `extension snapshot meta:${repoName}`,
      () => extractSnapshotMeta(repoPath, repoMeta.pathPrefix ?? "")
    );
  }

  // Parse logs
  const frontendLogs = measured(assemblySteps, "parse frontend log", () =>
    parseFrontendLog(path.join(testDir, "frontend.log"))
  );
  const backendLogs = measured(assemblySteps, "parse backend log", () =>
    parseBackendLog(path.join(testDir, "backend.log"))
  );
  const logs = measured(assemblySteps, "merge logs", () => [...frontendLogs, ...backendLogs].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp)
  ));


  // Read test source code
  const { testSourceFile, testSource } = measured(assemblySteps, "read test source", () => {
    let sourceFile = "";
    let source = "";
    const testFilePath = path.join(testDir, "test-file.txt");
    if (existsSync(testFilePath)) {
      sourceFile = readFileSync(testFilePath, "utf8").trim();
      if (existsSync(sourceFile)) {
        source = readFileSync(sourceFile, "utf8");
      }
    }
    return { testSourceFile: sourceFile, testSource: source };
  });

  // Read uncommitted file log and do a final check on the copied repo
  const uncommittedEntries = measured(assemblySteps, "read uncommitted log", () =>
    readUncommittedLog(path.join(testDir, "meadowHome-uncommitted.jsonl"))
  );
  measured(assemblySteps, "final git status", () => {
    if (existsSync(meadowHomeStateRepo)) {
      try {
        const finalStatus = execSync("git status --porcelain", {
          cwd: meadowHomeStateRepo,
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
        }).trim();
        const finalFiles = finalStatus
          ? finalStatus.split("\n").map((line) => ({
              status: line.slice(0, 2).trim(),
              path: line.slice(3),
            }))
          : [];
        uncommittedEntries.push({
          timestamp: endTime || new Date().toISOString(),
          message: "(final state at teardown)",
          uncommittedFiles: finalFiles,
        });
      } catch {
        // not a git repo or git not available
      }
    }
  });

  const bundleMode = measured(assemblySteps, "read bundle mode", () => {
    const bundleModePath = path.join(testDir, "bundle-mode.txt");
    if (!existsSync(bundleModePath)) return null;
    const value = readFileSync(bundleModePath, "utf8").trim();
    if (!isBundleMode(value)) {
      throw new Error(`Invalid bundle mode in ${bundleModePath}: ${JSON.stringify(value)}`);
    }
    return value;
  });

  // Extract scenario doc IDs, app area doc IDs, and bundle doc IDs from test source imports.
  const { scenarioDocIds, bundleDocIds, appAreaDocIds } = measured(assemblySteps, "extract doc ids", () => {
    const scenarioIds = extractScenarioDocIds(testSource);
    return {
      scenarioDocIds: scenarioIds,
      bundleDocIds: extractBundleDocIds(testSource),
      appAreaDocIds: deriveAppAreaDocIds(
        scenarioIds,
        extractExplicitAppAreaDocIds(testSource),
        moduleScenarioDocToAppAreaIds
      ),
    };
  });

  // Read key frames if they exist
  const keyFramesPath = path.join(testDir, "keyframes.json");
  const keyFrames: KeyFrame[] = measured(assemblySteps, "read keyframes", () =>
    existsSync(keyFramesPath)
      ? JSON.parse(readFileSync(keyFramesPath, "utf8"))
      : []
  );

  // Process tick log
  const tickData = measured(assemblySteps, "process tick log", () =>
    processTickLog(testDir)
  );

  // Write manifest
  const manifest: Manifest = { testName, status, startTime, endTime, snapshots, snapshotMeta, minioSnapshotMeta, extensionSnapshotMeta, uncommittedEntries, logs, testSourceFile, testSource, bundleMode, scenarioDocIds, bundleDocIds, appAreaDocIds, keyFrames, ...tickData };
  const manifestJson = measured(assemblySteps, "manifest stringify", () =>
    JSON.stringify(manifest, null, 2)
  );
  measured(assemblySteps, "manifest write", () => {
    writeFileSync(path.join(testDir, "manifest.json"), manifestJson);
  });
  console.log(`  Manifest: ${snapshots.length} snapshots, ${logs.length} log entries, ${tickData.ticks.length} ticks`);

  // Pre-compute report metadata for fast viewer loading
  let reportMetaBytes: number | null = null;
  let reportMetaHealthPoints: number | null = null;
  let reportMetaError: string | null = null;
  if (manifest.startTime && manifest.endTime) {
    try {
      const reportMeta = measured(assemblySteps, "report meta compute", () =>
        computeScenarioReportMeta(testDir, manifest)
      );
      const reportMetaJson = measured(assemblySteps, "report meta stringify", () =>
        JSON.stringify(reportMeta, null, 2)
      );
      reportMetaBytes = Buffer.byteLength(reportMetaJson);
      measured(assemblySteps, "report meta write", () => {
        writeFileSync(path.join(testDir, "report-meta.json"), reportMetaJson);
      });
      reportMetaHealthPoints = reportMeta.health.points.length;
      console.log(`  Report meta: ${reportMeta.health.points.length} health points`);
    } catch (err) {
      reportMetaError = String(err);
      console.log(`  Report meta: failed to compute (${err})`);
    }
  }

  const timing: AssemblyTiming = {
    version: 1,
    testName,
    status,
    startTime,
    endTime,
    startedAt: assemblyStartedAt,
    endedAt: new Date().toISOString(),
    totalMs: performance.now() - assemblyStart,
    steps: assemblySteps,
    artifacts: {
      manifestBytes: Buffer.byteLength(manifestJson),
      reportMetaBytes,
      reportMetaHealthPoints,
      reportMetaError,
      tickLogBytes: fileSizeOrNull(path.join(testDir, "ticks.jsonl")),
      frontendLogBytes: fileSizeOrNull(path.join(testDir, "frontend.log")),
      backendLogBytes: fileSizeOrNull(path.join(testDir, "backend.log")),
      meadowHomeSnapshotCount: snapshots.length,
      minioSnapshotMetaCount: minioSnapshotMeta.length,
      extensionStateRepoCount: Object.keys(extensionSnapshotMeta).length,
      tickCount: tickData.ticks.length,
      consolidatedTickGroupCount: tickData.consolidatedTicks.length,
      logEntryCount: logs.length,
    },
  };
  writeJsonFile(path.join(testDir, "assembly-timing.json"), timing);
}

/**
 * Post-run step: assemble per-test artifacts (manifest, report-meta), copy
 * videos, and build run-level report metadata.  Per-test assembly runs here
 * (not during fixture teardown) so that the browser context — and its video
 * recording — can close promptly after the test body finishes.
 *
 * Assembly is parallelized across CPU cores using child_process.fork().
 */
export async function assembleRun(runId: string): Promise<void> {
  const runDir = path.join(ARTIFACTS_BASE, runId);

  if (!existsSync(runDir)) {
    console.log(`No artifact directory found for run ${runId}.`);
    return;
  }

  const dirs = readdirSync(runDir).filter((d) =>
    statSync(path.join(runDir, d)).isDirectory()
  );

  if (dirs.length === 0) {
    console.log(`No scenario directories found in run ${runId}.`);
    return;
  }

  const CONCURRENCY =
    parseInt(process.env.E2E_ASSEMBLE_WORKERS || "", 10) || os.cpus().length;
  const workerScript = path.join(import.meta.dirname, "assemble-worker.ts");

  // Pre-collect all videos (single directory walk instead of one per test)
  const videoCollectStart = performance.now();
  const allVideos = collectAllVideos();
  const videoCollectMs = performance.now() - videoCollectStart;

  // Assemble per-test artifacts in parallel and copy videos
  const assemblyStart = performance.now();
  const failures: string[] = [];
  const parentTimings = new Map<string, { parentForkMs: number; videoCopyMs: number; videoBytes?: number }>();

  await runWithConcurrency(dirs, CONCURRENCY, async (dir) => {
    const testDir = path.join(runDir, dir);
    const forkStart = performance.now();
    let parentForkMs = 0;
    let videoCopyMs = 0;
    let videoBytes: number | undefined;

    try {
      await forkAssembly(workerScript, testDir);
      parentForkMs = performance.now() - forkStart;
    } catch (err) {
      parentForkMs = performance.now() - forkStart;
      console.log(`  ${dir}: assembly failed (${err})`);
      failures.push(dir);
    }

    const videoStart = performance.now();
    try {
      const videoDest = path.join(testDir, "video.webm");
      rmSync(videoDest, { force: true });
      const videoSrc = findVideoFromList(allVideos, dir);
      if (videoSrc) {
        cpSync(videoSrc, videoDest);
        videoBytes = fileSizeOrNull(videoSrc) ?? undefined;
      }
    } finally {
      videoCopyMs = performance.now() - videoStart;
      parentTimings.set(dir, { parentForkMs, videoCopyMs, videoBytes });
    }
  });

  const assemblyMs = performance.now() - assemblyStart;
  console.log(`\nParallel assembly: ${dirs.length} tests, ${CONCURRENCY} workers, ${(assemblyMs / 1000).toFixed(1)}s (video scan: ${videoCollectMs.toFixed(0)}ms)`);
  if (failures.length > 0) {
    console.log(`  ${failures.length} assembly failure(s): ${failures.join(", ")}`);
  }

  const scenarioTimings: AssemblyTimingSummary["scenarios"] = [];
  const totalsByStep = new Map<string, number>();
  for (const dir of dirs) {
    const timingPath = path.join(runDir, dir, "assembly-timing.json");
    if (!existsSync(timingPath)) continue;
    try {
      const timing = JSON.parse(readFileSync(timingPath, "utf8")) as AssemblyTiming;
      for (const step of timing.steps) {
        totalsByStep.set(step.name, (totalsByStep.get(step.name) ?? 0) + step.ms);
      }
      scenarioTimings.push({
        ...timing,
        ...(parentTimings.get(dir) ?? {}),
      });
    } catch {
      // A failed or interrupted assembly may leave timing unavailable.
    }
  }
  if (scenarioTimings.length > 0) {
    const timingSummary: AssemblyTimingSummary = {
      version: 1,
      runId,
      concurrency: CONCURRENCY,
      videoCollectMs,
      parallelAssemblyMs: assemblyMs,
      scenarios: scenarioTimings.sort((a, b) => b.totalMs - a.totalMs),
      totalsByStep: [...totalsByStep.entries()]
        .map(([name, ms]) => ({ name, ms }))
        .sort((a, b) => b.ms - a.ms),
    };
    writeJsonFile(path.join(runDir, "assembly-timing-summary.json"), timingSummary);
    console.log(`Assembly timing summary written with ${scenarioTimings.length} scenario(s)`);
  }

  // Compute total wall-clock duration from earliest start to latest end
  let earliestStart = Infinity;
  let latestEnd = -Infinity;
  for (const dir of dirs) {
    const testDir = path.join(runDir, dir);
    const startFile = path.join(testDir, "start-time.txt");
    const endFile = path.join(testDir, "end-time.txt");
    if (existsSync(startFile)) {
      const t = new Date(readFileSync(startFile, "utf8").trim()).getTime();
      if (t < earliestStart) earliestStart = t;
    }
    if (existsSync(endFile)) {
      const t = new Date(readFileSync(endFile, "utf8").trim()).getTime();
      if (t > latestEnd) latestEnd = t;
    }
  }
  const totalDurationSeconds = (earliestStart < Infinity && latestEnd > -Infinity)
    ? Math.round((latestEnd - earliestStart) / 1000)
    : null;

  // Build run-level report meta from per-scenario report-meta.json files
  const runReportMeta: RunReportMeta = { version: 1, totalDurationSeconds, scenarios: {} };
  for (const dir of dirs) {
    const scenarioMetaPath = path.join(runDir, dir, "report-meta.json");
    if (existsSync(scenarioMetaPath)) {
      try {
        const meta = JSON.parse(readFileSync(scenarioMetaPath, "utf8")) as ScenarioReportMeta;
        if (meta.version === 1) {
          runReportMeta.scenarios[dir] = {
            totalErrorCount: meta.summary.totalErrorCount,
            totalWarnCount: meta.summary.totalWarnCount,
            hasUncommittedAtEnd: meta.summary.hasUncommittedAtEnd,
            hasIssues: meta.summary.hasIssues,
          };
        }
      } catch {
        // skip
      }
    }
  }
  if (Object.keys(runReportMeta.scenarios).length > 0) {
    writeFileSync(
      path.join(runDir, "run-report-meta.json"),
      JSON.stringify(runReportMeta, null, 2)
    );
    console.log(`Run report meta written with ${Object.keys(runReportMeta.scenarios).length} scenarios`);
  }

  console.log(`\nArtifacts assembled in ${runDir}/`);
}

// Direct-run guard for standalone invocation
const isDirectRun = process.argv[1]?.endsWith("assemble.ts");
if (isDirectRun) {
  const runId = process.env.E2E_RUN_ID || "default";
  await assembleRun(runId);
}
