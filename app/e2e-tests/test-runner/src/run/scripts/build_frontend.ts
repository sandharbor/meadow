#!/usr/bin/env npx tsx
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

/**
 * Builds app/frontend for use by the e2e static frontend server.
 *
 * Why: the e2e test harness replaces vite dev mode (which pays a ~1.8s
 * cold-start compile cost on first `page.goto("/")` per test) with a
 * simple static file server serving dist/. This script makes sure dist/
 * is present and up-to-date before tests run.
 *
 * Called from playwright.config.ts at top-level, before workers start.
 *
 * Staleness detection: the script hashes the mtimes of all tracked
 * source inputs (src/**, index.html, vite.config.ts, package.json,
 * postcss.config.js, tailwind.config.js, tsconfig.json) and stores the
 * hash next to dist/. Rebuilds only when that hash changes. Typical
 * re-run cost: ~50ms for the walk + zero build time.
 *
 * The e2e build pins VITE_PURCHASE_POLL_INTERVAL_MS=500 because the
 * test fixture used to set it per-run in the dev-mode flow and several
 * tests depend on the sped-up polling.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const frontendDir = path.resolve(import.meta.dirname, "../../../../../../app/frontend");
const providersDir = path.resolve(import.meta.dirname, "../../../../../../app/publishing_providers");
const distDir = path.join(frontendDir, "dist");
const stampPath = path.join(distDir, ".e2e-build-stamp");

const E2E_ENV = {
  VITE_PURCHASE_POLL_INTERVAL_MS: "500",
};

// Source inputs whose changes should invalidate dist/
const WATCH_DIRS = ["src"];
const WATCH_FILES = [
  "index.html",
  "vite.config.ts",
  "package.json",
  "package-lock.json",
  "postcss.config.js",
  "tailwind.config.js",
  "tsconfig.json",
];

// Every publishing provider's frontend/ is bundled into the same Vite build
// (via import.meta.glob in providerRegistry.ts), so changes there must
// invalidate dist/ too.
const PROVIDER_FRONTEND_SUBDIR = "frontend";

function computeSourceHash(): string {
  const hash = crypto.createHash("sha256");
  // Include the pinned env so toggling it invalidates the cache
  hash.update(JSON.stringify(E2E_ENV));

  const addFile = (absPath: string, relPath: string) => {
    try {
      const stat = fs.statSync(absPath);
      hash.update(`${relPath}:${stat.mtimeMs}:${stat.size}\n`);
    } catch {
      // Missing file — ignored
    }
  };

  const walk = (dir: string, relBase: string) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      const rel = path.join(relBase, entry.name);
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (entry.isFile()) {
        addFile(full, rel);
      }
    }
  };

  for (const dir of WATCH_DIRS) {
    walk(path.join(frontendDir, dir), dir);
  }
  for (const file of WATCH_FILES) {
    addFile(path.join(frontendDir, file), file);
  }

  // Walk each provider's frontend/ so provider UI changes trigger a rebuild.
  // Use statSync (follows symlinks) rather than Dirent.isDirectory(), since
  // some providers may be mounted as symlinks and Dirent reports those as
  // symlinks rather than directories — skipping them would leave their
  // contents out of the cache hash and reuse a stale build.
  try {
    const providerEntries = fs.readdirSync(providersDir);
    for (const name of providerEntries) {
      const providerPath = path.join(providersDir, name);
      let isDir = false;
      try {
        isDir = fs.statSync(providerPath).isDirectory();
      } catch {
        continue;
      }
      if (!isDir) continue;
      const providerFrontendDir = path.join(providerPath, PROVIDER_FRONTEND_SUBDIR);
      if (fs.existsSync(providerFrontendDir)) {
        walk(providerFrontendDir, path.join("publishing_providers", name, PROVIDER_FRONTEND_SUBDIR));
      }
    }
  } catch {
    // No providers dir — harmless in a stripped-down checkout.
  }

  return hash.digest("hex");
}

export function buildFrontendIfStale(): string {
  const currentHash = computeSourceHash();

  const indexHtml = path.join(distDir, "index.html");
  const existingStamp = fs.existsSync(stampPath) && fs.existsSync(indexHtml)
    ? fs.readFileSync(stampPath, "utf8").trim()
    : "";

  if (existingStamp === currentHash) {
    return distDir;
  }

  process.stderr.write("[e2e] Building frontend for static serving...\n");
  const start = Date.now();
  execSync("npx vite build", {
    cwd: frontendDir,
    env: { ...process.env, ...E2E_ENV },
    stdio: ["ignore", "inherit", "inherit"],
  });
  fs.writeFileSync(stampPath, currentHash);
  process.stderr.write(`[e2e] Frontend build complete in ${Date.now() - start}ms\n`);
  return distDir;
}

// Allow running as a CLI too
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = buildFrontendIfStale();
  process.stdout.write(dir);
}
