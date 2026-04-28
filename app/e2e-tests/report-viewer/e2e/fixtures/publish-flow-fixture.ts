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

import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import os from "os";
import path from "path";

// Builds (or reuses) a cached artifact directory produced by running
// `app/e2e-tests/test-runner/tests/publish-flow.spec.ts`. This artifact is the
// shared fixture for every report-viewer e2e spec.
//
// Cache strategy
// --------------
// We key the cache on the SHA-256 of publish-flow.spec.ts's file contents.
// Any change to that spec invalidates the cache on the next run. This is
// not perfect (changes to dependencies that publish-flow imports don't
// invalidate), but it's cheap and catches the common case. Bump the cache
// manually by deleting the cache dir if a dependency changes.
//
// The cached artifact is materialized at a stable run-id inside the
// standard artifacts root so the report-viewer server can serve it with
// no extra plumbing.

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const PUBLISH_FLOW_SPEC = path.join(
  REPO_ROOT,
  "app/e2e-tests/test-runner/tests/publish-flow.spec.ts"
);
const TEST_RUNNER_DIR = path.join(REPO_ROOT, "app/e2e-tests/test-runner");
const ARTIFACTS_ROOT = path.join(os.homedir(), "meadow-e2e-artifacts", "current");

// The test slug matches the one computed by the test-runner's artifactDir
// fixture (title lowercased, non-alphanumerics → "-"). If the publish-flow
// test title changes, update this constant.
const PUBLISH_FLOW_TEST_SLUG = "publish-flow-uploads-files-to-minio";

export interface PublishFlowFixture {
  runId: string;
  testSlug: string;
  artifactDir: string;
}

function computeCacheKey(): string {
  const content = readFileSync(PUBLISH_FLOW_SPEC, "utf8");
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

function runIdForKey(key: string): string {
  return `rv-fixture-${key}`;
}

function isCached(runId: string): boolean {
  const statusPath = path.join(
    ARTIFACTS_ROOT,
    runId,
    PUBLISH_FLOW_TEST_SLUG,
    "status.txt"
  );
  if (!existsSync(statusPath)) return false;
  const status = readFileSync(statusPath, "utf8").trim();
  return status === "passed";
}

function buildArtifact(runId: string): void {
  console.log(
    `[publish-flow-fixture] building cached artifact (runId=${runId}) — this is slow on first run`
  );

  // Invoke the test-runner CLI directly with a stable run-id and a grep
  // filter so only publish-flow runs. We bypass slowcheck.sh because
  // slowcheck runs `npm install --force` every invocation, which is
  // wasteful here — we assume test-runner deps are already installed
  // (quickcheck installs them). If they aren't, this will fail with a
  // clear error and the user can run quickcheck first.
  execFileSync(
    "npx",
    [
      "tsx",
      "src/cli.ts",
      "--run-id",
      runId,
      "--run-notes",
      "report-viewer e2e fixture",
      "--grep",
      "Publish flow",
    ],
    {
      cwd: TEST_RUNNER_DIR,
      stdio: "inherit",
    }
  );
}

/**
 * Ensure the cached publish-flow artifact exists. Returns its location
 * (run id, test slug, absolute artifact dir). Idempotent: if the cached
 * artifact is already present and passing, this is a no-op.
 */
export function ensurePublishFlowArtifact(): PublishFlowFixture {
  const key = computeCacheKey();
  const runId = runIdForKey(key);

  if (!isCached(runId)) {
    buildArtifact(runId);
    if (!isCached(runId)) {
      throw new Error(
        `[publish-flow-fixture] build completed but cached artifact is missing or not passing at ${path.join(ARTIFACTS_ROOT, runId, PUBLISH_FLOW_TEST_SLUG)}`
      );
    }
    // Record the cache key alongside so it's obvious what this fixture is
    // when browsing the artifacts directory.
    writeFileSync(
      path.join(ARTIFACTS_ROOT, runId, "cache-key.txt"),
      `sha256(publish-flow.spec.ts)=${key}\n`
    );
  }

  return {
    runId,
    testSlug: PUBLISH_FLOW_TEST_SLUG,
    artifactDir: path.join(ARTIFACTS_ROOT, runId, PUBLISH_FLOW_TEST_SLUG),
  };
}
