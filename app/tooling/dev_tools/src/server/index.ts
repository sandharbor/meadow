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
import { existsSync, rmSync, readdirSync, readFileSync, mkdirSync, cpSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, URL } from "url";
import { spawn, execFile } from "child_process";
import { promisify } from "node:util";
import { homedir } from "os";
import { createSourceChangeRoutes, fixtureSourceGraphs } from './sourceChangeRoutes.js';
import { applySourceChange, loadSourceChanges } from '../../../../shared_code/shared_dev/sourceChanges.js';
import { acceptSourceBaseline } from "../../../../shared_code/shared_dev/sourceScenario.js";
import { appPlacePath, parseAppPlace, type PlaceArrival } from "../../../../contracts/places/index.js";
import { getRuntimePaths } from "../../../../runtime/supervisor/src/runtimePaths.js";
import { readRuntimeSessionDescriptor } from "../../../../runtime/supervisor/src/sessionDescriptor.js";
import type { SourcingReview } from "../../../../contracts/types/sourcing.js";
import { getDefaultConfigDirectory } from "../../../../shared_code/utils/appConfigUtils.js";
import { findProjectRoot } from "../../../../shared_code/shared_dev/testBundlesConfig.js";
import { homeFixtureDisplayName, listHomeFixtures } from "../../../../shared_code/shared_dev/savedStates.js";
import type { ConfigFixture, PublishingProviderConfProfile } from "../shared/types.js";
import { createBrowserLaunchUrl } from "../../../../runtime/supervisor/src/runtimeClient.js";
import { DevRuntimeManager } from "./devRuntimeManager.js";
import { stopOwnedDevAppProcesses } from "./devAppProcessManager.js";
import { SavedStateRefusal, SavedStateSession, type SavedStateOrigin, type ServiceTarget } from "./savedStateSession.js";
import { checkpointOptions } from "./checkpointCatalog.js";
import { designatedScenarioStart } from "./designatedScenario.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

// The report viewer opens checkpoints here from another origin.
app.use(cors());
app.use(express.json());

function getProjectRoot(): string {
  const projectRoot = findProjectRoot(__dirname);
  if (!projectRoot) {
    throw new Error("Could not find project root (looking for shared_data/home_fixtures)");
  }
  return projectRoot;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const projectRoot = getProjectRoot();
const electronAppDir = join(projectRoot, "app", "hosts", "desktop");
const electronPackage = JSON.parse(
  readFileSync(join(electronAppDir, "package.json"), "utf8"),
) as { version?: unknown };
const appVersionValue = electronPackage.version;
if (typeof appVersionValue !== "string" || appVersionValue.length === 0) {
  throw new Error("Electron app package does not declare a version");
}
const appVersion = appVersionValue;

// The developer's real Meadow Home (or a worktree's isolated one). Dev Tools
// never moves it; every other saved state opens into its own folder.
const session = new SavedStateSession({
  projectRoot,
  normalHome: getDefaultConfigDirectory(),
  homesDirectory: process.env.MEADOW_DEV_HOMES_DIRECTORY,
  instanceName: process.env.MEADOW_DEV_TMUX_SESSION,
});

function runtimeFor(homeDirectory: string, serviceEnvironment: Record<string, string>): DevRuntimeManager {
  return new DevRuntimeManager({ projectRoot, configDirectory: homeDirectory, appVersion, serviceEnvironment });
}

function currentRuntime(): DevRuntimeManager {
  const current = session.current();
  return runtimeFor(current.homeDirectory, current.serviceEnvironment);
}

/** Environment every client launched for the open saved state receives. */
function clientEnvironment(): typeof process.env {
  const current = session.current();
  return {
    ...process.env,
    MEADOW_HOME_DIRECTORY_OVERRIDE: current.homeDirectory,
    ...current.serviceEnvironment,
  };
}

let operationRunning = false;
app.use('/api', (req, res, next) => {
  if (req.method === 'GET') { next(); return; }
  if (operationRunning) { res.status(409).json({ error: 'Wait for the current saved-state operation to finish.' }); return; }
  operationRunning = true;
  res.once('finish', () => { operationRunning = false; });
  next();
});

app.use('/api', createSourceChangeRoutes({
  projectRoot,
  openHome: () => session.current().homeDirectory,
  openSourceGraphs: () => session.openSourceGraphs(),
}));

// ============ Saved States ============

function discoverFixtures(): ConfigFixture[] {
  return listHomeFixtures(projectRoot).map(folderName => ({
    folderName,
    displayName: homeFixtureDisplayName(folderName),
    hasSourceChanges: fixtureSourceGraphs(projectRoot, folderName).some(graph => loadSourceChanges(projectRoot, graph).length > 0),
  })).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** What the app reported reaching after the latest launch, from the Runtime. */
async function latestArrival(): Promise<PlaceArrival | null> {
  const current = session.current();
  if (!current.requestedPlace || !current.launchedAt) return null;
  const descriptorPath = getRuntimePaths(current.homeDirectory).sessionDescriptor;
  if (!existsSync(descriptorPath)) return null;
  try {
    const descriptor = readRuntimeSessionDescriptor(descriptorPath);
    const response = await globalThis.fetch(`${descriptor.backendUrl}/places/arrivals?since=${encodeURIComponent(current.launchedAt)}`, {
      headers: { "x-meadow-capability": descriptor.capability },
      signal: globalThis.AbortSignal.timeout(2_000),
    });
    if (!response.ok) return null;
    const { arrivals } = await response.json() as { arrivals: PlaceArrival[] };
    return arrivals.filter(arrival => arrival.requested === current.requestedPlace).at(-1) ?? null;
  } catch {
    return null;
  }
}

app.get("/api/saved-states", async (_req, res) => {
  try {
    res.json({
      arrival: await latestArrival(),
      current: session.current(),
      fixtures: discoverFixtures(),
      localServiceParts: await session.localServicesMounted(),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error, "Failed to read saved states") });
  }
});

/** Stop everything running against the open saved state before replacing it. */
async function stopClients(): Promise<void> {
  await stopOwnedDevAppProcesses(electronAppDir);
  await currentRuntime().stopRuntime();
}

function parseOrigin(value: unknown): SavedStateOrigin {
  const origin = value as Partial<SavedStateOrigin> | undefined;
  switch (origin?.kind) {
    case 'normal': return { kind: 'normal' };
    case 'empty': return { kind: 'empty' };
    case 'fixture':
      if (typeof origin.fixture === 'string') return { kind: 'fixture', fixture: origin.fixture };
      break;
    case 'checkpoint':
      if (typeof origin.runId === 'string' && typeof origin.scenario === 'string' && typeof origin.checkpoint === 'number' && Number.isInteger(origin.checkpoint)) {
        return { kind: 'checkpoint', runId: origin.runId, scenario: origin.scenario, checkpoint: origin.checkpoint };
      }
      break;
  }
  throw new Error('Unknown saved state');
}

type LaunchMode = 'app' | 'browser' | 'none';

async function openSavedState(origin: SavedStateOrigin, serviceTarget: ServiceTarget) {
  await stopClients();
  return await session.open(origin, serviceTarget);
}

/**
 * Open a saved state and hand it to a client. The report viewer's checkpoint
 * button and every Dev Tools card use this one contract:
 * { origin, serviceTarget: "local" | "hosted", launch: "app" | "browser" | "none", targetPath? }
 */
app.post("/api/saved-states/open", async (req, res) => {
  try {
    const origin = parseOrigin(req.body?.origin);
    const serviceTarget: ServiceTarget = req.body?.serviceTarget === 'hosted' ? 'hosted' : 'local';
    const launch: LaunchMode = ['app', 'browser', 'none'].includes(req.body?.launch) ? req.body.launch : 'app';
    const state = await openSavedState(origin, serviceTarget);
    // A fork opens where its checkpoint was taken unless told otherwise.
    const targetPath = typeof req.body?.targetPath === 'string' ? req.body.targetPath : state.checkpoint?.place ?? '/';
    const destination = await launchClient(launch, targetPath);
    res.json({ success: true, state, destination });
  } catch (error) {
    if (error instanceof SavedStateRefusal) {
      res.status(409).json({ error: error.message });
      return;
    }
    console.error("Error opening saved state:", error);
    res.status(500).json({ error: errorMessage(error, "Failed to open saved state") });
  }
});

app.get("/api/checkpoints/:runId/:scenario", (req, res) => {
  try {
    res.json({ checkpoints: checkpointOptions(req.params.runId, req.params.scenario) });
  } catch (error) {
    res.status(404).json({ error: errorMessage(error, "Checkpoints not found") });
  }
});

// Start a source change's designated scenario on current code: open its
// fixture, accept the baseline, apply the change, and review it.
app.post('/api/source-scenarios/:changeId/start', async (req, res) => {
  try {
    const change = ['meadow-test-bundles-data', 'multi-source', ...readdirSync(join(projectRoot, 'app/shared_data/source_changes'))]
      .filter((graph, index, all) => all.indexOf(graph) === index)
      .flatMap(graph => loadSourceChanges(projectRoot, graph))
      .find(candidate => candidate.id === req.params.changeId);
    if (!change) { res.status(404).json({ error: 'Unknown source change' }); return; }
    const start = designatedScenarioStart(projectRoot, change);
    const serviceTarget: ServiceTarget = req.body?.serviceTarget === 'hosted' ? 'hosted' : 'local';
    const state = await openSavedState({ kind: 'fixture', fixture: start.fixtureName }, serviceTarget);
    await currentRuntime().prepareForLaunch('started a source scenario in Meadow Dev Tools');
    const run = async (args: string[]): Promise<string> => {
      const result = await promisify(execFile)(process.execPath, [join(projectRoot, 'app/clients/cli/dist/meadow.cjs'), ...args], {
        env: clientEnvironment(), maxBuffer: 16 * 1024 * 1024, timeout: 120000,
      });
      return result.stdout;
    };
    await acceptSourceBaseline(run, start.bundleSlug);
    applySourceChange({ projectRoot, sourceGraphsDir: join(state.homeDirectory, 'source_graphs'), sourceGraph: start.sourceGraph, changeId: change.id });
    // A change that disconnects a source or its required start cannot
    // capture a candidate; the accepted bundle is where the repair begins.
    let targetPath = appPlacePath({ page: 'bundle', slug: start.bundleSlug, surface: { name: 'source-review', parameters: {} } });
    try {
      const review = JSON.parse(await run(['bundle', 'sources', 'refresh', start.bundleSlug])) as SourcingReview;
      if (!review.candidate) targetPath = appPlacePath({ page: 'bundle', slug: start.bundleSlug });
    } catch {
      targetPath = appPlacePath({ page: 'bundle', slug: start.bundleSlug });
    }
    const launch: LaunchMode = ['app', 'browser', 'none'].includes(req.body?.launch) ? req.body.launch : 'app';
    const destination = await launchClient(launch, targetPath);
    res.json({ success: true, targetPath, destination, start });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error, 'Could not prepare the source scenario') });
  }
});

// ============ Publishing Provider Confs ============

function getPublishingProviderConfsPath(): string {
  return join(projectRoot, "app", "tooling", "dev_tools", "publishing_provider_confs");
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

// Hosted Development credentials go into the open saved state, never into
// the developer's real home and never into a Local saved state.
app.post("/api/publishing-provider-confs/apply", async (req, res) => {
  try {
    const { profileName } = (req.body || {}) as { profileName?: string };
    if (!profileName) {
      res.status(400).json({ error: "profileName is required" });
      return;
    }
    const current = session.current();
    if (current.origin.kind === 'normal') {
      res.status(400).json({ error: "Refusing to modify your real Meadow Home. Open a saved state first." });
      return;
    }
    if (current.serviceTarget !== 'hosted') {
      res.status(400).json({ error: "This saved state uses Local services. Open it with Hosted Development to apply hosted credentials." });
      return;
    }

    await currentRuntime().stopRuntime();

    const profilePath = join(getPublishingProviderConfsPath(), profileName);
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

    const targetRoot = join(current.homeDirectory, "app", "publishing_providers");
    mkdirSync(targetRoot, { recursive: true });
    const written: string[] = [];
    for (const entry of providerEntries) {
      const dest = join(targetRoot, entry.name);
      if (existsSync(dest)) rmSync(dest, { recursive: true });
      cpSync(join(profilePath, entry.name), dest, {
        recursive: true,
        filter: (s: string) => !s.includes(".DS_Store"),
      });
      written.push(entry.name);
    }

    res.json({ success: true, message: `Applied "${profileName}" → ${written.join(", ")}` });
  } catch (error) {
    console.error("Error applying publishing provider conf:", error);
    res.status(500).json({ error: "Failed to apply publishing provider conf" });
  }
});

// ============ Logs Operations ============

app.post("/api/logs/clear", (_req, res) => {
  try {
    const logDir = join(homedir(), "Library", "Logs", "Meadow");
    if (existsSync(logDir)) rmSync(logDir, { recursive: true });
    res.json({ success: true, message: "Logs directory removed" });
  } catch (error) {
    console.error("Error clearing logs:", error);
    res.status(500).json({ error: "Failed to clear logs" });
  }
});

// ============ App Launch Operations ============

/** Any App Place is a valid destination; nothing else is. */
function validDestination(targetPath: string): string {
  const parsed = parseAppPlace(targetPath);
  if (parsed.ignored.length > 0) throw new Error(`Invalid app destination: ${parsed.ignored.join(', ')}`);
  return appPlacePath(parsed.place);
}

/** Launch the dev Electron app against the open saved state. */
async function launchDevApp(targetPath: string): Promise<void> {
  const stoppedProcessGroups = await stopOwnedDevAppProcesses(electronAppDir);
  if (stoppedProcessGroups.length > 0) {
    console.log(`[dev] Stopped process groups: ${stoppedProcessGroups.join(", ")}`);
  }
  // Start or attach before Electron launches; Electron negotiates its own
  // client lease against the same supervisor-owned Runtime.
  await currentRuntime().prepareForLaunch("clicked Start Dev App in Meadow Dev Tools");
  const child = spawn("npm", ["run", "electron-dev"], {
    cwd: electronAppDir,
    shell: true,
    detached: true,
    stdio: "ignore",
    env: { ...clientEnvironment(), MEADOW_INITIAL_APP_PATH: targetPath },
  });
  child.unref();
}

/** Open (or focus) Chrome on the open saved state and return the URL. */
async function openBrowser(targetPath: string): Promise<string> {
  const userAction = "clicked Open Browser in Meadow Dev Tools";
  const preparedRuntime = await currentRuntime().prepareForLaunch(userAction);
  const targetUrl = await createBrowserLaunchUrl(preparedRuntime.descriptor, targetPath, {
    ownershipTraceId: preparedRuntime.ownershipTraceId,
    source: "Meadow Dev Tools",
    userAction,
  });
  if (process.env.MEADOW_DEV_NO_BROWSER === "1") return targetUrl;
  const localhostPattern = new URL(targetUrl).host;
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
        set URL of tab foundTabIndex of window foundWindow to "${targetUrl}"
        set active tab index of window foundWindow to foundTabIndex
        set index of window foundWindow to 1
        activate
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
  await promisify(execFile)("osascript", ["-e", appleScript]);
  return targetUrl;
}

async function launchClient(launch: LaunchMode, targetPath: string): Promise<string | null> {
  const destination = validDestination(targetPath);
  if (launch !== 'none') session.recordLaunch(destination);
  if (launch === 'app') {
    await launchDevApp(destination);
    return destination;
  }
  if (launch === 'browser') return await openBrowser(destination);
  return null;
}

app.post("/api/app/launch-dev", async (req, res) => {
  try {
    await launchDevApp(validDestination(req.body?.targetPath ?? '/'));
    res.json({ success: true, message: "Dev app launching..." });
  } catch (error) {
    console.error("Error launching dev app:", error);
    res.status(500).json({ error: errorMessage(error, "Failed to launch dev app") });
  }
});

app.post("/api/app/open-browser", async (req, res) => {
  try {
    const { url } = (req.body || {}) as { url?: string };
    const requestedTarget = url ? new URL(url) : null;
    if (requestedTarget && requestedTarget.hostname !== "localhost" && requestedTarget.hostname !== "127.0.0.1") {
      res.status(400).json({ error: "Only local Meadow URLs may be opened" });
      return;
    }
    const targetPath = requestedTarget
      ? `${requestedTarget.pathname}${requestedTarget.search}${requestedTarget.hash}`
      : "/";
    const targetUrl = await openBrowser(targetPath);
    res.json({ success: true, message: `Browser opened/focused for ${targetUrl}`, url: targetUrl });
  } catch (error) {
    console.error("Error opening browser:", error);
    res.status(500).json({ error: errorMessage(error, "Failed to open browser") });
  }
});

// ============ Start Server ============

const server = app.listen(PORT, () => {
  console.log(`Dev Tools Server running on http://localhost:${PORT}`);
  session.resume().catch(error => console.error("Could not resume the open saved state:", error));
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close();
    session.shutdown().finally(() => process.exit(0));
  });
}
