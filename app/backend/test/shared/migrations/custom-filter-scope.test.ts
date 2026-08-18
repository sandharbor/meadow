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
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { InvalidDurableDocumentError } from '../../../../shared_code/utils/durableDocument.js';
import { renameLegacyCustomFilterScopes } from '../../../src/shared/migrations/versions/26_08_17_13_00_00_m6q2v8k4p7x1_rename_custom_filter_scope.js';

const temporaryDirectories: string[] = [];

function makeHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-filter-scope-migration-'));
  temporaryDirectories.push(home);
  return home;
}

function filterConfig(scope: string): Record<string, unknown> {
  return {
    version: '1.0.0',
    futureMetadata: { preserved: true },
    filters: [{
      id: 'filter-1',
      name: 'Legacy local filter',
      scope,
      selectors: [{ field: 'title', matchType: 'substring', value: 'draft' }],
      selectorApplicationCriteria: 'union',
      actions: [{ type: 'highlight', color: '#ffcc00' }],
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
  };
}

function writeConfig(home: string, value: unknown): string {
  const target = path.join(home, 'bundles', 'my-bundle', 'config', 'custom_filters.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o640 });
  return target;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('custom-filter scope migration', () => {
  it('converts only the legacy scope and preserves extensions and file mode', () => {
    const home = makeHome();
    const target = writeConfig(home, filterConfig('site'));

    expect(renameLegacyCustomFilterScopes(home)).toEqual([target]);
    const migrated = JSON.parse(fs.readFileSync(target, 'utf8')) as Record<string, unknown>;
    expect((migrated.filters as Array<Record<string, unknown>>)[0].scope).toBe('bundle');
    expect(migrated.futureMetadata).toEqual({ preserved: true });
    expect(fs.statSync(target).mode & 0o777).toBe(0o640);
  });

  it('leaves an already-current document byte-for-byte unchanged', () => {
    const home = makeHome();
    const target = writeConfig(home, filterConfig('bundle'));
    const before = fs.readFileSync(target);

    expect(renameLegacyCustomFilterScopes(home)).toEqual([]);
    expect(fs.readFileSync(target)).toEqual(before);
  });

  it('refuses an unrelated schema error without changing recoverable bytes', () => {
    const home = makeHome();
    const invalid = filterConfig('site');
    (invalid.filters as Array<Record<string, unknown>>)[0].enabled = 'yes';
    const target = writeConfig(home, invalid);
    const before = fs.readFileSync(target);

    expect(() => renameLegacyCustomFilterScopes(home)).toThrow(InvalidDurableDocumentError);
    expect(fs.readFileSync(target)).toEqual(before);
  });
});
