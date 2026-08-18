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

import { createHash } from 'node:crypto';
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIRECTORY = path.resolve(TEST_DIRECTORY, '../../..');
const APP_DIRECTORY = path.resolve(BACKEND_DIRECTORY, '..');
const FIXTURE_DIRECTORY = path.join(APP_DIRECTORY, 'shared_data', 'home_fixtures', 'release-safety');
const BACKEND_ENTRY = path.join(BACKEND_DIRECTORY, 'src', 'shared', 'app-shell', 'index.ts');
const TSX_CLI = path.join(BACKEND_DIRECTORY, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const NETWORK_DENY_PRELOAD = path.join(TEST_DIRECTORY, 'networkDeny.cjs');
const FAST_GIT_OPS = path.join(
  APP_DIRECTORY,
  'native_utils',
  'fast_git_ops',
  'fast_git_ops_code',
  'target',
  'release',
  'fast_git_ops_bin',
);
const LAUNCH_CAPABILITY = 'fixture-capability-000000000000000000000000';
const UI_ORIGIN = 'http://127.0.0.1:43123';

const cleanupRoots: string[] = [];
const runningChildren = new Set<ChildProcess>();

interface StartupResult {
  output: string;
  logSource: string;
}

function fixtureCopy(name: string): { root: string; home: string; logDirectory: string } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-release-upgrade-')));
  cleanupRoots.push(root);
  const home = path.join(root, 'Meadow Home');
  fs.cpSync(path.join(FIXTURE_DIRECTORY, name), home, { recursive: true });
  const logDirectory = path.join(root, 'logs-outside-home');
  fs.mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(home, 'app'), { recursive: true });
  fs.appendFileSync(
    path.join(home, 'app', 'resources.yaml'),
    `logDirectory: ${JSON.stringify(logDirectory)}\n`,
  );
  return { root, home, logDirectory };
}

function backendEnvironment(
  home: string,
  root: string,
  logDirectory: string,
  port: number,
): { env: NodeJS.ProcessEnv; auditPath: string; diagnosticPath: string } {
  const auditPath = path.join(root, `network-audit-${port}.txt`);
  const diagnosticPath = path.join(root, `startup-diagnostic-${port}.json`);
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('AWS_') || key.startsWith('MEADOW_')) delete env[key];
  }
  Object.assign(env, {
    AWS_EC2_METADATA_DISABLED: 'true',
    FAST_GIT_OPS_PATH: FAST_GIT_OPS,
    MEADOW_API_CAPABILITY: LAUNCH_CAPABILITY,
    MEADOW_APP_VERSION: '0.5.41',
    MEADOW_BACKEND_PORT: String(port),
    MEADOW_HOME_DIRECTORY_OVERRIDE: home,
    MEADOW_IS_DEV: 'false',
    MEADOW_LOG_DIRECTORY_OVERRIDE: logDirectory,
    MEADOW_NETWORK_AUDIT_PATH: auditPath,
    MEADOW_STARTUP_DIAGNOSTIC_PATH: diagnosticPath,
    MEADOW_UI_ORIGIN: UI_ORIGIN,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${NETWORK_DENY_PRELOAD}`]
      .filter(Boolean)
      .join(' '),
  });
  return { env, auditPath, diagnosticPath };
}

async function unusedLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate loopback port'));
        return;
      }
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForHealth(child: ChildProcess, port: number, output: () => string): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Backend exited before health check (code ${child.exitCode}):\n${output()}`);
    }
    let response: Response | null = null;
    try {
      response = await fetch(`http://127.0.0.1:${port}/api/health`);
    } catch {
      // The listener is not ready yet.
    }
    if (response?.ok) {
      expect(await response.json()).toMatchObject({ ready: true });
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Backend health check timed out:\n${output()}`);
}

async function startAndStopBackend(
  home: string,
  root: string,
  logDirectory: string,
  verify?: (port: number) => Promise<void>,
): Promise<StartupResult> {
  const port = await unusedLoopbackPort();
  const { env, auditPath, diagnosticPath } = backendEnvironment(
    home,
    root,
    logDirectory,
    port,
  );

  const child = spawn(process.execPath, [TSX_CLI, BACKEND_ENTRY], {
    cwd: BACKEND_DIRECTORY,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  runningChildren.add(child);
  let output = '';
  child.stdout?.on('data', chunk => { output += String(chunk); });
  child.stderr?.on('data', chunk => { output += String(chunk); });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
    child.once('close', (code, signal) => resolve({ code, signal }));
  });

  try {
    await waitForHealth(child, port, () => output);
    await verify?.(port);
    expect(fs.existsSync(auditPath) ? fs.readFileSync(auditPath, 'utf8') : '').toBe('');
    expect(fs.existsSync(diagnosticPath)).toBe(false);
    child.kill('SIGTERM');
    const result = await Promise.race([
      closed,
      new Promise<never>((_resolve, reject) => setTimeout(
        () => reject(new Error('Backend did not exit after SIGTERM')),
        10_000,
      )),
    ]);
    expect(result).toEqual({ code: 0, signal: null });
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    runningChildren.delete(child);
  }

  const logPath = path.join(logDirectory, 'meadow.log');
  return {
    output,
    logSource: fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '',
  };
}

async function expectTcpConnectionFailure(host: string, port: number): Promise<void> {
  await expect(new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(2_000);
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('connection timed out'));
    });
    socket.once('error', reject);
  })).rejects.toBeDefined();
}

async function expectBackendRefusal(
  home: string,
  root: string,
  logDirectory: string,
): Promise<{ output: string; diagnostic: Record<string, unknown> }> {
  const port = await unusedLoopbackPort();
  const { env, auditPath, diagnosticPath } = backendEnvironment(
    home,
    root,
    logDirectory,
    port,
  );
  const child = spawn(process.execPath, [TSX_CLI, BACKEND_ENTRY], {
    cwd: BACKEND_DIRECTORY,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  runningChildren.add(child);
  let output = '';
  child.stdout?.on('data', chunk => { output += String(chunk); });
  child.stderr?.on('data', chunk => { output += String(chunk); });
  const result = await Promise.race([
    new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
      child.once('close', (code, signal) => resolve({ code, signal }));
    }),
    new Promise<never>((_resolve, reject) => setTimeout(
      () => reject(new Error('Backend did not refuse startup within 30 seconds')),
      30_000,
    )),
  ]);
  runningChildren.delete(child);
  expect(result).toEqual({ code: 1, signal: null });
  expect(fs.existsSync(auditPath) ? fs.readFileSync(auditPath, 'utf8') : '').toBe('');
  expect(fs.statSync(diagnosticPath).mode & 0o777).toBe(0o600);
  return {
    output,
    diagnostic: JSON.parse(fs.readFileSync(diagnosticPath, 'utf8')) as Record<string, unknown>,
  };
}

function homeDigest(
  home: string,
  options: {
    excludeGitignore?: boolean;
    excludeProviderState?: boolean;
  } = {},
): string {
  const digest = createHash('sha256');
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (
        entry.name === '.git'
        || entry.name === 'logs'
        || (options.excludeProviderState === true && entry.name === 'publishing_providers')
      ) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Fixture contains unsupported symlink ${fullPath}`);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (options.excludeGitignore === true && entry.name === '.gitignore') continue;
        digest.update(path.relative(home, fullPath).split(path.sep).join('/'));
        digest.update('\0');
        digest.update(String(fs.statSync(fullPath).mode & 0o777));
        digest.update('\0');
        digest.update(fs.readFileSync(fullPath));
        digest.update('\0');
      }
    }
  };
  walk(home);
  return digest.digest('hex');
}

function assertCleanRepository(home: string): void {
  const status = execFileSync('git', ['-C', home, 'status', '--porcelain', '--untracked-files=all'], {
    encoding: 'utf8',
  });
  expect(status).toBe('');
}

function assertNoTransactionResidue(directory: string): void {
  const residue: string[] = [];
  const walk = (current: string): void => {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (
        entry.name.endsWith('.lock')
        || /\.(?:tmp|rollback)\.\d+\.[0-9a-f-]+$/.test(entry.name)
        || entry.name === 'migration.json'
      ) residue.push(fullPath);
      if (entry.isDirectory()) walk(fullPath);
    }
  };
  walk(directory);
  expect(residue).toEqual([]);
}

afterEach(() => {
  for (const child of runningChildren) child.kill('SIGKILL');
  runningChildren.clear();
  for (const root of cleanupRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('public-release startup upgrade matrix', () => {
  it('preserves the first public core format and is full-tree stable on second startup', async () => {
    const { root, home, logDirectory } = fixtureCopy('public-format-1');
    const beforeCore = homeDigest(home, { excludeGitignore: true, excludeProviderState: true });
    await startAndStopBackend(home, root, logDirectory);
    expect(homeDigest(home, { excludeGitignore: true, excludeProviderState: true })).toBe(beforeCore);
    const gitignore = fs.readFileSync(path.join(home, '.gitignore'), 'utf8');
    expect(gitignore.match(/\.meadow-migration-recovery\//g)).toHaveLength(1);
    expect(gitignore.match(/>>> Meadow managed private paths >>>/g)).toHaveLength(1);
    const afterFirst = homeDigest(home);
    await startAndStopBackend(home, root, logDirectory);
    expect(homeDigest(home)).toBe(afterFirst);
    assertCleanRepository(home);
    assertNoTransactionResidue(root);
  }, 120_000);

  it('protects the application route surface and binds only to loopback', async () => {
    const { root, home, logDirectory } = fixtureCopy('public-format-1');
    await startAndStopBackend(home, root, logDirectory, async port => {
      const base = `http://127.0.0.1:${port}`;
      const healthResponse = await fetch(`${base}/api/health`);
      expect(healthResponse.status).toBe(200);
      expect(await healthResponse.json()).toEqual({
        ready: true,
        protocol: 'meadow-local-v1',
      });

      const protectedRequests: Array<[string, RequestInit?]> = [
        ['/api/app-config'],
        ['/api/app-config/tree'],
        ['/api/sharing/publishing-providers/S3PublishingProvider/configuration'],
        ['/api/app-config/manage-git-automatically', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: false }),
        }],
      ];
      const beforeUnauthorized = homeDigest(home);
      for (const [requestPath, init] of protectedRequests) {
        expect((await fetch(`${base}${requestPath}`, init)).status).toBe(401);
      }
      expect(homeDigest(home)).toBe(beforeUnauthorized);

      expect((await fetch(`${base}/api/app-config`, {
        headers: { Origin: 'https://attacker.example.invalid' },
      })).status).toBe(403);
      expect((await fetch(`${base}/api/app-config`, {
        headers: { 'x-meadow-capability': 'wrong-launch-capability' },
      })).status).toBe(401);
      expect((await fetch(`${base}/api/app-config`, {
        headers: {
          Origin: 'https://attacker.example.invalid',
          'x-meadow-capability': LAUNCH_CAPABILITY,
        },
      })).status).toBe(403);

      const trustedResponse = await fetch(`${base}/api/app-config`, {
        headers: { 'x-meadow-capability': LAUNCH_CAPABILITY },
      });
      expect(trustedResponse.status).toBe(200);
      const browserResponse = await fetch(`${base}/api/app-config`, {
        headers: {
          Origin: UI_ORIGIN,
          'x-meadow-capability': LAUNCH_CAPABILITY,
        },
      });
      expect(browserResponse.status).toBe(200);
      expect(browserResponse.headers.get('access-control-allow-origin')).toBe(UI_ORIGIN);

      const configurationResponse = await fetch(
        `${base}/api/sharing/publishing-providers/S3PublishingProvider/configuration`,
        { headers: { 'x-meadow-capability': LAUNCH_CAPABILITY } },
      );
      expect(configurationResponse.status).toBe(200);
      const configuration = await configurationResponse.json() as Record<string, unknown>;
      expect(configuration).toMatchObject({ hasAccessKeyId: false, hasSecretAccessKey: false });
      expect(configuration).not.toHaveProperty('s3AccessKeyId');
      expect(configuration).not.toHaveProperty('s3SecretAccessKey');

      const externalIpv4 = Object.values(os.networkInterfaces())
        .flatMap(records => records ?? [])
        .find(record => record.family === 'IPv4' && !record.internal)?.address;
      if (externalIpv4) await expectTcpConnectionFailure(externalIpv4, port);
    });
  }, 120_000);

  it.each([
    ['future-format', 'unsupported-home-format'],
    ['corrupt-home', 'invalid-schema'],
  ])('refuses the %s fixture before any Home or Git mutation', async (fixtureName, category) => {
    const { root, home, logDirectory } = fixtureCopy(fixtureName);
    const before = homeDigest(home);
    const refusal = await expectBackendRefusal(home, root, logDirectory);
    expect(homeDigest(home)).toBe(before);
    expect(fs.existsSync(path.join(home, '.git'))).toBe(false);
    expect(refusal.diagnostic).toMatchObject({
      category,
      selectedHomePath: home,
      appVersion: '0.5.41',
      supportedHomeFormatMinimum: 0,
      supportedHomeFormatMaximum: 1,
    });
    expect(`${refusal.output}\n${JSON.stringify(refusal.diagnostic)}`)
      .not.toContain(LAUNCH_CAPABILITY);
  }, 120_000);
});
