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
test("sourceGraphSearch for outlink gap page, inspect links, and navigate via inlink", { annotation: { type: 'scenario-id', description: '5d8213b4-06da-47eb-a6a1-a88f6f18fe4f' } }, async ({ sourceCommand,
  page,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  await sourceCommand(() => wf.navigateToBigBundle());
  await sourceCommand(() => checkpoint("bundle editor loaded"));

  // --- Test start ---
  // Search for the outlink-gap page.
  const filterPanel = new FilterPanelComponent(page, expect);
  await sourceCommand(() => filterPanel.fillSearch("outlink gap"));
  await sourceCommand(() => page.waitForTimeout(500));
  await sourceCommand(() => addKeyFrame(sourceGraphSearch));
  await sourceCommand(() => addKeyFrame(labels));
  await sourceCommand(() => checkpoint("searched for outlink gap"));

  // Inspect the search result in list view.
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => checkpoint("list view with sourceGraphSearch results"));

  // Select the matching page.
  const listCount = await sourceCommand(() => editor.getListViewPageCount());
  expect(listCount).toBe(1);

  // Click the row to select it
  await sourceCommand(() => editor.clickListViewRow(0));
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => checkpoint("outlink gap page selected"));

  // Open its details.
  const selectedPageRoot = editor.getSelectedPageRoot();
  const detail = new SelectedPageDetailComponent(selectedPageRoot, expect);
  await sourceCommand(() => detail.openDetails());
  await sourceCommand(() => detail.expectFolder('t021'));
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => checkpoint("details opened for outlink gap page"));

  // Inspect its links.
  await sourceCommand(() => detail.clickShowLinks());
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => checkpoint("links modal open"));

  // Check the outgoing link states.
  const linksModal = new LinksModal(page, expect);
  await sourceCommand(() => linksModal.expectModalTitle("Links: t021 ---- outlink gap"));

  // There should be outlinks that are not in the graph
  await sourceCommand(() => linksModal.expectNotInGraphVisible());

  // Keyframe for link-gap — shows the outlinks with gap indicators
  await sourceCommand(() => addKeyFrame(linkGap));
  await sourceCommand(() => checkpoint("outlink gap links visible"));

  // Read the depth explanation.
  await sourceCommand(() => linksModal.hoverInfoIcon());
  await sourceCommand(() => page.waitForTimeout(250));

  // Expect the tooltip to say the target page is beyond outlinks depth
  await sourceCommand(() => linksModal.expectBeyondOutlinksDepthTooltip());
  await sourceCommand(() => addKeyFrame(callout));
  await sourceCommand(() => checkpoint("tooltip showing beyond outlinks depth"));

  // Follow an incoming link.
  await sourceCommand(() => linksModal.clickInlinkLinks("t021 - link gaps"));
  await sourceCommand(() => page.waitForTimeout(250));
  await sourceCommand(() => checkpoint("navigated to inlink page links"));

  // Check the linked page title.
  await sourceCommand(() => linksModal.expectModalTitle("Links: t021 - link gaps"));

  // Keyframe for Bundle Page Links.
  await sourceCommand(() => addKeyFrame(links));
  await sourceCommand(() => checkpoint("links modal showing t021 link gaps page"));

  void bigBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
