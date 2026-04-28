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

// During publish-flow, the backend creates `app/global_custom_filters.json`
// (see ensureDefaultGlobalFiltersInitialized during server startup) but
// never commits it, so from tick 1 onward every tick reports the file
// as uncommitted-new. This spec is expected to FAIL until the backend
// commits the file after initial creation — same category of bug as the
// app_config.yaml one we just fixed. The failure is the signal.

let fixture: PublishFlowFixture;

test.beforeAll(() => {
  fixture = ensurePublishFlowArtifact();
});

test("at tick 1, app/global_custom_filters.json is committed in MeadowHome files", async ({
  page,
}) => {
  const { runId, testSlug } = fixture;

  await page.goto(`/${runId}/${testSlug}`);

  const tickNav = new TickNavComponent(page, expect);
  const files = new MeadowHomeFilesComponent(page, expect);

  await files.activate();
  await tickNav.goToTick(1);

  await files.expectFileCommitted("app/global_custom_filters.json");
});
