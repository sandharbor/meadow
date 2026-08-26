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
import { Workflows } from "../src/run/workflows.js";
import { BundleListPage, BundleEditorPage } from "../src/run/pages/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";
import { bundles } from "../../../concepts/index.js";

test.use({ bundleMode: "single-file" });

test("navigate back to bundles list from big bundle view", async ({ page, snapshot, assertMeadowHomeState }) => {
  const wf = new Workflows(page, expect);
  const bundleList = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);

  await wf.navigateToBigBundle();
  await snapshot("big bundle loaded");

  await editor.clickBackToBundles();
  await bundleList.expectHeadingVisible();
  await snapshot("back at bundles list");
  void bigBundle;
  void bundles;

  await assertMeadowHomeState();
});
