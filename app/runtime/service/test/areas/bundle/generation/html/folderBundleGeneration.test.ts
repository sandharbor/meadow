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
import { BundleConfigPaths } from '../../../../../../../shared_code/paths/bundleConfigPaths.js';
import { generateHtmlForBundle } from '../../../../../src/areas/bundle/generation/html/htmlService.js';
import { TestBundleSetup } from '../../../../shared/support/testBundleSetup.js';
import { buildFilteredSourcesExportForBundle } from '../../../../../src/areas/bundle/generation/sources-export/filteredSourcesExport.js';
import { buildFilteredOpenKnowledgeFormatForBundle } from '../../../../../src/areas/bundle/generation/open-knowledge-format/filteredOpenKnowledgeFormat.js';
import { getGeneratedBundleTestOutputDirectory } from '../../../../shared/support/generatedBundleTestOutput.js';

describe('folder-derived HTML generation', () => {
  const setup = new TestBundleSetup(
    'areas/bundle/generation/fixtures/folder-bundle',
    'folder-bundle-test',
    'areas/bundle/generation/fixtures/with-hooks-hooks',
  );
  let bundlePath: string;

  beforeEach(() => {
    setup.setUp();
    bundlePath = setup.getBundlePath();
  });

  afterEach(() => setup.tearDown());

  it('renders contraction, collision-safe routes, search, navigation, hooks-compatible HTML, and source-backed optional outputs', async () => {
    const generatedHtml = getGeneratedBundleTestOutputDirectory(bundlePath);
    await generateHtmlForBundle(bundlePath, { preview: true, outputDirectory: generatedHtml });
    const read = (relative: string) => fs.readFileSync(path.join(generatedHtml, ...relative.split('/')), 'utf8');

    expect(fs.existsSync(path.join(generatedHtml, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(generatedHtml, '_mw_gen', 'folderpages', 'project-111111111111.html'))).toBe(true);
    expect(fs.existsSync(path.join(generatedHtml, 'Project', 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(generatedHtml, 'Project', 'Folder sketch.html'))).toBe(true);
    expect(fs.existsSync(path.join(generatedHtml, 'Project', 'Middle', 'Deep.html'))).toBe(true);
    expect(fs.existsSync(path.join(generatedHtml, 'Project', 'Middle', 'index.html'))).toBe(false);
    expect(fs.existsSync(path.join(generatedHtml, '_mw_gen', 'folderpages', 'empty-222222222222.html'))).toBe(true);
    expect(fs.existsSync(path.join(generatedHtml, 'Outside.html'))).toBe(true);

    const home = read('index.html');
    expect(home.match(/<h1>Folder Test<\/h1>/g)).toHaveLength(1);
    expect(home).toContain('data-hook-processed="true"');
    expect(home.indexOf('Project')).toBeLessThan(home.indexOf('Empty'));
    expect(home).toContain('_mw_gen/folderpages/project-111111111111.html');
    const project = read('_mw_gen/folderpages/project-111111111111.html');
    expect(project).toContain('stop-ssssssssssss.html');
    expect(project).toContain('../../Project/Middle/Deep.html');
    expect(project).toContain('../../Project/index.html');
    expect(project).toContain('class="structural-child-icon"');
    expect(project).not.toContain('structural-child-kind');
    expect(project).toContain('data-file-type="excalidraw"');
    expect(project).toContain('class="structural-child-preview structural-child-preview-excalidraw"');
    expect(project).toContain('src="../../Project/Folder%20sketch.html?meadow-thumbnail=1"');
    expect(project).not.toContain('Project/Middle/index.html');
    expect(read('_mw_gen/folderpages/empty-222222222222.html')).toContain('This folder is empty.');
    expect(read('Project/Middle/Deep.html')).toContain('href="../../Outside.html"');

    const assets = path.join(generatedHtml, '_mw_assets', 'cust');
    expect(fs.existsSync(path.join(assets, 'search', 'index', 'manifest.js'))).toBe(true);
    expect(fs.existsSync(path.join(assets, 'folder_nav'))).toBe(true);
    expect(fs.existsSync(path.join(assets, 'sources-export'))).toBe(true);
    expect(fs.existsSync(path.join(assets, 'okf', 'bundle', 'index.md'))).toBe(true);
    expect(fs.readFileSync(path.join(assets, 'okf', 'bundle', 'index.md'), 'utf8')).toContain('# Folder Test');

    const filteredSources = await buildFilteredSourcesExportForBundle(bundlePath);
    expect(fs.existsSync(path.join(filteredSources, 'Project', 'Middle', 'Deep.md'))).toBe(true);
    expect(fs.existsSync(path.join(filteredSources, 'Folder Test.md'))).toBe(false);
    const filteredOkf = await buildFilteredOpenKnowledgeFormatForBundle(bundlePath);
    expect(fs.readFileSync(path.join(filteredOkf, 'index.md'), 'utf8')).toContain('# Folder Test');
  });
});
