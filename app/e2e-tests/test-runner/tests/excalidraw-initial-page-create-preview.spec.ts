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

import path from "path";
import { test, expect } from "../src/run/test-fixtures.js";
import {
  SiteListPage,
  SiteEditorPage,
  CreateAndEditSiteModal,
  PreviewPublishModal,
} from "../src/run/pages/index.js";
import { Fixture } from "../src/run/workflows.js";
import { excalidraw, initialPage } from "../src/scenario-docs/index.js";
import { customSite } from "../src/site-docs/index.js";

test.use({ fixtureHome: Fixture.None });

test("create a custom site with an excalidraw initial page and follow a drawing link", async ({
  page,
  testServer,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  expectLogErrors,
}) => {
  const releaseWorkerWarning = expectLogErrors(
    /Failed to use workers for subsetting, falling back to the main thread/,
  );

  const siteList = new SiteListPage(page, expect);
  const editor = new SiteEditorPage(page, expect);
  const createModal = new CreateAndEditSiteModal(page, expect);
  const previewModal = new PreviewPublishModal(page, expect);

  await siteList.goto();
  await siteList.expectCalloutVisible("Turn your notes into sites");
  await siteList.clickCreateSiteLink();

  const sourceDir = path.join(testServer.sourceGraphsDir, "meadow-test-sites-data");
  await createModal.fillSourceDirectory(sourceDir);
  await createModal.typeInitialPageTitle("t006 --- meadow-flower");
  await createModal.selectSuggestion("t006 --- meadow-flower");
  await createModal.clickCreateSite();

  await editor.waitForLoad("t006-meadow-flower");
  await snapshot("graph view loaded with excalidraw initial page");
  await addKeyFrame(initialPage);
  await addKeyFrame(excalidraw);

  await editor.switchToListView();
  await editor.expectListViewRowByTitleAndFileTypePresent(
    "t006 --- meadow-flower",
    "excalidraw",
  );
  await editor.clickSelectAll();
  await page.waitForTimeout(500);
  await editor.clickDeselectSensitivePagesIfVisible();
  await page.waitForTimeout(250);
  await editor.clickTrackAll();

  await editor.clickPreview();
  await previewModal.waitForPreviewCompleteAllTracked();

  const previewFrame = page.frameLocator('iframe[title="Preview"]');
  await expect(previewFrame.locator("h1").first()).toContainText(
    "t006 --- meadow-flower",
    { timeout: 30_000 },
  );
  await expect(previewFrame.locator(".meadow-excalidraw-page svg").first()).toBeVisible({
    timeout: 30_000,
  });
  await snapshot("preview shows excalidraw initial page");
  await addKeyFrame(excalidraw);

  const firstDrawingLink = previewFrame.locator(
    '.meadow-excalidraw-page svg a[href="t006%20---%20linked-from-excalidraw.html"]',
  );
  await expect(firstDrawingLink).toHaveCount(1);
  await firstDrawingLink.click();

  await expect(previewFrame.locator("h1").first()).toContainText(
    "t006 --- linked-from-excalidraw",
    { timeout: 15_000 },
  );
  await snapshot("preview after clicking first excalidraw link");
  await addKeyFrame(excalidraw);

  void customSite;

  releaseWorkerWarning();
  await skipMeadowHomeStateCheck();
});
