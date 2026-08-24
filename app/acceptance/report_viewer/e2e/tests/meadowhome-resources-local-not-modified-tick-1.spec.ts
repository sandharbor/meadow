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

// Sibling of meadowhome-app-config-not-modified-tick-1.spec.ts.
//
// `app/resources.local.yaml` holds per-instance state (ports, log
// directory, etc.) that the test-runner writes into configDir before
// spawning the backend. It is intentionally gitignored (see
// GITIGNORE_CONTENT in app/shared_code/utils/appConfigGitUtils.ts),
// so it should NEVER be reported as "uncommitted-modified" in the
// MeadowHome files tree. This spec pins that invariant in place.
//
// (Previously targeted tick 2 — see the note in
// meadowhome-app-config-not-modified-tick-1.spec.ts for why tick 2
// no longer exists in the dropdown after the vestigial
// secret_app_config.yaml pre-seed was removed.)

let fixture: PublishFlowFixture;

test.beforeAll(() => {
  fixture = ensurePublishFlowArtifact();
});

test("at tick 1, app/resources.local.yaml is not marked modified in MeadowHome files", async ({
  page,
}) => {
  const { runId, testSlug } = fixture;

  await page.goto(`/${runId}/${testSlug}`);

  const tickNav = new TickNavComponent(page, expect);
  const files = new MeadowHomeFilesComponent(page, expect);

  await files.activate();
  await tickNav.goToTick(1);

  await files.expectFileNotModified("app/resources.local.yaml");
});
