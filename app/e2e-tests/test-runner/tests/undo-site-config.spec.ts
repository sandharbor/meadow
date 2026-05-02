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
import { SiteEditorPage, SelectedPageDetailComponent } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { siteConfig } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";

test("Undo reverts site page config changes without leaving the site", async ({
  page,
  snapshot,
  addKeyFrame,
}) => {
  const wf = new Workflows(page, expect);
  await wf.navigateToBigSite();

  const editor = new SiteEditorPage(page, expect);

  // Switch to list view and record original page count
  await editor.switchToListView();
  await page.waitForTimeout(250);
  const originalCount = await editor.getListViewPageCount();
  expect(originalCount).toBeGreaterThan(10);
  await snapshot("list view - original page count");

  // Select the initial node ("main page") — details auto-open for depth-0 pages
  await editor.clickListViewRowByExactName("main page");
  await page.waitForTimeout(500);
  await snapshot("main page selected - details auto-opened");

  // Set outlinks depth to 1 via the Out-link Depth input — many pages should disappear
  const selectedPageRoot = editor.getSelectedPageRoot();
  const detail = new SelectedPageDetailComponent(selectedPageRoot, expect);
  await detail.setOutlinksDepth(1);
  await page.waitForTimeout(500);
  const reducedCount = await editor.getListViewPageCount();
  expect(reducedCount).toBeLessThan(originalCount);
  await snapshot("outlinks depth set to 1 - fewer pages");

  // The Undo button should now be visible (draft changes exist)
  await editor.expectUndoVisible();

  // Click Undo — pages should re-appear without leaving the site
  await editor.clickUndo();
  await page.waitForTimeout(500);

  const restoredCount = await editor.getListViewPageCount();
  expect(restoredCount).toBe(originalCount);

  // The depth input should show the original value (4), not the stale edit (1)
  const restoredDetail = new SelectedPageDetailComponent(
    editor.getSelectedPageRoot(),
    expect,
  );
  await restoredDetail.expectOutlinksDepthInputValue("4");

  await addKeyFrame(siteConfig);
  await snapshot("after undo - page count and depth restored");
  void bigSite;
});
