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
  SelectedPageDetailComponent,
} from "../src/run/pages/index.js";
import { Fixture } from "../src/run/workflows.js";
import { excalidraw, images, initialPage } from "../src/scenario-docs/index.js";
import { customSite } from "../src/site-docs/index.js";

test.use({ fixtureHome: Fixture.None });

/**
 * Build a fresh site against meadow-test-sites-data with "t006 - embedded
 * media" as the initial page. The "main page" of that source graph links into
 * t006, so the editor opens with several depth-1 inlink pages visible. After
 * setting Inlink Depth to 0 on the initial page, the depth-1 outlink media
 * (png, svg, excalidraw) should still appear — only the inlink-side traversal
 * should collapse.
 */
test("setting initial-page inlink depth to 0 keeps the depth-1 outlink media visible", async ({
  page,
  testServer,
  snapshot,
  addKeyFrame,
  expectLogErrors,
}) => {
  // The Excalidraw thumbnail rendered for the embedded `.excalidraw` page
  // tries to use a Web Worker for font subsetting; our vendor bundle has no
  // Worker URL configured, so the renderer logs and falls back to the main
  // thread. Same expected noise as `excalidraw-thumbnail-and-preview`.
  const releaseWorkerWarning = expectLogErrors(
    /Failed to use workers for subsetting, falling back to the main thread/,
  );

  const siteList = new SiteListPage(page, expect);
  const editor = new SiteEditorPage(page, expect);
  const createModal = new CreateAndEditSiteModal(page, expect);

  // Empty home → click "create a site" in the empty-state callout
  await siteList.goto();
  await siteList.expectCalloutVisible("Turn your notes into sites");
  await siteList.clickCreateSiteLink();

  // Point the new site at the shared meadow-test-sites-data graph and pick
  // "t006 - embedded media" as the initial page.
  const sourceDir = path.join(testServer.sourceGraphsDir, "meadow-test-sites-data");
  await createModal.fillSourceDirectory(sourceDir);
  await createModal.typeInitialPageTitle("t006 - embedded media");
  await createModal.selectSuggestion("t006 - embedded media");
  await createModal.clickCreateSite();

  // Slug is derived from the title via lowercase → spaces+dashes collapse.
  await editor.waitForLoad("t006-embedded-media");
  await snapshot("editor loaded with t006 - embedded media as initial page");

  // Use list view to reliably pick the initial-page row, then return to
  // graph view so the recorded video shows the visual change when inlink
  // depth is reduced.
  await editor.switchToListView();
  await page.waitForTimeout(250);
  await editor.clickListViewRowByExactName("t006 - embedded media");
  await page.waitForTimeout(250);
  await editor.switchToGraphView();
  await page.waitForTimeout(250);
  await snapshot("initial node selected in graph view, inlinks visible");
  await addKeyFrame(initialPage);

  // Set Inlink Depth to 0 on the initial page.
  const detail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await detail.setInlinksDepth(0);
  await page.waitForTimeout(1000);
  await snapshot("after setting inlink depth to 0");

  // The depth-1 outlink media should still be present — switch to list view
  // and assert each file type the user cares about is still in the graph.
  // Titles in list view drop the extension (the file type lives in its own
  // cell), so match by title + file-type cell.
  await editor.switchToListView();
  await page.waitForTimeout(250);
  await editor.expectListViewRowByTitleAndFileTypePresent("t006 --- meadow", "png");
  await editor.expectListViewRowByTitleAndFileTypePresent("t006 --- meadow-flower", "svg");
  await editor.expectListViewRowByTitleAndFileTypePresent("t006 --- meadow-flower", "excalidraw");
  await addKeyFrame(images);
  await addKeyFrame(excalidraw);
  await snapshot("depth-1 outlink media still present in list view");

  void customSite;

  releaseWorkerWarning();
});
