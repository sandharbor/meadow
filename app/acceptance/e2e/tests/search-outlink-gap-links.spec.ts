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
  BundleEditorPage,
  FilterPanelComponent,
  SelectedPageDetailComponent,
  LinksModal,
} from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { sourceGraphSearch, labels, linkGap, callout, links } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

/*
 * Search for a page with an outgoing-link gap and inspect its links. Follow an incoming
 * link to verify navigation to the related page.
 */
test("sourceGraphSearch for outlink gap page, inspect links, and navigate via inlink", async ({
  page,
  snapshot,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  await wf.navigateToBigBundle();
  await snapshot("bundle editor loaded");

  // --- Test start ---
  // Search for the outlink-gap page.
  const filterPanel = new FilterPanelComponent(page, expect);
  await filterPanel.fillSearch("outlink gap");
  await page.waitForTimeout(500);
  await addKeyFrame(sourceGraphSearch);
  await addKeyFrame(labels);
  await snapshot("searched for outlink gap");

  // Inspect the search result in list view.
  const editor = new BundleEditorPage(page, expect);
  await editor.switchToListView();
  await page.waitForTimeout(250);
  await snapshot("list view with sourceGraphSearch results");

  // Select the matching page.
  const listCount = await editor.getListViewPageCount();
  expect(listCount).toBe(1);

  // Click the row to select it
  await editor.clickListViewRow(0);
  await page.waitForTimeout(250);
  await snapshot("outlink gap page selected");

  // Open its details.
  const selectedPageRoot = editor.getSelectedPageRoot();
  const detail = new SelectedPageDetailComponent(selectedPageRoot, expect);
  await detail.openDetails();
  await detail.expectFolder('t021');
  await page.waitForTimeout(250);
  await snapshot("details opened for outlink gap page");

  // Inspect its links.
  await detail.clickShowLinks();
  await page.waitForTimeout(250);
  await snapshot("links modal open");

  // Check the outgoing link states.
  const linksModal = new LinksModal(page, expect);
  await linksModal.expectModalTitle("Links: t021 ---- outlink gap");

  // There should be outlinks that are not in the graph
  await linksModal.expectNotInGraphVisible();

  // Keyframe for link-gap — shows the outlinks with gap indicators
  await addKeyFrame(linkGap);
  await snapshot("outlink gap links visible");

  // Read the depth explanation.
  await linksModal.hoverInfoIcon();
  await page.waitForTimeout(250);

  // Expect the tooltip to say the target page is beyond outlinks depth
  await linksModal.expectBeyondOutlinksDepthTooltip();
  await addKeyFrame(callout);
  await snapshot("tooltip showing beyond outlinks depth");

  // Follow an incoming link.
  await linksModal.clickInlinkLinks("t021 - link gaps");
  await page.waitForTimeout(250);
  await snapshot("navigated to inlink page links");

  // Check the linked page title.
  await linksModal.expectModalTitle("Links: t021 - link gaps");

  // Keyframe for Bundle Page Links.
  await addKeyFrame(links);
  await snapshot("links modal showing t021 link gaps page");

  void bigBundle;

  await assertMeadowHomeState();
});
