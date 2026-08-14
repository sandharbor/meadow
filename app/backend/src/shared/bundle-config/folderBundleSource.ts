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

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { normalizeFolderSourceGraphSubdirectory } from '../../../../shared_code/utils/bundleNodeConfigUtils.js';

export const FOLDER_BUNDLE_HIGH_IMPACT_SEED_FILES = 1_000;
export const FOLDER_BUNDLE_HIGH_IMPACT_RAW_NODES = 5_000;
export const FOLDER_BUNDLE_MAX_RAW_NODES = 25_000;
export const FOLDER_BUNDLE_MAX_TYPED_EDGES = 100_000;

export function canonicalFolderBundleSourceDirectory(sourceDirectory: string): string {
  if (!sourceDirectory) throw new Error('sourceDirectory is required');
  const resolved = fs.realpathSync(sourceDirectory);
  if (!fs.statSync(resolved).isDirectory()) throw new Error('sourceDirectory must be a directory');
  return resolved;
}

export function normalizeSelectedFolder(sourceRoot: string, selection: string): string {
  const lexicalAbsolute = path.isAbsolute(selection)
    ? path.resolve(selection)
    : path.resolve(sourceRoot, ...selection.split('/'));
  const resolvedAbsolute = fs.realpathSync(lexicalAbsolute);
  const relative = path.relative(sourceRoot, resolvedAbsolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Selected folder escapes sourceDirectory: ${selection}`);
  }
  const normalized = normalizeFolderSourceGraphSubdirectory(relative.split(path.sep).join('/'));
  const expectedAbsolute = normalized ? path.join(sourceRoot, ...normalized.split('/')) : sourceRoot;
  const stat = fs.lstatSync(expectedAbsolute);
  if (stat.isSymbolicLink()) throw new Error(`Selected folder cannot be a symlink: ${selection}`);
  if (!stat.isDirectory()) throw new Error(`Selected folder is not a directory: ${selection}`);
  if (fs.realpathSync(expectedAbsolute) !== expectedAbsolute) {
    throw new Error(`Selected folder cannot traverse a symlink: ${selection}`);
  }
  if (normalized.split('/').some(segment => ['.git', '.meadow', '_meadow'].includes(segment))) {
    throw new Error(`Selected folder is reserved and cannot be published: ${selection}`);
  }
  return normalized;
}

export function folderName(sourceRoot: string, locator: string): string {
  return locator ? locator.slice(locator.lastIndexOf('/') + 1) : path.basename(sourceRoot);
}

export function updateFingerprintWithFolderSource(hash: crypto.Hash, sourceRoot: string, selectedFolders: string[]): void {
  const seen = new Set<string>();
  const visit = (absolute: string) => {
    const relative = path.relative(sourceRoot, absolute).split(path.sep).join('/');
    if (seen.has(relative)) return;
    seen.add(relative);
    const stat = fs.lstatSync(absolute, { bigint: true });
    hash.update(`${relative}\0${stat.mode}\0${stat.size}\0${stat.mtimeNs}\0`);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) visit(path.join(absolute, name));
    } else if (absolute.toLowerCase().endsWith('.md')) {
      hash.update(fs.readFileSync(absolute));
    }
  };
  for (const locator of selectedFolders) visit(locator ? path.join(sourceRoot, ...locator.split('/')) : sourceRoot);
}
