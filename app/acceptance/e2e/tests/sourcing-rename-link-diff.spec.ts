/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { pageIdentityPanel, changesTray, exemplarySpec, sourceSnapshot, sourceContentChange, sourceReviewIdentity, sourceReviewWorkspace, scenarioSections, conceptText, conceptLink, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });

const name = linkedScenarioName(conceptText`Source review shows readable replacement phrases when an incoming link follows a renamed page`);
const description = linkedScenarioDescription(conceptText`Rename a source page and update its incoming link. After confirming the suggested match in ${conceptLink(sourceReviewIdentity.id, 'Source Review Identity')}, inspect the referring page's ${conceptLink(sourceContentChange.id, 'Source Content Change')} in ${conceptLink(sourceReviewWorkspace.id, 'Source Review Workspace')}. Its content comparison shows the old and new link text as removed and added phrases.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Start from an accepted ${conceptLink(sourceSnapshot.id, 'Source Snapshot')}, rename a linked page, and confirm the suggested match in ${conceptLink(sourceReviewIdentity.id, 'Source Review Identity')}.` },
  inspectLinkDiff: { type: 'test', text: conceptText`Open the referring page's ${conceptLink(sourceContentChange.id, 'Source Content Change')} comparison in ${conceptLink(sourceReviewWorkspace.id, 'Source Review Workspace')} and verify the old and new link text appears as readable replacement phrases.` },
});
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewWorkspace] });

test(name.name, { annotation: [{ type: 'scenario-id', description: '9a0b56cb-6d9d-461f-89c7-b3ef4abef8a0' }, { type: 'concept', description: exemplarySpec.id }, name.annotation, description.annotation, sections.annotation, areas.annotation] }, async ({ sourceCommand, page, sourceChanges, checkpoint, skipMeadowHomeStateCheck }) => {
  const { review } = await test.step(sections.steps.setup, async () => {
    await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.waitForSourceCheck());
    await sourceCommand(() => sourceChanges.apply('rename-page-with-links'));
    await sourceCommand(() => editor.checkSourceChanges());
    const review = editor.sourceReview;
    await sourceCommand(() => review.open());
    await sourceCommand(() => review.confirmSuggestedIdentities());
    await sourceCommand(() => review.continueToGraph());
    await sourceCommand(() => checkpoint(
      conceptText`The rename is confirmed in ${conceptLink(sourceReviewIdentity.id, 'Source Review Identity')} and the referring page is ready for content comparison.`,
      { keyFrames: [sourceReviewWorkspace] },
    ));
    return { review };
  });

  await test.step(sections.steps.inspectLinkDiff, async () => {
    await sourceCommand(() => review.expandDetails('t003 - link to section.md'));
    await sourceCommand(() => review.expectInlineChanges('t003 - link to section.md', ['page with section to link to'], ['renamed section page']));
    await sourceCommand(() => checkpoint(
      conceptText`The referring page's ${conceptLink(sourceContentChange.id, 'Source Content Change')} comparison shows the old and new link text as removed and added phrases.`,
      { keyFrames: [sourceContentChange] },
    ));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
