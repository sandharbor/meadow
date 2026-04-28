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

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to the e2e test-runner's pre-migration fixtures folder.
 * Each fixture is a frozen MeadowHome snapshot captured BEFORE a specific
 * migration ran — tests use these as the starting state so the backend's
 * startup-migration runner actually has work to do.
 *
 *   e2e-tests/test-runner/fixtures/pre-migration/
 *     <migrationId>/                  e.g. 26_01_21_12_00_00_some_example
 *       <fixtureName>/                a MeadowHome tree (app/, sites/, migrations.yaml, …)
 *     <extensionId>/                  e.g. meadow-extension
 *       <migrationId>/
 *         <fixtureName>/
 */
const FIXTURES_ROOT = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "fixtures",
  "pre-migration",
);

/**
 * Resolve an absolute path to a pre-migration fixture for use with
 * `test.use({ migrationBeforePath: ... })`.
 *
 * `migrationId` is the migration filename without the `.ts` extension
 * (e.g. `26_04_22_10_00_00_u6sotb1nmvag_move_meadow_to_provider`).
 * `fixtureName` is the sub-folder name of the specific snapshot.
 * `extension`, when given (e.g. `"meadow-extension"`), nests the lookup
 * under that subdir so extension-owned fixtures can be mounted via
 * prepare.sh without colliding with core fixtures.
 */
export function preMigrationFixturePath(
  migrationId: string,
  fixtureName: string,
  extension?: string,
): string {
  return extension
    ? path.join(FIXTURES_ROOT, extension, migrationId, fixtureName)
    : path.join(FIXTURES_ROOT, migrationId, fixtureName);
}
