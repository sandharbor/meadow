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
import {
  getNodespecForBundle,
  getNodespecBlock,
  validateNodespecsBlock,
} from '../../../../nodespecs/index.js';
import { parseBundleNodeConfig } from '../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import {
  findAllNodespecSourceFiles,
  getAvailableBundles,
  getPageIdFromPath,
  getPageTitle,
  getNodespecBundlesToCheck,
  isPageTracked,
  nodespecSourceGraphDirs,
  setUpNodespecBundles,
  type NodespecBundleSetups,
} from '../../../support/nodespecTestHelpers.js';

describe('Nodespecs Curation System Tests', () => {
  describe('Curation YAML Validation Tests', () => {
    it('all curation filter IDs should be valid', () => {
      const availableBundles = getAvailableBundles();
      const errors: string[] = [];

      for (const sourceGraphDir of nodespecSourceGraphDirs) {
        const nodespecSourceFiles = findAllNodespecSourceFiles(sourceGraphDir);

        for (const sourceFile of nodespecSourceFiles) {
          const block = getNodespecBlock(sourceFile).block;
          if (!block) continue;

          const pageTitle = getPageTitle(sourceFile);
          const validationErrors = validateNodespecsBlock(
            block,
            [],
            availableBundles,
            pageTitle,
            { requireLinksWhenInWorkingGraph: true, requireHtmlRenderedLinks: false }
          );

          for (const err of validationErrors) {
            if (err.field === 'filtersSelected') {
              errors.push(`${sourceFile}: ${err.message}`);
            }
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Filter ID validation errors:\n${errors.join('\n')}`);
      }
    });
  });
});

describe('Nodespec Curation Tracking Validation', () => {
  let bundleSetups: NodespecBundleSetups | undefined;

  beforeEach(() => {
    bundleSetups = setUpNodespecBundles('nodespec-curation-validation');
  });

  afterEach(() => {
    if (!bundleSetups) return;
    for (const { setup } of getNodespecBundlesToCheck(bundleSetups)) setup.tearDown();
  });

  it('should validate isTracked matches bundle_node_config.yaml', () => {
    const configuredBundles = getNodespecBundlesToCheck(bundleSetups!);
    const errors: string[] = [];
    let pagesValidated = 0;

    for (const { name: bundleName, setup: bundleSetup, sourceGraphDir } of configuredBundles) {
      const bundleConfigPath = path.join(bundleSetup.getBundlePath(), 'config', 'bundle_node_config.yaml');
      const bundleNodeConfigs = fs.existsSync(bundleConfigPath)
        ? parseBundleNodeConfig(fs.readFileSync(bundleConfigPath, 'utf-8'))
        : [];

      const nodespecSourceFiles = findAllNodespecSourceFiles(sourceGraphDir);

      for (const sourceFile of nodespecSourceFiles) {
        const block = getNodespecBlock(sourceFile).block;
        if (!block) continue;

        const pageId = getPageIdFromPath(sourceFile, sourceGraphDir, bundleName);
        const bundleSpec = getNodespecForBundle(block, bundleName);
        if (!bundleSpec) continue;

        pagesValidated++;

        const actualTracked = isPageTracked(pageId, bundleNodeConfigs, 'md');
        if (bundleSpec.curation.isTracked !== actualTracked) {
          errors.push(
            `[${bundleName}] ${pageId}: isTracked mismatch - spec says ${bundleSpec.curation.isTracked}, actual is ${actualTracked}`
          );
        }
      }
    }

    expect(pagesValidated).toBeGreaterThan(0);

    if (errors.length > 0) {
      throw new Error(`isTracked validation errors:\n${errors.join('\n')}`);
    }
  });
});
