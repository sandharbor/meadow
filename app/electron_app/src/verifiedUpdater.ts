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

import { execFile } from 'child_process';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const UPDATE_METADATA_SCHEMA_VERSION = 1;
export const UPDATE_METADATA_MAX_BYTES = 256 * 1024;
export const UPDATE_ARTIFACT_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const EXPECTED_UPDATE_TEAM_ID = '3Y93X67X8P';
export const EXPECTED_UPDATE_BUNDLE_ID = 'com.meadow.desktop';
export const EXPECTED_UPDATE_APP_NAME = 'Meadow.app';
export const EXPECTED_UPDATE_EXECUTABLE = 'Meadow';

const UPDATE_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ARTIFACT_PATH_PATTERN = /^dist\/Meadow-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)-prod-arm64\.dmg$/;

export interface UpdateMetadata {
  schemaVersion: 1;
  version: string;
  artifactPath: string;
  artifactSize: number;
  artifactSha256: string;
  releaseNotesPath: string;
  teamId: string;
  bundleId: string;
  appName: string;
  executableName: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface UpdateCommandAdapter {
  run(file: string, args: readonly string[]): Promise<CommandResult>;
  copyApplication(source: string, destination: string): Promise<void>;
  launchApplication(
    executablePath: string,
    environment: NodeJS.ProcessEnv,
  ): Promise<{ pid: number | undefined }>;
  terminateApplication(pid: number): Promise<void>;
}

export interface InstallUpdateOptions {
  installedAppPath: string;
  artifactPath: string;
  transactionDirectory: string;
  metadata: UpdateMetadata;
  healthToken: string;
  healthTimeoutMs?: number;
  pollIntervalMs?: number;
  adapter?: UpdateCommandAdapter;
}

export interface InstallUpdateResult {
  rollbackPath: string;
  healthAcknowledged: true;
}

export interface VerifiedDownload {
  metadata: UpdateMetadata;
  artifactPath: string;
  transactionDirectory: string;
}

export interface VerifiedMetadata {
  metadata: UpdateMetadata;
  transactionDirectory: string;
}

export type CmsMetadataVerifier = (
  cmsPath: string,
  transactionDirectory: string,
) => Promise<Buffer>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Update metadata field ${key} must be a non-empty string`);
  }
  return value;
}

export function parseUpdateMetadata(source: Buffer | string): UpdateMetadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.toString());
  } catch {
    throw new Error('Signed update metadata is not valid JSON');
  }

  if (!isRecord(parsed)) {
    throw new Error('Signed update metadata must be an object');
  }

  const expectedKeys = [
    'appName',
    'artifactPath',
    'artifactSha256',
    'artifactSize',
    'bundleId',
    'executableName',
    'releaseNotesPath',
    'schemaVersion',
    'teamId',
    'version',
  ];
  const actualKeys = Object.keys(parsed).sort();
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error('Signed update metadata has unknown or missing fields');
  }

  if (parsed.schemaVersion !== UPDATE_METADATA_SCHEMA_VERSION) {
    throw new Error('Signed update metadata uses an unsupported schema version');
  }

  const version = requireString(parsed, 'version');
  if (!VERSION_PATTERN.test(version)) {
    throw new Error('Signed update metadata has an invalid version');
  }

  const artifactPath = requireString(parsed, 'artifactPath');
  const artifactMatch = ARTIFACT_PATH_PATTERN.exec(artifactPath);
  if (!artifactMatch || artifactMatch[1] !== version) {
    throw new Error('Signed update metadata has an invalid artifact path');
  }

  if (!Number.isSafeInteger(parsed.artifactSize)
    || (parsed.artifactSize as number) <= 0
    || (parsed.artifactSize as number) > UPDATE_ARTIFACT_MAX_BYTES) {
    throw new Error('Signed update metadata has an invalid artifact size');
  }

  const artifactSha256 = requireString(parsed, 'artifactSha256').toLowerCase();
  if (!SHA256_PATTERN.test(artifactSha256)) {
    throw new Error('Signed update metadata has an invalid SHA-256 checksum');
  }

  const releaseNotesPath = requireString(parsed, 'releaseNotesPath');
  if (releaseNotesPath !== `release_notes/${version}.md`) {
    throw new Error('Signed update metadata has an invalid release notes path');
  }

  const teamId = requireString(parsed, 'teamId');
  const bundleId = requireString(parsed, 'bundleId');
  const appName = requireString(parsed, 'appName');
  const executableName = requireString(parsed, 'executableName');
  if (teamId !== EXPECTED_UPDATE_TEAM_ID
    || bundleId !== EXPECTED_UPDATE_BUNDLE_ID
    || appName !== EXPECTED_UPDATE_APP_NAME
    || executableName !== EXPECTED_UPDATE_EXECUTABLE) {
    throw new Error('Signed update metadata does not identify Meadow');
  }

  return {
    schemaVersion: UPDATE_METADATA_SCHEMA_VERSION,
    version,
    artifactPath,
    artifactSize: parsed.artifactSize as number,
    artifactSha256,
    releaseNotesPath,
    teamId,
    bundleId,
    appName,
    executableName,
  };
}

function requireRegularFile(filePath: string, description: string): void {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${description} must be a regular file, not a symbolic link`);
  }
}

function requireDirectory(directoryPath: string, description: string): void {
  const stat = fs.lstatSync(directoryPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${description} must be a directory, not a symbolic link`);
  }
}

function requireDestinationParent(destinationPath: string): void {
  const parent = path.dirname(destinationPath);
  requireDirectory(parent, 'Update destination parent');
  if (fs.realpathSync(parent) !== path.resolve(parent)) {
    throw new Error('Update destination parent may not traverse a symbolic link');
  }
}

function safeRemove(targetPath: string): void {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch {
    // Cleanup failure must not obscure the transaction result.
  }
}

function writeFileDurably(filePath: string, contents: string | Buffer, mode = 0o600): void {
  const descriptor = fs.openSync(filePath, 'wx', mode);
  try {
    fs.writeFileSync(descriptor, contents);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.chmodSync(filePath, mode);
}

function secureEquals(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createProductionUpdateAdapter(): UpdateCommandAdapter {
  return {
    async run(file, args) {
      try {
        const result = await execFileAsync(file, [...args], {
          encoding: 'utf8',
          maxBuffer: 1024 * 1024,
          timeout: 120_000,
        });
        return { stdout: result.stdout, stderr: result.stderr };
      } catch (error) {
        const commandError = error as Error & { stderr?: string };
        const diagnostic = commandError.stderr?.trim().slice(0, 1000);
        throw new Error(diagnostic
          ? `Update verification command failed: ${diagnostic}`
          : 'Update verification command failed');
      }
    },
    async copyApplication(source, destination) {
      await this.run('/usr/bin/ditto', [
        '--rsrc',
        '--extattr',
        '--acl',
        source,
        destination,
      ]);
    },
    async launchApplication(executablePath, environment) {
      const child = await import('child_process').then(({ spawn }) => spawn(
        executablePath,
        [],
        {
          detached: true,
          env: environment,
          stdio: 'ignore',
        },
      ));
      child.unref();
      return { pid: child.pid };
    },
    async terminateApplication(pid) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // It is already stopped.
      }
    },
  };
}

export async function verifyCmsMetadata(
  cmsPath: string,
  transactionDirectory: string,
  adapter: UpdateCommandAdapter = createProductionUpdateAdapter(),
): Promise<Buffer> {
  requireRegularFile(cmsPath, 'Update metadata');
  requireDirectory(transactionDirectory, 'Update transaction directory');

  const decodedPath = path.join(transactionDirectory, 'metadata.decoded.json');
  const verifiedPath = path.join(transactionDirectory, 'metadata.verified.json');
  const signerPath = path.join(transactionDirectory, 'metadata-signer.pem');

  await adapter.run('/usr/bin/security', [
    'cms', '-D', '-u', '6', '-i', cmsPath, '-o', decodedPath,
  ]);
  await adapter.run('/usr/bin/openssl', [
    'cms', '-verify', '-noverify', '-inform', 'DER', '-in', cmsPath,
    '-out', verifiedPath, '-signer', signerPath,
  ]);

  requireRegularFile(decodedPath, 'Decoded update metadata');
  requireRegularFile(verifiedPath, 'Cryptographically verified update metadata');
  requireRegularFile(signerPath, 'Update metadata signer certificate');

  const decoded = fs.readFileSync(decodedPath);
  const verified = fs.readFileSync(verifiedPath);
  if (!secureEquals(decoded, verified)) {
    throw new Error('System trust and cryptographic verification decoded different metadata');
  }
  if (verified.length > UPDATE_METADATA_MAX_BYTES) {
    throw new Error('Signed update metadata exceeds the size limit');
  }

  const signer = await adapter.run('/usr/bin/openssl', [
    'x509', '-in', signerPath, '-noout', '-subject', '-nameopt', 'RFC2253',
  ]);
  const organizationalUnit = /(?:^|,)OU=([^,]+)/.exec(signer.stdout.trim())?.[1];
  if (organizationalUnit !== EXPECTED_UPDATE_TEAM_ID) {
    throw new Error('Update metadata signer does not belong to the expected Team ID');
  }

  return verified;
}

async function fetchWithLimit(
  url: URL,
  maximumBytes: number,
  fetchImplementation: typeof fetch,
): Promise<Buffer> {
  const response = await fetchImplementation(url, { redirect: 'error' });
  if (!response.ok) {
    throw new Error(`Update download failed with HTTP ${response.status}`);
  }

  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > maximumBytes) {
      throw new Error('Update download has an invalid Content-Length');
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Update download has no response body');
  }
  const chunks: Buffer[] = [];
  let received = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    received += result.value.byteLength;
    if (received > maximumBytes) {
      await reader.cancel();
      throw new Error('Update download exceeds the size limit');
    }
    chunks.push(Buffer.from(result.value));
  }
  return Buffer.concat(chunks, received);
}

export async function fetchVerifiedUpdateMetadata(
  baseUrl: string,
  options: {
    fetchImplementation?: typeof fetch;
    metadataVerifier?: CmsMetadataVerifier;
    temporaryRoot?: string;
  } = {},
): Promise<VerifiedMetadata> {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:') {
    throw new Error('Update service must use HTTPS');
  }
  const temporaryRoot = options.temporaryRoot ?? os.tmpdir();
  const transactionDirectory = fs.mkdtempSync(path.join(temporaryRoot, 'meadow-update-'));
  fs.chmodSync(transactionDirectory, 0o700);

  try {
    const fetchImplementation = options.fetchImplementation ?? fetch;
    const cmsBytes = await fetchWithLimit(
      new URL('metadata/auto-update-metadata.cms', `${base.toString().replace(/\/?$/, '/')}`),
      UPDATE_METADATA_MAX_BYTES,
      fetchImplementation,
    );
    const cmsPath = path.join(transactionDirectory, 'metadata.cms');
    writeFileDurably(cmsPath, cmsBytes);
    const verifier = options.metadataVerifier ?? verifyCmsMetadata;
    const metadata = parseUpdateMetadata(await verifier(cmsPath, transactionDirectory));
    return { metadata, transactionDirectory };
  } catch (error) {
    safeRemove(transactionDirectory);
    throw error;
  }
}

export async function downloadVerifiedUpdateArtifact(
  baseUrl: string,
  verifiedMetadata: VerifiedMetadata,
  fetchImplementation: typeof fetch = fetch,
): Promise<VerifiedDownload> {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:') {
    throw new Error('Update service must use HTTPS');
  }
  const { metadata, transactionDirectory } = verifiedMetadata;
  requireDirectory(transactionDirectory, 'Update transaction directory');
  try {
    const artifactUrl = new URL(metadata.artifactPath, `${base.toString().replace(/\/?$/, '/')}`);
    if (artifactUrl.origin !== base.origin || !artifactUrl.pathname.startsWith(`${base.pathname.replace(/\/?$/, '/')}`)) {
      throw new Error('Signed update artifact URL escapes the configured update service');
    }
    const artifactBytes = await fetchWithLimit(
      artifactUrl,
      Math.min(metadata.artifactSize, UPDATE_ARTIFACT_MAX_BYTES),
      fetchImplementation,
    );
    if (artifactBytes.length !== metadata.artifactSize) {
      throw new Error('Downloaded update size does not match signed metadata');
    }
    const actualSha256 = createHash('sha256').update(artifactBytes).digest('hex');
    if (actualSha256 !== metadata.artifactSha256) {
      throw new Error('Downloaded update checksum does not match signed metadata');
    }

    const partialPath = path.join(transactionDirectory, `${path.basename(metadata.artifactPath)}.partial`);
    writeFileDurably(partialPath, artifactBytes);
    const artifactPath = partialPath.slice(0, -'.partial'.length);
    fs.renameSync(partialPath, artifactPath);
    const directoryDescriptor = fs.openSync(transactionDirectory, 'r');
    try {
      fs.fsyncSync(directoryDescriptor);
    } finally {
      fs.closeSync(directoryDescriptor);
    }
    return { metadata, artifactPath, transactionDirectory };
  } catch (error) {
    safeRemove(transactionDirectory);
    throw error;
  }
}

export async function downloadVerifiedUpdate(
  baseUrl: string,
  options: {
    fetchImplementation?: typeof fetch;
    metadataVerifier?: CmsMetadataVerifier;
    temporaryRoot?: string;
  } = {},
): Promise<VerifiedDownload> {
  const verifiedMetadata = await fetchVerifiedUpdateMetadata(baseUrl, options);
  return downloadVerifiedUpdateArtifact(
    baseUrl,
    verifiedMetadata,
    options.fetchImplementation ?? fetch,
  );
}

async function verifyApplication(
  applicationPath: string,
  metadata: UpdateMetadata,
  adapter: UpdateCommandAdapter,
): Promise<void> {
  requireDirectory(applicationPath, 'Update application');
  const designatedRequirement = `anchor apple generic and certificate leaf[subject.OU] = "${metadata.teamId}" and identifier "${metadata.bundleId}"`;
  await adapter.run('/usr/bin/codesign', [
    '--verify', '--deep', '--strict', '--verbose=4', `-R=${designatedRequirement}`, applicationPath,
  ]);

  const display = await adapter.run('/usr/bin/codesign', [
    '--display', '--verbose=4', applicationPath,
  ]);
  const details = `${display.stdout}\n${display.stderr}`;
  if (!details.includes(`TeamIdentifier=${metadata.teamId}`)
    || !details.includes(`Identifier=${metadata.bundleId}`)) {
    throw new Error('Update application signature identity does not match signed metadata');
  }

  const infoPlist = path.join(applicationPath, 'Contents', 'Info.plist');
  requireRegularFile(infoPlist, 'Update application Info.plist');
  const bundleId = (await adapter.run('/usr/bin/plutil', [
    '-extract', 'CFBundleIdentifier', 'raw', '-o', '-', infoPlist,
  ])).stdout.trim();
  const version = (await adapter.run('/usr/bin/plutil', [
    '-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', infoPlist,
  ])).stdout.trim();
  const executable = (await adapter.run('/usr/bin/plutil', [
    '-extract', 'CFBundleExecutable', 'raw', '-o', '-', infoPlist,
  ])).stdout.trim();
  if (bundleId !== metadata.bundleId
    || version !== metadata.version
    || executable !== metadata.executableName) {
    throw new Error('Update application bundle metadata does not match signed metadata');
  }

  await adapter.run('/usr/sbin/spctl', [
    '--assess', '--type', 'execute', '--verbose=4', applicationPath,
  ]);
}

async function waitForHealthAcknowledgement(
  acknowledgementPath: string,
  healthToken: string,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(acknowledgementPath)) {
      requireRegularFile(acknowledgementPath, 'Update health acknowledgement');
      const acknowledgement = fs.readFileSync(acknowledgementPath, 'utf8').trim();
      if (acknowledgement === healthToken) return true;
      throw new Error('Update health acknowledgement has the wrong token');
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  return false;
}

export async function installVerifiedUpdate(
  options: InstallUpdateOptions,
): Promise<InstallUpdateResult> {
  const adapter = options.adapter ?? createProductionUpdateAdapter();
  if (!UPDATE_TOKEN_PATTERN.test(options.healthToken)) {
    throw new Error('Update health token must contain 256 bits of hexadecimal data');
  }
  if (!path.isAbsolute(options.installedAppPath)
    || path.basename(options.installedAppPath) !== options.metadata.appName) {
    throw new Error('Installed application path does not identify Meadow.app');
  }
  requireDestinationParent(options.installedAppPath);
  requireDirectory(options.installedAppPath, 'Installed application');
  requireRegularFile(options.artifactPath, 'Update artifact');
  requireDirectory(options.transactionDirectory, 'Update transaction directory');

  const destinationDirectory = path.dirname(options.installedAppPath);
  const transactionId = randomBytes(16).toString('hex');
  const stagingPath = path.join(
    destinationDirectory,
    `.Meadow.meadow-update-stage-${transactionId}.app`,
  );
  const rollbackPath = path.join(
    destinationDirectory,
    `.Meadow.meadow-update-rollback-${transactionId}.app`,
  );
  const failedPath = path.join(
    destinationDirectory,
    `.Meadow.meadow-update-failed-${transactionId}.app`,
  );
  const mountPoint = path.join(options.transactionDirectory, 'mounted');
  const acknowledgementPath = path.join(options.transactionDirectory, 'health-ack');
  const journalPath = path.join(options.transactionDirectory, 'transaction.json');
  fs.mkdirSync(mountPoint, { mode: 0o700 });
  let mounted = false;
  let swapped = false;
  let launchedPid: number | undefined;

  const recordPhase = (phase: string): void => {
    if (fs.existsSync(journalPath)) fs.unlinkSync(journalPath);
    writeFileDurably(journalPath, `${JSON.stringify({ phase, transactionId })}\n`);
  };

  try {
    recordPhase('verifying-artifact');
    await adapter.run('/usr/bin/hdiutil', ['verify', options.artifactPath]);
    await adapter.run('/usr/bin/hdiutil', [
      'attach', options.artifactPath, '-readonly', '-nobrowse', '-mountpoint', mountPoint,
    ]);
    mounted = true;

    const mountedApplications = fs.readdirSync(mountPoint)
      .filter(name => name.endsWith('.app'));
    if (mountedApplications.length !== 1
      || mountedApplications[0] !== options.metadata.appName) {
      throw new Error('Update disk image must contain exactly one expected Meadow.app');
    }
    const mountedApplication = path.join(mountPoint, mountedApplications[0]);
    await verifyApplication(mountedApplication, options.metadata, adapter);

    recordPhase('staging');
    if (fs.existsSync(stagingPath) || fs.existsSync(rollbackPath)) {
      throw new Error('Unique update staging or rollback path already exists');
    }
    await adapter.copyApplication(mountedApplication, stagingPath);
    await verifyApplication(stagingPath, options.metadata, adapter);

    recordPhase('swapping');
    requireDirectory(options.installedAppPath, 'Installed application before swap');
    requireDirectory(stagingPath, 'Staged application before swap');
    fs.renameSync(options.installedAppPath, rollbackPath);
    try {
      fs.renameSync(stagingPath, options.installedAppPath);
      swapped = true;
    } catch (error) {
      fs.renameSync(rollbackPath, options.installedAppPath);
      throw error;
    }

    recordPhase('awaiting-health');
    const executablePath = path.join(
      options.installedAppPath,
      'Contents',
      'MacOS',
      options.metadata.executableName,
    );
    requireRegularFile(executablePath, 'Installed update executable');
    const launched = await adapter.launchApplication(executablePath, {
      ...process.env,
      MEADOW_UPDATE_HEALTH_TOKEN: options.healthToken,
      MEADOW_UPDATE_HEALTH_ACK_PATH: acknowledgementPath,
      MEADOW_UPDATE_TRANSACTION_ID: transactionId,
    });
    launchedPid = launched.pid;
    const healthy = await waitForHealthAcknowledgement(
      acknowledgementPath,
      options.healthToken,
      options.healthTimeoutMs ?? 60_000,
      options.pollIntervalMs ?? 250,
    );
    if (!healthy) {
      throw new Error('Updated application did not acknowledge healthy startup in time');
    }

    recordPhase('healthy');
    fs.rmSync(rollbackPath, { recursive: true });
    return { rollbackPath, healthAcknowledged: true };
  } catch (error) {
    if (swapped) {
      if (launchedPid !== undefined) {
        try {
          await adapter.terminateApplication(launchedPid);
        } catch {
          // Rollback must continue even when the unhealthy process cannot be
          // terminated through the adapter. Renaming the application bundle
          // is still safe and restores the next launch target.
        }
      }
      if (fs.existsSync(options.installedAppPath)) {
        fs.renameSync(options.installedAppPath, failedPath);
      }
      if (!fs.existsSync(rollbackPath)) {
        throw new Error('Update failed after swap and the rollback application is missing');
      }
      fs.renameSync(rollbackPath, options.installedAppPath);
      const rollbackExecutable = path.join(
        options.installedAppPath,
        'Contents',
        'MacOS',
        options.metadata.executableName,
      );
      try {
        await adapter.launchApplication(rollbackExecutable, { ...process.env });
      } finally {
        safeRemove(failedPath);
      }
    }
    safeRemove(stagingPath);
    throw error;
  } finally {
    if (mounted) {
      try {
        await adapter.run('/usr/bin/hdiutil', ['detach', mountPoint]);
      } catch {
        // The transaction result is authoritative; a detach failure is retained in logs.
      }
    }
  }
}

export function acknowledgeUpdateHealthFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  temporaryRoot = os.tmpdir(),
): boolean {
  const token = environment.MEADOW_UPDATE_HEALTH_TOKEN;
  const acknowledgementPath = environment.MEADOW_UPDATE_HEALTH_ACK_PATH;
  if (token === undefined && acknowledgementPath === undefined) return false;
  if (!token || !acknowledgementPath || !UPDATE_TOKEN_PATTERN.test(token)) {
    throw new Error('Incomplete or invalid update health acknowledgement environment');
  }

  const resolvedRoot = fs.realpathSync(temporaryRoot);
  const resolvedParent = fs.realpathSync(path.dirname(acknowledgementPath));
  if (!resolvedParent.startsWith(`${resolvedRoot}${path.sep}`)
    || !path.basename(resolvedParent).startsWith('meadow-update-')
    || path.basename(acknowledgementPath) !== 'health-ack') {
    throw new Error('Update health acknowledgement path is outside its transaction directory');
  }
  writeFileDurably(acknowledgementPath, `${token}\n`);
  delete environment.MEADOW_UPDATE_HEALTH_TOKEN;
  delete environment.MEADOW_UPDATE_HEALTH_ACK_PATH;
  delete environment.MEADOW_UPDATE_TRANSACTION_ID;
  return true;
}
