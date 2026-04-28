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

import type { Migration } from '../../../../shared_code/types/migrations.js';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { getDefaultConfigDirectory } from '../../../../shared_code/utils/appConfigUtils.js';
import { getAppConfigPath } from '../../../../shared_code/utils/appConfigUtils.js';

/**
 * Migration: Rename `graphDepth` site page config property to `outlinksDepth`.
 *
 * - Rewrites every site_page_config.yaml and draft_site_page_config.yaml under
 *   <configDir>/sites/<siteSlug>/conf/ so that the per-page `graphDepth` key
 *   becomes `outlinksDepth`.
 * - Renames the `calloutInitialPageGraphDepth` flag in the app config's
 *   `calloutDismissals` to `calloutInitialPageOutlinksDepth`.
 *
 * The rename aligns the YAML property with the UI terminology ("outlinks depth")
 * and its counterpart `inlinksDepth`.
 */

function renameSitePageConfigFile(filePath: string): void {
  const raw = fs.readFileSync(filePath, 'utf8');
  const doc = YAML.parse(raw) as { pages?: Array<Record<string, unknown>>; nodes?: Array<Record<string, unknown>> } | null;
  if (!doc) return;

  const items = doc.pages || doc.nodes;
  if (!Array.isArray(items)) return;

  let changed = false;
  for (const item of items) {
    if (item && Object.prototype.hasOwnProperty.call(item, 'graphDepth')) {
      item.outlinksDepth = item.graphDepth;
      delete item.graphDepth;
      changed = true;
    }
  }

  if (!changed) return;

  fs.writeFileSync(filePath, YAML.stringify(doc, { sortMapEntries: true }), 'utf8');
}

function migrateSitePageConfigs(configDir: string): void {
  const sitesDir = path.join(configDir, 'sites');
  if (!fs.existsSync(sitesDir)) return;

  const siteEntries = fs.readdirSync(sitesDir, { withFileTypes: true });
  for (const entry of siteEntries) {
    if (!entry.isDirectory()) continue;
    const confDir = path.join(sitesDir, entry.name, 'conf');
    if (!fs.existsSync(confDir)) continue;

    for (const filename of ['site_page_config.yaml', 'draft_site_page_config.yaml']) {
      const filePath = path.join(confDir, filename);
      if (fs.existsSync(filePath)) {
        renameSitePageConfigFile(filePath);
      }
    }
  }
}

function migrateAppConfigCalloutKey(configDir: string): void {
  const appConfigPath = getAppConfigPath(configDir);
  if (!fs.existsSync(appConfigPath)) return;

  const raw = fs.readFileSync(appConfigPath, 'utf8');
  const doc = YAML.parse(raw) as Record<string, unknown> | null;
  if (!doc || typeof doc !== 'object') return;

  const dismissals = doc.calloutDismissals;
  if (!dismissals || typeof dismissals !== 'object') return;

  const dismissalsRecord = dismissals as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(dismissalsRecord, 'calloutInitialPageGraphDepth')) return;

  dismissalsRecord.calloutInitialPageOutlinksDepth = dismissalsRecord.calloutInitialPageGraphDepth;
  delete dismissalsRecord.calloutInitialPageGraphDepth;

  fs.writeFileSync(appConfigPath, YAML.stringify(doc), 'utf8');
}

export const migration: Migration = {
  name: 'Rename graphDepth to outlinksDepth',
  description: 'Rename the graphDepth property in site_page_config.yaml files to outlinksDepth, and the matching calloutInitialPageGraphDepth flag in app config.',
  run: (): Promise<void> => {
    const configDir = getDefaultConfigDirectory();
    migrateSitePageConfigs(configDir);
    migrateAppConfigCalloutKey(configDir);
    return Promise.resolve();
  }
};
