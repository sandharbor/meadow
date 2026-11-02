/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { scenarioSections, exemplarySpec, orphan, conceptText, conceptLink, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, sourceSnapshot, bundleConfig as bundleNodeConfiguration, sourceReviewIdentity, sourceIdentityMatching, manuallyOverrideSourceIdentityMatching, treatAsDifferentPages, sourceReviewAcceptance, sourceReviewCleanup } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

const originalTitle = 't003 ---- page with section to link to';
const renamedTitle = 't003 ---- renamed section page';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Rejecting a suggested rename keeps the pages separate and removes the old page's configuration on acceptance`);

const description = linkedScenarioDescription(conceptText`Rename a configured source page and update its incoming link. ${conceptLink(sourceIdentityMatching.id, 'Source Identity Matching')} suggests Same file. Choose New file to ${conceptLink(manuallyOverrideSourceIdentityMatching.id, 'Manually Override Source Identity Matching')} and ${conceptLink(treatAsDifferentPages.id, 'Treat as Different Pages')}. The original page's saved configuration stays unchanged while the decision is pending. ${conceptLink(sourceReviewAcceptance.id, 'Proposal Acceptance')} removes the old configuration and makes the renamed page available in the bundle.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Open a bundle with an accepted ${conceptLink(sourceSnapshot.id, 'Source Snapshot')} and saved ${conceptLink(bundleNodeConfiguration.id, 'Bundle Node Configuration')} for the page that will be renamed.` },
  rejectSuggestedMatch: { type: 'test', text: conceptText`Rename the page and update its incoming link. ${conceptLink(manuallyOverrideSourceIdentityMatching.id, 'Manually Override Source Identity Matching')} by choosing New file to ${conceptLink(treatAsDifferentPages.id, 'Treat as Different Pages')}; the original page's saved configuration remains unchanged.` },
  acceptSeparatePages: { type: 'test', text: conceptText`Accept the changes: ${conceptLink(sourceReviewCleanup.id, 'Accepted Scope Cleanup')} removes the old page's saved configuration, and the renamed page appears in the bundle.` },
});
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewIdentity] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '30c13a6a-547f-4c87-ac13-cc68a5a6592a' }, { type: 'concept', description: exemplarySpec.id }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const { editor, bundleConfig, original } = await test.step(sections.steps.setup, async () => {
    await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.waitForSourceCheck());
    const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'meadow-test-bundle-big', expect);
    const original = bundleConfig.requireNode({ bundleNodeName: originalTitle });
    await sourceCommand(() => checkpoint(conceptText`The original page has saved ${conceptLink(bundleNodeConfiguration.id, 'Bundle Node Configuration')} in the accepted bundle.`));
    return { editor, bundleConfig, original };
  });

  const { review } = await test.step(sections.steps.rejectSuggestedMatch, async () => {
    await sourceCommand(() => sourceChanges.apply('rename-page-with-links'));
    await sourceCommand(() => editor.checkSourceChanges());
    const review = editor.sourceReview;
    await sourceCommand(() => review.open());
    const rename = await sourceCommand(() => review.moveFrom(`${originalTitle}.md`));
    await sourceCommand(() => rename.expectSamePageSelected());
    await sourceCommand(() => addKeyFrame(sourceIdentityMatching));
    await sourceCommand(() => rename.keepSeparate());
    await sourceCommand(() => rename.showDifferentHelp());
    await sourceCommand(() => rename.expectPreviousRoute('t003 - link to section.md'));
    expect(bundleConfig.findNode({ bundleNodeId: original.bundleNodeId })).toEqual(original);
    await sourceCommand(() => checkpoint(
      conceptText`New file is selected for ${conceptLink(treatAsDifferentPages.id, 'Treat as Different Pages')}. Review shows the previous route and explains that acceptance removes the old page's configuration; its saved configuration remains unchanged.`,
      { keyFrames: [treatAsDifferentPages, orphan] },
    ));
    return { review };
  });

  await test.step(sections.steps.acceptSeparatePages, async () => {
    await sourceCommand(() => review.accept());
    expect(bundleConfig.findNode({ bundleNodeId: original.bundleNodeId })).toBeUndefined();
    await sourceCommand(() => editor.expectSourceOrphanCount(0));
    await sourceCommand(() => expect(page.getByRole('button', { name: 'Refresh sources', exact: true })).toBeVisible());
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => editor.expectListViewRowByExactNamePresent(renamedTitle));
    await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent(originalTitle));
    await sourceCommand(() => checkpoint(
      conceptText`${conceptLink(sourceReviewAcceptance.id, 'Proposal Acceptance')} removes the original page's saved configuration and leaves no ${conceptLink(orphan.id, 'Orphaned Configuration')} entries. The renamed page is listed in the bundle and the original name is absent.`,
      { keyFrames: [treatAsDifferentPages] },
    ));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
