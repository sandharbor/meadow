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

import { test, expect } from "../src/run/test-fixtures.js";
import { BundleListPage } from "../src/run/pages/index.js";
import { callout } from "../../../concepts/index.js";
import { bundles } from "../../../concepts/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: "home_fixture_minimal" });

/*
 * Open an empty MeadowHome. The welcome callout should explain how to turn notes into a
 * bundle.
 */
test("Callout turn your notes into bundles shown on empty state", { annotation: { type: 'scenario-id', description: 'dbc2cba3-81b2-4fc8-9f2b-886298b8a570' } }, async ({ sourceCommand, page, checkpoint, assertMeadowHomeState, addKeyFrame }) => {
  // --- Setup ---
  const bundleList = new BundleListPage(page, expect);
  await sourceCommand(() => bundleList.goto());
  await sourceCommand(() => checkpoint("empty bundle list loaded"));

  // --- Test start ---
  // Check the invitation to create a bundle.
  await sourceCommand(() => bundleList.expectCalloutVisible("Turn your notes into bundles"));
  await sourceCommand(() => addKeyFrame(callout));
  await sourceCommand(() => checkpoint("turn your notes into bundles callout visible"));

  void bundles;

  await sourceCommand(() => assertMeadowHomeState());
});
