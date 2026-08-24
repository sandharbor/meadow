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
import YAML from 'yaml';
import type { Migration } from '../../../../contracts/types/migrations.js';

const MIGRATION_ID = '26_08_18_12_00_00_e2e_test_upgrade_marker';

export const migration: Migration = {
  id: MIGRATION_ID,
  name: 'Upgrade the E2E migration marker',
  description: 'Purpose-built E2E fixture that proves startup migrations can rewrite Home data.',
  run: (): Promise<void> => {
    const configDir = process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
    if (!configDir) throw new Error('MEADOW_HOME_DIRECTORY_OVERRIDE is required');

    const markerPath = path.join(configDir, 'migration-system-e2e.yaml');
    const marker = YAML.parse(fs.readFileSync(markerPath, 'utf8')) as {
      schemaVersion?: unknown;
      legacyGreeting?: unknown;
      migrationRunCount?: unknown;
    };
    if (
      marker.schemaVersion !== 0
      || typeof marker.legacyGreeting !== 'string'
      || marker.migrationRunCount !== 0
    ) {
      throw new Error('E2E migration marker is not in its expected pre-migration state');
    }

    fs.writeFileSync(markerPath, YAML.stringify({
      schemaVersion: 1,
      greeting: marker.legacyGreeting,
      migrationRunCount: 1,
    }), 'utf8');
    return Promise.resolve();
  },
};
