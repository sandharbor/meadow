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

import fs from 'fs';
import path from 'path';
import type { Migration } from '../../../../../shared_code/types/migrations.js';
import type { BundleCustomFiltersConfig } from '../../../../../shared_code/types/customFilters.js';
import { bundleCustomFiltersCodec } from '../../../../../shared_code/utils/configDocumentCodecs.js';
import {
  type DurableDocumentCodec,
  isPlainObject,
  readDurableDocument,
  requireValidDocument,
  writeDurableDocument,
} from '../../../../../shared_code/utils/durableDocument.js';
import { getConfigDirectory } from '../../bundle-config/bundleConfigPaths.js';

function canonicalizeLegacyScope(value: unknown): unknown {
  if (!isPlainObject(value) || !Array.isArray(value.filters)) return value;
  const filters = value.filters as unknown[];
  return {
    ...value,
    filters: filters.map(filter => (
      isPlainObject(filter) && filter.scope === 'site'
        ? { ...filter, scope: 'bundle' }
        : filter
    )),
  };
}

const legacyScopeCodec: DurableDocumentCodec<BundleCustomFiltersConfig> = {
  parse: source => JSON.parse(source) as unknown,
  validate: value => bundleCustomFiltersCodec.validate(canonicalizeLegacyScope(value)),
  serialize: value => bundleCustomFiltersCodec.serialize(value),
};

function containsLegacyScope(value: unknown): boolean {
  return isPlainObject(value) && Array.isArray(value.filters)
    && value.filters.some(filter => isPlainObject(filter) && filter.scope === 'site');
}

function customFilterFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const result: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...customFilterFiles(entryPath));
    else if (entry.isFile() && entry.name === 'custom_filters.json') result.push(entryPath);
  }
  return result;
}

/** Convert the former site-local scope value without accepting any other invalid shape. */
export function renameLegacyCustomFilterScopes(configDirectory: string): string[] {
  const migrated: string[] = [];
  const candidates = [
    ...customFilterFiles(path.join(configDirectory, 'sites')),
    ...customFilterFiles(path.join(configDirectory, 'bundles')),
  ].sort((left, right) => left.localeCompare(right));

  for (const filePath of candidates) {
    const result = readDurableDocument(filePath, legacyScopeCodec);
    const config = requireValidDocument(result, (): BundleCustomFiltersConfig => ({
      filters: [],
      version: '1.0.0',
    }));
    const original = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    if (!containsLegacyScope(original)) continue;
    writeDurableDocument({
      path: filePath,
      value: config,
      codec: legacyScopeCodec,
      mode: fs.statSync(filePath).mode & 0o777,
    });
    migrated.push(filePath);
  }

  return migrated;
}

export const migration: Migration = {
  id: '26_08_17_13_00_00_m6q2v8k4p7x1_rename_custom_filter_scope',
  name: 'Rename custom-filter site scope to bundle scope',
  description:
    'Convert the legacy site-local custom-filter scope value after the site-to-bundle domain rename, preserving current documents byte-for-byte.',
  run: () => {
    renameLegacyCustomFilterScopes(getConfigDirectory());
    return Promise.resolve();
  },
};
