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

import fs from 'fs';
import path from 'path';
import { SiteConfigPaths } from '../../../../../shared_code/paths/siteConfigPaths.js';
import type { Migration } from '../../../../../shared_code/types/migrations.js';
import { getDefaultConfigDirectory } from '../../../../../shared_code/utils/appConfigUtils.js';

const LEGACY_PREVIEW_DIRECTORY = 'preview';

/** Moves each site's current generated artifact to its canonical directory. */
export function migratePreviewOutputDirectory(configDir: string): string[] {
  const sitesDir = path.join(configDir, 'sites');
  if (!fs.existsSync(sitesDir)) return [];

  const migratedSites: string[] = [];
  const siteEntries = fs.readdirSync(sitesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of siteEntries) {
    const siteDir = path.join(sitesDir, entry.name);
    const legacyDir = path.join(SiteConfigPaths.getHtmlDir(siteDir), LEGACY_PREVIEW_DIRECTORY);
    const generatedDir = SiteConfigPaths.getGeneratedHtmlDir(siteDir);
    if (!fs.existsSync(legacyDir)) continue;

    if (fs.existsSync(generatedDir)) {
      const generatedEntries = fs.readdirSync(generatedDir);
      if (generatedEntries.length > 0) {
        throw new Error(
          `Cannot migrate ${entry.name}: both ${legacyDir} and non-empty ${generatedDir} exist`,
        );
      }
      fs.rmdirSync(generatedDir);
    }

    fs.mkdirSync(path.dirname(generatedDir), { recursive: true });
    fs.renameSync(legacyDir, generatedDir);
    migratedSites.push(entry.name);
  }

  return migratedSites;
}

export const migration: Migration = {
  name: 'Rename preview output to generated HTML',
  description: 'Move each current generated site artifact from html/preview to html/generated.',
  run: (): Promise<void> => {
    migratePreviewOutputDirectory(getDefaultConfigDirectory());
    return Promise.resolve();
  },
};
