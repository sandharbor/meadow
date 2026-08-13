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
import { parseSiteNodeConfig, stringifySiteNodeConfig } from '../../shared_code/utils/siteNodeConfigUtils.js';
import {
  startServer,
  stopServer,
  TEST_BASE_URL
} from '../helpers/serverManager.js';
import { SystemTestSiteSetup } from '../helpers/testSetup.js';
import { readCompressionManifest } from '../../shared_code/utils/compressionManifestUtils.js';

const BIG_SITE_EXCALIDRAW_PAGE_CONFIGS = [
  {
    fileType: 'excalidraw',
    listType: 'whitelist',
    sourceGraphSubdirectory: 't006 - second directory',
    siteNodeName: 'embedded in page in other t006 directory',
  },
  {
    fileType: 'excalidraw',
    listType: 'whitelist',
    sourceGraphSubdirectory: 't006',
    siteNodeName: 't006 --- meadow-flower',
  },
] as const;

function trackBigSiteExcalidrawPages(testSetup: SystemTestSiteSetup) {
  const siteNodeConfigPath = testSetup.getPathInSite('conf/site_node_config.yaml');
  const nodes = parseSiteNodeConfig(fs.readFileSync(siteNodeConfigPath, 'utf8'), siteNodeConfigPath);
  const keyFor = (node: {
    sourceGraphSubdirectory?: unknown;
    siteNodeName?: unknown;
    fileType?: unknown;
  }) => [
    typeof node.sourceGraphSubdirectory === 'string' ? node.sourceGraphSubdirectory : '',
    typeof node.siteNodeName === 'string' ? node.siteNodeName : '',
    typeof node.fileType === 'string' ? node.fileType : '',
  ].join('\u0000');

  for (const config of BIG_SITE_EXCALIDRAW_PAGE_CONFIGS) {
    const existingNode = nodes.find((node) => keyFor(node) === keyFor(config));
    if (!existingNode) throw new Error(`Fixture node missing: ${config.siteNodeName}`);
    existingNode.listType = config.listType;
  }

  fs.writeFileSync(siteNodeConfigPath, stringifySiteNodeConfig(nodes), 'utf8');
}

describe('Generated archive determinism', () => {
  beforeAll(async () => {
    await startServer();
  });

  afterAll(() => {
    stopServer();
  });

  describe('sources export ZIP', () => {
    let testSetup: SystemTestSiteSetup | undefined;

    beforeEach(() => {
      testSetup = new SystemTestSiteSetup(
        'home_fixture_big_and_small',
        'zip-determinism-sources-export',
        { siteFolderName: 'meadow-test-site-big' }
      );
      testSetup.setUp();
      const siteConfigPath = testSetup.getPathInSite('conf/site_config.yaml');
      fs.appendFileSync(siteConfigPath, 'generationMarkdownZipEnabled: true\n', 'utf8');
    });

    afterEach(() => {
      testSetup?.tearDown();
    });

    it('produces byte-identical ZIPs across two consecutive preview runs', async () => {
      const siteSlug = testSetup!.getSiteSlug();
      const sourcesExportDir = testSetup!.getPathInSite('html/generated/_mw_assets/cust/sources-export');

      async function runPreviewAndReadZip(): Promise<{ filename: string; bytes: Buffer }> {
        const response = await fetch(`${TEST_BASE_URL}/api/sites/${siteSlug}/generation/preview`, {
          method: 'POST'
        });
        expect(response.ok).toBe(true);

        const manifestPath = path.join(sourcesExportDir, 'sources-export-manifest.json');
        expect(fs.existsSync(manifestPath)).toBe(true);
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { zipFilename: string; downloadFilename: string };
        expect(manifest.downloadFilename).toBe('meadow-test-site-big-sources.zip');

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
    let testSetup: SystemTestSiteSetup | undefined;

    beforeEach(() => {
      testSetup = new SystemTestSiteSetup(
        'home_fixture_big_and_small',
        'zip-determinism-gzipped-assets',
        { siteFolderName: 'meadow-test-site-big' }
      );
      testSetup.setUp();
      trackBigSiteExcalidrawPages(testSetup);
    });

    afterEach(() => {
      testSetup?.tearDown();
    });

    it('produces byte-identical gzipped assets and stable URL hashes across two runs', async () => {
      const siteSlug = testSetup!.getSiteSlug();
      const assetsDir = testSetup!.getPathInSite('html/generated/_mw_assets');

      async function runPreviewAndReadGzipped(): Promise<Map<string, Buffer>> {
        const response = await fetch(`${TEST_BASE_URL}/api/sites/${siteSlug}/generation/preview`, {
          method: 'POST'
        });
        expect(response.ok).toBe(true);

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
