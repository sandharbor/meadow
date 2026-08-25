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
import { writeFileSync } from "fs";
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

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  workers: WORKERS,
  reporter: "list",

  globalSetup: "./globalSetup.ts",
  globalTeardown: "./globalTeardown.ts",

  use: {
    trace: "on-first-retry",
    // video + viewport are configured in the custom context fixture
    // (test-fixtures.ts) so that recording starts only after testServer
    // is ready — see context override there.
  },
});
