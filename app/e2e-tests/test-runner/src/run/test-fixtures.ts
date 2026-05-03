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

import { test as base, expect } from "@playwright/test";
import { execSync, spawn, ChildProcess } from "child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  copyFileSync,
  cpSync,
  rmSync,
  unlinkSync,
  appendFileSync,
  readdirSync,
  statSync,
  openSync,
} from "fs";
import net from "net";
import http from "http";
import os from "os";
import path from "path";
import YAML from "yaml";
import { resolveFastGitOpsBinary } from "./utils/MeadowHomeGit.js";
import { MinioS3 } from "./utils/MinioS3.js";
// assembleTestArtifacts is called in assembleRun() post-run, not during fixture teardown

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const BACKEND_DIR = path.join(REPO_ROOT, "app", "backend");
const FRONTEND_DIR = path.join(REPO_ROOT, "app", "frontend");
const E2E_DIR = path.join(import.meta.dirname, "../..");

const MINIO_BUCKET_PREFIX = "meadow-e2e-test";

// ---------------------------------------------------------------------------
// Helpers (also exported for use by extension fixture layers)
// ---------------------------------------------------------------------------

export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("Failed to get port")));
      }
    });
    srv.on("error", reject);
  });
}

export function waitForPort(port: number, timeoutMs: number, proc: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let exited = false;

    proc.on("exit", (code) => {
      exited = true;
      reject(new Error(`Process exited with code ${code} while waiting for port ${port}`));
    });

    function attempt() {
      if (exited) return;
      if (Date.now() > deadline) {
        reject(new Error(`Timed out waiting for port ${port} after ${timeoutMs}ms`));
        return;
      }
      const socket = net.createConnection({ port, host: "localhost" });
      socket.on("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        setTimeout(attempt, 300);
      });
    }
    attempt();
  });
}

// TCP-accept (waitForPort) is not enough to know the backend is truly ready
// to serve HTTP requests: under heavy parallel load we have seen cases where
// the port is bound, "Server running" is logged, and yet a request made soon
// after times out or gets 502'd through the static-frontend proxy. This
// polls a real GET until it returns a 2xx response, so we don't hand off to
// the test body until the backend is actually responding to HTTP.
export function waitForHttpReady(
  port: number,
  path: string,
  timeoutMs: number,
  proc: ChildProcess,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let exited = false;

    proc.on("exit", (code) => {
      exited = true;
      reject(new Error(`Process exited with code ${code} while waiting for HTTP readiness on port ${port}`));
    });

    function attempt() {
      if (exited) return;
      if (Date.now() > deadline) {
        reject(new Error(`Timed out waiting for HTTP readiness on port ${port} path ${path} after ${timeoutMs}ms`));
        return;
      }
      const req = http.request(
        { host: "127.0.0.1", port, path, method: "GET", timeout: 2_000 },
        (res) => {
          res.resume();
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
            // 2xx/3xx/4xx all mean the backend is processing requests.
            // Only 5xx or no response indicates it's not truly ready.
            resolve();
          } else {
            setTimeout(attempt, 200);
          }
        },
      );
      req.on("timeout", () => {
        req.destroy();
        setTimeout(attempt, 200);
      });
      req.on("error", () => {
        setTimeout(attempt, 200);
      });
      req.end();
    }
    attempt();
  });
}

/**
 * Seed the config dir from a pre-migration MeadowHome snapshot resolved
 * via preMigrationFixturePath() (under
 * e2e-tests/test-runner/fixtures/pre-migration/). Copies the whole tree,
 * then rewrites each site_config.yaml's sourceDirectory to point at the
 * shared source_graphs/ so the tests don't depend on absolute paths
 * captured in the snapshot.
 *
 * Unlike populateConfigDir, this deliberately preserves the snapshot's
 * migrations.yaml — the point of these tests is to run the app with the
 * pre-migration bookkeeping and let the startup migration runner do its
 * thing.
 */
function populateConfigDirFromSnapshot(configDir: string, snapshotPath: string) {
  if (!existsSync(snapshotPath)) {
    throw new Error(`Migration snapshot path not found: ${snapshotPath}`);
  }

  // Preserve the freshly-allocated ports that setup_worktree_resources_config.ts
  // wrote into resources.local.yaml — the snapshot has stale port numbers from
  // the original run and would otherwise clobber them.
  const resLocalPath = path.join(configDir, "app", "resources.local.yaml");
  let preservedLocal: Record<string, unknown> = {};
  if (existsSync(resLocalPath)) {
    try {
      preservedLocal = (YAML.parse(readFileSync(resLocalPath, "utf8")) as Record<string, unknown>) ?? {};
    } catch {
      // fall through — no preserved values
    }
  }

  cpSync(snapshotPath, configDir, {
    recursive: true,
    filter: (src) => !src.includes(".DS_Store"),
  });

  // Re-merge the preserved local values on top of whatever the snapshot had,
  // so freshly-allocated ports win.
  if (Object.keys(preservedLocal).length > 0) {
    let existing: Record<string, unknown> = {};
    if (existsSync(resLocalPath)) {
      try {
        existing = (YAML.parse(readFileSync(resLocalPath, "utf8")) as Record<string, unknown>) ?? {};
      } catch {
        existing = {};
      }
    }
    writeFileSync(resLocalPath, YAML.stringify({ ...existing, ...preservedLocal }), "utf8");
  }

  const sourceGraphsDir = path.join(REPO_ROOT, "app", "shared_data", "source_graphs");
  const sitesDir = path.join(configDir, "sites");
  if (!existsSync(sitesDir)) return;

  for (const siteName of readdirSync(sitesDir)) {
    const destSiteDir = path.join(sitesDir, siteName);
    if (!statSync(destSiteDir).isDirectory()) continue;

    const siteConfigPath = path.join(destSiteDir, "conf", "site_config.yaml");
    if (!existsSync(siteConfigPath)) continue;

    const config = YAML.parse(readFileSync(siteConfigPath, "utf8")) as Record<string, unknown>;
    if (typeof config.sourceDirectory === "string") {
      const sourceFolder = path.basename(config.sourceDirectory);
      config.sourceDirectory = path.join(sourceGraphsDir, sourceFolder);
      writeFileSync(siteConfigPath, YAML.stringify(config), "utf8");
    }
  }
}

function populateConfigDir(configDir: string, fixtureName = "home_fixture_big_and_small") {
  const appDir = path.join(configDir, "app");
  mkdirSync(appDir, { recursive: true });

  if (fixtureName === "none") {
    writeFileSync(path.join(appDir, "app_config.yaml"), "version: 1.0.0\n", "utf8");
    return;
  }

  const fixtureDir = path.join(
    REPO_ROOT, "app", "shared_data", "home_fixtures", fixtureName
  );
  const sourceGraphsDir = path.join(REPO_ROOT, "app", "shared_data", "source_graphs");

  // Copy app/app_config.yaml
  const srcAppConfig = path.join(fixtureDir, "app", "app_config.yaml");
  if (existsSync(srcAppConfig)) {
    const content = readFileSync(srcAppConfig, "utf8");
    writeFileSync(path.join(appDir, "app_config.yaml"), content, "utf8");
  }

  // Copy app/hooks if present
  const srcHooksDir = path.join(fixtureDir, "app", "hooks");
  if (existsSync(srcHooksDir)) {
    const destHooksDir = path.join(appDir, "hooks");
    cpSync(srcHooksDir, destHooksDir, {
      recursive: true,
      filter: (src: string) => !src.includes(".DS_Store"),
    });
  }

  // Copy site directories and rewrite sourceDirectory paths
  const sitesDir = path.join(configDir, "sites");
  mkdirSync(sitesDir, { recursive: true });

  const fixtureSitesDir = path.join(fixtureDir, "sites");
  for (const siteName of readdirSync(fixtureSitesDir)) {
    const srcSiteDir = path.join(fixtureSitesDir, siteName);
    if (!statSync(srcSiteDir).isDirectory()) continue;

    const destSiteDir = path.join(sitesDir, siteName);
    cpSync(srcSiteDir, destSiteDir, {
      recursive: true,
      filter: (src) => !src.includes(".DS_Store"),
    });

    const siteConfigPath = path.join(destSiteDir, "conf", "site_config.yaml");
    if (existsSync(siteConfigPath)) {
      const yamlContent = readFileSync(siteConfigPath, "utf8");
      const config = YAML.parse(yamlContent) as Record<string, unknown>;

      if (config.sourceDirectory && typeof config.sourceDirectory === "string") {
        const sourceFolder = path.basename(config.sourceDirectory);
        config.sourceDirectory = path.join(sourceGraphsDir, sourceFolder);
      }

      writeFileSync(siteConfigPath, YAML.stringify(config), "utf8");
    }
  }
}

// ---------------------------------------------------------------------------
// File listing helper for tick capture
// ---------------------------------------------------------------------------

function listFilesRecursive(dir: string, excludeDirs: string[]): string[] {
  const excludeSet = new Set(excludeDirs);
  const result: string[] = [];
  function walk(current: string, prefix: string) {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (prefix === "" && excludeSet.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(current, entry.name), rel);
      } else {
        result.push(rel);
      }
    }
  }
  walk(dir, "");
  return result.sort();
}

// ---------------------------------------------------------------------------
// Git helpers for snapshot fixture (exported for extension snapshot layers)
// ---------------------------------------------------------------------------

export function initGitRepo(repoDir: string, name: string) {
  mkdirSync(repoDir, { recursive: true });
  execSync("git init", { cwd: repoDir, stdio: "ignore" });
  execSync(`git config user.email "${name}@test"`, {
    cwd: repoDir,
    stdio: "ignore",
  });
  execSync(`git config user.name "${name}"`, {
    cwd: repoDir,
    stdio: "ignore",
  });
}

export function gitCommitIfChanged(repoDir: string, message: string, timelinePath: string) {
  execSync("git add -A", { cwd: repoDir, stdio: "ignore" });
  const status = execSync("git status --porcelain", {
    cwd: repoDir,
    encoding: "utf8",
  }).trim();

  if (status.length > 0) {
    const timestamp = new Date().toISOString();
    execSync(`git commit -m "${message}"`, {
      cwd: repoDir,
      stdio: "ignore",
    });
    const hash = execSync("git rev-parse HEAD", {
      cwd: repoDir,
      encoding: "utf8",
    }).trim();
    appendFileSync(
      timelinePath,
      JSON.stringify({ timestamp, commitHash: hash, message }) + "\n"
    );
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestServer {
  configDir: string;
  sourceGraphsDir: string;
  backendPort: number;
  frontendPort: number;
  webServerPort: number;
  minioEndpoint: string;
  minioBucket: string;
  /**
   * Swap the active publishing provider to S3PublishingProvider and deactivate
   * every other publishing provider mounted in the source tree. Writes MinIO
   * connection details to the S3 provider's pp_resources.local.yaml. Must be
   * called before the frontend fetches /api/publishing-providers (i.e. before
   * the first page navigation).
   */
  activateS3Provider: () => Promise<void>;
  /** Read the backend's app config. */
  getAppConfig: (page: import("@playwright/test").Page) => Promise<Record<string, unknown>>;
  /** Poll app config until a key has a truthy value. Returns the config. */
  waitForAppConfig: (page: import("@playwright/test").Page, key: string, timeoutMs?: number) => Promise<Record<string, unknown>>;
  /**
   * Poll a publishing provider's `/account` endpoint until a key has a
   * truthy value. Returns the account payload.
   */
  waitForProviderAccount: (
    page: import("@playwright/test").Page,
    providerId: string,
    key: string,
    timeoutMs?: number,
  ) => Promise<Record<string, unknown>>;
}

/**
 * Extension point used by fixture layers to attach additional snapshot
 * capture logic (e.g. a structured backing-store snapshot). The base
 * `snapshot` fixture calls every registered handler after its own
 * minio+uncommitted capture.
 */
export type SnapshotHandler = (message: string) => Promise<void>;

/**
 * Extension point invoked after MinIO and the web server have been set up
 * but before the backend is spawned. Lets a fixture layer seed
 * provider-specific config (e.g. writing endpoints into a provider's
 * pp_resources.local.yaml) without the base fixture having to know which
 * providers are mounted.
 */
export type PreSpawnSeed = (deps: {
  configDir: string;
  minioEndpoint: string;
  minioBucket: string;
  webServerPort: number;
}) => Promise<void>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const test = base.extend<{
  fixtureHome: string;
  /**
   * Absolute path to a pre-migration MeadowHome snapshot (typically
   * resolved via preMigrationFixturePath()). When set, the test's
   * MeadowHome is seeded from that snapshot (bypassing `fixtureHome`).
   * Used by migration e2e specs to boot the backend against a
   * pre-migration tree and exercise the startup migration path.
   */
  migrationBeforePath: string | null;
  testServer: TestServer;
  artifactDir: string;
  snapshot: (message: string) => Promise<void>;
  /**
   * Assert that the MeadowHome configDir git repo is clean except for the
   * explicitly allowed paths. Untracked entries (`??`) and modified entries
   * (anything else: `M`/`A`/`D`/`R`/...) are checked separately. Each
   * allow-list is matched by exact relative path (no globs).
   *
   * Every spec must call this at least once, after its last `snapshot()` call —
   * the `_module/scripts/lint-final-assertion` linter enforces that.
   */
  assertMeadowHomeState: (opts?: {
    allowedUntracked?: string[];
    allowedModified?: string[];
  }) => Promise<void>;
  addKeyFrame: (scenarioDoc: { id: string }) => Promise<void>;
  minioS3: MinioS3;
  /**
   * Register an expected error pattern scoped to a block of code.
   * Returns a cleanup function — call it when the error-producing block is done.
   * Only log lines that appear during the active window are suppressed.
   */
  expectLogErrors: (pattern: RegExp) => () => void;
  /** Internal: shared expected error windows, used by artifactDir guardrail. */
  _expectedErrorWindows: { pattern: RegExp; startTime: string; endTime: string | null }[];
  /**
   * Internal extension point: additional snapshot handlers contributed by a
   * fixture layer (e.g. a layer that captures backing-store state). Base
   * exports an empty array; overriding layers extend this fixture to
   * return handlers.
   */
  _additionalSnapshotHandlers: SnapshotHandler[];
  /**
   * Internal extension point: extra environment variables merged into the
   * spawned backend process. Fixture layers override to inject env vars
   * required by their provider (e.g. stub URLs, polling overrides) without
   * the base fixture having to name them.
   */
  _backendExtraEnv: Record<string, string>;
  /**
   * Internal extension point: callback run after MinIO + web server are
   * allocated but before the backend is spawned. Fixture layers override
   * to seed provider-specific config (e.g. pp_resources.local.yaml).
   */
  _preSpawnSeed: PreSpawnSeed;
}>({
  fixtureHome: ["home_fixture_big_and_small", { option: true }],
  migrationBeforePath: [null, { option: true }],
  // _backendExtraEnv and _preSpawnSeed are declared as fixtures (rather than
  // options) because their values are objects/functions that Playwright's
  // option-form would shadow with TestFixture inference. Factory style
  // sidesteps that: each fixture yields its current value, and an extension
  // layer overrides by yielding a different one.
  _backendExtraEnv: async ({}, use) => {
    await use({});
  },
  _preSpawnSeed: async ({}, use) => {
    await use(async () => {});
  },

  // Override built-in context so it depends on testServer.  This ensures
  // the browser context (and its video recording) only starts AFTER the
  // backend / frontend / web-server are ready, keeping video duration
  // close to the actual test-body duration.
  context: async ({ browser, testServer: _ts }, use, testInfo) => {
    const testSlug = testInfo.title
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    const videoDir = path.join(
      import.meta.dirname, "..", "..", "test-results", `${testSlug}-context`
    );
    mkdirSync(videoDir, { recursive: true });
    const context = await browser.newContext({
      recordVideo: { dir: videoDir, size: { width: 1200, height: 675 } },
      viewport: { width: 1200, height: 675 },
    });
    await use(context);
    await context.close();
  },

  testServer: [
    async ({ fixtureHome, migrationBeforePath, _backendExtraEnv, _preSpawnSeed }, use, testInfo) => {
      const workerIndex = testInfo.parallelIndex;
      const minioBucket = `${MINIO_BUCKET_PREFIX}-${workerIndex}`;

      // 1. Create fresh CONFIG_DIR
      const configDir = execSync("npx tsx src/scripts/setup_worktree_resources_config.ts", {
        cwd: BACKEND_DIR,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();

      // 2. Populate fixture data
      if (migrationBeforePath) {
        populateConfigDirFromSnapshot(configDir, migrationBeforePath);
      } else {
        populateConfigDir(configDir, fixtureHome);
      }

      // 3. Read allocated ports from resources.local.yaml
      const resLocalPath = path.join(configDir, "app", "resources.local.yaml");
      const resources = YAML.parse(readFileSync(resLocalPath, "utf8")) as {
        backendPort: number;
        frontendPort: number;
      };
      const backendPort = resources.backendPort;
      const frontendPort = resources.frontendPort;

      // 4. Read shared container endpoint from marker file
      const minioEndpoint = readFileSync(path.join(E2E_DIR, ".minio-endpoint"), "utf8").trim();

      // 4b. Clear MinIO bucket so tests start with a clean slate
      {
        const tempS3 = new MinioS3(minioEndpoint, minioBucket, expect);
        await tempS3.deleteAll();
        tempS3.destroy();
      }

      // 5. Allocate web server port
      const webServerPort = await findFreePort();

      // 6. Pre-spawn provider seeding hook. Base does nothing; fixture layers
      //    override to write provider-specific pp_resources.local.yaml entries
      //    (e.g. an S3-backed provider wiring up MinIO endpoints).
      await _preSpawnSeed({ configDir, minioEndpoint, minioBucket, webServerPort });

      // Capture stderr from the backend and static-frontend processes to
      // files in configDir/logs so crashes and proxy errors are
      // diagnosable after a run. Without this, any stderr output
      // (backend crash traces, proxy `ECONNREFUSED`/`ECONNRESET` errors)
      // is silently discarded and flakes are nearly impossible to
      // root-cause.
      const backendStderrFd = openSync(path.join(configDir, "logs", "backend-stderr.log"), "a");
      const frontendStderrFd = openSync(path.join(configDir, "logs", "frontend-stderr.log"), "a");

      // 7. Spawn backend. Fixture layers can supply additional env vars
      //    via the `_backendExtraEnv` option (e.g. provider-specific stubs).
      const backendProc = spawn(
        "npx",
        ["tsx", "src/index.ts"],
        {
          cwd: BACKEND_DIR,
          env: {
            ...process.env,
            MEADOW_HOME_DIRECTORY_OVERRIDE: configDir,
            MEADOW_IS_DEV: "true",
            ..._backendExtraEnv,
          },
          stdio: ["ignore", "ignore", backendStderrFd],
          shell: true,
        }
      );

      // 8. Spawn frontend — a lightweight static file server serving the
      // pre-built dist/ (built once in playwright.config.ts). This replaces
      // `npx vite` because vite dev mode paid a ~1.8s module transform
      // cold-start on the very first page.goto("/") of every test.
      const frontendDistDir = readFileSync(
        path.join(E2E_DIR, ".frontend-dist-dir"),
        "utf8",
      ).trim();
      const frontendProc = spawn(
        "npx",
        [
          "tsx",
          path.join(E2E_DIR, "src/run/scripts/start_static_frontend.ts"),
          String(frontendPort),
          String(backendPort),
          frontendDistDir,
        ],
        {
          cwd: E2E_DIR,
          env: { ...process.env },
          stdio: ["ignore", "ignore", frontendStderrFd],
          shell: true,
        }
      );

      // 9. Spawn web server
      const webServerProc = spawn(
        "npx",
        ["tsx", "src/run/scripts/start_web_server.ts", String(webServerPort)],
        {
          cwd: E2E_DIR,
          env: {
            ...process.env,
            MINIO_ENDPOINT: minioEndpoint,
            MINIO_BUCKET: minioBucket,
          },
          stdio: "ignore",
          shell: true,
        }
      );

      const procs = [backendProc, frontendProc, webServerProc];

      // 11. Wait for all ports to be ready (TCP accept)
      await Promise.all([
        waitForPort(backendPort, 30_000, backendProc),
        waitForPort(frontendPort, 30_000, frontendProc),
        waitForPort(webServerPort, 15_000, webServerProc),
      ]);

      // 11b. Wait for backend to actually respond to HTTP requests. TCP
      // accept is not sufficient — under heavy parallel load it has been
      // observed as bound-but-unresponsive, surfacing as 502s through the
      // static-frontend proxy (frontend page load).
      await waitForHttpReady(backendPort, "/api/app-config", 15_000, backendProc);
      const sourceGraphsDir = path.join(REPO_ROOT, "app", "shared_data", "source_graphs");

      const server: TestServer = {
        configDir,
        sourceGraphsDir,
        backendPort,
        frontendPort,
        webServerPort,
        minioEndpoint,
        minioBucket,
        activateS3Provider: async () => {
          // Deactivate every publishing provider mounted in the source tree
          // and activate S3 specifically, then wire S3 resources to MinIO.
          // Discovering providers here keeps the base fixture provider-agnostic
          // — any extension layer that mounts an additional provider gets it
          // turned off automatically.
          const writePpConfig = (providerId: string, patch: Record<string, unknown>) => {
            const dir = path.join(configDir, "app", "publishing_providers", providerId);
            const file = path.join(dir, "pp_config.yaml");
            const existing = existsSync(file)
              ? YAML.parse(readFileSync(file, "utf8")) as Record<string, unknown>
              : {};
            mkdirSync(dir, { recursive: true });
            writeFileSync(file, YAML.stringify({ ...existing, ...patch }), "utf8");
          };
          const providersSourceDir = path.join(REPO_ROOT, "app", "publishing_providers");
          for (const name of readdirSync(providersSourceDir)) {
            if (name === "_module" || name.startsWith(".") || name === "package.json") continue;
            let isDir = false;
            try {
              isDir = statSync(path.join(providersSourceDir, name)).isDirectory();
            } catch {
              continue;
            }
            if (!isDir) continue;
            if (name === "S3PublishingProvider") continue;
            writePpConfig(name, { isActive: false });
          }
          writePpConfig("S3PublishingProvider", { isActive: true });

          const s3ProviderDir = path.join(
            configDir,
            "app",
            "publishing_providers",
            "S3PublishingProvider",
          );
          mkdirSync(s3ProviderDir, { recursive: true });

          const s3ResLocalPath = path.join(s3ProviderDir, "pp_resources.local.yaml");
          const existingRes = existsSync(s3ResLocalPath)
            ? YAML.parse(readFileSync(s3ResLocalPath, "utf8")) as Record<string, unknown>
            : {};
          const mergedRes = {
            ...existingRes,
            s3Endpoint: minioEndpoint,
            s3ForcePathStyle: true,
            s3BucketName: minioBucket,
            s3Region: "us-east-1",
            webBaseUrl: `http://localhost:${webServerPort}`,
          };
          writeFileSync(s3ResLocalPath, YAML.stringify(mergedRes), "utf8");

          const s3SecretsPath = path.join(s3ProviderDir, "pp_secrets.yaml");
          const existingSecrets = existsSync(s3SecretsPath)
            ? YAML.parse(readFileSync(s3SecretsPath, "utf8")) as Record<string, unknown>
            : {};
          const mergedSecrets = {
            ...existingSecrets,
            s3AccessKeyId: "minioadmin",
            s3SecretAccessKey: "minioadmin",
          };
          writeFileSync(s3SecretsPath, YAML.stringify(mergedSecrets), "utf8");
        },
        getAppConfig: async (pg) => {
          const res = await pg.request.get(`http://localhost:${backendPort}/api/app-config`);
          return await res.json() as Record<string, unknown>;
        },
        waitForAppConfig: async (pg, key, timeoutMs = 10_000) => {
          const start = Date.now();
          while (Date.now() - start < timeoutMs) {
            const res = await pg.request.get(`http://localhost:${backendPort}/api/app-config`);
            const cfg = await res.json() as Record<string, unknown>;
            if (cfg[key]) return cfg;
            await new Promise(r => setTimeout(r, 250));
          }
          throw new Error(`Timed out waiting for app config key "${key}" after ${timeoutMs}ms`);
        },
        waitForProviderAccount: async (pg, providerId, key, timeoutMs = 10_000) => {
          const start = Date.now();
          const url = `http://localhost:${backendPort}/api/publishing-providers/${providerId}/account`;
          while (Date.now() - start < timeoutMs) {
            const res = await pg.request.get(url);
            if (res.ok()) {
              const cfg = await res.json() as Record<string, unknown>;
              if (cfg[key]) return cfg;
            }
            await new Promise(r => setTimeout(r, 250));
          }
          throw new Error(`Timed out waiting for ${providerId} account key "${key}" after ${timeoutMs}ms`);
        },
      };

      await use(server);

      // 12. Teardown: SIGTERM all processes, SIGKILL after 3s grace
      for (const proc of procs) {
        if (proc.exitCode === null) {
          proc.kill("SIGTERM");
        }
      }
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          for (const proc of procs) {
            if (proc.exitCode === null) {
              proc.kill("SIGKILL");
            }
          }
          resolve();
        }, 3000);

        let remaining = procs.filter((p) => p.exitCode === null).length;
        if (remaining === 0) {
          clearTimeout(timeout);
          resolve();
          return;
        }
        for (const proc of procs) {
          if (proc.exitCode === null) {
            proc.on("exit", () => {
              remaining--;
              if (remaining === 0) {
                clearTimeout(timeout);
                resolve();
              }
            });
          }
        }
      });
    },
    { auto: true },
  ],

  artifactDir: [
    async ({ page, testServer, minioS3, _expectedErrorWindows: expectedErrorWindows }, use, testInfo) => {
      const { configDir } = testServer;

      // Create artifact directory
      const testSlug = testInfo.title
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
      const runId = process.env.E2E_RUN_ID || "default";
      const artifactDir = path.join(
        os.homedir(),
        "meadow-e2e-artifacts",
        "current",
        runId,
        testSlug
      );
      mkdirSync(artifactDir, { recursive: true });

      // Record start time
      writeFileSync(
        path.join(artifactDir, "start-time.txt"),
        new Date().toISOString()
      );

      // Record test source file path for artifact assembly
      writeFileSync(
        path.join(artifactDir, "test-file.txt"),
        testInfo.file
      );

      // --- Tick recording ---
      const tickLogPath = path.join(artifactDir, "ticks.jsonl");
      const snapshotMarkerPath = path.join(artifactDir, "snapshot-marker.txt");
      const tickIntervalMs = parseInt(process.env.E2E_TICK_INTERVAL_MS || "250", 10);
      writeFileSync(
        path.join(artifactDir, "tick-config.json"),
        JSON.stringify({ intervalMs: tickIntervalMs })
      );

      let fastGitBinary: string | null = null;
      try {
        fastGitBinary = resolveFastGitOpsBinary();
        if (!existsSync(fastGitBinary)) fastGitBinary = null;
      } catch {
        // fast_git_ops not available — ticks will still capture file listings
      }

      let tickIndex = 0;
      // Cache for gitignored files. The set is a pure function of
      // (.gitignore contents, files on disk), so we can safely reuse the
      // last result when neither has changed. This matters: running
      // `git ls-files --ignored` every tick (4x/sec per worker) across
      // 16 parallel workers caused I/O contention that destabilized
      // unrelated tests (publish-flow, site-deletion) with empty-error
      // timeouts. The cache collapses the steady-state cost to zero
      // subprocess calls per tick while remaining correct when files
      // or .gitignore change. .gitignore changes very rarely (it's
      // written once by AppConfigGitUtils.initRepo and basically never
      // touched after that); files typically change at only a handful
      // of ticks per test.
      let cachedIgnoredFiles: string[] = [];
      let cachedFilesKey = "";
      let cachedGitignoreKey = "";
      function captureTickSync() {
        try {
          const files = listFilesRecursive(configDir, ["logs", ".git"]);

          let uncommittedFiles: { path: string; status: string }[] = [];
          let gitHeadSha: string | undefined;

          // Which files in the working tree does git consider gitignored?
          // `git ls-files --others --ignored --exclude-standard` returns
          // paths relative to the repo root. May fail on the very first
          // tick (git not initialized yet) — swallow and reuse whatever
          // was cached (initially []).
          const filesKey = files.length + "|" + files.join("\n");
          let gitignoreKey = "";
          try {
            const st = statSync(path.join(configDir, ".gitignore"));
            gitignoreKey = `${st.mtimeMs}:${st.size}`;
          } catch {
            // .gitignore doesn't exist yet — leave key empty
          }
          if (filesKey !== cachedFilesKey || gitignoreKey !== cachedGitignoreKey) {
            try {
              const ignoredOut = execSync(
                `git --git-dir="${configDir}/.git" --work-tree="${configDir}" ls-files --others --ignored --exclude-standard`,
                { encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }
              );
              cachedIgnoredFiles = ignoredOut.split("\n").map(s => s.trim()).filter(Boolean);
              cachedFilesKey = filesKey;
              cachedGitignoreKey = gitignoreKey;
            } catch {
              // git not initialized yet, or not installed — leave cache untouched
            }
          }
          const ignoredFiles = cachedIgnoredFiles;

          if (fastGitBinary) {
            try {
              const statusOut = execSync(
                `"${fastGitBinary}" status "${configDir}"`,
                { encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }
              ).trim();
              const rawFiles: { path: string; status: string }[] = statusOut ? JSON.parse(statusOut) : [];
              // Convert absolute paths to relative (fast_git_ops returns absolute paths)
              const prefix = configDir.endsWith("/") ? configDir : configDir + "/";
              uncommittedFiles = rawFiles
                .map(f => ({
                  path: f.path.startsWith(prefix) ? f.path.slice(prefix.length) : f.path,
                  status: f.status,
                }))
                .filter(f => !f.path.startsWith("logs/") && !f.path.startsWith("logs"));
            } catch {
              // git may not be initialized yet
            }
            try {
              const logOut = execSync(
                `"${fastGitBinary}" dir-log "${configDir}" --limit 1`,
                { encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }
              ).trim();
              const parsed = JSON.parse(logOut) as { commits: { sha: string }[] };
              if (parsed.commits?.length > 0) {
                gitHeadSha = parsed.commits[0].sha;
              }
            } catch {
              // git may not be initialized yet
            }
          }

          // Check for snapshot marker
          let isSnapshot = false;
          let snapshotMessage: string | undefined;
          if (existsSync(snapshotMarkerPath)) {
            snapshotMessage = readFileSync(snapshotMarkerPath, "utf8");
            isSnapshot = true;
            unlinkSync(snapshotMarkerPath);
          }

          const entry = {
            timestamp: new Date().toISOString(),
            tickIndex: tickIndex++,
            isSnapshot,
            ...(snapshotMessage !== undefined && { snapshotMessage }),
            files,
            uncommittedFiles,
            ignoredFiles,
            ...(gitHeadSha !== undefined && { gitHeadSha }),
            s3Keys: latestS3Keys,
          };
          appendFileSync(tickLogPath, JSON.stringify(entry) + "\n");
        } catch (err) {
          console.error("tick capture error:", err);
        }
      }

      // S3 key capture: runs async alongside sync tick capture.
      // The latest S3 key list is stored in a variable that captureTickSync reads.
      let latestS3Keys: string[] = [];
      let s3Capturing = false;
      const captureS3Keys = async () => {
        if (s3Capturing) return;
        s3Capturing = true;
        try {
          latestS3Keys = (await minioS3.listKeys()).sort();
        } catch { /* ignore — MinIO may not be ready yet */ }
        s3Capturing = false;
      };
      captureS3Keys(); // initial capture
      const s3TickTimer = setInterval(captureS3Keys, tickIntervalMs);

      captureTickSync(); // tick 0 immediately
      const tickTimer = setInterval(captureTickSync, tickIntervalMs);

      // Capture frontend console logs and page errors
      const logEntries: string[] = [];
      page.on("console", (msg) => {
        logEntries.push(
          `${new Date().toISOString()} [${msg.type()}] ${msg.text()}`
        );
      });
      page.on("pageerror", (error) => {
        logEntries.push(`${new Date().toISOString()} [error] ${error.message}`);
      });

      await use(artifactDir);

      // --- Teardown ---

      // Stop tick recording and capture final tick
      clearInterval(tickTimer);
      clearInterval(s3TickTimer);
      await captureS3Keys(); // final S3 capture before last tick
      captureTickSync();

      // Copy the MeadowHome config dir (including its .git history) as-is
      const meadowHomeStateRepo = path.join(artifactDir, "meadowHome-state-repo");
      cpSync(configDir, meadowHomeStateRepo, {
        recursive: true,
        filter: (src) => {
          if (src === configDir) return true;
          const rel = path.relative(configDir, src);
          return !rel.startsWith("logs");
        },
      });

      // Write frontend log
      writeFileSync(
        path.join(artifactDir, "frontend.log"),
        logEntries.join("\n")
      );

      // Copy backend log
      const backendLog = path.join(configDir, "logs", "meadow.log");
      if (existsSync(backendLog)) {
        copyFileSync(backendLog, path.join(artifactDir, "backend.log"));
      }

      // Copy backend/frontend stderr captures — these surface crash traces
      // and static-frontend proxy errors that would otherwise be lost.
      // Only copy when non-empty to avoid cluttering artifact dirs.
      // (Extension fixtures that spawn their own processes, e.g. a
      // cloudServer fixture, copy their own stderr logs separately.)
      for (const name of ["backend-stderr.log", "frontend-stderr.log"]) {
        const src = path.join(configDir, "logs", name);
        if (existsSync(src) && statSync(src).size > 0) {
          copyFileSync(src, path.join(artifactDir, name));
        }
      }

      // Persist expected error windows so the assembly step can exclude them from counts
      if (expectedErrorWindows.length > 0) {
        writeFileSync(
          path.join(artifactDir, "expected-error-windows.json"),
          JSON.stringify(expectedErrorWindows.map(w => ({
            pattern: w.pattern.source,
            startTime: w.startTime,
            endTime: w.endTime,
          })))
        );
      }

      // Record end time early (always needed for duration calculations).
      const endTime = new Date();
      writeFileSync(
        path.join(artifactDir, "end-time.txt"),
        endTime.toISOString()
      );

      // Run guardrails, collecting failures so we can write status.txt
      // and assemble artifacts BEFORE re-throwing.
      const guardrailErrors: Error[] = [];

      // Guardrail: fail test if it took longer than 30 seconds
      const startTimeStr = readFileSync(path.join(artifactDir, "start-time.txt"), "utf8").trim();
      const durationMs = endTime.getTime() - new Date(startTimeStr).getTime();
      const MAX_TEST_DURATION_MS = 45_000;
      if (durationMs > MAX_TEST_DURATION_MS) {
        guardrailErrors.push(
          new Error(`Test body took ${(durationMs / 1000).toFixed(1)}s — exceeds the ${MAX_TEST_DURATION_MS / 1000}s limit`)
        );
      }

      // Guardrail: fail test if any log contains ERROR or WARN entries
      // Backend format: [ERROR] or [WARN ] (uppercase, padEnd(5))
      // Frontend format: [error] or [warning] (lowercase, Playwright msg.type())
      const errorWarnPattern = /\[(ERROR|WARN|error|warning)\s*]/;
      // Browser resource-loading 403/404 from preview iframe are expected in e2e
      // (e.g. iframe reloads while a new preview is being generated)
      const benignPatterns = [
        // Browser resource-loading 403/404 from preview iframe are expected in e2e
        // (e.g. iframe reloads while a new preview is being generated)
        /Failed to load resource: the server responded with a status of 403/,
        /Failed to load resource: the server responded with a status of 404/,
      ];

      // Check if a log line's timestamp falls within an expected error window
      const isCoveredByExpectedWindow = (line: string): boolean => {
        if (expectedErrorWindows.length === 0) return false;
        // Extract ISO timestamp from start of line (both backend and frontend formats)
        const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/);
        if (!tsMatch) return false;
        const lineTime = tsMatch[1];
        return expectedErrorWindows.some(w =>
          w.pattern.test(line) && lineTime >= w.startTime && (w.endTime === null || lineTime <= w.endTime)
        );
      };

      const allErrorWarnLines: string[] = [];
      for (const { label, content } of [
        { label: "backend", content: existsSync(backendLog) ? readFileSync(backendLog, "utf8").trim() : "" },
        { label: "frontend", content: logEntries.join("\n") },
      ]) {
        if (!content) continue;
        for (const line of content.split("\n")) {
          if (errorWarnPattern.test(line) && !benignPatterns.some(p => p.test(line)) && !isCoveredByExpectedWindow(line)) {
            allErrorWarnLines.push(`[${label}] ${line}`);
          }
        }
      }
      if (allErrorWarnLines.length > 0) {
        guardrailErrors.push(
          new Error(`Logs should have no ERROR/WARN entries:\n${allErrorWarnLines.join("\n")}`)
        );
      }

      // Write status and failure reason reflecting guardrail results
      const finalStatus = guardrailErrors.length > 0 ? "failed" : (testInfo.status || "unknown");
      writeFileSync(
        path.join(artifactDir, "status.txt"),
        finalStatus
      );
      if (guardrailErrors.length > 0) {
        writeFileSync(
          path.join(artifactDir, "failure-reason.txt"),
          guardrailErrors.map(e => e.message).join("\n")
        );
      }

      // NOTE: assembleTestArtifacts() is NOT called here — it runs in the
      // post-run assembleRun() step instead.  This keeps the browser context
      // (and video recording) alive only for the actual test + lightweight
      // teardown, rather than bloating the video with 10-20s of git/IO work
      // that has nothing to do with the test itself.

      // Now throw the first guardrail error (if any) to fail the test
      if (guardrailErrors.length > 0) {
        throw guardrailErrors[0];
      }

    },
    { auto: true },
  ],

  baseURL: async ({ testServer }, use) => {
    await use(`http://localhost:${testServer.frontendPort}`);
  },

  minioS3: async ({ testServer }, use) => {
    const s3 = new MinioS3(testServer.minioEndpoint, testServer.minioBucket, expect);
    await use(s3);
    s3.destroy();
  },

  _expectedErrorWindows: async ({}, use) => {
    const windows: { pattern: RegExp; startTime: string; endTime: string | null }[] = [];
    await use(windows);
  },

  expectLogErrors: async ({ _expectedErrorWindows: windows }, use) => {
    const fn = (pattern: RegExp) => {
      const entry = { pattern, startTime: new Date().toISOString(), endTime: null as string | null };
      windows.push(entry);
      return () => { entry.endTime = new Date().toISOString(); };
    };
    await use(fn);
  },

  _additionalSnapshotHandlers: async ({}, use) => {
    await use([]);
  },

  snapshot: async ({ artifactDir, testServer, minioS3, _additionalSnapshotHandlers }, use) => {
    // --- Setup: init repos ---

    const { minioEndpoint, configDir } = testServer;
    const uncommittedLogPath = path.join(artifactDir, "meadowHome-uncommitted.jsonl");

    let minioStateRepo: string | null = null;
    let minioTimelinePath: string | null = null;

    if (minioEndpoint) {
      minioStateRepo = path.join(artifactDir, "minio-state-repo");
      minioTimelinePath = path.join(minioStateRepo, "timeline.jsonl");
      const objectsDir = path.join(minioStateRepo, "objects");
      mkdirSync(objectsDir, { recursive: true });
      initGitRepo(minioStateRepo, "minio-snapshot");
    }

    // --- The snapshot function ---

    const snapshotFn = async (message: string) => {
      // MinIO snapshot
      if (minioStateRepo && minioTimelinePath) {
        try {
          const objectsDir = path.join(minioStateRepo, "objects");
          const keys = await minioS3.listKeys();

          // Clear and re-download to handle deletions
          if (existsSync(objectsDir)) {
            rmSync(objectsDir, { recursive: true });
          }
          mkdirSync(objectsDir, { recursive: true });

          for (const key of keys) {
            const content = await minioS3.getObjectContent(key);
            const filePath = path.join(objectsDir, key);
            mkdirSync(path.dirname(filePath), { recursive: true });
            writeFileSync(filePath, content);
          }
          gitCommitIfChanged(minioStateRepo, message, minioTimelinePath);
        } catch (err) {
          console.error("minio snapshot error:", err);
        }
      }

      // Check for uncommitted files in the app's configDir.
      const gitDir = path.join(configDir, ".git");
      if (existsSync(gitDir)) {
        try {
          const statusOutput = execSync("git status --porcelain", {
            cwd: configDir,
            encoding: "utf8",
          }).trim();
          const uncommittedFiles = statusOutput
            ? statusOutput.split("\n").map((line) => ({
                status: line.slice(0, 2).trim(),
                path: line.slice(3),
              }))
            : [];
          appendFileSync(
            uncommittedLogPath,
            JSON.stringify({
              timestamp: new Date().toISOString(),
              message,
              uncommittedFiles,
            }) + "\n"
          );
        } catch (err) {
          console.error("uncommitted check error:", err);
        }
      }

      // Let layered fixtures contribute their own snapshot capture.
      for (const handler of _additionalSnapshotHandlers) {
        await handler(message);
      }

      // Write snapshot marker so the tick system picks it up on the next tick
      const markerPath = path.join(artifactDir, "snapshot-marker.txt");
      writeFileSync(markerPath, message);
    };

    await use(snapshotFn);
  },

  assertMeadowHomeState: async ({ testServer }, use) => {
    const { configDir } = testServer;
    const fn = async (opts?: { allowedUntracked?: string[]; allowedModified?: string[] }) => {
      const gitDir = path.join(configDir, ".git");
      if (!existsSync(gitDir)) {
        throw new Error(
          `assertMeadowHomeState: configDir ${configDir} is not a git repo`
        );
      }
      // Use -z so paths are NUL-separated and never quoted/escaped.
      const out = execSync("git status --porcelain -z", {
        cwd: configDir,
        encoding: "utf8",
      });
      const records = out.split("\0").filter((r) => r.length > 0);
      const untracked: string[] = [];
      const modified: { status: string; path: string }[] = [];
      for (const rec of records) {
        const status = rec.slice(0, 2);
        const filePath = rec.slice(3);
        if (status === "??") {
          untracked.push(filePath);
        } else {
          modified.push({ status, path: filePath });
        }
      }
      const allowedU = new Set(opts?.allowedUntracked ?? []);
      const allowedM = new Set(opts?.allowedModified ?? []);
      const unexpectedU = untracked.filter((p) => !allowedU.has(p));
      const unexpectedM = modified.filter((m) => !allowedM.has(m.path));
      if (unexpectedU.length === 0 && unexpectedM.length === 0) return;

      const lines: string[] = [
        "assertMeadowHomeState: MeadowHome has unexpected uncommitted state.",
      ];
      if (unexpectedU.length > 0) {
        lines.push("  Unexpected untracked:");
        for (const p of unexpectedU) lines.push(`    ?? ${p}`);
      }
      if (unexpectedM.length > 0) {
        lines.push("  Unexpected modified:");
        for (const m of unexpectedM) lines.push(`    ${m.status} ${m.path}`);
      }
      lines.push("");
      lines.push("  If this state is intentional, allow it explicitly:");
      const u = unexpectedU.map((p) => JSON.stringify(p)).join(", ");
      const m = unexpectedM.map((x) => JSON.stringify(x.path)).join(", ");
      lines.push(
        `    await assertMeadowHomeState({ allowedUntracked: [${u}], allowedModified: [${m}] })`
      );
      throw new Error(lines.join("\n"));
    };
    await use(fn);
  },

  addKeyFrame: async ({ page, artifactDir }, use) => {
    const keyFrames: { docId: string; filename: string; timestamp: string }[] = [];

    const docIdCounts = new Map<string, number>();

    const addKeyFrameFn = async (scenarioDoc: { id: string }) => {
      const count = (docIdCounts.get(scenarioDoc.id) ?? 0) + 1;
      docIdCounts.set(scenarioDoc.id, count);
      const filename = count === 1
        ? `keyframe-${scenarioDoc.id}.png`
        : `keyframe-${scenarioDoc.id}-${count}.png`;
      await page.screenshot({ path: path.join(artifactDir, filename) });
      keyFrames.push({ docId: scenarioDoc.id, filename, timestamp: new Date().toISOString() });
    };

    await use(addKeyFrameFn);

    // Teardown: write keyframes.json so artifact assembly can find them
    if (keyFrames.length > 0) {
      writeFileSync(
        path.join(artifactDir, "keyframes.json"),
        JSON.stringify(keyFrames, null, 2)
      );
    }
  },
});

export { expect };
