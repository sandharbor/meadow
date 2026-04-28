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
 * Utility functions for loading and saving global custom filters.
 * Shared between backend routes and startup initialization.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { GlobalCustomFiltersConfig } from '../types/customFilters.js';

const GLOBAL_CUSTOM_FILTERS_FILENAME = 'global_custom_filters.json';

export function getGlobalCustomFiltersPath(configDir: string): string {
  return join(configDir, 'app', GLOBAL_CUSTOM_FILTERS_FILENAME);
}

export function loadGlobalCustomFilters(configDir: string): GlobalCustomFiltersConfig {
  const path = getGlobalCustomFiltersPath(configDir);
  if (!existsSync(path)) {
    return { filters: [], version: '1.0.0' };
  }
  try {
    const content = readFileSync(path, 'utf8');
    return JSON.parse(content) as GlobalCustomFiltersConfig;
  } catch {
    return { filters: [], version: '1.0.0' };
  }
}

export function saveGlobalCustomFilters(configDir: string, config: GlobalCustomFiltersConfig): void {
  const path = getGlobalCustomFiltersPath(configDir);
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  config.version = '1.0.0';
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf8');
}
