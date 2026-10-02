/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent, PreviewPublishModal } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, pendingSourceProposal, sourceReviewSensitivity, tracking, sensitive, filterSensitivity } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * Safe additions follow the saved tracking preference; directly sensitive and filter-sensitive
 * additions remain untracked. An individual opt-out survives preference toggles. All source material
 * is accepted, the ordinary Untracked filter finds the remaining choices, and preview warns about them.
 */
test('Sourcing shows provisional tracking preferences and permits untracked accepted additions', async ({ page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const filters = new FilterPanelComponent(page, expect);
  await list.goto();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  await filters.clickAddCustomFilter();
  await filters.fillAndSaveCustomFilter({ name: 'Policy drafts are sensitive', field: 'title', matchType: 'substring', value: 'Policy', markSensitive: true });
  await checkpoint('accepted sensitivity policy is ready before additions arrive');

  // --- Test start ---
  await sourceChanges.apply('add-review-pages', 'sourcing-review-data');
  await editor.checkSourceChanges();
  await sourcing.open();
  for (const name of ['Safe One', 'Safe Two']) {
    await sourcing.select(name);
    await expect(sourcing.selectedPage.getByText('Tracked', { exact: true })).toBeVisible();
  }
  for (const name of ['Secret', 'Policy Draft']) {
    await sourcing.select(name);
    await expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible();
    await expect(sourcing.selectedPage.getByText('Sensitive', { exact: true })).toBeVisible();
  }
  await addKeyFrame(sourceReviewSensitivity);
  await checkpoint('provisional tracking includes only safe additions under the current preference');
  await sourcing.select('Safe Two');
  await sourcing.untrackSelected();
  await sourcing.setTrackingPreference(false);
  await sourcing.select('Safe One');
  await expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible();
  await checkpoint('preference off removes the remaining automatic choice');
  await sourcing.setTrackingPreference(true);
  await sourcing.select('Safe One');
  await expect(sourcing.selectedPage.getByText('Tracked', { exact: true })).toBeVisible();
  await sourcing.select('Safe Two');
  await expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible();
  await checkpoint('preference on restores automatic tracking while preserving the explicit opt-out');
  await sourcing.accept();
  await editor.sourceReview.trackingNotice.expectSensitiveSkipped(2);
  await editor.sourceReview.trackingNotice.close();
  const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
  const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes;
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Safe One')).toBe(true);
  for (const name of ['Safe Two', 'Secret', 'Policy Draft']) expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === name)).toBe(false);
  await editor.switchToListView();
  await filters.enableAndSoloFilter('Untracked');
  for (const name of ['Safe Two', 'Secret', 'Policy Draft']) await editor.expectListViewRowByExactNamePresent(name);
  await editor.expectListViewRowByExactNameNotPresent('Safe One');
  await editor.clickPreview();
  const preview = new PreviewPublishModal(page, expect);
  await preview.waitForPreviewComplete();
  await checkpoint('accepted untracked additions remain visible through curation and the preview warning');
  await preview.closeModal();
  await assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl', 'bundles/sourcing-review/config/generated_bundle_versions.yaml', 'bundles/sourcing-review/build/', 'bundles/sourcing-review/html/', 'bundles/sourcing-review/raw/generation_inputs/', 'bundles/sourcing-review/raw/tracked_page_content/'], allowedModified: ['source_graphs/sourcing-review-data/Start.md'] });
});
