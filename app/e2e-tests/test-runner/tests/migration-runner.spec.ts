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

import fs from "fs";
import path from "path";
import YAML from "yaml";
import { test as baseTest, expect } from "../src/run/test-fixtures.js";
import { BundleListPage } from "../src/run/pages/index.js";
import { MeadowHomeMigrations } from "../src/run/utils/index.js";
import { migration } from "../src/scenario-docs/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";
import { bundles } from "../src/app-area-docs/index.js";

const MIGRATION_ID = "26_08_18_12_00_00_e2e_test_upgrade_marker";
const MIGRATIONS_DIRECTORY = path.resolve(import.meta.dirname, "../fixtures/migrations");

const test = baseTest.extend({
  _backendExtraEnv: async ({}, use) => {
    await use({
      MEADOW_E2E_TEST: "true",
      MEADOW_E2E_CORE_MIGRATIONS_DIRECTORY: MIGRATIONS_DIRECTORY,
    });
  },
  _preSpawnSeed: async ({}, use) => {
    await use(async ({ configDir }) => {
      fs.writeFileSync(
        path.join(configDir, "migration-system-e2e.yaml"),
        YAML.stringify({
          schemaVersion: 0,
          legacyGreeting: "migration system ready",
          migrationRunCount: 0,
        }),
        "utf8",
      );
    });
  },
});

test.use({ bundleMode: "single-file" });

test("Migration runner applies an E2E-only migration at startup", async ({
  page,
  snapshot,
  assertMeadowHomeState,
  addKeyFrame,
  testServer,
}) => {
  const migrations = new MeadowHomeMigrations(testServer.configDir, expect);
  await migrations.expectCompleted(MIGRATION_ID);

  const markerPath = path.join(testServer.configDir, "migration-system-e2e.yaml");
  expect(YAML.parse(fs.readFileSync(markerPath, "utf8"))).toEqual({
    schemaVersion: 1,
    greeting: "migration system ready",
    migrationRunCount: 1,
  });
  expect(fs.existsSync(path.join(testServer.configDir, ".meadow-migration-recovery"))).toBe(false);

  const bundleList = new BundleListPage(page, expect);
  await bundleList.goto();
  await bundleList.expectHeadingVisible();
  await addKeyFrame(migration);
  await snapshot("app ready after E2E-only startup migration");
  void bigBundle;
  void bundles;

  await assertMeadowHomeState();
});
