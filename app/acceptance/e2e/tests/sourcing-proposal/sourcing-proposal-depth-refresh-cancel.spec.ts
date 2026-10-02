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
test('Cancelling a depth change that needs newer sources preserves the reviewed proposal', async ({ page, sourceChanges, testServer, checkpoint, addKeyFrame, assertMeadowHomeState, expectLogErrors }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'example-bundle');
  await list.goto();
  await list.clickBundle('example-bundle');
  await editor.waitForLoad('example-bundle');
  await sourcing.open();
  await sourcing.select('Inversion');
  await sourcing.untrackSelected();
  await sourcing.select('Cognitive Biases');
  const before = proposal.current;
  await checkpoint('the reviewed capture retains its depth stop and a staged untrack choice');

  // --- Test start ---
  // Changing live links must not be silently folded into a depth edit.
  await sourceChanges.apply('redirect-biases-link', 'example-bundle-data');
  const endConsentErrors = expectLogErrors(/This boundary change needs newer source material|server responded with a status of 409/);
  await sourcing.setSelectedOutlinkDepth(1);
  const confirmation = page.getByRole('dialog', { name: 'Update sources for this change?', exact: true });
  await expect(confirmation).toBeVisible();
  endConsentErrors();
  await expect(confirmation).toContainText('Newer source material is available');
  expect(proposal.current.candidateSnapshotId).toBe(before.candidateSnapshotId);
  expect(proposal.current.proposed).toEqual(before.proposed);
  await addKeyFrame(sourceChangesDuringReview);
  await checkpoint('the depth refresh confirmation is open with the original proposal preserved');

  // Cancel preserves the old capture and the displayed depth as well as the durable draft.
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(confirmation).toBeHidden();
  expect(proposal.current.proposed).toEqual(before.proposed);
  expect(proposal.current.tracking).toEqual(before.tracking);
  await sourcing.select('Inversion');
  await expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible();
  await sourcing.compare('Cognitive Biases');
  await sourcing.comparison.getByRole('button', { name: 'Expand all', exact: true }).click();
  await expect(sourcing.comparison).toContainText('[[Availability Bias]]');
  await expect(sourcing.comparison).toContainText('No content changes');
  await sourcing.closeComparison();
  await sourcing.later();
  await sourcing.open();
  expect(proposal.current.candidateSnapshotId).toBe(before.candidateSnapshotId);
  expect(proposal.current.proposed).toEqual(before.proposed);
  expect(proposal.current.tracking).toEqual(before.tracking);
  await checkpoint('cancelled depth and the earlier untrack decision survive deferral');

  // The pending proposal and the two external source edits intentionally remain for manual review.
  await assertMeadowHomeState({ allowedUntracked: [proposal.relativePath, 'source_graphs/.source-changes.jsonl'],
    allowedModified: ['source_graphs/example-bundle-data/Cognitive Biases.md', 'source_graphs/example-bundle-data/Confirmation Bias.md'] });
});
