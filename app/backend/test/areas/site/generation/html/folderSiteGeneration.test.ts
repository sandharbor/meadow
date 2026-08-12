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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SiteConfigPaths } from '../../../../../../shared_code/paths/siteConfigPaths.js';
import { generateHtmlForSite } from '../../../../../src/areas/site/generation/html/htmlService.js';
import { TestSiteSetup } from '../../../../shared/support/testSiteSetup.js';
import { buildFilteredSourcesExportForSite } from '../../../../../src/areas/site/generation/sources-export/filteredSourcesExport.js';
import { buildFilteredOpenKnowledgeFormatForSite } from '../../../../../src/areas/site/generation/open-knowledge-format/filteredOpenKnowledgeFormat.js';

describe('folder-derived HTML generation', () => {
  const setup = new TestSiteSetup(
    'areas/site/generation/fixtures/folder-site',
    'folder-site-test',
    'areas/site/generation/fixtures/with-hooks-hooks',
  );
  let sitePath: string;

  beforeEach(() => {
    setup.setUp();
    sitePath = setup.getSitePath();
  });

  afterEach(() => setup.tearDown());

  it('renders contraction, collision-safe routes, search, navigation, hooks-compatible HTML, and source-backed optional outputs', async () => {
    await generateHtmlForSite(sitePath, { preview: true });
    const preview = SiteConfigPaths.getPreviewDir(sitePath);
    const read = (relative: string) => fs.readFileSync(path.join(preview, ...relative.split('/')), 'utf8');

    expect(fs.existsSync(path.join(preview, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(preview, 'Project', '_folder-111111.html'))).toBe(true);
    expect(fs.existsSync(path.join(preview, 'Project', 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(preview, 'Project', 'Middle', 'Deep.html'))).toBe(true);
    expect(fs.existsSync(path.join(preview, 'Project', 'Middle', 'index.html'))).toBe(false);
    expect(fs.existsSync(path.join(preview, 'Empty', 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(preview, 'Outside.html'))).toBe(true);

    const home = read('index.html');
    expect(home).toContain('data-hook-processed="true"');
    expect(home.indexOf('Project')).toBeLessThan(home.indexOf('Empty'));
    expect(home).toContain('Project/_folder-111111.html');
    const project = read('Project/_folder-111111.html');
    expect(project).toContain('Stop/index.html');
    expect(project).toContain('Middle/Deep.html');
    expect(project).toContain('index.html');
    expect(project).not.toContain('Middle/index.html');
    expect(read('Empty/index.html')).toContain('This folder is empty.');
    expect(read('Project/Middle/Deep.html')).toContain('href="../../Outside.html"');

    const assets = path.join(preview, '_mw_assets', 'cust');
    expect(fs.existsSync(path.join(assets, 'search', 'index', 'manifest.js'))).toBe(true);
    expect(fs.existsSync(path.join(assets, 'folder_nav'))).toBe(true);
    expect(fs.existsSync(path.join(assets, 'sources-export'))).toBe(true);
    expect(fs.existsSync(path.join(assets, 'okf', 'bundle', 'index.md'))).toBe(true);
    expect(fs.readFileSync(path.join(assets, 'okf', 'bundle', 'index.md'), 'utf8')).toContain('# Folder Test');

    const filteredSources = await buildFilteredSourcesExportForSite(sitePath);
    expect(fs.existsSync(path.join(filteredSources, 'Project', 'Middle', 'Deep.md'))).toBe(true);
    expect(fs.existsSync(path.join(filteredSources, 'Folder Test.md'))).toBe(false);
    const filteredOkf = await buildFilteredOpenKnowledgeFormatForSite(sitePath);
    expect(fs.readFileSync(path.join(filteredOkf, 'index.md'), 'utf8')).toContain('# Folder Test');
  });
});
