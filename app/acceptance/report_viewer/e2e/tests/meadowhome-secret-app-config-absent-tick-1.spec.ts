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

// `app/secret_app_config.yaml` holds secrets populated after the user
// completes a Stripe subscription via the lambdas. In the publish-flow
// artifact it shows up at tick 1 and then disappears from tick 2
// onward, which is suspected to be vestigial behavior from when the
// E2E tests didn't exercise the real lambda path and the file was
// being pre-seeded with a static value. Now that publish-flow actually
// goes through the lambdas, the file shouldn't exist until much later
// (post-Stripe, around tick 15 in the current fixture), so at tick 1
// it should simply not be present. This spec is expected to FAIL until
// that vestigial seeding is removed. The failure is the signal — do
// not silence or skip it.
//
// Note: `app/secret_app_config.yaml` is already listed in the
// .gitignore written by AppConfigGitUtils.initRepo (see
// app/shared_code/utils/appConfigGitUtils.ts GITIGNORE_CONTENT), so
// the fix is NOT "add it to .gitignore" — it's "find and remove
// whatever code is pre-seeding the file on disk before Stripe runs".
// The sibling spec meadowhome-secret-app-config-shown-as-ignored-tick-15
// covers the post-Stripe case: once the file legitimately appears, the
// UI should render it greyed out because it's gitignored.

let fixture: PublishFlowFixture;

test.beforeAll(() => {
  fixture = ensurePublishFlowArtifact();
});

test("at tick 1, app/secret_app_config.yaml is not present in MeadowHome files", async ({
  page,
}) => {
  const { runId, testSlug } = fixture;

  await page.goto(`/${runId}/${testSlug}`);

  const tickNav = new TickNavComponent(page, expect);
  const files = new MeadowHomeFilesComponent(page, expect);

  await files.activate();
  await tickNav.goToTick(1);

  await files.expectFileNotPresent("app/secret_app_config.yaml");
});
