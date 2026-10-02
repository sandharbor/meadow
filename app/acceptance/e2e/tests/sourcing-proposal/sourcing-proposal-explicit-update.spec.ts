/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, pendingProposalRevalidation, sourceChangesDuringReview, pendingSourceProposal } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * Refresh after a tracked page loses its route. The proposal keeps a compatible untrack choice and
 * exposes the now-unavailable tracked target. A disconnected-source failure preserves that complete
 * proposal; the user can leave the unavailable page untracked and accept the reviewed capture.
 */
test('Updating a sourcing proposal preserves applicable decisions and exposes invalidated decisions', async ({ page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState, expectLogErrors }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
  const filename = path.join(directory, 'raw/sourcing/proposal.json');
  const proposal = () => JSON.parse(fs.readFileSync(filename, 'utf8'));
  await list.goto();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  await sourcing.open();
  await sourcing.select('Reference');
  await sourcing.untrackSelected();
  await sourcing.select('Leaf');
  await sourcing.untrackSelected();
  await sourcing.trackSelected();
  const captured = proposal().candidateSnapshotId;
  await checkpoint('the reviewed capture has explicit tracking and untracking choices');

  // --- Test start ---
  // Discovery announces newer material without replacing the capture or its decisions.
  await sourceChanges.apply('remove-leaf-link', 'sourcing-review-data');
  await sourcing.later();
  await editor.checkSourceChanges();
  await sourcing.open();
  await expect(sourcing.root.getByRole('status')).toContainText('Newer sources available');
  expect(proposal().candidateSnapshotId).toBe(captured);
  await checkpoint('newer sources are available while the reviewed capture remains unchanged');
  await sourcing.updateSources();
  expect(proposal().candidateSnapshotId).not.toBe(captured);
  expect(proposal().tracking['file:Routes/Reference.md']).toMatchObject({ track: false, origin: 'explicit' });
  expect(proposal().tracking['file:Leaf.md'].invalidated).toContain('no longer included');
  await expect(sourcing.root.getByRole('button', { name: 'Accept source changes', exact: true })).toBeDisabled();
  await sourcing.reviewTrackingChoices(1);
  await expect(sourcing.sensitivityReview).toContainText('This page is no longer included');
  await addKeyFrame(pendingProposalRevalidation);
  await checkpoint('the refreshed proposal retains the applicable choice and exposes the invalidated target');
  await sourcing.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click();

  // An unavailable source cannot replace the existing capture or any pending decisions.
  const beforeFailure = fs.readFileSync(filename, 'utf8');
  const source = path.join(testServer.sourceGraphsDir, 'sourcing-review-data');
  fs.renameSync(source, `${source}-unavailable`);
  const endExpectedErrors = expectLogErrors(/disconnected: its directory is unavailable|server responded with a status of 409/);
  try {
    await sourcing.root.getByRole('button', { name: 'Update sources', exact: true }).click();
    await expect(sourcing.root.getByRole('alert')).toContainText('disconnected');
    expect(fs.readFileSync(filename, 'utf8')).toBe(beforeFailure);
    await checkpoint('failed refresh keeps the complete proposal intact while its source is unavailable');
  } finally {
    fs.renameSync(`${source}-unavailable`, source);
    endExpectedErrors();
  }

  // Resolving the unavailable choice permits acceptance without silently restoring it.
  await sourcing.reviewTrackingChoices(1);
  await sourcing.resolveSensitiveTracking('Leaf.md', false);
  await sourcing.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click();
  await sourcing.accept();
  const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes;
  for (const name of ['Leaf', 'Reference']) expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === name)).toBe(false);
  expect(fs.existsSync(path.join(source, 'Leaf.md'))).toBe(true);
  await checkpoint('acceptance installs the refreshed scope and both resolved untrack choices');
  await assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'], allowedModified: ['source_graphs/sourcing-review-data/Start.md'] });
});
