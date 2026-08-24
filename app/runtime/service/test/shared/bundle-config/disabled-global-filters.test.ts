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
import os from 'os';
import { loadBundleConfig, saveBundleConfig } from '../../../src/shared/utils/bundleConfigUtils.js';
import { CustomFilterConfig, GlobalCustomFiltersConfig } from '../../../../../contracts/types/customFilters.js';

describe('Disabled Global Filters', () => {
  let testDir: string;
  let bundlesDir: string;
  let testBundleDir: string;
  let globalFiltersPath: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-test-'));
    bundlesDir = path.join(testDir, 'bundles');
    testBundleDir = path.join(bundlesDir, 'test-bundle', 'config');
    globalFiltersPath = path.join(testDir, 'app', 'global_custom_filters.json');

    // Create directories
    fs.mkdirSync(testBundleDir, { recursive: true });
    fs.mkdirSync(path.dirname(globalFiltersPath), { recursive: true });

    // Set environment variable to use test directory
    process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = testDir;

    // Create a test global filter
    const globalConfig: GlobalCustomFiltersConfig = {
      filters: [
        {
          id: 'global-filter-1',
          name: 'Test Global Filter',
          scope: 'global',
          selectors: [
            {
              field: 'title',
              matchType: 'substring',
              value: 'test',
              caseSensitive: false
            }
          ],
          selectorApplicationCriteria: 'union',
          actions: [
            {
              type: 'highlight',
              color: '#FFD700',
              isDashed: false
            }
          ],
          enabled: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      version: '1.0.0'
    };

    fs.writeFileSync(globalFiltersPath, JSON.stringify(globalConfig, null, 2));
  });

  afterEach(() => {
    // Clean up
    delete process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should load bundle config without disabledGlobalFilters initially', () => {
    const bundleConfig = loadBundleConfig(path.join(bundlesDir, 'test-bundle'));
    expect(bundleConfig.disabledGlobalFilters).toBeUndefined();
  });

  it('should save and load disabledGlobalFilters in bundle config', () => {
    const bundleDir = path.join(bundlesDir, 'test-bundle');
    
    // Add a disabled global filter
    const bundleConfig = loadBundleConfig(bundleDir);
    bundleConfig.disabledGlobalFilters = ['global-filter-1'];
    saveBundleConfig(bundleDir, bundleConfig);

    // Load it back
    const loadedConf = loadBundleConfig(bundleDir);
    expect(loadedConf.disabledGlobalFilters).toEqual(['global-filter-1']);
  });

  it('should maintain empty array when no global filters are disabled', () => {
    const bundleDir = path.join(bundlesDir, 'test-bundle');
    
    const bundleConfig = loadBundleConfig(bundleDir);
    bundleConfig.disabledGlobalFilters = [];
    saveBundleConfig(bundleDir, bundleConfig);

    const loadedConf = loadBundleConfig(bundleDir);
    expect(loadedConf.disabledGlobalFilters).toEqual([]);
  });

  it('should handle multiple disabled global filters', () => {
    const bundleDir = path.join(bundlesDir, 'test-bundle');
    
    const bundleConfig = loadBundleConfig(bundleDir);
    bundleConfig.disabledGlobalFilters = ['filter-1', 'filter-2', 'filter-3'];
    saveBundleConfig(bundleDir, bundleConfig);

    const loadedConf = loadBundleConfig(bundleDir);
    expect(loadedConf.disabledGlobalFilters).toHaveLength(3);
    expect(loadedConf.disabledGlobalFilters).toContain('filter-1');
    expect(loadedConf.disabledGlobalFilters).toContain('filter-2');
    expect(loadedConf.disabledGlobalFilters).toContain('filter-3');
  });

  it('should preserve other bundle config fields when adding disabledGlobalFilters', () => {
    const bundleDir = path.join(bundlesDir, 'test-bundle');
    
    // Set up initial config with other fields
    const initialConf = {
      sourceDirectory: './test',
      entryBundleNodeId: 'a1b2c3d4e5f6',
      publishSlug: 'test-bundle'
    };
    saveBundleConfig(bundleDir, initialConf);

    // Add disabled global filters
    const bundleConfig = loadBundleConfig(bundleDir);
    bundleConfig.disabledGlobalFilters = ['global-filter-1'];
    saveBundleConfig(bundleDir, bundleConfig);

    // Verify all fields are preserved
    const loadedConf = loadBundleConfig(bundleDir);
    expect(loadedConf.sourceDirectory).toBe('./test');
    expect(loadedConf.entryBundleNodeId).toBe('a1b2c3d4e5f6');
    expect(loadedConf.publishSlug).toBe('test-bundle');
    expect(loadedConf.disabledGlobalFilters).toEqual(['global-filter-1']);
  });
});
