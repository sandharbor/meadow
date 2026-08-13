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
import { SiteConfigPaths } from '../../../../shared_code/paths/siteConfigPaths.js';
import { migratePreviewOutputDirectory } from '../../../src/shared/migrations/versions/26_08_13_12_00_00_f3m8q1v6z2k9_rename_preview_output_to_generated.js';

const temporaryDirectories: string[] = [];

function makeHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-generated-html-migration-'));
  temporaryDirectories.push(home);
  return home;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('generated HTML directory migration', () => {
  it('moves legacy preview artifacts and is idempotent', () => {
    const home = makeHome();
    const siteDir = path.join(home, 'sites', 'garden');
    const legacyDir = path.join(SiteConfigPaths.getHtmlDir(siteDir), 'preview');
    const generatedDir = SiteConfigPaths.getGeneratedHtmlDir(siteDir);
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'index.html'), '<h1>Garden</h1>', 'utf8');

    expect(migratePreviewOutputDirectory(home)).toEqual(['garden']);
    expect(fs.existsSync(legacyDir)).toBe(false);
    expect(fs.readFileSync(path.join(generatedDir, 'index.html'), 'utf8'))
      .toBe('<h1>Garden</h1>');
    expect(migratePreviewOutputDirectory(home)).toEqual([]);
  });

  it('accepts an empty destination but refuses to overwrite generated content', () => {
    const home = makeHome();
    const siteDir = path.join(home, 'sites', 'garden');
    const legacyDir = path.join(SiteConfigPaths.getHtmlDir(siteDir), 'preview');
    const generatedDir = SiteConfigPaths.getGeneratedHtmlDir(siteDir);
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'index.html'), 'legacy', 'utf8');
    fs.mkdirSync(generatedDir, { recursive: true });

    expect(migratePreviewOutputDirectory(home)).toEqual(['garden']);
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'index.html'), 'second legacy', 'utf8');
    expect(() => migratePreviewOutputDirectory(home)).toThrow('both');
    expect(fs.readFileSync(path.join(generatedDir, 'index.html'), 'utf8')).toBe('legacy');
  });
});
