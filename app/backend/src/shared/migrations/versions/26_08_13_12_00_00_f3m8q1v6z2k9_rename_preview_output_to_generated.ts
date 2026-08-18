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
import { BundleConfigPaths } from '../../../../../shared_code/paths/bundleConfigPaths.js';
import type { Migration } from '../../../../../shared_code/types/migrations.js';
import { getDefaultConfigDirectory } from '../../../../../shared_code/utils/appConfigUtils.js';

const LEGACY_PREVIEW_DIRECTORY = 'preview';

/** Moves each bundle's current generated artifact to its canonical directory. */
export function migratePreviewOutputDirectory(configDir: string): string[] {
  // This migration predates and runs before the root is renamed to bundles/.
  const bundlesDir = path.join(configDir, 'sites');
  if (!fs.existsSync(bundlesDir)) return [];

  const migratedBundles: string[] = [];
  const bundleEntries = fs.readdirSync(bundlesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of bundleEntries) {
    const bundleDir = path.join(bundlesDir, entry.name);
    const legacyDir = path.join(BundleConfigPaths.getHtmlDir(bundleDir), LEGACY_PREVIEW_DIRECTORY);
    const generatedDir = path.join(bundleDir, 'html', 'generated');
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
    migratedBundles.push(entry.name);
  }

  return migratedBundles;
}

export const migration: Migration = {
  id: '26_08_13_12_00_00_f3m8q1v6z2k9_rename_preview_output_to_generated',
  name: 'Rename preview output to generated HTML',
  description: 'Move each current generated bundle artifact from html/preview to html/generated.',
  run: (): Promise<void> => {
    migratePreviewOutputDirectory(getDefaultConfigDirectory());
    return Promise.resolve();
  },
};
