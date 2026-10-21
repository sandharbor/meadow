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
import { scenarioSections, sourceGraphSearch, labels, linkGap, callout, links, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleCuration } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`sourceGraphSearch for outlink gap page, inspect links, and navigate via inlink`);

const description = linkedScenarioDescription(conceptText`Search for a page with an outgoing-link gap and inspect its links. Follow an incoming
link to verify navigation to the related page.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: bundle editor loaded.` },
  searchForOutlinkGapPage: { type: 'test', text: conceptText`Search for the outlink-gap page.` },
  inspectSearchResultInListView: { type: 'test', text: conceptText`Inspect the search result in list view.` },
  selectMatchingPage: { type: 'test', text: conceptText`Select the matching page.` },
  clickRowSelectIt: { type: 'test', text: conceptText`Click the row to select it` },
  openDetails: { type: 'test', text: conceptText`Open its details.` },
  inspectLinks: { type: 'test', text: conceptText`Inspect its links.` },
  checkOutgoingLinkStates: { type: 'test', text: conceptText`Check the outgoing link states.` },
  thereShouldBeOutlinksAreNotIn: { type: 'test', text: conceptText`There should be outlinks that are not in the graph` },
  keyframeForLinkGapShowsOutlinksGap: { type: 'test', text: conceptText`Keyframe for link-gap — shows the outlinks with gap indicators` },
  readDepthExplanation: { type: 'test', text: conceptText`Read the depth explanation.` },
  expectTooltipSayTargetPageBeyondOutlinks: { type: 'test', text: conceptText`Expect the tooltip to say the target page is beyond outlinks depth` },
  followIncomingLink: { type: 'test', text: conceptText`Follow an incoming link.` },
  checkLinkedPageTitle: { type: 'test', text: conceptText`Check the linked page title.` },
  keyframeForBundlePageLinks: { type: 'test', text: conceptText`Keyframe for Bundle Page Links.` },
});
const areas = scenarioAreas([bundleCuration]);
test(name.name, { annotation: [{ type: 'scenario-id', description: '5d8213b4-06da-47eb-a6a1-a88f6f18fe4f' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  await test.step(sections.steps.setup, async () => {
    const wf = new Workflows(page, expect);
    await sourceCommand(() => wf.navigateToBigBundle());
    await sourceCommand(() => checkpoint("bundle editor loaded"));
  });

  await test.step(sections.steps.searchForOutlinkGapPage, async () => {
    const filterPanel = new FilterPanelComponent(page, expect);
    await sourceCommand(() => filterPanel.fillSearch("outlink gap"));
    await sourceCommand(() => page.waitForTimeout(500));
    await sourceCommand(() => addKeyFrame(sourceGraphSearch));
    await sourceCommand(() => addKeyFrame(labels));
    await sourceCommand(() => checkpoint("searched for outlink gap"));
  });

  const { editor } = await test.step(sections.steps.inspectSearchResultInListView, async () => {
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => page.waitForTimeout(250));
    await sourceCommand(() => checkpoint("list view with sourceGraphSearch results"));
    return { editor };
  });

  await test.step(sections.steps.selectMatchingPage, async () => {
    const listCount = await sourceCommand(() => editor.getListViewPageCount());
    expect(listCount).toBe(1);
  });

  await test.step(sections.steps.clickRowSelectIt, async () => {
    await sourceCommand(() => editor.clickListViewRow(0));
    await sourceCommand(() => page.waitForTimeout(250));
    await sourceCommand(() => checkpoint("outlink gap page selected"));
  });

  const { detail } = await test.step(sections.steps.openDetails, async () => {
    const selectedPageRoot = editor.getSelectedPageRoot();
    const detail = new SelectedPageDetailComponent(selectedPageRoot, expect);
    await sourceCommand(() => detail.openDetails());
    await sourceCommand(() => detail.expectFolder('t021'));
    await sourceCommand(() => page.waitForTimeout(250));
    await sourceCommand(() => checkpoint("details opened for outlink gap page"));
    return { detail };
  });

  await test.step(sections.steps.inspectLinks, async () => {
    await sourceCommand(() => detail.clickShowLinks());
    await sourceCommand(() => page.waitForTimeout(250));
    await sourceCommand(() => checkpoint("links modal open"));
  });

  const { linksModal } = await test.step(sections.steps.checkOutgoingLinkStates, async () => {
    const linksModal = new LinksModal(page, expect);
    await sourceCommand(() => linksModal.expectModalTitle("Links: t021 ---- outlink gap"));
    return { linksModal };
  });

  await test.step(sections.steps.thereShouldBeOutlinksAreNotIn, async () => {
    await sourceCommand(() => linksModal.expectNotInGraphVisible());
  });

  await test.step(sections.steps.keyframeForLinkGapShowsOutlinksGap, async () => {
    await sourceCommand(() => addKeyFrame(linkGap));
    await sourceCommand(() => checkpoint("outlink gap links visible"));
  });

  await test.step(sections.steps.readDepthExplanation, async () => {
    await sourceCommand(() => linksModal.hoverInfoIcon());
    await sourceCommand(() => page.waitForTimeout(250));
  });

  await test.step(sections.steps.expectTooltipSayTargetPageBeyondOutlinks, async () => {
    await sourceCommand(() => linksModal.expectBeyondOutlinksDepthTooltip());
    await sourceCommand(() => addKeyFrame(callout));
    await sourceCommand(() => checkpoint("tooltip showing beyond outlinks depth"));
  });

  await test.step(sections.steps.followIncomingLink, async () => {
    await sourceCommand(() => linksModal.clickInlinkLinks("t021 - link gaps"));
    await sourceCommand(() => page.waitForTimeout(250));
    await sourceCommand(() => checkpoint("navigated to inlink page links"));
  });

  await test.step(sections.steps.checkLinkedPageTitle, async () => {
    await sourceCommand(() => linksModal.expectModalTitle("Links: t021 - link gaps"));
  });

  await test.step(sections.steps.keyframeForBundlePageLinks, async () => {
    await sourceCommand(() => addKeyFrame(links));
    await sourceCommand(() => checkpoint("links modal showing t021 link gaps page"));
  });

  void bigBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
