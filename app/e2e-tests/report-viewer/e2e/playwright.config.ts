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

// End-to-end tests for the report viewer itself.
//
// These drive the full server + client stack via Playwright. They use a
// cached `publish-flow.spec.ts` artifact as their shared fixture — see
// `fixtures/publish-flow-fixture.ts` for how the cache is built and reused.
//
// This suite is NOT part of quickcheck (too slow on first run because it
// has to build the fixture). Invoke it explicitly:
//
//   cd e2e-tests/report-viewer && npm run e2e
//
// Port isolation: we deliberately use different ports from the /dev
// defaults (3456 / 5175) so this suite can run concurrently with any
// worktree's dev servers. The server and vite configs read these ports
// from env vars.

const E2E_SERVER_PORT = "3556";
const E2E_CLIENT_PORT = "5275";

const sharedEnv = {
  REPORT_VIEWER_PORT: E2E_SERVER_PORT,
  REPORT_VIEWER_CLIENT_PORT: E2E_CLIENT_PORT,
};

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",

  use: {
    baseURL: `http://localhost:${E2E_CLIENT_PORT}`,
    trace: "on-first-retry",
  },

  webServer: [
    {
      command: "npm run server",
      cwd: "..",
      url: `http://localhost:${E2E_SERVER_PORT}/api/runs`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: sharedEnv,
    },
    {
      command: "npm run client",
      cwd: "..",
      url: `http://localhost:${E2E_CLIENT_PORT}`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: sharedEnv,
    },
  ],
});
