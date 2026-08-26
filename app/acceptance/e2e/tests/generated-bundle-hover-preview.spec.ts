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
import {
  CustomizeTab,
  PreviewPublishModal,
} from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { customize, htmlGeneration } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test("generated-bundle hover preview links navigate from nested pages", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  const workflows = new Workflows(page, expect);
  await workflows.navigateToBigBundlePreview();

  const modal = new PreviewPublishModal(page, expect);
  const generatedBundle = modal.generatedBundle;
  const customizeTab = new CustomizeTab(page, expect);

  await modal.openCustomizeSidebar();
  const previewDone = page.waitForResponse(response =>
    response.url().includes("/preview-stream"),
  );
  await customizeTab.generationOptions.enableHoverPreview();
  await previewDone;
  await generatedBundle.hoverPreview.expectAvailable();
  await generatedBundle.expectHeading("main page", 60_000);
  await addKeyFrame(customize);
  await modal.closeCustomizeSidebar();

  await generatedBundle.clickPageLink("t001 - deeply nested");
  await generatedBundle.expectHeading("t001 - deeply nested");
  await generatedBundle.clickPageLink("t001 ---- child 1");
  await generatedBundle.expectHeading("t001 ---- child 1");

  // This backlink fetches a root page while the current page is nested under
  // t001/. Its preview links must resolve against the fetched root page, not
  // against the nested page displaying the popup.
  await generatedBundle.hoverPreview.hoverFooterLink("t001 - deeply nested");
  await generatedBundle.hoverPreview.expectLinkHref(
    "t001 ---- child 2",
    /\/t001\/deeper\/t001%20----%20child%202\.html$/,
  );
  await generatedBundle.hoverPreview.expectLinkDecorationMatchesFooterLink(
    "t001 ---- child 2",
    "t001 - deeply nested",
  );
  await snapshot("hover preview exposes a navigable nested-page link");
  await addKeyFrame(htmlGeneration);

  await generatedBundle.hoverPreview.clickLink("t001 ---- child 2");
  await generatedBundle.expectHeading("t001 ---- child 2");
  await snapshot("navigated through hover preview link");

  void bigBundle;
  await skipMeadowHomeStateCheck();
});
