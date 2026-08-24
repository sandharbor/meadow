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

import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import YAML from 'yaml';
import type { MeadowHomeManifest, MeadowHomePreflightResult } from '../../contracts/types/meadowHome.js';
import {
  deterministicJson,
  isPlainObject,
  jsonDocumentCodec,
  readDurableDocument,
  requireValidDocument,
  writeDurableDocument,
  yamlDocumentCodec,
} from './durableDocument.js';

export const MEADOW_HOME_MANIFEST_FILENAME = 'meadow_home.yaml';
export const CURRENT_MEADOW_HOME_FORMAT_VERSION = 1;
export const OLDEST_UPGRADABLE_MEADOW_HOME_FORMAT_VERSION = 0;
export const MINIMUM_COMPATIBLE_APP_VERSION = '0.5.41';
export const SUPPORTED_MEADOW_HOME_CAPABILITIES = new Set<string>();

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const MANIFEST_FIELDS = new Set([
  'formatVersion',
  'minimumReaderAppVersion',
  'minimumWriterAppVersion',
  'createdByAppVersion',
  'lastWrittenByAppVersion',
  'capabilities',
]);

export class MeadowHomeCompatibilityError extends Error {
  constructor(
    readonly kind:
      | 'invalid-app-version'
      | 'invalid-manifest'
      | 'newer-format'
      | 'older-format'
      | 'unsupported-capability'
      | 'app-too-old'
      | 'invalid-legacy-home',
    message: string,
    readonly homePath: string,
    readonly manifestPath: string,
  ) {
    super(message);
    this.name = 'MeadowHomeCompatibilityError';
  }
}

function semverParts(version: string): [number, number, number] | null {
  const match = SEMVER_PATTERN.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function compareAppVersions(left: string, right: string): number {
  const leftParts = semverParts(left);
  const rightParts = semverParts(right);
  if (!leftParts || !rightParts) throw new TypeError(`Cannot compare invalid app versions '${left}' and '${right}'`);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] < rightParts[index] ? -1 : 1;
  }
  return 0;
}

function validateManifest(value: unknown) {
  if (!isPlainObject(value)) return { valid: false as const, diagnostic: '$ must be an object' };
  for (const field of Object.keys(value)) {
    if (!MANIFEST_FIELDS.has(field)) {
      return { valid: false as const, diagnostic: `$.${field} is not supported` };
    }
  }
  if (!Number.isInteger(value.formatVersion) || Number(value.formatVersion) < 0) {
    return { valid: false as const, diagnostic: '$.formatVersion must be a non-negative integer' };
  }
  for (const field of [
    'minimumReaderAppVersion',
    'minimumWriterAppVersion',
    'createdByAppVersion',
    'lastWrittenByAppVersion',
  ]) {
    if (typeof value[field] !== 'string' || !semverParts(value[field] as string)) {
      return { valid: false as const, diagnostic: `$.${field} must be a semantic app version` };
    }
  }
  if (
    !Array.isArray(value.capabilities) ||
    !value.capabilities.every(item => typeof item === 'string' && item.length > 0)
  ) {
    return { valid: false as const, diagnostic: '$.capabilities must be an array of non-empty strings' };
  }
  if (new Set(value.capabilities).size !== value.capabilities.length) {
    return { valid: false as const, diagnostic: '$.capabilities must not contain duplicates' };
  }
  return { valid: true as const, value: value as unknown as MeadowHomeManifest };
}

export const meadowHomeManifestCodec = yamlDocumentCodec(validateManifest);

interface BootstrapCheckpointManifest {
  schemaVersion: 1;
  checkpointId: string;
  createdAt: string;
  homePath: string;
  targetRelativePath: string;
  targetExisted: boolean;
  targetSha256: string | null;
  targetMode: number | null;
}

const checkpointCodec = jsonDocumentCodec<BootstrapCheckpointManifest>(value => {
  if (!isPlainObject(value)) return { valid: false, diagnostic: '$ must be an object' };
  if (value.schemaVersion !== 1) return { valid: false, diagnostic: '$.schemaVersion must be 1' };
  for (const field of ['checkpointId', 'createdAt', 'homePath', 'targetRelativePath']) {
    if (typeof value[field] !== 'string') return { valid: false, diagnostic: `$.${field} must be a string` };
  }
  if (typeof value.targetExisted !== 'boolean') {
    return { valid: false, diagnostic: '$.targetExisted must be a boolean' };
  }
  if (value.targetSha256 !== null && typeof value.targetSha256 !== 'string') {
    return { valid: false, diagnostic: '$.targetSha256 must be a string or null' };
  }
  if (value.targetMode !== null && !Number.isInteger(value.targetMode)) {
    return { valid: false, diagnostic: '$.targetMode must be an integer or null' };
  }
  return { valid: true, value: value as unknown as BootstrapCheckpointManifest };
});

function sha256(source: Uint8Array): string {
  return createHash('sha256').update(source).digest('hex');
}

function checkpointRoot(homePath: string): string {
  return path.join(path.dirname(homePath), `.${path.basename(homePath)}.meadow-recovery`, 'checkpoints');
}

function createManifestCheckpoint(homePath: string, manifestPath: string): string {
  const checkpointId = `home-format-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const directory = path.join(checkpointRoot(homePath), checkpointId);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);

  const existing = readDurableDocument(manifestPath, meadowHomeManifestCodec);
  const targetExisted = existing.status !== 'missing';
  const source = targetExisted ? fs.readFileSync(manifestPath) : null;
  const targetMode = targetExisted ? fs.statSync(manifestPath).mode & 0o777 : null;
  if (source) fs.writeFileSync(path.join(directory, MEADOW_HOME_MANIFEST_FILENAME), source, { mode: 0o600 });

  const record: BootstrapCheckpointManifest = {
    schemaVersion: 1,
    checkpointId,
    createdAt: new Date().toISOString(),
    homePath,
    targetRelativePath: MEADOW_HOME_MANIFEST_FILENAME,
    targetExisted,
    targetSha256: source ? sha256(source) : null,
    targetMode,
  };
  const recordPath = path.join(directory, 'checkpoint.json');
  writeDurableDocument({ path: recordPath, value: record, codec: checkpointCodec, mode: 0o600 });
  const verified = requireValidDocument(readDurableDocument(recordPath, checkpointCodec), () => {
    throw new Error('Checkpoint disappeared during verification');
  });
  if (deterministicJson(verified) !== deterministicJson(record)) {
    throw new Error(`Checkpoint verification failed at ${recordPath}`);
  }
  if (source && !fs.readFileSync(path.join(directory, MEADOW_HOME_MANIFEST_FILENAME)).equals(source)) {
    throw new Error(`Checkpoint source verification failed at ${directory}`);
  }
  return checkpointId;
}

function walkFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'logs') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files.sort();
}

function validateLegacyHome(homePath: string, manifestPath: string): void {
  for (const filePath of walkFiles(homePath)) {
    if (filePath === manifestPath) continue;
    const extension = path.extname(filePath).toLowerCase();
    try {
      const source = fs.readFileSync(filePath, 'utf8');
      if (extension === '.yaml' || extension === '.yml') YAML.parse(source);
      else if (extension === '.json') JSON.parse(source);
    } catch {
      throw new MeadowHomeCompatibilityError(
        'invalid-legacy-home',
        `Legacy Meadow Home validation failed at ${filePath}; the original bytes were preserved`,
        homePath,
        manifestPath,
      );
    }
  }
}

function currentManifest(appVersion: string, createdByAppVersion = appVersion): MeadowHomeManifest {
  return {
    formatVersion: CURRENT_MEADOW_HOME_FORMAT_VERSION,
    minimumReaderAppVersion: MINIMUM_COMPATIBLE_APP_VERSION,
    minimumWriterAppVersion: MINIMUM_COMPATIBLE_APP_VERSION,
    createdByAppVersion,
    lastWrittenByAppVersion: appVersion,
    capabilities: [],
  };
}

function isEmptyHome(homePath: string): boolean {
  return !fs.existsSync(homePath) || fs.readdirSync(homePath).length === 0;
}

/** Must run before any mutation inside the selected Meadow Home. */
export function preflightMeadowHome(homePath: string, appVersion: string): MeadowHomePreflightResult {
  const manifestPath = path.join(homePath, MEADOW_HOME_MANIFEST_FILENAME);
  if (!semverParts(appVersion) || appVersion === 'unknown') {
    throw new MeadowHomeCompatibilityError(
      'invalid-app-version',
      `A semantic running application version is required before writing ${homePath}`,
      homePath,
      manifestPath,
    );
  }

  const result = readDurableDocument(manifestPath, meadowHomeManifestCodec);
  if (result.status === 'invalid') {
    throw new MeadowHomeCompatibilityError(
      'invalid-manifest',
      `Meadow Home manifest is ${result.kind}: ${result.diagnostic}`,
      homePath,
      manifestPath,
    );
  }

  if (result.status === 'missing') {
    if (isEmptyHome(homePath)) {
      const manifest = currentManifest(appVersion);
      writeDurableDocument({ path: manifestPath, value: manifest, codec: meadowHomeManifestCodec });
      return { manifest, homePath, manifestPath, action: 'created' };
    }
    validateLegacyHome(homePath, manifestPath);
    const checkpointId = createManifestCheckpoint(homePath, manifestPath);
    const manifest = currentManifest(appVersion);
    writeDurableDocument({ path: manifestPath, value: manifest, codec: meadowHomeManifestCodec });
    return { manifest, homePath, manifestPath, action: 'legacy-upgraded', checkpointId };
  }

  const manifest = result.value;
  if (manifest.formatVersion > CURRENT_MEADOW_HOME_FORMAT_VERSION) {
    throw new MeadowHomeCompatibilityError(
      'newer-format',
      `Meadow Home format ${manifest.formatVersion} is newer than supported format ${CURRENT_MEADOW_HOME_FORMAT_VERSION}`,
      homePath,
      manifestPath,
    );
  }
  if (manifest.formatVersion < OLDEST_UPGRADABLE_MEADOW_HOME_FORMAT_VERSION) {
    throw new MeadowHomeCompatibilityError(
      'older-format',
      `Meadow Home format ${manifest.formatVersion} is older than the upgradable range`,
      homePath,
      manifestPath,
    );
  }
  const unsupported = manifest.capabilities.filter(
    capability => !SUPPORTED_MEADOW_HOME_CAPABILITIES.has(capability),
  );
  if (unsupported.length > 0) {
    throw new MeadowHomeCompatibilityError(
      'unsupported-capability',
      `Meadow Home requires unsupported capabilities: ${unsupported.join(', ')}`,
      homePath,
      manifestPath,
    );
  }
  if (compareAppVersions(appVersion, manifest.minimumWriterAppVersion) < 0) {
    throw new MeadowHomeCompatibilityError(
      'app-too-old',
      `Meadow ${appVersion} cannot write this Home; version ${manifest.minimumWriterAppVersion} or newer is required`,
      homePath,
      manifestPath,
    );
  }

  if (manifest.formatVersion < CURRENT_MEADOW_HOME_FORMAT_VERSION) {
    validateLegacyHome(homePath, manifestPath);
    const checkpointId = createManifestCheckpoint(homePath, manifestPath);
    const upgraded = currentManifest(appVersion, manifest.createdByAppVersion);
    writeDurableDocument({ path: manifestPath, value: upgraded, codec: meadowHomeManifestCodec });
    return { manifest: upgraded, homePath, manifestPath, action: 'format-upgraded', checkpointId };
  }

  return { manifest, homePath, manifestPath, action: 'unchanged' };
}
