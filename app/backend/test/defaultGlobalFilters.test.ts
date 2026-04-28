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
import { ensureDefaultGlobalFiltersInitialized, DEFAULT_DAILY_NOTES_FILTER_ID } from '../../shared_code/utils/defaultGlobalFiltersUtils.js';
import { loadGlobalCustomFilters } from '../../shared_code/utils/globalCustomFiltersUtils.js';
import { loadAppConfig, saveAppConfig } from '../../shared_code/utils/appConfigUtils.js';

describe('Default Global Filters', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-test-'));
    fs.mkdirSync(path.join(testDir, 'app'), { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should create the daily notes filter when none exists', () => {
    ensureDefaultGlobalFiltersInitialized(testDir);

    const config = loadGlobalCustomFilters(testDir);
    expect(config.filters).toHaveLength(1);
    expect(config.filters[0].id).toBe(DEFAULT_DAILY_NOTES_FILTER_ID);
    expect(config.filters[0].name).toBe('Daily Notes (Sensitive)');
    expect(config.filters[0].scope).toBe('global');
    expect(config.filters[0].enabled).toBe(true);
    expect(config.filters[0].selectors[0].field).toBe('path');
    expect(config.filters[0].selectors[0].matchType).toBe('regex');
    expect(config.filters[0].actions).toHaveLength(2);
    expect(config.filters[0].actions[0].type).toBe('highlight');
    expect(config.filters[0].actions[1].type).toBe('mark_sensitive');
  });

  it('should not duplicate the filter if it already exists', () => {
    ensureDefaultGlobalFiltersInitialized(testDir);
    ensureDefaultGlobalFiltersInitialized(testDir);

    const config = loadGlobalCustomFilters(testDir);
    expect(config.filters).toHaveLength(1);
  });

  it('should not re-create the filter if its ID is in deletedDefaultFilterIds', () => {
    const appConfig = loadAppConfig(testDir);
    appConfig.deletedDefaultFilterIds = [DEFAULT_DAILY_NOTES_FILTER_ID];
    saveAppConfig(appConfig, testDir);

    ensureDefaultGlobalFiltersInitialized(testDir);

    const config = loadGlobalCustomFilters(testDir);
    expect(config.filters).toHaveLength(0);
  });

  it('should preserve existing custom filters when adding the default', () => {
    // Pre-populate with an existing filter
    const existingFilter = {
      id: 'user-filter-1',
      name: 'My Custom Filter',
      scope: 'global' as const,
      selectors: [{ field: 'title' as const, matchType: 'substring' as const, value: 'test', caseSensitive: false }],
      selectorApplicationCriteria: 'union' as const,
      actions: [{ type: 'highlight' as const, color: '#FFD700', isDashed: false }],
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const globalFiltersPath = path.join(testDir, 'app', 'global_custom_filters.json');
    fs.writeFileSync(globalFiltersPath, JSON.stringify({ filters: [existingFilter], version: '1.0.0' }, null, 2));

    ensureDefaultGlobalFiltersInitialized(testDir);

    const config = loadGlobalCustomFilters(testDir);
    expect(config.filters).toHaveLength(2);
    expect(config.filters[0].id).toBe('user-filter-1');
    expect(config.filters[1].id).toBe(DEFAULT_DAILY_NOTES_FILTER_ID);
  });
});
