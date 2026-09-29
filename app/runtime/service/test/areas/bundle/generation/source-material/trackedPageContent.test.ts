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
import {
  parseBundleNodeConfig,
  stringifyBundleNodeConfig,
} from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { generateHtmlForBundle } from '../../../../../src/areas/bundle/generation/html/htmlService.js';
import { ensureTrackedPageContent } from '../../../../../src/areas/bundle/generation/source-material/trackedPageContent.js';
import { TestBundleSetup } from '../../../../shared/support/testBundleSetup.js';
import { getGeneratedBundleTestOutputDirectory } from '../../../../shared/support/generatedBundleTestOutput.js';

describe('tracked page content for folder-derived bundles', () => {
  const setup = new TestBundleSetup(
    '../../../shared_data/home_fixtures/home_fixture_folder_structure_single/bundles/single-folder-bundle',
    'single-folder-bundle',
  );
  const sourceGraphDirectory = path.join(
    process.cwd(),
    '..',
    '..',
    'shared_data',
    'source_graphs',
    'folder-structure-test',
  );
  let bundlePath: string;

  beforeEach(() => {
    setup.setUp();
    bundlePath = setup.getBundlePath();
  });

  afterEach(() => {
    setup.tearDown();
  });

  const listFiles = (root: string): string[] => fs.readdirSync(root, { recursive: true, encoding: 'utf8' })
    .map(file => file.split(path.sep).join('/'))
    .filter(file => fs.statSync(path.join(root, file)).isFile())
    .sort();

  it('publishes only the tracked folder when its descendants are untracked', async () => {
    const persistedConfigPath = BundleConfigPaths.getBundleNodeConfigFile(bundlePath);
    const persistedConfigBefore = fs.readFileSync(persistedConfigPath, 'utf8');

    await ensureTrackedPageContent(bundlePath, sourceGraphDirectory);

    expect(fs.readFileSync(persistedConfigPath, 'utf8')).toBe(persistedConfigBefore);
    expect(fs.existsSync(BundleConfigPaths.getTrackedBundleNodeConfigFile(bundlePath))).toBe(false);
    expect(listFiles(BundleConfigPaths.getTrackedPageContentDir(bundlePath))).toEqual([]);

    const generatedHtml = getGeneratedBundleTestOutputDirectory(bundlePath);
    await generateHtmlForBundle(bundlePath, { preview: true, outputDirectory: generatedHtml });
    expect(listFiles(generatedHtml).filter(file => !file.startsWith('_mw_'))).toEqual(['index.html']);
    const alphaFolderHtml = fs.readFileSync(path.join(generatedHtml, 'index.html'), 'utf8');
    expect(alphaFolderHtml.match(/<h1>Alpha<\/h1>/g)).toHaveLength(1);
    expect(alphaFolderHtml).toContain('No pages in this folder are included in this bundle.');
    for (const untrackedName of ['Alpha note', 'Nested', 'Visual map', 'Outside note', 'Beyond outside', 'Frontier image']) {
      expect(alphaFolderHtml).not.toContain(untrackedName);
    }
  });

  it('publishes a tracked nested page beneath its untracked folder', async () => {
    const persistedConfigPath = BundleConfigPaths.getBundleNodeConfigFile(bundlePath);
    const persistedConfigs = parseBundleNodeConfig(fs.readFileSync(persistedConfigPath, 'utf8'), persistedConfigPath);
    fs.writeFileSync(persistedConfigPath, stringifyBundleNodeConfig([
      ...persistedConfigs,
      {
        bundleNodeName: 'Nested note',
        sourceGraphSubdirectory: 'Alpha/Nested',
        bundleNodeKind: 'file',
        fileType: 'md',
        bundleNodeId: 'nestednote01',
        listType: 'whitelist',
      },
    ]), 'utf8');

    await ensureTrackedPageContent(bundlePath, sourceGraphDirectory);
    expect(listFiles(BundleConfigPaths.getTrackedPageContentDir(bundlePath))).toEqual(['Alpha/Nested/Nested note.md']);

    const generatedHtml = getGeneratedBundleTestOutputDirectory(bundlePath);
    await generateHtmlForBundle(bundlePath, { preview: true, outputDirectory: generatedHtml });
    expect(listFiles(generatedHtml).filter(file => !file.startsWith('_mw_'))).toEqual([
      'Alpha/Nested/Nested note.html',
      'index.html',
    ]);
    const alphaFolderHtml = fs.readFileSync(path.join(generatedHtml, 'index.html'), 'utf8');
    expect(alphaFolderHtml).toContain('class="structural-child-name">Nested note</span>');
    expect(alphaFolderHtml).not.toContain('class="structural-child-name">Nested</span>');
    expect(alphaFolderHtml).not.toContain('Alpha note');
  });

  it('removes a derived generation config left by an earlier version', async () => {
    const staleConfigPath = BundleConfigPaths.getTrackedBundleNodeConfigFile(bundlePath);
    fs.mkdirSync(path.dirname(staleConfigPath), { recursive: true });
    fs.writeFileSync(staleConfigPath, stringifyBundleNodeConfig([
      ...parseBundleNodeConfig(fs.readFileSync(BundleConfigPaths.getBundleNodeConfigFile(bundlePath), 'utf8')),
      {
        bundleNodeName: 'Alpha note',
        sourceGraphSubdirectory: 'Alpha',
        bundleNodeKind: 'file',
        fileType: 'md',
        bundleNodeId: 'stalederived',
        listType: 'whitelist',
      },
    ]), 'utf8');

    await ensureTrackedPageContent(bundlePath, sourceGraphDirectory);
    expect(fs.existsSync(staleConfigPath)).toBe(false);

    const generatedHtml = getGeneratedBundleTestOutputDirectory(bundlePath);
    await generateHtmlForBundle(bundlePath, { preview: true, outputDirectory: generatedHtml });
    expect(fs.existsSync(path.join(generatedHtml, 'Alpha', 'Alpha note.html'))).toBe(false);
  });
});
