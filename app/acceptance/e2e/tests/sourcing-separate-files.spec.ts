/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { scenarioSections, exemplarySpec, orphan, conceptText, conceptLink, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, sourceReviewIdentity, sourceIdentityMatching, manuallyOverrideSourceIdentityMatching, treatAsDifferentPages } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

const originalTitle = 't003 ---- page with section to link to';
const renamedTitle = 't003 ---- renamed section page';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Sourcing treats a rejected rename as different pages and removes the old configuration on acceptance`);

const description = linkedScenarioDescription(conceptText`${conceptLink(manuallyOverrideSourceIdentityMatching.id, 'Manually override source identity matching')} by choosing to ${conceptLink(treatAsDifferentPages.id, 'treat the files as different pages')}. Acceptance removes the old configuration and admits the renamed destination as a new page.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: the accepted source state is established before changing files.` },
  rejectSuggestedMatch: { type: 'test', text: conceptText`Rename the page and its links, and ${conceptLink(manuallyOverrideSourceIdentityMatching.id, 'manually override source identity matching')} to ${conceptLink(treatAsDifferentPages.id, 'treat them as different pages')}.` },
  acceptSeparatePages: { type: 'test', text: conceptText`Accept the update: remove the old configuration and admit the renamed destination as a new page.` },
});
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewIdentity] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '30c13a6a-547f-4c87-ac13-cc68a5a6592a' }, { type: 'concept', description: exemplarySpec.id }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const { editor, bundleConfig, original } = await test.step(sections.steps.setup, async () => {
    await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.waitForSourceCheck());
    const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'meadow-test-bundle-big', expect);
    const original = bundleConfig.requireNode({ bundleNodeName: originalTitle });
    await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));
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
      conceptText`${conceptLink(treatAsDifferentPages.id, 'Different pages')} shows the previous route and proposes removing the ${conceptLink(orphan.id, 'orphaned configuration')}.`,
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
      conceptText`Acceptance removes the old configuration and admits the renamed destination as a new page.`,
      { keyFrames: [treatAsDifferentPages] },
    ));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
