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

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { parseBundleNodeConfig, stringifyBundleNodeConfig } from '../../shared_code/utils/bundleNodeConfigUtils.js';
import {
  startServer,
  stopServer,
  TEST_BASE_URL
} from '../helpers/serverManager.js';
import { SystemTestBundleSetup } from '../helpers/testSetup.js';
import { readCompressionManifest } from '../../shared_code/utils/compressionManifestUtils.js';

const BIG_BUNDLE_EXCALIDRAW_PAGE_CONFIGS = [
  {
    fileType: 'excalidraw',
    listType: 'whitelist',
    sourceGraphSubdirectory: 't006 - second directory',
    bundleNodeName: 'embedded in page in other t006 directory',
  },
  {
    fileType: 'excalidraw',
    listType: 'whitelist',
    sourceGraphSubdirectory: 't006',
    bundleNodeName: 't006 --- meadow-flower',
  },
] as const;

function trackBigBundleExcalidrawPages(testSetup: SystemTestBundleSetup) {
  const bundleNodeConfigPath = testSetup.getPathInBundle('config/bundle_node_config.yaml');
  const nodes = parseBundleNodeConfig(fs.readFileSync(bundleNodeConfigPath, 'utf8'), bundleNodeConfigPath);
  const keyFor = (node: {
    sourceGraphSubdirectory?: unknown;
    bundleNodeName?: unknown;
    fileType?: unknown;
  }) => [
    typeof node.sourceGraphSubdirectory === 'string' ? node.sourceGraphSubdirectory : '',
    typeof node.bundleNodeName === 'string' ? node.bundleNodeName : '',
    typeof node.fileType === 'string' ? node.fileType : '',
  ].join('\u0000');

  for (const config of BIG_BUNDLE_EXCALIDRAW_PAGE_CONFIGS) {
    const existingNode = nodes.find((node) => keyFor(node) === keyFor(config));
    if (!existingNode) throw new Error(`Fixture node missing: ${config.bundleNodeName}`);
    existingNode.listType = config.listType;
  }

  fs.writeFileSync(bundleNodeConfigPath, stringifyBundleNodeConfig(nodes), 'utf8');
}

describe('Generated archive determinism', () => {
  beforeAll(async () => {
    await startServer();
  });

  afterAll(() => {
    stopServer();
  });

  describe('sources export ZIP', () => {
    let testSetup: SystemTestBundleSetup | undefined;

    beforeEach(() => {
      testSetup = new SystemTestBundleSetup(
        'home_fixture_big_and_small',
        'zip-determinism-sources-export',
        { bundleFolderName: 'meadow-test-bundle-big' }
      );
      testSetup.setUp();
      const bundleConfigPath = testSetup.getPathInBundle('config/bundle_config.yaml');
      fs.appendFileSync(bundleConfigPath, 'generationMarkdownZipEnabled: true\n', 'utf8');
    });

    afterEach(() => {
      testSetup?.tearDown();
    });

    it('produces byte-identical ZIPs across two consecutive preview runs', async () => {
      const bundleSlug = testSetup!.getBundleSlug();
      async function runPreviewAndReadZip(): Promise<{ filename: string; bytes: Buffer }> {
        const response = await fetch(`${TEST_BASE_URL}/api/bundles/${bundleSlug}/generation/preview`, {
          method: 'POST'
        });
        expect(response.ok).toBe(true);

        const sourcesExportDir = testSetup!.getCurrentGeneratedHtmlPath('_mw_assets/cust/sources-export');
        const manifestPath = path.join(sourcesExportDir, 'sources-export-manifest.json');
        expect(fs.existsSync(manifestPath)).toBe(true);
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { zipFilename: string; downloadFilename: string };
        expect(manifest.downloadFilename).toBe('meadow-test-bundle-big-sources.zip');

        const zipPath = path.join(sourcesExportDir, manifest.zipFilename);
        expect(fs.existsSync(zipPath)).toBe(true);
        return { filename: manifest.zipFilename, bytes: fs.readFileSync(zipPath) };
      }

      const first = await runPreviewAndReadZip();
      // Pause long enough that any mtime-sourced bytes would shift between
      // the two runs (filesystem mtime granularity is 1s on many platforms).
      await new Promise(r => setTimeout(r, 1500));
      const second = await runPreviewAndReadZip();

      const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
      const firstHash = sha(first.bytes);
      const secondHash = sha(second.bytes);

      // Filename is content-addressed, so a filename mismatch is itself a
      // determinism failure. Check it explicitly so the assertion message is
      // legible when this regresses.
      expect(second.filename).toBe(first.filename);
      expect(secondHash).toBe(firstHash);
    });
  });

  describe('pre-gzipped shared assets', () => {
    let testSetup: SystemTestBundleSetup | undefined;

    beforeEach(() => {
      testSetup = new SystemTestBundleSetup(
        'home_fixture_big_and_small',
        'zip-determinism-gzipped-assets',
        { bundleFolderName: 'meadow-test-bundle-big' }
      );
      testSetup.setUp();
      trackBigBundleExcalidrawPages(testSetup);
    });

    afterEach(() => {
      testSetup?.tearDown();
    });

    it('produces byte-identical gzipped assets and stable URL hashes across two runs', async () => {
      const bundleSlug = testSetup!.getBundleSlug();
      async function runPreviewAndReadGzipped(): Promise<Map<string, Buffer>> {
        const response = await fetch(`${TEST_BASE_URL}/api/bundles/${bundleSlug}/generation/preview`, {
          method: 'POST'
        });
        expect(response.ok).toBe(true);

        const assetsDir = testSetup!.getCurrentGeneratedHtmlPath('_mw_assets');
        const manifest = readCompressionManifest(assetsDir);
        expect(manifest).not.toBeNull();
        // The big fixture has at least one excalidraw page, so the vendor
        // bundle must be present and gzipped. If this assertion fails, either
        // the fixture changed or the gzip wiring regressed.
        expect(manifest!.gzip.length).toBeGreaterThan(0);

        const out = new Map<string, Buffer>();
        for (const rel of manifest!.gzip) {
          const fullPath = path.join(assetsDir, rel);
          expect(fs.existsSync(fullPath)).toBe(true);
          out.set(rel, fs.readFileSync(fullPath));
        }
        return out;
      }

      const first = await runPreviewAndReadGzipped();
      await new Promise(r => setTimeout(r, 1500));
      const second = await runPreviewAndReadGzipped();

      // The set of gzipped paths (with their content-addressed URL hashes)
      // must match exactly — the filename hash is computed from the *raw* JS
      // bytes, so any rename here means the source changed or the hashing
      // is itself non-deterministic.
      expect([...second.keys()].sort()).toEqual([...first.keys()].sort());

      const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
      for (const [rel, firstBytes] of first.entries()) {
        const secondBytes = second.get(rel)!;
        expect(sha(secondBytes)).toBe(sha(firstBytes));
      }
    });
  });
});
