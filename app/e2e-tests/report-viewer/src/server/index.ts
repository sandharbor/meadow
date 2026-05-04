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

import express from "express";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import os from "os";
import path from "path";
import { allDocs } from "../../../test-runner/src/scenario-docs/index.ts";
import { allSiteDocs } from "../../../test-runner/src/site-docs/index.ts";
import {
  generateFixtureScenario,
  FIXTURE_RUN_ID,
  FIXTURE_TEST_SLUG,
} from "./fixture-scenario/index.ts";

// Optionally load an extension scenario-doc layer. When no extension is
// mounted, this folder is gone and the import no-ops.
// Runtime-computed path so tsc doesn't require the module to exist.
type ScenarioDocLike = { id: string };
let meadowExtensionDocs: ScenarioDocLike[] = [];
{
  const extIndex = path.join(
    import.meta.dirname, "..", "..", "..", "test-runner", "src", "scenario-docs", "meadow-extension", "index.ts"
  );
  if (existsSync(extIndex)) {
    const extPath = "../../../test-runner/src/scenario-docs/meadow-extension/index.ts";
    const mod = await import(extPath) as { meadowExtensionDocs?: ScenarioDocLike[] };
    meadowExtensionDocs = mod.meadowExtensionDocs ?? [];
  }
}

const ARTIFACTS_ROOT = path.join(os.homedir(), "meadow-e2e-artifacts");
const CURRENT_ARTIFACTS_ROOT = path.join(ARTIFACTS_ROOT, "current");
const ARCHIVED_ARTIFACTS_ROOT = path.join(ARTIFACTS_ROOT, "archived");

const app = express();

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

// --- Path traversal validation ---

function safeRunDir(runId: string): string | null {
  if (/[/\\.]/.test(runId)) return null;
  const dir = path.join(CURRENT_ARTIFACTS_ROOT, runId);
  if (!dir.startsWith(CURRENT_ARTIFACTS_ROOT)) return null;
  if (!existsSync(dir)) return null;
  return dir;
}

function safeScenarioDir(runId: string, testSlug: string): string | null {
  if (/[/\\.]/.test(runId) || /[/\\.]/.test(testSlug)) return null;
  const dir = path.join(CURRENT_ARTIFACTS_ROOT, runId, testSlug);
  if (!dir.startsWith(CURRENT_ARTIFACTS_ROOT)) return null;
  if (!existsSync(dir)) return null;
  return dir;
}

function safeArchivedRunDir(runId: string): string {
  return path.join(ARCHIVED_ARTIFACTS_ROOT, runId);
}

function archiveRun(runId: string): string {
  const sourceDir = safeRunDir(runId);
  if (!sourceDir) {
    throw new Error(`Run not found: ${runId}`);
  }

  mkdirSync(ARCHIVED_ARTIFACTS_ROOT, { recursive: true });
  let destDir = safeArchivedRunDir(runId);
  if (existsSync(destDir)) {
    destDir = safeArchivedRunDir(`${runId}__archived-${Date.now()}`);
  }
  renameSync(sourceDir, destDir);
  return path.basename(destDir);
}

// --- Fixture scenario regeneration ---
//
// The fixture scenario at /__fixture/canonical is regenerated from factory
// scripts on demand so the user can edit a factory file and see the result
// on the very next page refresh. The middleware below intercepts every API
// request under /api/__fixture/canonical/, ensuring the artifact is fresh
// before any handler runs.
//
// Cost control: regeneration is cached against the newest mtime of any
// file under fixture-scenario/. When the user is just navigating around
// the artifact (no source edits), the middleware is a single statSync per
// request. When a source file changes, the next request triggers a full
// regen and all subsequent in-flight requests share the same inflight
// promise so they see consistent fresh state.

const FIXTURE_SOURCE_DIR = path.join(import.meta.dirname, "fixture-scenario");
const FIXTURE_ARTIFACT_DIR = path.join(
  CURRENT_ARTIFACTS_ROOT,
  FIXTURE_RUN_ID,
  FIXTURE_TEST_SLUG
);

let fixtureRegenInflight: Promise<void> | null = null;
let fixtureLastSourceMtime = -1;

function newestSourceMtimeMs(dir: string): number {
  let newest = 0;
  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const m = statSync(full).mtimeMs;
        if (m > newest) newest = m;
      }
    }
  }
  walk(dir);
  return newest;
}

async function ensureFreshFixtureScenario(): Promise<void> {
  if (fixtureRegenInflight) return fixtureRegenInflight;

  const sourceMtime = newestSourceMtimeMs(FIXTURE_SOURCE_DIR);
  const manifestPath = path.join(FIXTURE_ARTIFACT_DIR, "manifest.json");
  const upToDate =
    existsSync(manifestPath) && sourceMtime === fixtureLastSourceMtime;
  if (upToDate) return;

  fixtureRegenInflight = (async () => {
    await generateFixtureScenario();
    fixtureLastSourceMtime = sourceMtime;
  })().finally(() => {
    fixtureRegenInflight = null;
  });
  return fixtureRegenInflight;
}

app.use(
  `/api/${FIXTURE_RUN_ID}/${FIXTURE_TEST_SLUG}`,
  async (_req, res, next) => {
    try {
      await ensureFreshFixtureScenario();
      next();
    } catch (e) {
      res
        .status(500)
        .send(`Fixture scenario regen failed: ${(e as Error).message}`);
    }
  }
);

// --- Scenario docs API ---

// GET /api/scenario-docs — return all scenario doc definitions (base plus
// any extension layer). Each doc is tagged with isMeadowExtension so the
// client can group them.
app.get("/api/scenario-docs", (_req, res) => {
  const base = allDocs.map((d) => ({ ...d, isMeadowExtension: false }));
  const extension = meadowExtensionDocs.map((d) => ({ ...d, isMeadowExtension: true }));
  res.json([...base, ...extension]);
});

// GET /api/site-docs — return all site doc definitions
app.get("/api/site-docs", (_req, res) => {
  res.json(allSiteDocs);
});

// --- Navigation APIs ---

// GET /api/runs — list all runs with scenario statuses
app.get("/api/runs", (_req, res) => {
  if (!existsSync(CURRENT_ARTIFACTS_ROOT)) {
    return res.json([]);
  }

  const entries = readdirSync(CURRENT_ARTIFACTS_ROOT)
    .filter((name) => {
      // Hide internal scratch dirs (e.g. the regenerable fixture scenario)
      // from the runs list — they're reachable only by direct URL.
      if (name.startsWith("__")) return false;
      const full = path.join(CURRENT_ARTIFACTS_ROOT, name);
      return statSync(full).isDirectory();
    })
    .sort()
    .reverse(); // newest first

  const runs = entries.map((runId) => {
    const runDir = path.join(CURRENT_ARTIFACTS_ROOT, runId);

    // Try to read pre-computed run-level report meta
    let runMeta: Record<string, { hasIssues: boolean }> | null = null;
    let totalDurationSeconds: number | null = null;
    const runMetaPath = path.join(runDir, "run-report-meta.json");
    if (existsSync(runMetaPath)) {
      try {
        const parsed = JSON.parse(readFileSync(runMetaPath, "utf8"));
        if (parsed.version === 1) {
          runMeta = parsed.scenarios;
          totalDurationSeconds = parsed.totalDurationSeconds ?? null;
        }
      } catch {
        // fall through to manifest scanning
      }
    }

    // Track fallback results so we can lazily backfill run-report-meta.json
    const backfillScenarios: Record<string, { hasIssues: boolean }> = {};
    let needsBackfill = false;

    const scenarios = readdirSync(runDir)
      .filter((name) => {
        const full = path.join(runDir, name);
        return statSync(full).isDirectory();
      })
      .map((slug) => {
        const scenarioDir = path.join(runDir, slug);
        const statusFile = path.join(scenarioDir, "status.txt");
        let status = "unknown";
        if (existsSync(statusFile)) {
          status = readFileSync(statusFile, "utf8").trim();
        }

        let hasIssues = false;
        if (runMeta && slug in runMeta) {
          hasIssues = runMeta[slug].hasIssues;
        } else {
          needsBackfill = true;
          // Fallback: scan manifest.json (expensive for large logs)
          const manifestFile = path.join(scenarioDir, "manifest.json");
          if (existsSync(manifestFile)) {
            try {
              const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
              const logs: { level?: string }[] = manifest.logs || [];
              const hasErrorOrWarn = logs.some(
                (l) => l.level === "ERROR" || l.level === "WARN"
              );
              const uncommitted: {
                uncommittedFiles: unknown[];
              }[] = manifest.uncommittedEntries || [];
              const hasUncommittedAtEnd =
                uncommitted.length > 0 &&
                uncommitted[uncommitted.length - 1].uncommittedFiles.length > 0;
              hasIssues = hasErrorOrWarn || hasUncommittedAtEnd;
            } catch {
              // ignore
            }
          }
          backfillScenarios[slug] = { hasIssues };
        }

        return { slug, status, hasIssues };
      });

    // Lazily backfill run-report-meta.json so subsequent loads are fast
    if (needsBackfill && Object.keys(backfillScenarios).length > 0) {
      try {
        const merged: Record<string, { totalErrorCount: number; totalWarnCount: number; hasUncommittedAtEnd: boolean; hasIssues: boolean }> = {};
        // Carry over any existing entries from runMeta
        if (runMeta) {
          for (const [k, v] of Object.entries(runMeta)) {
            merged[k] = { totalErrorCount: 0, totalWarnCount: 0, hasUncommittedAtEnd: false, ...v };
          }
        }
        for (const [k, v] of Object.entries(backfillScenarios)) {
          merged[k] = { totalErrorCount: 0, totalWarnCount: 0, hasUncommittedAtEnd: false, ...v };
        }
        writeFileSync(runMetaPath, JSON.stringify({ version: 1, scenarios: merged }, null, 2));
      } catch {
        // best-effort backfill
      }
    }

    const allPassed = scenarios.length > 0 && scenarios.every((s) => s.status === "passed");
    const anyFailed = scenarios.some((s) => s.status === "failed");

    // Parse timestamp from runId format: YYYY-MM-DD_HH-MM-SS
    let createdAt: string | null = null;
    const match = runId.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
    if (match) {
      createdAt = `${match[1]}T${match[2]}:${match[3]}:${match[4]}`;
    }

    // Read run-level notes
    let notes: string | undefined;
    const runNotesFile = path.join(runDir, "notes.md");
    if (existsSync(runNotesFile)) {
      notes = readFileSync(runNotesFile, "utf8");
    }

    return {
      runId,
      scenarioCount: scenarios.length,
      status: anyFailed ? "failed" : allPassed ? "passed" : "unknown",
      scenarios,
      createdAt,
      notes,
      totalDurationSeconds,
    };
  });

  res.json(runs);
});

// GET /api/runs/:runId — list scenarios in a run
app.get("/api/runs/:runId", (req, res) => {
  const runDir = safeRunDir(req.params.runId);
  if (!runDir) {
    return res.status(404).json({ error: "Run not found" });
  }

  const scenarios = readdirSync(runDir)
    .filter((name) => {
      const full = path.join(runDir, name);
      return statSync(full).isDirectory();
    })
    .map((slug) => {
      const scenarioDir = path.join(runDir, slug);
      const statusFile = path.join(scenarioDir, "status.txt");
      let status = "unknown";
      let testName = slug;
      let duration: number | null = null;
      let scenarioDocIds: string[] = [];
      let siteDocIds: string[] = [];
      let keyFrames: { docId: string; filename: string }[] = [];
      let failureReason: string | undefined;

      if (existsSync(statusFile)) {
        status = readFileSync(statusFile, "utf8").trim();
      }

      // Try pre-computed report-meta.json first (cheap)
      const reportMetaPath = path.join(scenarioDir, "report-meta.json");
      let resolved = false;
      if (existsSync(reportMetaPath)) {
        try {
          const meta = JSON.parse(readFileSync(reportMetaPath, "utf8"));
          if (meta.version === 1 && meta.scenarioInfo) {
            testName = meta.scenarioInfo.testName || slug;
            duration = meta.scenarioInfo.duration ?? null;
            scenarioDocIds = meta.scenarioInfo.scenarioDocIds || [];
            siteDocIds = meta.scenarioInfo.siteDocIds || [];
            keyFrames = meta.scenarioInfo.keyFrames || [];
            failureReason = meta.scenarioInfo.failureReason;
            resolved = true;
          }
        } catch {
          // fall through
        }
      }

      if (!resolved) {
        // Fallback: parse full manifest.json (expensive)
        const manifestFile = path.join(scenarioDir, "manifest.json");
        if (existsSync(manifestFile)) {
          try {
            const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
            testName = manifest.testName || slug;
            scenarioDocIds = manifest.scenarioDocIds || [];
            siteDocIds = manifest.siteDocIds || [];
            keyFrames = manifest.keyFrames || [];
            if (manifest.startTime && manifest.endTime) {
              duration =
                (new Date(manifest.endTime).getTime() -
                  new Date(manifest.startTime).getTime()) /
                1000;
            }
          } catch {
            // ignore
          }
        }
      }

      // Fallback: read failure-reason.txt directly if not in report-meta
      if (!failureReason && status === "failed") {
        const failureReasonFile = path.join(scenarioDir, "failure-reason.txt");
        if (existsSync(failureReasonFile)) {
          failureReason = readFileSync(failureReasonFile, "utf8").trim();
        }
      }

      // Read the originating spec file basename (written by Playwright fixture
      // into test-file.txt). Used by the client to match up --highlighted.
      let testBasename: string | undefined;
      const testFilePath = path.join(scenarioDir, "test-file.txt");
      if (existsSync(testFilePath)) {
        try {
          const src = readFileSync(testFilePath, "utf8").trim();
          const base = path.basename(src).replace(/\.spec\.ts$/, "");
          if (base) testBasename = base;
        } catch {
          // ignore
        }
      }

      return { slug, testName, testBasename, status, duration, scenarioDocIds, siteDocIds, keyFrames, failureReason };
    });

  // Read targeted-scenarios metadata (written when --scenarios flag was used)
  let targetedScenarioIds: string[] | undefined;
  const targetedFile = path.join(runDir, "targeted-scenarios.json");
  if (existsSync(targetedFile)) {
    try {
      targetedScenarioIds = JSON.parse(readFileSync(targetedFile, "utf8"));
    } catch {
      // ignore
    }
  }

  // Read highlighted-tests metadata (written when --highlighted flag was used)
  let highlightedTestBasenames: string[] | undefined;
  const highlightedFile = path.join(runDir, "highlighted-tests.json");
  if (existsSync(highlightedFile)) {
    try {
      highlightedTestBasenames = JSON.parse(readFileSync(highlightedFile, "utf8"));
    } catch {
      // ignore
    }
  }

  res.json({ runId: req.params.runId, scenarios, targetedScenarioIds, highlightedTestBasenames });
});

// GET /api/runs/:runId/health — health summaries for all scenarios in a run
app.get("/api/runs/:runId/health", (req, res) => {
  const runDir = safeRunDir(req.params.runId);
  if (!runDir) {
    return res.status(404).json({ error: "Run not found" });
  }

  const result: Record<
    string,
    {
      points: { pct: number; errorCount: number; warnCount: number; uncommittedTrackedFiles: number; uncommittedTrackedFolders: number; uncommittedUntrackedFiles: number; uncommittedUntrackedFolders: number }[];
      hasUncommittedAtEnd: boolean;
      hasAnyData: boolean;
    }
  > = {};

  const slugs = readdirSync(runDir).filter((name) => {
    const full = path.join(runDir, name);
    return statSync(full).isDirectory();
  });

  for (const slug of slugs) {
    const scenarioDir = path.join(runDir, slug);

    // Try pre-computed report-meta.json first
    const reportMetaPath = path.join(scenarioDir, "report-meta.json");
    if (existsSync(reportMetaPath)) {
      try {
        const meta = JSON.parse(readFileSync(reportMetaPath, "utf8"));
        if (meta.version === 1) {
          result[slug] = meta.health;
          continue;
        }
      } catch { /* fall through */ }
    }

    // Fallback: compute from manifest + git (expensive)
    const manifestPath = path.join(scenarioDir, "manifest.json");
    if (!existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (!manifest.startTime || !manifest.endTime) continue;

      const startMs = new Date(manifest.startTime).getTime();
      const endMs = new Date(manifest.endTime).getTime();
      const durationMs = endMs - startMs;
      if (durationMs <= 0) continue;

      const logs: { timestamp?: string; level: string }[] = manifest.logs || [];
      const uncommittedEntries: {
        timestamp: string;
        uncommittedFiles: { status: string; path: string }[];
      }[] = manifest.uncommittedEntries || [];

      // Build snapshot timestamps from minio + any extension state repos'
      // timeline.jsonl.
      const snapshotTimestamps: string[] = [];
      const seenMessages = new Set<string>();

      const repoNamesForHealth = [
        "minio-state-repo",
        ...listExtensionStateRepoNames(scenarioDir),
      ];
      for (const repoName of repoNamesForHealth) {
        const repoPath = path.join(scenarioDir, repoName);
        if (!existsSync(repoPath)) continue;
        const timelineMap = readTimeline(
          path.join(repoPath, "timeline.jsonl")
        );
        try {
          const logOutput = execSync(
            'git log --format="%H %aI %s" --reverse',
            { cwd: repoPath, encoding: "utf8" }
          ).trim();
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

      if (snapshotTimestamps.length === 0) continue;

      // Compute health data (same logic as client-side computeHealthData)
      const points: {
        pct: number;
        errorCount: number;
        warnCount: number;
        uncommittedTrackedFiles: number;
        uncommittedTrackedFolders: number;
        uncommittedUntrackedFiles: number;
        uncommittedUntrackedFolders: number;
      }[] = [];
      let prevTimeMs = startMs;

      for (const ts of snapshotTimestamps) {
        const snapMs = new Date(ts).getTime();
        const pct = Math.min(
          100,
          Math.max(0, ((snapMs - startMs) / durationMs) * 100)
        );

        let errorCount = 0;
        let warnCount = 0;
        for (const log of logs) {
          if (!log.timestamp) continue;
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

        points.push({ pct, errorCount, warnCount, uncommittedTrackedFiles, uncommittedTrackedFolders, uncommittedUntrackedFiles, uncommittedUntrackedFolders });
        prevTimeMs = snapMs;
      }

      const hasUncommittedAtEnd =
        uncommittedEntries.length > 0 &&
        uncommittedEntries[uncommittedEntries.length - 1].uncommittedFiles
          .length > 0;
      const hasAnyData = points.some(
        (p) => p.errorCount > 0 || p.warnCount > 0 ||
          p.uncommittedTrackedFiles > 0 || p.uncommittedTrackedFolders > 0 ||
          p.uncommittedUntrackedFiles > 0 || p.uncommittedUntrackedFolders > 0
      );

      result[slug] = { points, hasUncommittedAtEnd, hasAnyData };
    } catch {
      // skip this scenario
    }
  }

  res.json(result);
});

// POST /api/runs/:runId/archive — archive this run
app.post("/api/runs/:runId/archive", (req, res) => {
  const targetRunId = req.params.runId;
  if (/[/\\.]/.test(targetRunId)) {
    return res.status(400).json({ error: "Invalid run ID" });
  }

  try {
    const archivedRunId = archiveRun(targetRunId);
    res.json({ archived: [targetRunId], destinationRunIds: [archivedRunId] });
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Run not found" });
  }
});

// POST /api/runs/:runId/archive-and-below — archive this run and all older runs
app.post("/api/runs/:runId/archive-and-below", (req, res) => {
  const targetRunId = req.params.runId;
  if (/[/\\.]/.test(targetRunId)) {
    return res.status(400).json({ error: "Invalid run ID" });
  }
  if (!existsSync(CURRENT_ARTIFACTS_ROOT)) {
    return res.status(404).json({ error: "No artifacts directory" });
  }

  const allRuns = readdirSync(CURRENT_ARTIFACTS_ROOT)
    .filter((name) => {
      if (name.startsWith("__")) return false;
      const full = path.join(CURRENT_ARTIFACTS_ROOT, name);
      return statSync(full).isDirectory();
    })
    .sort();

  // Runs sorted ascending; "this and below" means this run and all older (<=) ones
  const toArchive = allRuns.filter((runId) => runId <= targetRunId);
  const destinationRunIds: string[] = [];
  for (const runId of toArchive) {
    destinationRunIds.push(archiveRun(runId));
  }

  res.json({ archived: toArchive, destinationRunIds });
});

// --- Per-scenario APIs (prefixed with /:runId/:testSlug) ---

// API: manifest
app.get("/api/:runId/:testSlug/manifest", (req, res) => {
  const dir = safeScenarioDir(req.params.runId, req.params.testSlug);
  if (!dir) return res.status(404).json({ error: "Scenario not found" });

  const manifestPath = path.join(dir, "manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    res.json(manifest);
  } else {
    res.status(404).json({ error: "No manifest found" });
  }
});

// API: absolute path of the scenario's artifact dir (for "Copy path" action)
app.get("/api/:runId/:testSlug/scenario-path", (req, res) => {
  const dir = safeScenarioDir(req.params.runId, req.params.testSlug);
  if (!dir) return res.status(404).json({ error: "Scenario not found" });
  res.json({ path: dir });
});

// API: test source
app.get("/api/:runId/:testSlug/test-source", (req, res) => {
  const dir = safeScenarioDir(req.params.runId, req.params.testSlug);
  if (!dir) return res.status(404).json({ error: "Scenario not found" });

  const manifestPath = path.join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    return res.status(404).json({ error: "No manifest" });
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  res.json({
    file: manifest.testSourceFile || "",
    source: manifest.testSource || "",
  });
});

// API: key frame image
// Serve keyframe by exact filename (supports incremented names like keyframe-callout-2.png)
app.get("/api/:runId/:testSlug/keyframe-file/:filename", (req, res) => {
  const dir = safeScenarioDir(req.params.runId, req.params.testSlug);
  if (!dir) return res.status(404).send("Scenario not found");

  // Only allow keyframe-*.png filenames to prevent path traversal
  const { filename } = req.params;
  if (!/^keyframe-[\w-]+\.png$/.test(filename)) return res.status(400).send("Invalid filename");

  const filePath = path.join(dir, filename);
  if (existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send("Key frame not found");
  }
});

// Legacy route: serve keyframe by docId (first keyframe only)
app.get("/api/:runId/:testSlug/keyframe/:docId.png", (req, res) => {
  const dir = safeScenarioDir(req.params.runId, req.params.testSlug);
  if (!dir) return res.status(404).send("Scenario not found");

  const filename = `keyframe-${req.params.docId}.png`;
  const filePath = path.join(dir, filename);
  if (existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send("Key frame not found");
  }
});

// API: video
app.get("/api/:runId/:testSlug/video.webm", (req, res) => {
  const dir = safeScenarioDir(req.params.runId, req.params.testSlug);
  if (!dir) return res.status(404).send("Scenario not found");

  const videoPath = path.join(dir, "video.webm");
  if (existsSync(videoPath)) {
    res.sendFile(videoPath);
  } else {
    res.status(404).send("No video found");
  }
});

// API: list file snapshots
app.get("/api/:runId/:testSlug/snapshots", (req, res) => {
  const dir = safeScenarioDir(req.params.runId, req.params.testSlug);
  if (!dir) return res.json([]);

  const meadowHomeStateRepo = path.join(dir, "meadowHome-state-repo");
  if (!existsSync(meadowHomeStateRepo)) {
    return res.json([]);
  }
  try {
    const timelineMap = readTimeline(path.join(meadowHomeStateRepo, "timeline.jsonl"));
    const logOutput = execSync('git log --format="%H %aI %s" --reverse', {
      cwd: meadowHomeStateRepo,
      encoding: "utf8",
    }).trim();
    if (!logOutput) return res.json([]);

    const lines = logOutput.split("\n");
    const snapshots: {
      timestamp: string;
      commitHash: string;
      commitMessage: string;
      changedFiles: string[];
    }[] = [];
    let prevHash: string | null = null;

    for (const line of lines) {
      const [hash, gitTimestamp, ...msgParts] = line.split(" ");
      const commitMessage = msgParts.join(" ");
      const timelineEntry = timelineMap.get(hash);
      const timestamp = timelineEntry?.timestamp ?? gitTimestamp;

      let changedFiles: string[] = [];
      if (prevHash) {
        changedFiles = execSync(
          `git diff-tree --no-commit-id --name-only -r ${prevHash} ${hash}`,
          { cwd: meadowHomeStateRepo, encoding: "utf8" }
        )
          .trim()
          .split("\n")
          .filter(Boolean);
      } else {
        changedFiles = execSync(`git ls-tree -r --name-only ${hash}`, {
          cwd: meadowHomeStateRepo,
          encoding: "utf8",
        })
          .trim()
          .split("\n")
          .filter(Boolean);
      }

      snapshots.push({ timestamp, commitHash: hash, commitMessage, changedFiles });
      prevHash = hash;
    }
    res.json(snapshots);
  } catch {
    res.json([]);
  }
});

// API: file tree at a specific commit
app.get("/api/:runId/:testSlug/snapshot/:hash", (req, res) => {
  const dir = safeScenarioDir(req.params.runId, req.params.testSlug);
  if (!dir) return res.status(404).json({ error: "Scenario not found" });

  const meadowHomeStateRepo = path.join(dir, "meadowHome-state-repo");
  if (!existsSync(meadowHomeStateRepo)) {
    return res.status(404).json({ error: "No state repo" });
  }
  try {
    const files = execSync(`git ls-tree -r --name-only ${req.params.hash}`, {
      cwd: meadowHomeStateRepo,
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);
    res.json(files);
  } catch {
    res.status(404).json({ error: "Commit not found" });
  }
});

// API: file content at a specific commit
app.get("/api/:runId/:testSlug/snapshot/:hash/file/*", (req, res) => {
  const dir = safeScenarioDir(req.params.runId, req.params.testSlug);
  if (!dir) return res.status(404).send("Scenario not found");

  const meadowHomeStateRepo = path.join(dir, "meadowHome-state-repo");
  if (!existsSync(meadowHomeStateRepo)) {
    return res.status(404).send("No state repo");
  }
  const filePath = (req.params as Record<string, string>)["0"];
  try {
    const content = execSync(`git show "${req.params.hash}:${filePath}"`, {
      cwd: meadowHomeStateRepo,
      encoding: "utf8",
    });
    res.type("text/plain").send(content);
  } catch {
    res.status(404).send("File not found at this commit");
  }
});

// --- Generic state-repo endpoints ---
// Discover any *-state-repo/ directories an extension layer dropped into
// the test artifact dir. Each declares its display name, path prefix,
// and rendering rules in a _meta.json the extension writes. The
// built-in repos (meadowHome, minio) have their own dedicated endpoints;
// the "structured state" tab in the viewer is driven by what's
// discovered here.

interface StateRepoMeta {
  displayName?: string;
  pathPrefix?: string;
  tableNameSuffixRegex?: string;
  recordKeyMap?: Record<string, string[]>;
  eventsLikeTables?: string[];
}

function listExtensionStateRepoNames(scenarioDir: string): string[] {
  if (!existsSync(scenarioDir)) return [];
  return readdirSync(scenarioDir)
    .filter((name) => name.endsWith("-state-repo"))
    .filter((name) => name !== "meadowHome-state-repo" && name !== "minio-state-repo")
    .filter((name) => {
      try { return statSync(path.join(scenarioDir, name)).isDirectory(); }
      catch { return false; }
    });
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

// API: list extension state repos with their rendering meta
app.get("/api/:runId/:testSlug/state-repos", (req, res) => {
  const dir = safeScenarioDir(req.params.runId, req.params.testSlug);
  if (!dir) return res.json([]);
  const repos = listExtensionStateRepoNames(dir).map((name) => ({
    name,
    ...readStateRepoMeta(path.join(dir, name)),
  }));
  res.json(repos);
});

// API: list snapshots for a named extension state repo
app.get("/api/:runId/:testSlug/state-snapshots/:repoName", (req, res) => {
  const dir = safeScenarioDir(req.params.runId, req.params.testSlug);
  if (!dir) return res.json([]);

  const repoName = req.params.repoName;
  if (!repoName.endsWith("-state-repo") || repoName.includes("/") || repoName.includes("..")) {
    return res.status(400).json({ error: "Invalid repo name" });
  }
  const stateRepo = path.join(dir, repoName);
  if (!existsSync(stateRepo)) return res.json([]);

  const meta = readStateRepoMeta(stateRepo);
  const pathPrefix = meta.pathPrefix ?? "";

  try {
    const timelineMap = readTimeline(path.join(stateRepo, "timeline.jsonl"));

    const logOutput = execSync('git log --format="%H %aI %s" --reverse', {
      cwd: stateRepo,
      encoding: "utf8",
    }).trim();
    if (!logOutput) return res.json([]);

    const lines = logOutput.split("\n");
    const snapshots: {
      timestamp: string;
      commitHash: string;
      commitMessage: string;
      changedFiles: string[];
    }[] = [];
    let prevHash: string | null = null;

    for (const line of lines) {
      const [hash, gitTimestamp, ...msgParts] = line.split(" ");
      const commitMessage = msgParts.join(" ");
      const timelineEntry = timelineMap.get(hash);
      const timestamp = timelineEntry?.timestamp ?? gitTimestamp;

      const rawFiles = (prevHash
        ? execSync(`git diff-tree --no-commit-id --name-only -r ${prevHash} ${hash}`,
            { cwd: stateRepo, encoding: "utf8" })
        : execSync(`git ls-tree -r --name-only ${hash}`,
            { cwd: stateRepo, encoding: "utf8" }))
        .trim().split("\n").filter(Boolean);

      const changedFiles = pathPrefix
        ? rawFiles.filter((f) => f.startsWith(pathPrefix)).map((f) => f.slice(pathPrefix.length))
        : rawFiles;

      snapshots.push({ timestamp, commitHash: hash, commitMessage, changedFiles });
      prevHash = hash;
    }
    res.json(snapshots);
  } catch {
    res.json([]);
  }
});

// API: all table YAMLs at a state-repo commit
app.get("/api/:runId/:testSlug/state-snapshot/:repoName/:hash", (req, res) => {
  const dir = safeScenarioDir(req.params.runId, req.params.testSlug);
  if (!dir) return res.status(404).json({ error: "Scenario not found" });

  const repoName = req.params.repoName;
  if (!repoName.endsWith("-state-repo") || repoName.includes("/") || repoName.includes("..")) {
    return res.status(400).json({ error: "Invalid repo name" });
  }
  const stateRepo = path.join(dir, repoName);
  if (!existsSync(stateRepo)) {
    return res.status(404).json({ error: "No such state repo" });
  }
  const meta = readStateRepoMeta(stateRepo);
  const pathPrefix = meta.pathPrefix ?? "";

  try {
    const files = execSync(`git ls-tree -r --name-only ${req.params.hash}`, {
      cwd: stateRepo,
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean)
      .filter((f) => !pathPrefix || f.startsWith(pathPrefix));

    const tables: Record<string, string> = {};
    for (const f of files) {
      const name = (pathPrefix ? f.slice(pathPrefix.length) : f).replace(/\.yaml$/, "");
      try {
        tables[name] = execSync(`git show ${req.params.hash}:${f}`, {
          cwd: stateRepo,
          encoding: "utf8",
        });
      } catch {
        tables[name] = "";
      }
    }
    res.json(tables);
  } catch {
    res.status(404).json({ error: "Commit not found" });
  }
});

// API: list minio snapshots
app.get("/api/:runId/:testSlug/minio-snapshots", (req, res) => {
  const dir = safeScenarioDir(req.params.runId, req.params.testSlug);
  if (!dir) return res.json([]);

  const minioStateRepo = path.join(dir, "minio-state-repo");
  if (!existsSync(minioStateRepo)) {
    return res.json([]);
  }
  try {
    // Use timeline.jsonl for millisecond-precision timestamps
    const timelineMap = readTimeline(path.join(minioStateRepo, "timeline.jsonl"));

    const logOutput = execSync('git log --format="%H %aI %s" --reverse', {
      cwd: minioStateRepo,
      encoding: "utf8",
    }).trim();
    if (!logOutput) return res.json([]);

    const lines = logOutput.split("\n");
    const snapshots: {
      timestamp: string;
      commitHash: string;
      commitMessage: string;
      changedFiles: string[];
    }[] = [];
    let prevHash: string | null = null;

    for (const line of lines) {
      const [hash, gitTimestamp, ...msgParts] = line.split(" ");
      const commitMessage = msgParts.join(" ");
      const timelineEntry = timelineMap.get(hash);
      const timestamp = timelineEntry?.timestamp ?? gitTimestamp;

      let changedFiles: string[] = [];
      if (prevHash) {
        changedFiles = execSync(
          `git diff-tree --no-commit-id --name-only -r ${prevHash} ${hash}`,
          { cwd: minioStateRepo, encoding: "utf8" }
        )
          .trim()
          .split("\n")
          .filter(Boolean)
          .filter((f) => f.startsWith("objects/"))
          .map((f) => f.slice("objects/".length));
      } else {
        changedFiles = execSync(`git ls-tree -r --name-only ${hash}`, {
          cwd: minioStateRepo,
          encoding: "utf8",
        })
          .trim()
          .split("\n")
          .filter(Boolean)
          .filter((f) => f.startsWith("objects/"))
          .map((f) => f.slice("objects/".length));
      }

      snapshots.push({ timestamp, commitHash: hash, commitMessage, changedFiles });
      prevHash = hash;
    }
    res.json(snapshots);
  } catch {
    res.json([]);
  }
});

// API: all objects at a minio commit
app.get("/api/:runId/:testSlug/minio-snapshot/:hash", (req, res) => {
  const dir = safeScenarioDir(req.params.runId, req.params.testSlug);
  if (!dir) return res.status(404).json({ error: "Scenario not found" });

  const minioStateRepo = path.join(dir, "minio-state-repo");
  if (!existsSync(minioStateRepo)) {
    return res.status(404).json({ error: "No minio state repo" });
  }
  try {
    const files = execSync(`git ls-tree -r --name-only ${req.params.hash}`, {
      cwd: minioStateRepo,
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean)
      .filter((f) => f.startsWith("objects/"));

    const objects: Record<string, string> = {};
    for (const f of files) {
      const key = f.slice("objects/".length);
      try {
        objects[key] = execSync(`git show "${req.params.hash}:${f}"`, {
          cwd: minioStateRepo,
          encoding: "utf8",
        });
      } catch {
        objects[key] = "";
      }
    }
    res.json(objects);
  } catch {
    res.status(404).json({ error: "Commit not found" });
  }
});

// API: uncommitted file entries from manifest
app.get("/api/:runId/:testSlug/uncommitted", (req, res) => {
  const dir = safeScenarioDir(req.params.runId, req.params.testSlug);
  if (!dir) return res.status(404).json({ error: "Scenario not found" });

  const manifestPath = path.join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    return res.json([]);
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    res.json(manifest.uncommittedEntries || []);
  } catch {
    res.json([]);
  }
});

// API: read uncommitted file content from the working tree of meadowHome-state-repo
app.get("/api/:runId/:testSlug/uncommitted-file/*", (req, res) => {
  const dir = safeScenarioDir(req.params.runId, req.params.testSlug);
  if (!dir) return res.status(404).send("Scenario not found");

  const meadowHomeStateRepo = path.join(dir, "meadowHome-state-repo");
  if (!existsSync(meadowHomeStateRepo)) {
    return res.status(404).send("No state repo");
  }

  const filePath = (req.params as Record<string, string>)["0"];
  const resolved = path.resolve(meadowHomeStateRepo, filePath);
  if (!resolved.startsWith(meadowHomeStateRepo + path.sep)) {
    return res.status(400).send("Invalid path");
  }
  if (!existsSync(resolved)) {
    return res.status(404).send("File not found");
  }

  try {
    const content = readFileSync(resolved, "utf8");
    res.type("text/plain").send(content);
  } catch {
    res.status(500).send("Failed to read file");
  }
});

// API: run-level notes
app.get("/api/:runId/notes", (req, res) => {
  const runDir = safeRunDir(req.params.runId);
  if (!runDir) return res.status(404).send("Run not found");

  const notesPath = path.join(runDir, "notes.md");
  if (existsSync(notesPath)) {
    res.type("text/plain").send(readFileSync(notesPath, "utf8"));
  } else {
    res.status(404).send("No notes found");
  }
});

// This is dev-only tooling — the Vite dev server (port 5175) serves the client
// and proxies /api requests here. No static file serving needed.

const PORT = parseInt(process.env.REPORT_VIEWER_PORT || "3456", 10);
app.listen(PORT, () => {
  console.log(`Report viewer running at http://localhost:${PORT}`);
  console.log(`Artifacts root: ${CURRENT_ARTIFACTS_ROOT}`);
});
