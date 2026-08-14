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
import { BundleListPage, BundleEditorPage } from "../src/run/pages/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";
import { bundles } from "../src/app-area-docs/index.js";

test.use({ bundleMode: "single-file" });

test("navigate from bundle list to bundle and see graph view", async ({ page, snapshot, assertMeadowHomeState }) => {
  const bundleList = new BundleListPage(page, expect);
  await bundleList.goto();
  await snapshot("bundle list loaded");

  await bundleList.clickBundle("meadow-test-bundle-big");
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad("meadow-test-bundle-big");

  await editor.expectGraphViewActive();
  await snapshot("graph view visible");
  void bigBundle;
  void bundles;

  await assertMeadowHomeState();
});
