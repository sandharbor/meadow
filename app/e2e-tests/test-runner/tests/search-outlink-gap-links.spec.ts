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
  SiteEditorPage,
  FilterPanelComponent,
  SelectedPageDetailComponent,
  LinksModal,
} from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { search, labels, linkGap, callout, links } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";

test("search for outlink gap page, inspect links, and navigate via inlink", async ({
  page,
  snapshot,
  addKeyFrame,
}) => {
  const wf = new Workflows(page, expect);
  await wf.navigateToBigSite();
  await snapshot("site editor loaded");

  // Search for "outlink gap" in the filter panel search input
  const filterPanel = new FilterPanelComponent(page, expect);
  await filterPanel.fillSearch("outlink gap");
  await page.waitForTimeout(500);
  await snapshot("searched for outlink gap");

  // Keyframe for search scenario doc — shows search results on graph
  await addKeyFrame(search);

  // Keyframe for labels — search results display labels
  await addKeyFrame(labels);

  // Switch to list view and select the page
  const editor = new SiteEditorPage(page, expect);
  await editor.switchToListView();
  await page.waitForTimeout(250);
  await snapshot("list view with search results");

  // Should have one result for outlink gap
  const listCount = await editor.getListViewPageCount();
  expect(listCount).toBe(1);

  // Click the row to select it
  await editor.clickListViewRow(0);
  await page.waitForTimeout(250);
  await snapshot("outlink gap page selected");

  // Open details for the selected page
  const selectedPageRoot = editor.getSelectedPageRoot();
  const detail = new SelectedPageDetailComponent(selectedPageRoot, expect);
  await detail.openDetails();
  await page.waitForTimeout(250);
  await snapshot("details opened for outlink gap page");

  // Click "Show Links" to open the links modal
  await detail.clickShowLinks();
  await page.waitForTimeout(250);
  await snapshot("links modal open");

  // Verify the modal and inspect links
  const linksModal = new LinksModal(page, expect);
  await linksModal.expectModalTitle("Links: t021 ---- outlink gap");

  // There should be outlinks that are not in the graph
  await linksModal.expectNotInGraphVisible();

  // Keyframe for link-gap — shows the outlinks with gap indicators
  await addKeyFrame(linkGap);
  await snapshot("outlink gap links visible");

  // Hover over the info icon on a "Not in graph" outlink to see the tooltip
  await linksModal.hoverInfoIcon();
  await page.waitForTimeout(250);

  // Expect the tooltip to say the target page is beyond outlinks depth
  await linksModal.expectBeyondOutlinksDepthTooltip();
  await snapshot("tooltip showing beyond outlinks depth");

  // Keyframe for callout — the tooltip is a callout-style message
  await addKeyFrame(callout);

  // Navigate to in-links section and click the Links button on the inlink
  await linksModal.clickInlinkLinks("t021 - link gaps");
  await page.waitForTimeout(250);
  await snapshot("navigated to inlink page links");

  // The modal title should now show "Links: t021 - link gaps"
  await linksModal.expectModalTitle("Links: t021 - link gaps");

  // Keyframe for links scenario doc
  await addKeyFrame(links);
  await snapshot("links modal showing t021 link gaps page");
  void bigSite;
});
