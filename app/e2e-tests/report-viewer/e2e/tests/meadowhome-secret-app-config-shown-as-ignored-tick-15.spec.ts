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

// Sibling of meadowhome-secret-app-config-absent-tick-1.spec.ts.
//
// `app/secret_app_config.yaml` is legitimately written to disk late in
// the publish-flow scenario — after the user completes a Stripe
// subscription and the lambdas populate the file. In the current
// fixture that happens around tick 15 (tickIndex 14 in the raw ticks
// stream), where the file reappears in the MeadowHome repo working
// tree.
//
// The file is gitignored (see GITIGNORE_CONTENT in
// app/shared_code/utils/appConfigGitUtils.ts), so when it shows up in
// the report viewer's Files tab it should be rendered greyed-out — not
// as an "uncommitted-new" alarm state like a tracked file would be.
// This spec asserts that the viewer marks the file as ignored via
// data-file-ignored="true" on the tree entry, which in turn drives the
// light-grey visual treatment.
//
// This spec is expected to FAIL until the report viewer learns to
// propagate gitignore status from fast_git_ops through ticks.jsonl and
// into the ScenarioViewer rendering. The failure is the signal — do
// not silence or skip it.

let fixture: PublishFlowFixture;

test.beforeAll(() => {
  fixture = ensurePublishFlowArtifact();
});

test("at tick 15, app/secret_app_config.yaml is rendered as gitignored in MeadowHome files", async ({
  page,
}) => {
  const { runId, testSlug } = fixture;

  await page.goto(`/${runId}/${testSlug}`);

  const tickNav = new TickNavComponent(page, expect);
  const files = new MeadowHomeFilesComponent(page, expect);

  await files.activate();
  await tickNav.goToTick(15);

  await files.expectFileIgnored("app/secret_app_config.yaml");
});
