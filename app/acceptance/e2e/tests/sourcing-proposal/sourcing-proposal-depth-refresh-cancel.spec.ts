/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewTrigger, pendingProposalRevalidation, sourceChangesDuringReview, overrides } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.Example });

/*
 * Stage an untrack decision, then change live links behind a traversal stop. Increasing depth asks
 * whether to incorporate that newer material. Cancel and check that the captured identity, displayed
 * bytes, depth, and existing tracking choice remain unchanged, including after Later and reopening.
 */
test('Cancelling a depth change that needs newer sources preserves the reviewed proposal', { annotation: { type: 'scenario-id', description: 'aac78272-d544-432b-ad5d-9945ba2c6515' } }, async ({ sourceCommand, page, sourceChanges, testServer, checkpoint, addKeyFrame, assertMeadowHomeState, expectLogErrors }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'example-bundle');
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('example-bundle'));
  await sourceCommand(() => editor.waitForLoad('example-bundle'));
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => sourcing.select('Inversion'));
  await sourceCommand(() => sourcing.untrackSelected());
  await sourceCommand(() => sourcing.select('Cognitive Biases'));
  const before = proposal.current;
  await sourceCommand(() => checkpoint('the reviewed capture retains its depth stop and a staged untrack choice'));

  // --- Test start ---
  // Changing live links must not be silently folded into a depth edit.
  await sourceCommand(() => sourceChanges.apply('redirect-biases-link', 'example-bundle-data'));
  const endConsentErrors = expectLogErrors(/This boundary change needs newer source material|server responded with a status of 409/);
  await sourceCommand(() => sourcing.setSelectedOutlinkDepth(1));
  const confirmation = page.getByRole('dialog', { name: 'Update sources for this change?', exact: true });
  await sourceCommand(() => expect(confirmation).toBeVisible());
  endConsentErrors();
  await sourceCommand(() => expect(confirmation).toContainText('Newer source material is available'));
  expect(proposal.current.candidateSnapshotId).toBe(before.candidateSnapshotId);
  expect(proposal.current.proposed).toEqual(before.proposed);
  await sourceCommand(() => addKeyFrame(sourceChangesDuringReview));
  await sourceCommand(() => checkpoint('the depth refresh confirmation is open with the original proposal preserved'));

  // Cancel preserves the old capture and the displayed depth as well as the durable draft.
  await sourceCommand(() => confirmation.getByRole('button', { name: 'Cancel', exact: true }).click());
  await sourceCommand(() => expect(confirmation).toBeHidden());
  expect(proposal.current.proposed).toEqual(before.proposed);
  expect(proposal.current.tracking).toEqual(before.tracking);
  await sourceCommand(() => sourcing.select('Inversion'));
  await sourceCommand(() => expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible());
  await sourceCommand(() => sourcing.compare('Cognitive Biases'));
  await sourceCommand(() => sourcing.comparison.getByRole('button', { name: 'Expand all', exact: true }).click());
  await sourceCommand(() => expect(sourcing.comparison).toContainText('[[Availability Bias]]'));
  await sourceCommand(() => expect(sourcing.comparison).toContainText('No content changes'));
  await sourceCommand(() => sourcing.closeComparison());
  await sourceCommand(() => sourcing.later());
  await sourceCommand(() => sourcing.open());
  expect(proposal.current.candidateSnapshotId).toBe(before.candidateSnapshotId);
  expect(proposal.current.proposed).toEqual(before.proposed);
  expect(proposal.current.tracking).toEqual(before.tracking);
  await sourceCommand(() => checkpoint('cancelled depth and the earlier untrack decision survive deferral'));

  // The pending proposal and the two external source edits intentionally remain for manual review.
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: [proposal.relativePath, 'source_graphs/.source-changes.jsonl'],
    allowedModified: ['source_graphs/example-bundle-data/Cognitive Biases.md', 'source_graphs/example-bundle-data/Confirmation Bias.md'] }));
});
