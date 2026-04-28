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
import { Fixture } from "../src/run/workflows.js";
import { exampleSiteFeature } from "../src/scenario-docs/index.js";
import { exampleSite } from "../src/site-docs/index.js";

test.use({ fixtureHome: Fixture.None });

test("add example site from empty state and preview it", async ({
  page, snapshot, addKeyFrame,
}) => {
  const siteList = new SiteListPage(page, expect);
  const editor = new SiteEditorPage(page, expect);
  const previewModal = new PreviewPublishModal(page, expect);

  // Start at empty site list
  await siteList.goto();
  await snapshot("empty site list");

  // Click the "add the example site" link in the empty state
  await siteList.clickAddExampleSiteLink();

  // Wait for navigation into the example site editor
  await editor.waitForLoad("example-site");
  await snapshot("example site editor loaded");

  // Click Preview and wait for it to complete
  await editor.clickPreview();
  await previewModal.waitForPreviewComplete();
  await snapshot("preview complete");

  // Verify the preview iframe shows the example site content
  await previewModal.expectPreviewIframeHeading("Notable Mental Models");
  await addKeyFrame(exampleSiteFeature);
  await snapshot("example site preview visible");

  // Verify this is tagged with the example site — the import alone handles
  // artifact extraction, but we reference the constant so it's not tree-shaken
  void exampleSite;
});
