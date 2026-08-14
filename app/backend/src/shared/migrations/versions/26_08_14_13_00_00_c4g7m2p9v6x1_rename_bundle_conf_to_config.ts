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
import type { Migration } from '../../../../../shared_code/types/migrations.js';
import { getDefaultConfigDirectory } from '../../../../../shared_code/utils/appConfigUtils.js';

const LEGACY_CONFIG_DIRECTORY = 'conf';
const CANONICAL_CONFIG_DIRECTORY = 'config';

export interface BundleConfigDirectoryMigrationReport {
  movedPaths: string[];
}

function sameFileContents(left: string, right: string): boolean {
  const leftStats = fs.statSync(left);
  const rightStats = fs.statSync(right);
  return leftStats.size === rightStats.size
    && fs.readFileSync(left).equals(fs.readFileSync(right));
}

function validateMerge(source: string, destination: string): void {
  if (!fs.existsSync(source) || !fs.existsSync(destination)) return;

  const sourceStats = fs.statSync(source);
  const destinationStats = fs.statSync(destination);
  if (sourceStats.isDirectory() && destinationStats.isDirectory()) {
    for (const entry of fs.readdirSync(source).sort((left, right) => left.localeCompare(right))) {
      validateMerge(path.join(source, entry), path.join(destination, entry));
    }
    return;
  }

  if (sourceStats.isFile() && destinationStats.isFile() && sameFileContents(source, destination)) {
    return;
  }

  throw new Error(
    `Cannot rename bundle config directory because both paths contain different data: ${source} and ${destination}`,
  );
}

function moveWithoutDataLoss(source: string, destination: string, movedPaths: string[]): void {
  if (!fs.existsSync(source)) return;

  if (!fs.existsSync(destination)) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.renameSync(source, destination);
    movedPaths.push(`${source} -> ${destination}`);
    return;
  }

  const sourceStats = fs.statSync(source);
  const destinationStats = fs.statSync(destination);
  if (sourceStats.isDirectory() && destinationStats.isDirectory()) {
    for (const entry of fs.readdirSync(source).sort((left, right) => left.localeCompare(right))) {
      moveWithoutDataLoss(path.join(source, entry), path.join(destination, entry), movedPaths);
    }
    fs.rmdirSync(source);
    return;
  }

  if (sourceStats.isFile() && destinationStats.isFile() && sameFileContents(source, destination)) {
    fs.unlinkSync(source);
    movedPaths.push(`${source} -> ${destination} (identical destination retained)`);
    return;
  }

  throw new Error(
    `Cannot rename bundle config directory because both paths contain different data: ${source} and ${destination}`,
  );
}

/** Move every bundle's legacy conf tree into its canonical config tree. */
export function migrateBundleConfToConfig(
  configDirectory: string,
): BundleConfigDirectoryMigrationReport {
  const report: BundleConfigDirectoryMigrationReport = { movedPaths: [] };
  const bundlesDirectory = path.join(configDirectory, 'bundles');
  if (!fs.existsSync(bundlesDirectory)) return report;

  const bundleDirectories = fs.readdirSync(bundlesDirectory, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(bundlesDirectory, entry.name))
    .sort((left, right) => left.localeCompare(right));

  // Validate every merge before moving anything so a conflict cannot leave a
  // Meadow home only partly migrated.
  for (const bundleDirectory of bundleDirectories) {
    validateMerge(
      path.join(bundleDirectory, LEGACY_CONFIG_DIRECTORY),
      path.join(bundleDirectory, CANONICAL_CONFIG_DIRECTORY),
    );
  }

  for (const bundleDirectory of bundleDirectories) {
    moveWithoutDataLoss(
      path.join(bundleDirectory, LEGACY_CONFIG_DIRECTORY),
      path.join(bundleDirectory, CANONICAL_CONFIG_DIRECTORY),
      report.movedPaths,
    );
  }

  report.movedPaths.sort((left, right) => left.localeCompare(right));
  return report;
}

export const migration: Migration = {
  name: 'Rename bundle conf directory to config',
  description: 'Move each bundle configuration tree from conf/ to config/ without overwriting existing data.',
  run: (): Promise<void> => {
    migrateBundleConfToConfig(getDefaultConfigDirectory());
    return Promise.resolve();
  },
};
