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
import cors from "cors";
import { existsSync, renameSync, rmSync, readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { homedir } from "os";
import { getDefaultConfigDirectory } from "../../../shared_code/utils/appConfigUtils.js";
import { loadResourcesConfig } from "../../../shared_code/utils/resourcesConfigUtils.js";
import {
  findProjectRoot,
  getHomeFixturesPath,
  copyTestSiteFixture,
} from "../../../shared_code/shared_dev/testSitesConf.js";
import type { ConfigFixture, PublishingProviderConfProfile } from "../shared/types.js";
import {
  AppConfigGitUtils,
  GIT_AUTHORS,
} from "../../../shared_code/utils/appConfigGitUtils.js";
import { ConfigModeHelper } from "../shared/helpers/ConfigModeHelper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

function getProjectRoot(): string {
  const projectRoot = findProjectRoot(__dirname);
  if (!projectRoot) {
    throw new Error("Could not find project root (looking for shared_data/home_fixtures)");
  }
  return projectRoot;
}

const configDir = getDefaultConfigDirectory();
const normalConfBackup = join(dirname(configDir), "MeadowHome_normal");
const activeFixtureFile = join(dirname(configDir), "meadow_active_fixture");

// Cache the frontend port at startup so it survives config directory moves (e.g. Missing Conf mode)
const cachedFrontendPort = loadResourcesConfig().frontendPort;

// ============ Fixture Discovery ============

const FIXTURE_PREFIX = "home_fixture_";

function discoverFixtures(): ConfigFixture[] {
  try {
    const projectRoot = getProjectRoot();
    const fixturesPath = getHomeFixturesPath(projectRoot);

    if (!existsSync(fixturesPath)) {
      return [];
    }

    const entries = readdirSync(fixturesPath, { withFileTypes: true });
    const fixtures: ConfigFixture[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(FIXTURE_PREFIX)) {
        fixtures.push({
          folderName: entry.name,
          displayName: entry.name.slice(FIXTURE_PREFIX.length),
        });
      }
    }

    fixtures.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return fixtures;
  } catch (error) {
    console.error("Error discovering fixtures:", error);
    return [];
  }
}

function getActiveFixture(): string | null {
  try {
    if (existsSync(activeFixtureFile)) {
      return readFileSync(activeFixtureFile, "utf-8").trim() || null;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

function setActiveFixture(fixtureName: string | null): void {
  if (fixtureName) {
    writeFileSync(activeFixtureFile, fixtureName, "utf-8");
  } else if (existsSync(activeFixtureFile)) {
    rmSync(activeFixtureFile);
  }
}

// ============ Config Status ============

app.get("/api/config/status", (_req, res) => {
  try {
    const configModeHelper = new ConfigModeHelper(
      existsSync(normalConfBackup),
      existsSync(configDir)
    );

    res.json({
      configMode: configModeHelper.mode,
      normalConfBackupExists: configModeHelper.isTestMode,
      normalConfBackupPath: normalConfBackup,
      activeFixture: getActiveFixture(),
    });
  } catch (error) {
    console.error("Error getting config status:", error);
    res.status(500).json({ error: "Failed to get config status" });
  }
});

app.get("/api/config/fixtures", (_req, res) => {
  try {
    const fixtures = discoverFixtures();
    res.json({ fixtures });
  } catch (error) {
    console.error("Error getting fixtures:", error);
    res.status(500).json({ error: "Failed to get fixtures" });
  }
});

// ============ Test Mode Operations ============

// Set test mode: missing (simulates fresh install)
app.post("/api/config/test-mode/missing", (_req, res) => {
  try {
    const alreadyInTestMode = existsSync(normalConfBackup);

    if (alreadyInTestMode) {
      if (existsSync(configDir)) {
        rmSync(configDir, { recursive: true });
      }
    } else {
      if (!existsSync(configDir)) {
        res.status(400).json({ error: "Config directory does not exist. Nothing to move." });
        return;
      }
      renameSync(configDir, normalConfBackup);
    }

    setActiveFixture(null);

    res.json({
      success: true,
      message: "Config folder moved to backup. Simulates fresh install.",
    });
  } catch (error) {
    console.error("Error setting test mode missing:", error);
    res.status(500).json({ error: "Failed to set test mode" });
  }
});

// Set test mode with a specific fixture
app.post("/api/config/test-mode/fixture/:fixtureName", async (req, res) => {
  try {
    const { fixtureName } = req.params;

    const fixtures = discoverFixtures();
    const fixture = fixtures.find(f => f.folderName === fixtureName);
    if (!fixture) {
      res.status(404).json({ error: `Fixture not found: ${fixtureName}` });
      return;
    }

    const alreadyInTestMode = existsSync(normalConfBackup);

    if (alreadyInTestMode) {
      if (existsSync(configDir)) {
        rmSync(configDir, { recursive: true });
      }
    } else {
      if (!existsSync(configDir)) {
        res.status(400).json({ error: "Config directory does not exist. Nothing to move." });
        return;
      }
      renameSync(configDir, normalConfBackup);
    }

    try {
      const projectRoot = getProjectRoot();
      const fixturesPath = getHomeFixturesPath(projectRoot);
      const fixturePath = join(fixturesPath, fixtureName);

      mkdirSync(configDir, { recursive: true });

      const sitesPath = join(fixturePath, "sites");
      if (existsSync(sitesPath)) {
        const siteEntries = readdirSync(sitesPath, { withFileTypes: true });
        for (const entry of siteEntries) {
          if (entry.isDirectory()) {
            const siteSlug = entry.name;
            copyTestSiteFixture(fixtureName, siteSlug, siteSlug, {
              targetConfigDir: configDir,
              projectRoot,
            });
          }
        }
      }

      const hooksPath = join(fixturePath, "app", "hooks");
      if (existsSync(hooksPath)) {
        const destHooksDir = join(configDir, "app", "hooks");
        mkdirSync(destHooksDir, { recursive: true });
        cpSync(hooksPath, destHooksDir, {
          recursive: true,
          filter: (src: string) => !src.includes(".DS_Store"),
        });
        console.log(`  ✓ Copied app/hooks`);
      }

      const gitUtils = new AppConfigGitUtils(GIT_AUTHORS.DEV_TOOLS_APP, configDir);
      await gitUtils.initAndCommitAll(`dev_tools_app: test mode with fixture ${fixture.displayName}`);

      setActiveFixture(fixtureName);

      res.json({
        success: true,
        message: `Fixture "${fixture.displayName}" has been set up successfully with git initialized.`,
      });
    } catch (error) {
      if (!alreadyInTestMode) {
        if (existsSync(configDir)) {
          rmSync(configDir, { recursive: true });
        }
        renameSync(normalConfBackup, configDir);
      }
      throw error;
    }
  } catch (error) {
    console.error("Error setting test mode with fixture:", error);
    res.status(500).json({ error: "Failed to set test mode with fixture" });
  }
});

// Copy current config back to the active fixture
app.post("/api/config/copy-back-to-fixture", (_req, res) => {
  try {
    const activeFixture = getActiveFixture();
    if (!activeFixture) {
      res.status(400).json({ error: "No active fixture. Must be in a test fixture mode." });
      return;
    }

    if (!existsSync(configDir)) {
      res.status(400).json({ error: "Config directory does not exist." });
      return;
    }

    const projectRoot = getProjectRoot();
    const fixturesPath = getHomeFixturesPath(projectRoot);
    const fixturePath = join(fixturesPath, activeFixture);

    if (!existsSync(fixturePath)) {
      res.status(404).json({ error: `Fixture path not found: ${fixturePath}` });
      return;
    }

    rmSync(fixturePath, { recursive: true });
    mkdirSync(fixturePath, { recursive: true });

    const copyWithFilter = (src: string, dest: string) => {
      const entries = readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === ".DS_Store" || entry.name === ".git" || entry.name === ".gitignore") continue;
        const srcPath = join(src, entry.name);
        const destPath = join(dest, entry.name);
        if (entry.isDirectory()) {
          mkdirSync(destPath, { recursive: true });
          copyWithFilter(srcPath, destPath);
        } else {
          const content = readFileSync(srcPath);
          writeFileSync(destPath, content);
        }
      }
    };
    copyWithFilter(configDir, fixturePath);
    console.log(`  ✓ Copied config back to fixture`);

    const fixture = discoverFixtures().find(f => f.folderName === activeFixture);
    res.json({
      success: true,
      message: `Config copied back to fixture "${fixture?.displayName || activeFixture}". Use git to review changes.`,
    });
  } catch (error) {
    console.error("Error copying config back to fixture:", error);
    res.status(500).json({ error: "Failed to copy config back to fixture" });
  }
});

// ============ Publishing Provider Confs ============

function getPublishingProviderConfsPath(): string {
  return join(getProjectRoot(), "app", "dev_tools_app", "publishing_provider_confs");
}

function discoverPublishingProviderConfProfiles(): PublishingProviderConfProfile[] {
  const root = getPublishingProviderConfsPath();
  if (!existsSync(root)) return [];

  const profiles: PublishingProviderConfProfile[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

    const profilePath = join(root, entry.name);
    const providerClassNames: string[] = [];
    for (const sub of readdirSync(profilePath, { withFileTypes: true })) {
      if (sub.isDirectory() && !sub.name.startsWith(".")) {
        providerClassNames.push(sub.name);
      }
    }
    profiles.push({ name: entry.name, providerClassNames });
  }

  profiles.sort((a, b) => a.name.localeCompare(b.name));
  return profiles;
}

app.get("/api/publishing-provider-confs", (_req, res) => {
  try {
    res.json({ profiles: discoverPublishingProviderConfProfiles() });
  } catch (error) {
    console.error("Error discovering publishing provider confs:", error);
    res.status(500).json({ error: "Failed to discover publishing provider confs" });
  }
});

app.post("/api/publishing-provider-confs/apply", (req, res) => {
  try {
    const { profileName } = (req.body || {}) as { profileName?: string };
    if (!profileName) {
      res.status(400).json({ error: "profileName is required" });
      return;
    }

    const inTestMode = existsSync(normalConfBackup);
    if (!inTestMode) {
      res.status(400).json({ error: "Refusing to modify normal config. Switch to a test mode first." });
      return;
    }

    const root = getPublishingProviderConfsPath();
    const profilePath = join(root, profileName);
    if (!existsSync(profilePath)) {
      res.status(404).json({ error: `Profile not found: ${profileName}` });
      return;
    }

    const providerEntries = readdirSync(profilePath, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."));

    if (providerEntries.length === 0) {
      res.status(400).json({ error: `Profile "${profileName}" has no provider folders.` });
      return;
    }

    const targetRoot = join(configDir, "app", "publishing_providers");
    mkdirSync(targetRoot, { recursive: true });

    const written: string[] = [];
    for (const entry of providerEntries) {
      const src = join(profilePath, entry.name);
      const dest = join(targetRoot, entry.name);
      if (existsSync(dest)) {
        rmSync(dest, { recursive: true });
      }
      cpSync(src, dest, {
        recursive: true,
        filter: (s: string) => !s.includes(".DS_Store"),
      });
      written.push(entry.name);
    }

    res.json({
      success: true,
      message: `Applied "${profileName}" → ${written.join(", ")}`,
    });
  } catch (error) {
    console.error("Error applying publishing provider conf:", error);
    res.status(500).json({ error: "Failed to apply publishing provider conf" });
  }
});

// Restore normal mode
app.post("/api/config/normal", (_req, res) => {
  try {
    if (!existsSync(normalConfBackup)) {
      res.status(400).json({ error: "Not in test mode. No backup to restore from." });
      return;
    }

    if (existsSync(configDir)) {
      rmSync(configDir, { recursive: true });
    }

    renameSync(normalConfBackup, configDir);

    setActiveFixture(null);

    res.json({
      success: true,
      message: "Normal config restored from backup.",
    });
  } catch (error) {
    console.error("Error restoring normal mode:", error);
    res.status(500).json({ error: "Failed to restore normal mode" });
  }
});

// ============ Logs Operations ============

app.post("/api/logs/clear", (_req, res) => {
  try {
    const logDir = join(homedir(), "Library", "Logs", "Meadow");

    if (existsSync(logDir)) {
      rmSync(logDir, { recursive: true });
    }

    res.json({ success: true, message: "Logs directory removed" });
  } catch (error) {
    console.error("Error clearing logs:", error);
    res.status(500).json({ error: "Failed to clear logs" });
  }
});

// ============ App Launch Operations ============

// Launch the dev app (electron-dev)
// Always kills any existing dev instances first before launching
app.post("/api/app/launch-dev", async (_req, res) => {
  try {
    const projectRoot = getProjectRoot();
    const electronAppDir = join(projectRoot, "app", "electron_app");

    console.log(`[dev] Killing any existing dev processes before launch...`);

    await new Promise<void>((resolve) => {
      const killScript = `
        pkill -f "electron.*electron_app" || true
        pkill -f "meadow-electron" || true
        pkill -f "node.*electron-dev" || true
      `;

      const killChild = spawn("bash", ["-c", killScript], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      killChild.on("close", () => {
        resolve();
      });
    });

    // Small delay to ensure processes are fully terminated
    await new Promise(r => globalThis.setTimeout(r, 300));

    console.log(`[dev] Starting electron dev in ${electronAppDir}`);

    const child = spawn("npm", ["run", "electron-dev"], {
      cwd: electronAppDir,
      shell: true,
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    });
    child.unref();

    res.json({
      success: true,
      message: "Dev app launching...",
    });
  } catch (error) {
    console.error("Error launching dev app:", error);
    res.status(500).json({ error: "Failed to launch dev app" });
  }
});

// ============ Browser Launch Operations ============

// Open or focus Chrome with a specific localhost URL
app.post("/api/app/open-browser", (req, res) => {
  try {
    const { url } = (req.body || {}) as { url?: string };
    const frontendPort = cachedFrontendPort;
    if (!frontendPort) {
      res.status(500).json({ error: "frontendPort not found in resources config" });
      return;
    }
    const targetUrl = url || `http://localhost:${frontendPort}`;

    const urlMatch = targetUrl.match(/localhost:\d+/);
    const localhostPattern = urlMatch![0];

    console.log(`[browser] Opening/focusing Chrome for ${targetUrl}`);

    const appleScript = `
      tell application "Google Chrome"
        set foundTab to false
        set foundWindow to 0
        set foundTabIndex to 0

        repeat with w from 1 to (count windows)
          set tabList to tabs of window w
          repeat with t from 1 to (count tabList)
            set tabUrl to URL of tab t of window w
            if tabUrl contains "${localhostPattern}" then
              set foundTab to true
              set foundWindow to w
              set foundTabIndex to t
              exit repeat
            end if
          end repeat
          if foundTab then exit repeat
        end repeat

        if foundTab then
          set active tab index of window foundWindow to foundTabIndex
          set index of window foundWindow to 1
          activate
          reload tab foundTabIndex of window foundWindow
        else
          activate
          if (count windows) is 0 then
            make new window
          end if
          tell window 1
            make new tab with properties {URL:"${targetUrl}"}
          end tell
        end if
      end tell
    `;

    const child = spawn("osascript", ["-e", appleScript], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        res.json({
          success: true,
          message: `Browser opened/focused for ${targetUrl}`,
        });
      } else {
        console.error(`[browser] AppleScript error: ${stderr}`);
        res.status(500).json({
          error: "Failed to open browser",
          details: stderr,
        });
      }
    });
  } catch (error) {
    console.error("Error opening browser:", error);
    res.status(500).json({ error: "Failed to open browser" });
  }
});

// ============ Start Server ============

app.listen(PORT, () => {
  console.log(`Dev Tools Server running on http://localhost:${PORT}`);
});
