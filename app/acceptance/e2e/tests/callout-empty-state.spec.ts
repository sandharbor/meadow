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
import { callout } from "../src/scenario-docs/index.js";
import { bundles } from "../src/app-area-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: "none" });

test("Callout turn your notes into bundles shown on empty state", async ({ page, snapshot, assertMeadowHomeState, addKeyFrame }) => {
  const bundleList = new BundleListPage(page, expect);
  await bundleList.goto();
  await snapshot("empty bundle list loaded");

  await bundleList.expectCalloutVisible("Turn your notes into bundles");
  await addKeyFrame(callout);
  await snapshot("turn your notes into bundles callout visible");
  void bundles;

  await assertMeadowHomeState();
});
