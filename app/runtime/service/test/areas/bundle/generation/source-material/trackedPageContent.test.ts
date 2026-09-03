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
  const temporarySourceRoots: string[] = [];

  beforeEach(() => {
    setup.setUp();
    bundlePath = setup.getBundlePath();
  });

  afterEach(() => {
    setup.tearDown();
    temporarySourceRoots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
  });

  it('materializes selected-folder descendants and linked pages for preview generation', async () => {
    const persistedConfigPath = BundleConfigPaths.getBundleNodeConfigFile(bundlePath);
    const persistedConfigBefore = fs.readFileSync(persistedConfigPath, 'utf8');

    await ensureTrackedPageContent(bundlePath, sourceGraphDirectory);

    expect(fs.readFileSync(persistedConfigPath, 'utf8')).toBe(persistedConfigBefore);
    const trackedConfigPath = BundleConfigPaths.getTrackedBundleNodeConfigFile(bundlePath);
    const trackedConfigBefore = fs.readFileSync(trackedConfigPath, 'utf8');
    const trackedConfigs = parseBundleNodeConfig(trackedConfigBefore, trackedConfigPath);
    expect(trackedConfigs).toHaveLength(8);
    expect(trackedConfigs.map(config => config.bundleNodeName)).toEqual(expect.arrayContaining([
      'Alpha', 'Alpha note', 'Nested note', 'Beyond outside', 'Frontier image', 'Outside note', 'Nested', 'Visual map',
    ]));
    const derivedByName = new Map(trackedConfigs.slice(1).map(config => [config.bundleNodeName, config]));
    expect(derivedByName.get('Alpha note')).toMatchObject({ outlinksDepth: 2, inlinksDepth: 0 });
    expect(derivedByName.get('Outside note')).toMatchObject({ outlinksDepth: 1, inlinksDepth: 0 });
    expect(derivedByName.get('Beyond outside')).toMatchObject({ outlinksDepth: 0, inlinksDepth: 0 });
    expect(derivedByName.get('Frontier image')).toMatchObject({
      fileType: 'png',
      outlinksDepth: 0,
      inlinksDepth: 0,
    });

    const trackedContent = BundleConfigPaths.getTrackedPageContentDir(bundlePath);
    for (const relativePath of [
      'Alpha/Alpha note.md',
      'Alpha/Visual map.svg',
      'Alpha/Nested/Nested note.md',
      'Outside/Outside note.md',
      'Outside/Beyond outside.md',
      'Outside/Frontier image.png',
    ]) {
      expect(fs.existsSync(path.join(trackedContent, ...relativePath.split('/')))).toBe(true);
    }

    await ensureTrackedPageContent(bundlePath, sourceGraphDirectory);
    expect(fs.readFileSync(trackedConfigPath, 'utf8')).toBe(trackedConfigBefore);

    const generatedHtml = getGeneratedBundleTestOutputDirectory(bundlePath);
    await generateHtmlForBundle(bundlePath, { preview: true, outputDirectory: generatedHtml });
    const nestedFolderRoute = `_mw_gen/folderpages/nested-${derivedByName.get('Nested')!.bundleNodeId}.html`;
    for (const relativePath of [
      'index.html',
      'Alpha/Alpha note.html',
      nestedFolderRoute,
      'Alpha/Nested/Nested note.html',
      'Outside/Outside note.html',
      'Outside/Beyond outside.html',
      'Outside/Frontier image.png',
    ]) {
      expect(fs.existsSync(path.join(generatedHtml, ...relativePath.split('/'))), relativePath).toBe(true);
    }
    const alphaFolderHtml = fs.readFileSync(path.join(generatedHtml, 'index.html'), 'utf8');
    expect(alphaFolderHtml.match(/<h1>Alpha<\/h1>/g)).toHaveLength(1);
    expect(alphaFolderHtml).not.toContain('This folder is empty.');
    expect(alphaFolderHtml).toContain('Alpha/Alpha%20note.html');
    expect(alphaFolderHtml).toContain('class="structural-child-icon"');
    expect(alphaFolderHtml).toContain('class="structural-child-name">Nested</span>');
    expect(alphaFolderHtml).not.toContain('structural-child-kind');
    expect(alphaFolderHtml).toContain('data-file-type="svg"');
    expect(alphaFolderHtml).toContain('class="structural-child-preview structural-child-preview-image"');
    expect(alphaFolderHtml).toMatch(/href="_mw_assets\/cust\/structural-previews\/[a-f0-9]{12}\.[a-f0-9]{8}\.svg"/);
    expect(alphaFolderHtml).toMatch(/structural-pages\.[a-f0-9]{8}\.css/);
    const structuralPreviewDirectory = path.join(generatedHtml, '_mw_assets', 'cust', 'structural-previews');
    expect(fs.readdirSync(structuralPreviewDirectory)).toEqual([
      expect.stringMatching(/^[a-f0-9]{12}\.[a-f0-9]{8}\.svg$/),
    ]);

    const outsideHtml = fs.readFileSync(path.join(generatedHtml, 'Outside', 'Outside note.html'), 'utf8');
    expect(outsideHtml).toContain('<a href="../index.html" class="breadcrumb-link">Alpha</a>');
    expect(outsideHtml).not.toContain('folder%3AAlpha');
  });

  it('normalizes a frontier-image sentinel depth for preview generation', async () => {
    const temporarySourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-folder-frontier-image-'));
    temporarySourceRoots.push(temporarySourceRoot);
    const isolatedSourceGraph = path.join(temporarySourceRoot, 'folder-structure-test');
    fs.cpSync(sourceGraphDirectory, isolatedSourceGraph, { recursive: true });

    const bundleConfigPath = BundleConfigPaths.getBundleConfigFile(bundlePath);
    fs.writeFileSync(
      bundleConfigPath,
      fs.readFileSync(bundleConfigPath, 'utf8').replace('defaultOutlinksDepth: 2', 'defaultOutlinksDepth: 1'),
      'utf8',
    );
    const outsideNotePath = path.join(isolatedSourceGraph, 'Outside', 'Outside note.md');
    fs.writeFileSync(
      outsideNotePath,
      `[[Frontier visual.png]]\n\n${fs.readFileSync(outsideNotePath, 'utf8')}`,
      'utf8',
    );
    fs.copyFileSync(
      path.join(
        process.cwd(),
        '..',
        '..',
        'shared_data',
        'source_graphs',
        'meadow-test-bundles-data',
        't016 ---- level 5 - frontier image.png',
      ),
      path.join(isolatedSourceGraph, 'Outside', 'Frontier visual.png'),
    );

    await ensureTrackedPageContent(bundlePath, isolatedSourceGraph);

    const trackedConfigPath = BundleConfigPaths.getTrackedBundleNodeConfigFile(bundlePath);
    const trackedConfigs = parseBundleNodeConfig(
      fs.readFileSync(trackedConfigPath, 'utf8'),
      trackedConfigPath,
    );
    expect(trackedConfigs.find(config => config.bundleNodeName === 'Frontier visual')).toMatchObject({
      fileType: 'png',
      outlinksDepth: 0,
      inlinksDepth: 0,
    });
    expect(fs.existsSync(path.join(
      BundleConfigPaths.getTrackedPageContentDir(bundlePath),
      'Outside',
      'Frontier visual.png',
    ))).toBe(true);

    const generatedHtml = getGeneratedBundleTestOutputDirectory(bundlePath);
    await generateHtmlForBundle(bundlePath, { preview: true, outputDirectory: generatedHtml });
    expect(fs.existsSync(path.join(generatedHtml, 'Outside', 'Outside note.html'))).toBe(true);
  });

  it('does not derive a duplicate config for an explicitly tracked frontier image', async () => {
    const persistedConfigPath = BundleConfigPaths.getBundleNodeConfigFile(bundlePath);
    const persistedConfigs = parseBundleNodeConfig(
      fs.readFileSync(persistedConfigPath, 'utf8'),
      persistedConfigPath,
    );
    fs.writeFileSync(persistedConfigPath, stringifyBundleNodeConfig([
      ...persistedConfigs,
      {
        bundleNodeName: 'Frontier image',
        sourceGraphSubdirectory: 'Outside',
        bundleNodeKind: 'file',
        fileType: 'png',
        bundleNodeId: 'frontier0001',
        listType: 'whitelist',
      },
    ]), 'utf8');

    await ensureTrackedPageContent(bundlePath, sourceGraphDirectory);

    const trackedConfigPath = BundleConfigPaths.getTrackedBundleNodeConfigFile(bundlePath);
    const trackedConfigs = parseBundleNodeConfig(
      fs.readFileSync(trackedConfigPath, 'utf8'),
      trackedConfigPath,
    );
    expect(trackedConfigs.filter(config => config.bundleNodeName === 'Frontier image')).toHaveLength(1);

    const generatedHtml = getGeneratedBundleTestOutputDirectory(bundlePath);
    await generateHtmlForBundle(bundlePath, { preview: true, outputDirectory: generatedHtml });
    expect(fs.existsSync(path.join(generatedHtml, 'Outside', 'Frontier image.png'))).toBe(true);
  });
});
