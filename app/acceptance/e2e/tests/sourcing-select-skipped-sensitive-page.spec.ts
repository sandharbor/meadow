/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Fixture, Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { SourcingProposalState } from '../src/run/state/SourcingProposalState.js';
import { trackAddedPages, changesTray, exemplarySpec, sourceSensitivity, sourceReviewWorkspace, trackingChangesPanel, scenarioSections, conceptText, conceptLink, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Selecting a skipped sensitive addition selects only that page for review`);
const description = linkedScenarioDescription(conceptText`Open ${conceptLink(sourceReviewWorkspace.id, 'Source Review Workspace')} with an addition carrying ${conceptLink(sourceSensitivity.id, 'Source-Marked Sensitivity')} skipped by automatic tracking. Select it from the ${conceptLink(trackingChangesPanel.id, 'Tracking Changes Panel')} in the ${conceptLink(changesTray.id, 'Changes Tray')} and verify that only that page is selected for inspection.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Open review with an addition carrying ${conceptLink(sourceSensitivity.id, 'Source-Marked Sensitivity')} listed as skipped by automatic tracking.` },
  selectSkippedPage: { type: 'test', text: conceptText`Select the skipped page from the ${conceptLink(trackingChangesPanel.id, 'Tracking Changes Panel')}. ${conceptLink(sourceReviewWorkspace.id, 'Source Review Workspace')} shows that page as the only selection.` },
});
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewWorkspace] });

test(name.name, { annotation: [{ type: 'scenario-id', description: 'e15f0d92-ae5d-4b83-9718-b6ac64e20713' }, { type: 'concept', description: exemplarySpec.id }, name.annotation, description.annotation, sections.annotation, areas.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, assertMeadowHomeState }) => {
  const { review } = await test.step(sections.steps.setup, async () => {
    await sourceCommand(() => new Workflows(page, expect).navigateToSourcingReviewBundle());
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.waitForSourceCheck());
    await sourceCommand(() => sourceChanges.apply('add-review-pages', 'sourcing-review-data'));
    await sourceCommand(() => editor.checkSourceChanges());
    const review = editor.sourceReview;
    await sourceCommand(() => review.open());
    await sourceCommand(() => review.expectTrackAdditions(true));
    await sourceCommand(() => review.expectSensitiveSkippedPages(['Secret']));
    await sourceCommand(() => checkpoint(
      conceptText`The addition carrying ${conceptLink(sourceSensitivity.id, 'Source-Marked Sensitivity')} is available in the sensitive-skipped list.`,
      { keyFrames: [sourceSensitivity] },
    ));
    return { review };
  });

  await test.step(sections.steps.selectSkippedPage, async () => {
    await sourceCommand(() => review.selectSensitiveSkippedPage('Secret'));
    await sourceCommand(() => checkpoint(
      conceptText`${conceptLink(sourceReviewWorkspace.id, 'Source Review Workspace')} shows only the page selected from the sensitive-skipped list.`,
      { keyFrames: [sourceReviewWorkspace] },
    ));
  });

  // This inspection scenario intentionally finishes with the reviewed proposal pending.
  const proposal = new SourcingProposalState(testServer, 'sourcing-review');
  await sourceCommand(() => assertMeadowHomeState({
    allowedUntracked: ['source_graphs/.source-changes.jsonl', proposal.relativePath,
      `bundles/sourcing-review/raw/sourcing/snapshots/${proposal.current.candidateSnapshotId}/`],
    allowedModified: ['source_graphs/sourcing-review-data/Start.md', 'bundles/sourcing-review/raw/sourcing/state.json'],
  }));
});
