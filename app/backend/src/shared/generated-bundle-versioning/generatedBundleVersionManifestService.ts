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

import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import type {
  GeneratedBundleVersionId,
  GeneratedBundleVersionManifest,
} from '../../../../shared_code/types/generatedBundleVersioning.js';
import {
  currentGeneratedBundleVersion,
  emptyGeneratedBundleVersionManifest,
  parseGeneratedBundleVersionManifest,
} from './generatedBundleVersionDomain.js';

const VERSION_ID_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function generatedBundleVersionManifestPath(bundleDirectory: string): string {
  return path.join(bundleDirectory, 'config', 'generated_bundle_versions.yaml');
}

export function generatedBundleVersionsRoot(bundleDirectory: string): string {
  return path.join(bundleDirectory, 'html', 'generated_bundle_versions');
}

export function generatedBundleVersionDirectory(
  bundleDirectory: string,
  versionId: GeneratedBundleVersionId,
): string {
  return path.join(generatedBundleVersionsRoot(bundleDirectory), versionId);
}

export function currentGeneratedBundleVersionDirectory(bundleDirectory: string): string | null {
  const current = currentGeneratedBundleVersion(loadGeneratedBundleVersionManifest(bundleDirectory));
  return current ? generatedBundleVersionDirectory(bundleDirectory, current.versionId) : null;
}

export function serializeGeneratedBundleVersionManifest(manifest: GeneratedBundleVersionManifest): string {
  const validated = parseGeneratedBundleVersionManifest(manifest);
  return YAML.stringify(validated, { lineWidth: 0 });
}

export function parseGeneratedBundleVersionManifestYaml(content: string): GeneratedBundleVersionManifest {
  let parsed: unknown;
  try {
    parsed = YAML.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid generated bundle version manifest YAML: ${message}`);
  }
  return parseGeneratedBundleVersionManifest(parsed);
}

export function loadGeneratedBundleVersionManifest(bundleDirectory: string): GeneratedBundleVersionManifest {
  const manifestPath = generatedBundleVersionManifestPath(bundleDirectory);
  if (!fs.existsSync(manifestPath)) return emptyGeneratedBundleVersionManifest();
  return parseGeneratedBundleVersionManifestYaml(fs.readFileSync(manifestPath, 'utf8'));
}

export function saveGeneratedBundleVersionManifest(
  bundleDirectory: string,
  manifest: GeneratedBundleVersionManifest,
): void {
  const manifestPath = generatedBundleVersionManifestPath(bundleDirectory);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const temporaryPath = `${manifestPath}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  try {
    fs.writeFileSync(temporaryPath, serializeGeneratedBundleVersionManifest(manifest), 'utf8');
    fs.renameSync(temporaryPath, manifestPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
}

export function generateGeneratedBundleVersionId(
  existingVersionIds: Iterable<string>,
  options: {
    randomBytes?: (size: number) => Buffer;
    maximumAttempts?: number;
  } = {},
): GeneratedBundleVersionId {
  const foldedExistingIds = new Set([...existingVersionIds].map((id) => id.toLowerCase()));
  const makeRandomBytes = options.randomBytes ?? randomBytes;
  const maximumAttempts = options.maximumAttempts ?? 100;
  for (let attempt = 0; attempt < maximumAttempts; attempt++) {
    const bytes = makeRandomBytes(6);
    if (bytes.length < 6) throw new Error('Version ID random source returned fewer than six bytes');
    let candidate = 'v';
    for (let index = 0; index < 6; index++) {
      candidate += VERSION_ID_CHARACTERS[bytes[index] % VERSION_ID_CHARACTERS.length];
    }
    if (!foldedExistingIds.has(candidate.toLowerCase())) return candidate as GeneratedBundleVersionId;
  }
  throw new Error(`Unable to reserve a unique generated bundle version ID after ${maximumAttempts} attempts`);
}
