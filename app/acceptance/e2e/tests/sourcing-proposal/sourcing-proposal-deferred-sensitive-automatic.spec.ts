/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, pendingProposalRevalidation, sourceReviewSensitivity, sensitive, filterSensitivity, tracking } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * Defer a proposal, change accepted sensitivity policy, and reopen the same capture. Automatic choices become untracked without requiring explicit confirmation.
 * Checkpoints preserve the pending decisions and their current sensitivity evidence.
 */
test('Deferred proposals untrack automatic choices when accepted sensitivity policy changes', async ({ page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const filters = new FilterPanelComponent(page, expect);
  const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
  const proposal = () => JSON.parse(fs.readFileSync(path.join(directory, 'raw/sourcing/proposal.json'), 'utf8'));
  await list.goto();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  await sourceChanges.apply('add-review-pages', 'sourcing-review-data');
  await editor.checkSourceChanges();
  await sourcing.open();
  for (const name of ['Safe One', 'Safe Two']) {
    await sourcing.select(name);
    await expect(sourcing.selectedPage.getByText('Tracked', { exact: true })).toBeVisible();
  }
  for (const name of ['Safe One', 'Safe Two']) expect(proposal().tracking[`file:Additions/${name}.md`]).toMatchObject({ track: true, origin: 'automatic' });
  const captured = proposal().candidateSnapshotId;
  await checkpoint('safe additions have pending automatic tracking choices');

  // --- Test start ---
  // Reopening must assess saved policy against the original capture.
  await sourcing.later();
  await filters.clickAddCustomFilter();
  await filters.fillAndSaveCustomFilter({ name: 'Restricted review material', field: 'title', matchType: 'substring', value: 'Safe', markSensitive: true, scope: 'bundle' });
  await checkpoint('accepted bundle sensitivity policy changes while the proposal is deferred');
  await page.reload();
  await editor.waitForLoad('sourcing-review');
  await sourcing.open();
  expect(proposal().candidateSnapshotId).toBe(captured);
  for (const name of ['Safe One', 'Safe Two']) {
    await sourcing.select(name);
    await expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible();
    await expect(sourcing.selectedPage.getByText('Sensitive', { exact: true })).toBeVisible();
    expect(proposal().tracking[`file:Additions/${name}.md`]).toMatchObject({ track: false, origin: 'automatic' });
    expect(proposal().tracking[`file:Additions/${name}.md`].needsConfirmation).not.toBe(true);
  }
  await expect(sourcing.root.getByRole('button', { name: /Review .* tracking choices/ })).toHaveCount(0);
  await addKeyFrame(sourceReviewSensitivity);
  await checkpoint('sensitive additions are untracked without an explicit-choice confirmation');
  await sourcing.accept();
  await editor.sourceReview.trackingNotice.expectSensitiveSkipped(3);
  await editor.sourceReview.trackingNotice.close();
  const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes;
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Safe One')).toBe(false);
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Safe Two')).toBe(false);
  await editor.switchToListView();
  await editor.expectListViewRowByExactNamePresent('Safe One');
  await editor.expectListViewRowByExactNamePresent('Safe Two');
  await filters.expectFilterVisible('Restricted review material');
  await checkpoint('accepted curation contains the reviewed material and the resolved tracking choices');
  await assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'], allowedModified: ['source_graphs/sourcing-review-data/Start.md'] });
});
