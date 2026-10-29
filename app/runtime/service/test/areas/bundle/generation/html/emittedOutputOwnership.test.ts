/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GeneratedBundleReaderRouteIndex } from '../../../../../../../contracts/types/shared/generated-bundle-versioning/generatedBundleVersioning.js';
import { generateHtmlForBundle } from '../../../../../src/areas/bundle/generation/html/htmlService.js';
import { TestBundleSetup } from '../../../../shared/support/testBundleSetup.js';
import { getGeneratedBundleTestOutputDirectory } from '../../../../shared/support/generatedBundleTestOutput.js';

function routeIndex(outputDirectory: string): GeneratedBundleReaderRouteIndex {
  const directory = path.join(outputDirectory, '_mw_assets', 'versioning');
  const filename = fs.readdirSync(directory).find(name => /^routes\.[0-9a-f]{12}\.json$/.test(name))!;
  return JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8')) as GeneratedBundleReaderRouteIndex;
}

describe('emitted output ownership', () => {
  const setups: TestBundleSetup[] = [];
  const setUp = (fixture: string, slug: string): string => {
    const setup = new TestBundleSetup(`areas/bundle/generation/fixtures/${fixture}`, slug);
    setups.push(setup);
    setup.setUp();
    return setup.getBundlePath();
  };

  afterEach(() => {
    for (const setup of setups.splice(0)) setup.tearDown();
  });

  it('records a drawing page and its drawing data as separate roles of one owner and agrees with the reader index', async () => {
    const bundlePath = setUp('excalidraw-initial-bundle', 'excalidraw-ownership');
    const outputDirectory = getGeneratedBundleTestOutputDirectory(bundlePath);
    const emission = await generateHtmlForBundle(bundlePath, { preview: true, outputDirectory });

    expect(emission.owners).toEqual(expect.arrayContaining([
      { path: 'meadow flower.excalidraw.html', bundleNodeId: '456175f97e4d', role: 'page' },
      { path: 'meadow flower.excalidraw.md', bundleNodeId: '456175f97e4d', role: 'drawing-data' },
      { path: 'embedded media.html', bundleNodeId: '8be9eee5814d', role: 'page' },
    ]));
    for (const owner of emission.owners) {
      expect(fs.existsSync(path.join(outputDirectory, ...owner.path.split('/')))).toBe(true);
    }
    const pages = Object.fromEntries(emission.owners.filter(owner => owner.role === 'page').map(owner => [owner.bundleNodeId, owner.path]));
    expect(routeIndex(outputDirectory).routesByBundleNodeId).toEqual(pages);
    expect(emission.includedBundleNodeIds).toEqual(['456175f97e4d', '8be9eee5814d']);
  });

  it('assigns a legacy route collision to the page that actually wrote the file', async () => {
    const bundlePath = setUp('minimal-bundle', 'collision-ownership');
    const content = path.join(bundlePath, 'raw', 'tracked_page_content');
    fs.writeFileSync(path.join(content, 'another page.html'), '<html><head><title>Native</title></head><body><main>Native</main></body></html>');
    fs.writeFileSync(path.join(content, 'main page.md'), '# Main Page\n\n- [[child page]]\n- [[another page]]\n- [native](another%20page.html)\n');
    fs.appendFileSync(
      path.join(bundlePath, 'config', 'bundle_node_config.yaml'),
      '  - bundleNodeName: another page\n    bundleNodeKind: file\n    fileType: html\n    bundleNodeId: aaaabbbbcccc\n    listType: whitelist\n',
    );
    const outputDirectory = getGeneratedBundleTestOutputDirectory(bundlePath);
    const emission = await generateHtmlForBundle(bundlePath, { preview: true, outputDirectory });

    expect(emission.includedBundleNodeIds).toContain('aaaabbbbcccc');
    // Native HTML is written before Markdown, so the Markdown page is the final writer.
    expect(fs.readFileSync(path.join(outputDirectory, 'another page.html'), 'utf8')).toContain('Another Page');
    expect(emission.owners.filter(owner => owner.path === 'another page.html')).toEqual([
      { path: 'another page.html', bundleNodeId: '5cc1ecd75517', role: 'page' },
    ]);
    expect(routeIndex(outputDirectory).routesByBundleNodeId['5cc1ecd75517']).toBe('another page.html');
    expect(routeIndex(outputDirectory).routesByBundleNodeId.aaaabbbbcccc).toBeUndefined();
  });
});
