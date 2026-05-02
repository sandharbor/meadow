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
import { SiteListPage, SiteEditorPage, PreviewPublishModal } from "../src/run/pages/index.js";
import { callout } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";

test("Callout preview warns about untracked pages", async ({ page, snapshot, addKeyFrame }) => {
  const siteList = new SiteListPage(page, expect);
  await siteList.goto();
  await snapshot("site list loaded");

  await siteList.clickSite("meadow-test-site-big");
  const editor = new SiteEditorPage(page, expect);
  await editor.waitForLoad("meadow-test-site-big");
  await snapshot("site editor loaded");

  await editor.clickPreview();
  const modal = new PreviewPublishModal(page, expect);
  await modal.waitForPreviewComplete();
  await addKeyFrame(callout);
  await snapshot("preview shows untracked warning");
  void bigSite;
});
