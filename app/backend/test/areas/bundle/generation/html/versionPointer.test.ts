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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { generateHtmlForBundle, publishToNewVersion, updateOlderVersionsWithPointer } from '../../../../../src/areas/bundle/generation/html/htmlService.js';
import { loadBundleConfig } from '../../../../../src/shared/utils/bundleConfigUtils.js';
import { TestBundleSetup } from '../../../../shared/support/testBundleSetup.js';
import YAML from 'yaml';
import { stringifyBundleNodeConfig } from '../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { makeBundleNodeConfig } from '../../../../shared/support/bundleNodeConfigTestUtils.js';

function writeYaml(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, 'utf8');
}

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

function listHtmlFilesRecursively(dir: string): string[] {
  const out: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listHtmlFilesRecursively(full));
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) out.push(full);
  }
  return out;
}

function expectHasEmptyPointerDiv(html: string): void {
  expect(html).toContain('<div id="new-version-pointer" style="display:none"></div>');
}

function expectHasBanner(html: string): void {
  expect(html).toContain('id="new-version-pointer"');
  expect(html).toContain('class="new-version-pointer');
}

function expectHasNormalBannerTo(html: string, href: string): void {
  expectHasBanner(html);
  expect(html).toContain('Open this page in the newer version');
  expect(html).toContain(`href="${href}"`);
  expect(html).not.toContain('page-removed');
}

function expectHasRemovedBannerToInitial(html: string, initialHref: string, initialTitle: string): void {
  expectHasBanner(html);
  expect(html).toContain('page-removed');
  expect(html).toContain('This page does not exist in the newer version');
  expect(html).toContain(`href="${initialHref}"`);
  expect(html).toContain(`>${initialTitle}<`);
}

describe('publish new version pointers', () => {
  const testSetup = new TestBundleSetup('areas/bundle/generation/fixtures/minimal-bundle', 'version-pointer-bundle');
  let bundlePath: string;

  const titles = ['home', 'page-a', 'page-b', 'page-c', 'page-d'];

  function configureFivePageBundle(): void {
    const configDir = path.join(bundlePath, 'config');
    const rawDir = path.join(bundlePath, 'raw', 'tracked_page_content');
    fs.mkdirSync(rawDir, { recursive: true });

    const nodes = titles.map(title => makeBundleNodeConfig(title, 'whitelist', title === 'home'
      ? {}
      : { outlinksDepth: 1, inlinksDepth: 0 }));
    const entryNode = nodes.find(node => node.bundleNodeName === 'home')!;

    // Update bundle_config.yaml so "home" holds both bundle roles.
    const bundleConfigPath = path.join(configDir, 'bundle_config.yaml');
    const existingBundleConfig = YAML.parse(fs.readFileSync(bundleConfigPath, 'utf8')) as Record<string, unknown>;
    writeYaml(bundleConfigPath, YAML.stringify({
      ...existingBundleConfig,
      entryBundleNodeId: entryNode.bundleNodeId,
      defaultTraversalBundleNodeId: entryNode.bundleNodeId,
      defaultOutlinksDepth: 1,
      defaultInlinksDepth: 0,
      publishSlug: 'version-pointer-bundle',
      bundleNotes: 'Version pointer test bundle',
    }));

    // Create 5 minimal pages. Ensure they're connected so the working graph includes them.
    fs.writeFileSync(
      path.join(rawDir, 'home.md'),
      [
        '# home',
        '',
        'Links:',
        '- [[page-a]]',
        '- [[page-b]]',
        '- [[page-c]]',
        '- [[page-d]]',
        '',
      ].join('\n'),
      'utf8'
    );
    for (const t of titles.filter((t) => t !== 'home')) {
      fs.writeFileSync(path.join(rawDir, `${t}.md`), `# ${t}\n\nback to [[home]]\n`, 'utf8');
    }

    // Update bundle_node_config.yaml to whitelist all 5 pages.
    const pageConfigPath = path.join(configDir, 'bundle_node_config.yaml');
    writeYaml(pageConfigPath, stringifyBundleNodeConfig(nodes));
  }

  async function generatePreview(): Promise<void> {
    await generateHtmlForBundle(bundlePath, { preview: true });
  }

  function versionDir(versionId: string): string {
    return path.join(bundlePath, 'html', 'generated_bundle_versions', versionId);
  }

  function versionBaseUrl(versionId: string): string {
    return `https://example.com/${versionId}`;
  }

  beforeEach(() => {
    testSetup.setUp();
    bundlePath = testSetup.getBundlePath();
    configureFivePageBundle();
  });

  afterEach(() => {
    testSetup.tearDown();
  });

  it('Test 1: Publish without pointers leaves older versions unchanged', async () => {
    await generatePreview();
    const bundleConfig1 = loadBundleConfig(bundlePath);
    const { version: v1 } = publishToNewVersion(bundlePath, bundleConfig1);

    // Make a second earlier version (still no pointers injected).
    await generatePreview();
    const bundleConfig2 = loadBundleConfig(bundlePath);
    const { version: v2 } = publishToNewVersion(bundlePath, bundleConfig2);

    // Publish a new version but do NOT update pointers.
    await generatePreview();
    const bundleConfig3 = loadBundleConfig(bundlePath);
    const { version: v3 } = publishToNewVersion(bundlePath, bundleConfig3);
    expect(v3).not.toBe(v2);

    // Verify older versions still have empty pointer placeholders (no banner injected).
    for (const v of [v1, v2]) {
      const htmlFiles = listHtmlFilesRecursively(versionDir(v));
      expect(htmlFiles.length).toBeGreaterThanOrEqual(5);
      for (const f of htmlFiles) {
        const html = readFile(f);
        expectHasEmptyPointerDiv(html);
      }
    }
  });

  it('Test 2: Publish with pointers updates both older versions to point to the new version', async () => {
    await generatePreview();
    const bundleConfig1 = loadBundleConfig(bundlePath);
    const { version: v1 } = publishToNewVersion(bundlePath, bundleConfig1);

    await generatePreview();
    const bundleConfig2 = loadBundleConfig(bundlePath);
    const { version: v2 } = publishToNewVersion(bundlePath, bundleConfig2);

    // Publish the new version
    await generatePreview();
    const bundleConfig3 = loadBundleConfig(bundlePath);
    const { version: v3 } = publishToNewVersion(bundlePath, bundleConfig3);

    const result = updateOlderVersionsWithPointer(
      bundlePath,
      v3,
      versionBaseUrl(v3),
      [v1, v2],
      'home',
      'home.html'
    );

    expect(result.filesUpdated).toBeGreaterThan(0);
    expect(result.pagesNotInNewVersion).toBe(0);

    for (const v of [v1, v2]) {
      for (const t of titles) {
        const oldHtmlPath = path.join(versionDir(v), `${t}.html`);
        expect(fs.existsSync(oldHtmlPath)).toBe(true);
        const html = readFile(oldHtmlPath);
        const expectedHref = `${versionBaseUrl(v3)}/${t}.html`;
        expectHasNormalBannerTo(html, expectedHref);
      }
    }
  });

  it('Test 3: Removed page gets warning banner, others get normal banner', async () => {
    await generatePreview();
    const bundleConfig1 = loadBundleConfig(bundlePath);
    const { version: v1 } = publishToNewVersion(bundlePath, bundleConfig1);

    await generatePreview();
    const bundleConfig2 = loadBundleConfig(bundlePath);
    const { version: v2 } = publishToNewVersion(bundlePath, bundleConfig2);

    // Remove page-c from bundle_node_config.yaml (so it will not be rendered in the new version).
    const pageConfigPath = path.join(bundlePath, 'config', 'bundle_node_config.yaml');
    const remaining = titles
      .filter((title) => title !== 'page-c')
      .map(title => makeBundleNodeConfig(title, 'whitelist', title === 'home'
        ? {}
        : { outlinksDepth: 1, inlinksDepth: 0 }));
    writeYaml(pageConfigPath, stringifyBundleNodeConfig(remaining));

    // New preview/new version will not include page-c.html.
    await generatePreview();
    const bundleConfig3 = loadBundleConfig(bundlePath);
    const { version: v3 } = publishToNewVersion(bundlePath, bundleConfig3);

    const result = updateOlderVersionsWithPointer(
      bundlePath,
      v3,
      versionBaseUrl(v3),
      [v1, v2],
      'home',
      'home.html'
    );
    expect(result.filesUpdated).toBeGreaterThan(0);
    expect(result.pagesNotInNewVersion).toBeGreaterThan(0);

    for (const v of [v1, v2]) {
      // page-c should get warning banner pointing to home
      const pageCPath = path.join(versionDir(v), 'page-c.html');
      expect(fs.existsSync(pageCPath)).toBe(true);
      const pageCHtml = readFile(pageCPath);
      const expectedInitialHref = `${versionBaseUrl(v3)}/home.html`;
      expectHasRemovedBannerToInitial(pageCHtml, expectedInitialHref, 'home');

      // others should get normal banner linking to same page
      for (const node of remaining) {
        const oldHtmlPath = path.join(versionDir(v), `${node.bundleNodeName}.html`);
        expect(fs.existsSync(oldHtmlPath)).toBe(true);
        const html = readFile(oldHtmlPath);
        const expectedHref = `${versionBaseUrl(v3)}/${node.bundleNodeName}.html`;
        expectHasNormalBannerTo(html, expectedHref);
      }
    }
  });
});
