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

import { restoreMigrationCheckpoint } from '../migrations/migrationPersistence.js';

function main(): void {
  const [homePath, checkpointId, applicationVersion, ...unexpected] = process.argv.slice(2);
  if (!homePath || !checkpointId || !applicationVersion || unexpected.length > 0) {
    throw new Error('Usage: restoreCheckpoint <home-path> <checkpoint-id> <application-version>');
  }
  const result = restoreMigrationCheckpoint(homePath, checkpointId, applicationVersion);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown checkpoint restore error';
  process.stderr.write(`Checkpoint restore failed: ${message}\n`);
  process.exitCode = 1;
}
