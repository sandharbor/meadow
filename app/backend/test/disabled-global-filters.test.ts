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
import { loadSiteConfig, saveSiteConfig } from '../src/utils/siteConfigUtils.js';
import { CustomFilterConfig, GlobalCustomFiltersConfig } from '../../shared_code/types/customFilters.js';

describe('Disabled Global Filters', () => {
  let testDir: string;
  let sitesDir: string;
  let testSiteDir: string;
  let globalFiltersPath: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-test-'));
    sitesDir = path.join(testDir, 'sites');
    testSiteDir = path.join(sitesDir, 'test-site', 'conf');
    globalFiltersPath = path.join(testDir, 'app', 'global_custom_filters.json');

    // Create directories
    fs.mkdirSync(testSiteDir, { recursive: true });
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

  it('should load site config without disabledGlobalFilters initially', () => {
    const siteConfig = loadSiteConfig(path.join(sitesDir, 'test-site'));
    expect(siteConfig.disabledGlobalFilters).toBeUndefined();
  });

  it('should save and load disabledGlobalFilters in site config', () => {
    const siteDir = path.join(sitesDir, 'test-site');
    
    // Add a disabled global filter
    const siteConfig = loadSiteConfig(siteDir);
    siteConfig.disabledGlobalFilters = ['global-filter-1'];
    saveSiteConfig(siteDir, siteConfig);

    // Load it back
    const loadedConf = loadSiteConfig(siteDir);
    expect(loadedConf.disabledGlobalFilters).toEqual(['global-filter-1']);
  });

  it('should maintain empty array when no global filters are disabled', () => {
    const siteDir = path.join(sitesDir, 'test-site');
    
    const siteConfig = loadSiteConfig(siteDir);
    siteConfig.disabledGlobalFilters = [];
    saveSiteConfig(siteDir, siteConfig);

    const loadedConf = loadSiteConfig(siteDir);
    expect(loadedConf.disabledGlobalFilters).toEqual([]);
  });

  it('should handle multiple disabled global filters', () => {
    const siteDir = path.join(sitesDir, 'test-site');
    
    const siteConfig = loadSiteConfig(siteDir);
    siteConfig.disabledGlobalFilters = ['filter-1', 'filter-2', 'filter-3'];
    saveSiteConfig(siteDir, siteConfig);

    const loadedConf = loadSiteConfig(siteDir);
    expect(loadedConf.disabledGlobalFilters).toHaveLength(3);
    expect(loadedConf.disabledGlobalFilters).toContain('filter-1');
    expect(loadedConf.disabledGlobalFilters).toContain('filter-2');
    expect(loadedConf.disabledGlobalFilters).toContain('filter-3');
  });

  it('should preserve other site config fields when adding disabledGlobalFilters', () => {
    const siteDir = path.join(sitesDir, 'test-site');
    
    // Set up initial config with other fields
    const initialConf = {
      sourceDirectory: './test',
      initialSitePageTitle: 'Main',
      publishSlug: 'test-site'
    };
    saveSiteConfig(siteDir, initialConf);

    // Add disabled global filters
    const siteConfig = loadSiteConfig(siteDir);
    siteConfig.disabledGlobalFilters = ['global-filter-1'];
    saveSiteConfig(siteDir, siteConfig);

    // Verify all fields are preserved
    const loadedConf = loadSiteConfig(siteDir);
    expect(loadedConf.sourceDirectory).toBe('./test');
    expect(loadedConf.initialSitePageTitle).toBe('Main');
    expect(loadedConf.publishSlug).toBe('test-site');
    expect(loadedConf.disabledGlobalFilters).toEqual(['global-filter-1']);
  });
});

