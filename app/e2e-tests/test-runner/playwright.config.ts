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

import { defineConfig } from "@playwright/test";
import { execSync } from "child_process";
import { writeFileSync, existsSync } from "fs";
import os from "os";
import path from "path";
import { buildFrontendIfStale } from "./src/run/scripts/build_frontend.js";

const WORKERS = parseInt(process.env.E2E_WORKERS || "", 10) || Math.min(os.cpus().length, 8);

// --- Build the frontend once so each test can serve a static bundle ---
// This replaces per-test vite dev mode (which paid a ~1.8s module
// transform cold-start on the first page.goto of every test).
// Re-runs are ~free because buildFrontendIfStale uses a source-hash stamp.
const FRONTEND_DIST_DIR = buildFrontendIfStale();
writeFileSync(path.join(import.meta.dirname, ".frontend-dist-dir"), FRONTEND_DIST_DIR, "utf8");

// --- Start shared Docker containers ---
// Guard: skip if containers are already running (re-evaluation by worker process)
const minioContainerFile = path.join(import.meta.dirname, ".minio-container");

if (!existsSync(minioContainerFile)) {
  // Start MinIO for S3 publish tests (creates per-worker buckets)
  const minioJson = execSync(`npx tsx src/run/scripts/start_minio.ts ${WORKERS}`, {
    cwd: import.meta.dirname,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const minio = JSON.parse(minioJson) as { port: number; endpoint: string; containerName: string };

  writeFileSync(path.join(import.meta.dirname, ".minio-container"), minio.containerName, "utf8");
  writeFileSync(path.join(import.meta.dirname, ".minio-endpoint"), minio.endpoint, "utf8");

  // Run the extension's global setup, if an extension layer is mounted.
  // The extension owns whatever backing services and marker files it
  // needs; the base suite knows nothing about them.
  const extSetupScript = path.join(
    import.meta.dirname, "src/run/meadow-extension/scripts/global_setup.ts"
  );
  if (existsSync(extSetupScript)) {
    execSync(`npx tsx ${extSetupScript} ${WORKERS}`, {
      cwd: import.meta.dirname,
      stdio: ["ignore", "inherit", "inherit"],
    });
  }
}

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  workers: WORKERS,
  reporter: "list",

  globalTeardown: "./globalTeardown.ts",

  use: {
    trace: "on-first-retry",
    // video + viewport are configured in the custom context fixture
    // (test-fixtures.ts) so that recording starts only after testServer
    // is ready — see context override there.
  },
});
