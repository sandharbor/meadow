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

import { spawnSync } from "child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync, unlinkSync } from "fs";
import os from "os";
import path from "path";
import { performance } from "perf_hooks";
import { assembleRun } from "./artifacts/assemble.ts";
import { allDocs as baseDocs } from "./scenario-docs/index.ts";

const E2E_DIR = path.join(import.meta.dirname, "..");

// Optionally load an extension scenario-doc layer. When no extension is
// mounted, this folder is gone and the import no-ops.
// Runtime-computed path so tsc doesn't require the module to exist.
type ScenarioDocLike = { id: string };
let meadowExtensionDocs: ScenarioDocLike[] = [];
let meadowExtensionScenarioDocExports: Record<string, unknown> = {};
{
  const extIndex = path.join(import.meta.dirname, "scenario-docs", "meadow-extension", "index.ts");
  if (existsSync(extIndex)) {
    const extPath = "./scenario-docs/meadow-extension/index.ts";
    const mod = await import(extPath) as { meadowExtensionDocs?: ScenarioDocLike[] } & Record<string, unknown>;
    meadowExtensionDocs = mod.meadowExtensionDocs ?? [];
    meadowExtensionScenarioDocExports = mod;
  }
}

// Recursively count *.spec.ts files under a directory. Playwright's testDir
// recurses into subdirectories (e.g. tests/meadow-extension/), so the
// guardrail needs to match. Symlinks to directories are followed because
// an extension layer may be mounted in via symlinks.
function countSpecFiles(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const isDir = entry.isDirectory() || (entry.isSymbolicLink() && statSync(full).isDirectory());
    if (isDir) {
      count += countSpecFiles(full);
    } else if (entry.isFile() && entry.name.endsWith(".spec.ts")) {
      count++;
    }
  }
  return count;
}
const ARTIFACTS_BASE = path.join(os.homedir(), "meadow-e2e-artifacts", "current");

const allDocs = [...baseDocs, ...meadowExtensionDocs];

// Build a map from scenario doc export name to doc ID (mirrors assemble.ts logic)
import * as scenarioDocExports from "./scenario-docs/index.ts";
const exportNameToDocId = new Map<string, string>();
for (const exports of [scenarioDocExports, meadowExtensionScenarioDocExports]) {
  for (const [key, value] of Object.entries(exports)) {
    if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
      exportNameToDocId.set(key, value.id);
    }
  }
}

function extractScenarioDocIds(testSource: string): string[] {
  const match = testSource.match(
    /import\s+\{([^}]+)\}\s+from\s+["'][^"']*scenario-docs[^"']*["']/
  );
  if (!match) return [];
  const names = match[1].split(",").map((s) => s.trim()).filter(Boolean);
  return names
    .map((name) => exportNameToDocId.get(name.split(/\s+as\s+/)[0]))
    .filter((id): id is string => !!id);
}

function resolveSpecFilesForScenarios(scenarioIds: string[]): string[] {
  const testsDir = path.join(E2E_DIR, "tests");
  const specFiles = readdirSync(testsDir).filter((f) => f.endsWith(".spec.ts"));
  const matchingFiles: Set<string> = new Set();

  for (const specFile of specFiles) {
    const source = readFileSync(path.join(testsDir, specFile), "utf8");
    const docIds = extractScenarioDocIds(source);
    if (scenarioIds.some((id) => docIds.includes(id))) {
      matchingFiles.add(path.join(testsDir, specFile));
    }
  }

  return [...matchingFiles];
}

// ---------------------------------------------------------------------------
// Subcommand: --status <runId>
// Reads the assembled artifacts for a run and prints a deterministic pass/fail.
// Exit code 0 = all tests passed with no issues. Non-zero = failure.
// ---------------------------------------------------------------------------
function runStatus(statusRunId: string): never {
  const runDir = path.join(ARTIFACTS_BASE, statusRunId);
  if (!existsSync(runDir)) {
    console.error(`ERROR: No artifacts found for run "${statusRunId}"`);
    console.error(`  Expected directory: ${runDir}`);
    process.exit(1);
  }

  // Read run-report-meta.json for the authoritative summary
  const metaPath = path.join(runDir, "run-report-meta.json");
  if (!existsSync(metaPath)) {
    console.error(`ERROR: run-report-meta.json not found for run "${statusRunId}"`);
    console.error("  The run may not have finished or artifacts were not assembled.");
    process.exit(1);
  }

  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
    version: number;
    totalDurationSeconds: number | null;
    scenarios: Record<string, { totalErrorCount: number; totalWarnCount: number; hasIssues: boolean }>;
  };

  // Also check individual status.txt files to catch tests that failed outright
  const dirs = readdirSync(runDir).filter((d) => statSync(path.join(runDir, d)).isDirectory());
  const failedTests: string[] = [];
  const issueTests: string[] = [];

  for (const dir of dirs) {
    const statusFile = path.join(runDir, dir, "status.txt");
    const status = existsSync(statusFile) ? readFileSync(statusFile, "utf8").trim() : "unknown";
    if (status !== "passed") {
      failedTests.push(`${dir} (status: ${status})`);
    }
    const scenarioMeta = meta.scenarios[dir];
    if (scenarioMeta?.hasIssues) {
      issueTests.push(`${dir} (errors: ${scenarioMeta.totalErrorCount}, warns: ${scenarioMeta.totalWarnCount})`);
    }
  }

  // Verify expected test count
  const testsDir = path.join(E2E_DIR, "tests");
  const specCount = countSpecFiles(testsDir);

  console.log(`Run: ${statusRunId}`);
  console.log(`Tests found: ${dirs.length}/${specCount}`);
  console.log(`Duration: ${meta.totalDurationSeconds != null ? `${meta.totalDurationSeconds}s` : "unknown"}`);

  let hasProblems = false;

  if (dirs.length !== specCount) {
    console.error(`\nERROR: Expected ${specCount} test artifacts but found ${dirs.length}`);
    hasProblems = true;
  }

  if (failedTests.length > 0) {
    console.error(`\nFailed tests (${failedTests.length}):`);
    for (const t of failedTests) console.error(`  - ${t}`);
    hasProblems = true;
  }

  if (issueTests.length > 0) {
    console.error(`\nTests with issues (${issueTests.length}):`);
    for (const t of issueTests) console.error(`  - ${t}`);
    hasProblems = true;
  }

  if (!hasProblems) {
    console.log(`\nResult: ALL PASSED (${dirs.length} tests, 0 errors, 0 warnings)`);
    process.exit(0);
  } else {
    console.error(`\nResult: FAILED`);
    process.exit(1);
  }
}

// Parse CLI args
function parseArgs(argv: string[]): { runId: string; runNotes?: string; grep?: string; scenarios?: string[]; highlighted?: string[]; statusRunId?: string } {
  let runId = "";
  let runNotes: string | undefined;
  let grep: string | undefined;
  let scenarios: string[] | undefined;
  let highlighted: string[] | undefined;
  let statusRunId: string | undefined;

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--status" && i + 1 < argv.length) {
      statusRunId = argv[++i];
    } else if (argv[i] === "--run-id" && i + 1 < argv.length) {
      runId = argv[++i];
    } else if (argv[i] === "--run-notes" && i + 1 < argv.length) {
      runNotes = argv[++i];
    } else if (argv[i] === "--grep" && i + 1 < argv.length) {
      grep = argv[++i];
    } else if (argv[i] === "--scenarios") {
      scenarios = [];
      // Consume all following arguments until the next flag or end
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        scenarios.push(argv[++i]);
      }
      if (scenarios.length === 0) {
        console.error("ERROR: --scenarios requires at least one scenario doc ID.");
        process.exit(1);
      }
    } else if (argv[i] === "--highlighted") {
      highlighted = [];
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        highlighted.push(argv[++i]);
      }
      if (highlighted.length === 0) {
        console.error("ERROR: --highlighted requires at least one spec basename (e.g. delete-then-republish).");
        process.exit(1);
      }
    }
  }

  if (!runId) {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    runId = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  }

  return { runId, runNotes, grep, scenarios, highlighted, statusRunId };
}

const { runId, runNotes, grep, scenarios, highlighted, statusRunId } = parseArgs(process.argv);

// Handle --status subcommand before anything else
if (statusRunId) {
  runStatus(statusRunId);
}

// Validate mutual exclusivity of --grep and --scenarios
if (grep && scenarios) {
  console.error("ERROR: --grep and --scenarios are mutually exclusive. Use one or the other.");
  process.exit(1);
}

// Validate mutual exclusivity of --scenarios and --highlighted
if (scenarios && highlighted) {
  console.error("ERROR: --scenarios and --highlighted are mutually exclusive.");
  console.error("  --scenarios filters the run to specific scenario areas.");
  console.error("  --highlighted marks specific specs for reviewer focus — it does not filter.");
  console.error("  Pick one.");
  process.exit(1);
}

// Validate and resolve --highlighted
let highlightedBasenames: string[] | undefined;
if (highlighted) {
  const testsDir = path.join(E2E_DIR, "tests");
  const specBasenames = readdirSync(testsDir)
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => f.replace(/\.spec\.ts$/, ""));
  // Allow users to pass either "foo" or "foo.spec.ts"
  const normalized = highlighted.map((name) => name.replace(/\.spec\.ts$/, ""));
  const invalid = normalized.filter((n) => !specBasenames.includes(n));
  if (invalid.length > 0) {
    console.error(`ERROR: Unknown spec(s) for --highlighted: ${invalid.join(", ")}`);
    console.error(`\nSpecs available to highlight (${specBasenames.length}):`);
    for (const b of [...specBasenames].sort()) console.error(`  ${b}`);
    process.exit(1);
  }
  highlightedBasenames = normalized;
  console.log(`Highlighting ${highlightedBasenames.length} spec(s): ${highlightedBasenames.join(", ")}`);
}

// Validate and resolve --scenarios
let scenarioSpecFiles: string[] | undefined;
if (scenarios) {
  const validIds = allDocs.map((d) => d.id);
  const invalidIds = scenarios.filter((s) => !validIds.includes(s));
  if (invalidIds.length > 0) {
    console.error(`ERROR: Unknown scenario doc ID(s): ${invalidIds.join(", ")}`);
    console.error(`\nAvailable scenario doc IDs:\n  ${validIds.join("\n  ")}`);
    process.exit(1);
  }
  scenarioSpecFiles = resolveSpecFilesForScenarios(scenarios);
  if (scenarioSpecFiles.length === 0) {
    console.error(`ERROR: No spec files found that import scenario doc(s): ${scenarios.join(", ")}`);
    process.exit(1);
  }
  console.log(`Filtering to ${scenarioSpecFiles.length} spec file(s) for scenario(s): ${scenarios.join(", ")}`);
}

// Step 1: Run Playwright
const totalStart = performance.now();
console.log(`\nE2E run: ${runId}\n`);
const playwrightArgs = ["playwright", "test"];
if (grep) {
  playwrightArgs.push("--grep", grep);
}
if (scenarioSpecFiles) {
  playwrightArgs.push(...scenarioSpecFiles);
}
const result = spawnSync("npx", playwrightArgs, {
  cwd: E2E_DIR,
  env: { ...process.env, E2E_RUN_ID: runId },
  stdio: "inherit",
  shell: true,
});

const playwrightExitCode = result.status ?? 1;
const playwrightMs = performance.now() - totalStart;

// Step 2: Assemble artifacts (even if tests failed, to capture what we can)
const assembleStart = performance.now();
await assembleRun(runId);
const assembleMs = performance.now() - assembleStart;

const artifactsDir = path.join(ARTIFACTS_BASE, runId);

// Step 3: Guardrail — verify every spec produced an artifact directory
const testsDir = path.join(E2E_DIR, "tests");
const specCount = countSpecFiles(testsDir);
const artifactCount = existsSync(artifactsDir)
  ? readdirSync(artifactsDir).filter((d) => statSync(path.join(artifactsDir, d)).isDirectory()).length
  : 0;

if (!grep && !scenarios && specCount !== artifactCount) {
  console.error("");
  console.error("ERROR: Artifact count mismatch!");
  console.error(`  Spec files found:        ${specCount}`);
  console.error(`  Artifact dirs produced:   ${artifactCount}`);
  console.error("");
  console.error("  Some scenarios may not have run. Investigate before trusting results.");
  process.exit(1);
}

// Step 4: Write run-level notes and targeted-scenarios metadata
if (runNotes && existsSync(artifactsDir)) {
  writeFileSync(path.join(artifactsDir, "notes.md"), runNotes, "utf8");
}
if (scenarios && existsSync(artifactsDir)) {
  writeFileSync(path.join(artifactsDir, "targeted-scenarios.json"), JSON.stringify(scenarios), "utf8");
}
if (highlightedBasenames && existsSync(artifactsDir)) {
  writeFileSync(path.join(artifactsDir, "highlighted-tests.json"), JSON.stringify(highlightedBasenames), "utf8");
}

// Step 5: Print report viewer URL and timing summary
if (existsSync(artifactsDir)) {
  const subDirs = readdirSync(artifactsDir).filter((d) =>
    statSync(path.join(artifactsDir, d)).isDirectory()
  );
  if (subDirs.length > 0) {
    console.log(`\nLaunch report viewer: npm start --prefix ../report-viewer`);
    console.log(`Then open: http://localhost:5175/${runId}/${subDirs[0]}`);
  }
}

const totalMs = performance.now() - totalStart;
console.log(`\n--- E2E Timing ---`);
console.log(`  Playwright tests:   ${(playwrightMs / 1000).toFixed(1)}s`);
console.log(`  Artifact assembly:  ${(assembleMs / 1000).toFixed(1)}s`);
console.log(`  Total wall-clock:   ${(totalMs / 1000).toFixed(1)}s`);

// Step 6: Clean up temp files
const safeRunId =
  runId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "default";
try {
  rmSync(path.join(os.tmpdir(), "meadow_parallel", safeRunId), {
    recursive: true,
    force: true,
  });
} catch { /* ignore */ }
for (const f of [".minio-container", ".minio-endpoint"]) {
  try { unlinkSync(path.join(E2E_DIR, f)); } catch { /* ignore */ }
}

// Propagate Playwright exit code
if (playwrightExitCode !== 0) {
  process.exit(playwrightExitCode);
}
