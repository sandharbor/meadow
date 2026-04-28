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

import { test, expect } from "@playwright/test";
import {
  ensurePublishFlowArtifact,
  type PublishFlowFixture,
} from "../fixtures/publish-flow-fixture.js";
import { TickNavComponent } from "../pages/TickNavComponent.js";
import { MeadowHomeFilesComponent } from "../pages/MeadowHomeFilesComponent.js";

// Regression test for a previously-fixed bug: `app/app_config.yaml`
// used to be reported as "uncommitted-modified" in the MeadowHome
// files tree at the first post-startup tick, because
// ensureAppConfigInitialized would patch the file with new defaults
// but startServer never committed the patch. Fixed in
// app/backend/src/index.ts startServer() by committing after
// ensureAppConfigInitialized reports wasPatched=true. This spec pins
// that fix in place.
//
// (Previously this spec targeted tick 2 — that worked because a
// separate vestigial pre-seed of app/secret_app_config.yaml in
// test-fixtures.ts created a diff at tick 2 that kept it in the
// header dropdown. That pre-seed has since been removed, so tick 2
// is no longer "interesting". Tick 1 is now the first and only
// stable post-startup tick in the dropdown.)

let fixture: PublishFlowFixture;

test.beforeAll(() => {
  fixture = ensurePublishFlowArtifact();
});

test("at tick 1, app/app_config.yaml is not marked modified in MeadowHome files", async ({
  page,
}) => {
  const { runId, testSlug } = fixture;

  await page.goto(`/${runId}/${testSlug}`);

  const tickNav = new TickNavComponent(page, expect);
  const files = new MeadowHomeFilesComponent(page, expect);

  await files.activate();
  await tickNav.goToTick(1);

  await files.expectFileNotModified("app/app_config.yaml");
});
