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

import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { saveResourcesLocalConfig } from '../../../shared_code/utils/resourcesConfigUtils.js';
import { RuntimeSupervisor } from '../../supervisor/src/runtimeSupervisor.js';
import { findFreeLoopbackPort } from '../../supervisor/src/freePort.js';

const SYSTEM_TESTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_ROOT = path.resolve(SYSTEM_TESTS_DIR, '../..');
const BACKEND_DIR = path.join(WORKSPACE_ROOT, 'runtime', 'service');

export const TEST_PORT = parseInt(process.env.MEADOW_SYSTEM_TEST_PORT ?? '3099', 10);
export const TEST_BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_API_CAPABILITY = process.env.MEADOW_SYSTEM_TEST_API_CAPABILITY
  ?? randomBytes(32).toString('base64url');
// Vitest isolates module graphs between files. Persist the per-run fake
// capability in this process environment so setup and test imports agree.
process.env.MEADOW_SYSTEM_TEST_API_CAPABILITY = TEST_API_CAPABILITY;
const nativeFetch = globalThis.fetch.bind(globalThis);

export function authenticatedSystemTestFetch(
  input: Parameters<typeof globalThis.fetch>[0],
  init: Parameters<typeof globalThis.fetch>[1] = {},
) {
  const rawUrl = input instanceof globalThis.Request ? input.url : input.toString();
  const candidate = new globalThis.URL(rawUrl, TEST_BASE_URL);
  const testOrigin = new globalThis.URL(TEST_BASE_URL).origin;
  if (candidate.origin !== testOrigin || !candidate.pathname.startsWith('/api/')) {
    return nativeFetch(input, init);
  }
  const headers = new globalThis.Headers(input instanceof globalThis.Request ? input.headers : undefined);
  new globalThis.Headers(init.headers).forEach((value, key) => headers.set(key, value));
  headers.set('x-meadow-capability', TEST_API_CAPABILITY);
  if (input instanceof globalThis.Request) {
    return nativeFetch(new globalThis.Request(input, { ...init, headers }));
  }
  return nativeFetch(input, { ...init, headers });
}

export function installAuthenticatedSystemTestFetch(): void {
  globalThis.fetch = authenticatedSystemTestFetch;
}

installAuthenticatedSystemTestFetch();
/**
 * IMPORTANT: This must live OUTSIDE the Meadow repo.
 *
 * The backend may attempt to git-commit generated preview/published files after publish.
 * If the test config directory lives inside the Meadow repo, git discovery will find the
 * parent repo and create real commits in the codebase during system tests.
 */
const RUN_ID =
  process.env.MEADOW_SYSTEM_TEST_RUN_ID ??
  `${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
export const TEST_CONFIG_DIR =
  process.env.MEADOW_SYSTEM_TEST_CONFIG_DIR ??
  path.join(os.tmpdir(), 'meadow_system_tests', RUN_ID);

let serverSupervisor: RuntimeSupervisor | null = null;
let serverStartCount = 0;

async function killAnyServerOnTestPort(): Promise<void> {
  try {
    // Use lsof to find LISTENING process(es) on the test port.
    // IMPORTANT: only kill listeners, not client connections (which could include the Jest process).
    const result = execSync(`lsof -tiTCP:${TEST_PORT} -sTCP:LISTEN`, { encoding: 'utf8' });
    const pids = result.trim().split('\n').filter(Boolean);
    if (pids.length === 0) return;

    console.log(`Found server process(es) on port ${TEST_PORT}, killing...`);
    for (const pid of pids) {
      try {
        process.kill(parseInt(pid, 10), 'SIGKILL');
      } catch {
        // Process might have already exited
      }
    }

    // Wait for the port to be released
    await new Promise(r => setTimeout(r, 500));
  } catch {
    // lsof returns non-zero if no process is on the port, which is fine
  }
}

/**
 * Checks if the server is already running
 */
async function isServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${TEST_BASE_URL}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Starts the backend server on the test port with isolated config directory.
 * If the server is already running (from this run or a previous run), reuses it.
 */
export async function startServer(): Promise<void> {
  serverStartCount++;

  // If we already started a server in THIS test run, reuse it (if healthy).
  // If it's not healthy, restart it.
  if (serverSupervisor) {
    if (await isServerRunning()) {
      return;
    }
    console.log('Runtime Supervisor exists but is not responding, cleaning up...');
    await serverSupervisor.shutdown('requested');
    serverSupervisor = null;
  }
  
  // If something else is already listening on this port, fail fast.
  // Reusing an unknown server is unsafe because it may have been started with a different
  // MEADOW_HOME_DIRECTORY_OVERRIDE (which could be inside the repo, causing real commits).
  if (await isServerRunning()) {
    await killAnyServerOnTestPort();
    if (await isServerRunning()) {
      serverStartCount--;
      throw new Error(
        `A server is already running on ${TEST_BASE_URL}. ` +
          `Stop it (or use a different port) before running system tests.`
      );
    }
  }

  // Ensure the config workspace directory exists
  if (!fs.existsSync(TEST_CONFIG_DIR)) {
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
  }

  // Write test port to resources.local.yaml so the backend reads it from config
  saveResourcesLocalConfig({ backendPort: TEST_PORT }, TEST_CONFIG_DIR);

  console.log(`Starting supervised server on port ${TEST_PORT}...`);
  let controlPort = await findFreeLoopbackPort();
  while (controlPort === TEST_PORT) controlPort = await findFreeLoopbackPort();
  let frontendPort = await findFreeLoopbackPort();
  while (frontendPort === TEST_PORT || frontendPort === controlPort) {
    frontendPort = await findFreeLoopbackPort();
  }
  const appVersion = '0.5.41-system-test';
  const perspective = process.env.MEADOW_BUILD_PERSPECTIVE === 'composed'
    ? 'composed'
    : 'standalone';
  const supervisor = new RuntimeSupervisor({
    schemaVersion: 1,
    homeDirectory: TEST_CONFIG_DIR,
    payload: {
      identity: `source-${perspective}-${appVersion}`,
      appVersion,
      perspective,
    },
    service: {
      executable: path.join(BACKEND_DIR, 'node_modules', '.bin', 'tsx'),
      args: ['src/shared/app-shell/index.ts'],
      cwd: BACKEND_DIR,
      environment: { MEADOW_IS_DEV: 'true' },
    },
    web: {
      executable: process.execPath,
      args: [
        '-e',
        "require('http').createServer((q,s)=>{s.writeHead(200);s.end('ready')}).listen(Number(process.env.PORT),'127.0.0.1')",
      ],
      cwd: SYSTEM_TESTS_DIR,
    },
    idleTimeoutMs: 60 * 60 * 1_000,
  }, {
    ports: { controlPort, backendPort: TEST_PORT, frontendPort },
    capability: TEST_API_CAPABILITY,
    childStdio: () => process.env.DEBUG ? 'inherit' : 'ignore',
    ownershipLogPath: path.join(TEST_CONFIG_DIR, 'logs', 'meadow.log'),
  });
  supervisor.leases.acquire('client', `system-tests-${process.pid}`, process.pid);
  try {
    const descriptor = await supervisor.start();
    serverSupervisor = supervisor;
    process.env.MEADOW_SYSTEM_TEST_API_CAPABILITY = descriptor.capability;
    await waitForHealthy();
  } catch (error) {
    await supervisor.shutdown('startup-failure');
    throw error;
  }
}

/**
 * Waits for the server to respond to health checks
 */
async function waitForHealthy(maxAttempts = 30, delayMs = 200): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${TEST_BASE_URL}/api/health`);
      if (response.ok) {
        console.log('Server is healthy');
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error('Server health check timed out');
}

/**
 * Stops the backend server
 */
export function stopServer(): void {
  serverStartCount--;
  
  // Only actually stop if no one else is using it
  if (serverStartCount > 0) {
    console.log(`Server still in use by ${serverStartCount} test suites`);
    return;
  }
  
  if (serverSupervisor) {
    console.log('Stopping supervised server...');
    const supervisor = serverSupervisor;
    serverSupervisor = null;
    supervisor.leases.release('client', `system-tests-${process.pid}`);
    void supervisor.shutdown('requested');
  }
}

/**
 * Force stops the server regardless of reference count
 */
export function forceStopServer(): void {
  serverStartCount = 0;
  if (serverSupervisor) {
    console.log('Force stopping supervised server...');
    const supervisor = serverSupervisor;
    serverSupervisor = null;
    supervisor.leases.release('client', `system-tests-${process.pid}`);
    void supervisor.shutdown('requested');
  }
}

// Ensure cleanup on process exit
process.on('exit', () => {
  forceStopServer();
  if (process.env.MEADOW_SYSTEM_TESTS_KEEP_CONFIG_DIR) {
    return;
  }
  try {
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
  } catch {
    // Best-effort cleanup
  }
});

process.on('SIGINT', () => {
  forceStopServer();
  process.exit(0);
});

process.on('SIGTERM', () => {
  forceStopServer();
  process.exit(0);
});

/**
 * Gets the path to test fixtures
 */
export function getFixturesPath(): string {
  return path.join(WORKSPACE_ROOT, 'shared_data', 'home_fixtures');
}

/**
 * Gets the path to source graphs
 */
export function getSourceGraphsPath(): string {
  return path.join(WORKSPACE_ROOT, 'shared_data', 'source_graphs');
}

export function getExpectedResultsPath(): string {
  return path.join(SYSTEM_TESTS_DIR, 'expected_results');
}

/**
 * Creates a unique test workspace directory
 */
export function createTestWorkspace(): string {
  const uniqueId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const workspacePath = path.join(TEST_CONFIG_DIR, uniqueId);
  fs.mkdirSync(workspacePath, { recursive: true });
  return workspacePath;
}

/**
 * Cleans up a test workspace directory
 */
export function cleanupTestWorkspace(workspacePath: string): void {
  if (fs.existsSync(workspacePath)) {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
}

/**
 * Clears the hooks cache on the server.
 * This should be called after setting up a test that includes hooks,
 * since the server may have cached that hooks don't exist from a previous test.
 */
export async function clearHooksCache(): Promise<void> {
  const response = await fetch(`${TEST_BASE_URL}/api/generation/hooks/clear-cache`, {
    method: 'POST'
  });
  if (!response.ok) {
    throw new Error(`Failed to clear hooks cache: ${response.statusText}`);
  }
}
