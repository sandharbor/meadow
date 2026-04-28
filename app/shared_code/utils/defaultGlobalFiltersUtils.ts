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

/**
 * Ensures default global filters are seeded on app startup.
 * If the user deletes a default filter, its ID is recorded in AppConfig
 * so it won't be re-created.
 */

import { CustomFilterConfig } from '../types/customFilters.js';
import { loadAppConfig } from './appConfigUtils.js';
import { loadGlobalCustomFilters, saveGlobalCustomFilters } from './globalCustomFiltersUtils.js';

export const DEFAULT_DAILY_NOTES_FILTER_ID = 'default-daily-notes-sensitive';

function buildDefaultDailyNotesFilter(): CustomFilterConfig {
  const now = new Date().toISOString();
  return {
    id: DEFAULT_DAILY_NOTES_FILTER_ID,
    name: 'Daily Notes (Sensitive)',
    note: 'Daily notes often contain tasks or content that is sensitive',
    scope: 'global',
    selectors: [{
      field: 'path',
      matchType: 'regex',
      value: '\\d{4}-\\d{2}-\\d{2}\\.md$',
      caseSensitive: false,
    }],
    selectorApplicationCriteria: 'union',
    actions: [
      { type: 'highlight', color: '#ff69b4', isDashed: true },
      { type: 'mark_sensitive' },
    ],
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function ensureDefaultGlobalFiltersInitialized(configDir: string): { wasPatched: boolean } {
  const appConfig = loadAppConfig(configDir);
  const deletedIds = appConfig.deletedDefaultFilterIds || [];

  // Don't re-create if user intentionally deleted it
  if (deletedIds.includes(DEFAULT_DAILY_NOTES_FILTER_ID)) {
    return { wasPatched: false };
  }

  const globalConfig = loadGlobalCustomFilters(configDir);

  // If it already exists, backfill the note if missing
  const existing = globalConfig.filters.find(f => f.id === DEFAULT_DAILY_NOTES_FILTER_ID);
  if (existing) {
    if (!existing.note) {
      existing.note = buildDefaultDailyNotesFilter().note;
      saveGlobalCustomFilters(configDir, globalConfig);
      return { wasPatched: true };
    }
    return { wasPatched: false };
  }

  globalConfig.filters.push(buildDefaultDailyNotesFilter());
  saveGlobalCustomFilters(configDir, globalConfig);
  return { wasPatched: true };
}
