/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent, PreviewPublishModal } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewWorkspace, sourceReviewTrigger, frontier, sourceSnapshot } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.Example });

/*
 * With no external changes, sourcing explores live frontier beyond its captured boundary. Increasing
 * traversal captures those pages into the proposal. Later preserves accepted curation and generation;
 * accepting admits the new material and returns to curation without frontier exploration controls.
 */
test('Sourcing explores the frontier without changing accepted material until acceptance', async ({ page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const filters = new FilterPanelComponent(page, expect);
  const preview = new PreviewPublishModal(page, expect);
  await list.goto();
  await list.clickBundle('example-bundle');
  await editor.waitForLoad('example-bundle');
  const directory = path.join(testServer.configDir, 'bundles/example-bundle');
  const accepted = JSON.parse(fs.readFileSync(path.join(directory, 'raw/sourcing/state.json'), 'utf8')).acceptedId;
  await expect(page.getByRole('checkbox', { name: 'Frontier', exact: true })).toHaveCount(0);
  await sourcing.open();
  await checkpoint('sourcing opens for exploration without pending external source changes');

  // --- Test start ---
  await filters.enableFilter('Frontier');
  await sourcing.select('Availability Bias');
  await expect(sourcing.evidence).toContainText('Live frontier beyond the proposed scope');
  await expect(sourcing.root.getByRole('button', { name: 'Compare captured content', exact: true })).toHaveCount(0);
  await addKeyFrame(frontier);
  await checkpoint('boundary exploration shows live frontier separately from captured candidate material');
  await sourcing.select('Cognitive Biases');
  await sourcing.setSelectedOutlinkDepth(1);
  await sourcing.select('Availability Bias');
  await expect(sourcing.evidence).toContainText('Newly included');
  await expect(sourcing.root.getByRole('button', { name: 'Compare captured content', exact: true })).toBeVisible();
  await checkpoint('the traversal edit captures the formerly frontier page into the pending proposal');
  await sourcing.later();
  await editor.switchToListView();
  await editor.expectListViewRowByExactNameNotPresent('Availability Bias');
  expect(JSON.parse(fs.readFileSync(path.join(directory, 'raw/sourcing/state.json'), 'utf8')).acceptedId).toBe(accepted);
  await editor.clickPreview();
  await preview.waitForPreviewComplete();
  expect(fs.existsSync(path.join(directory, 'raw/tracked_page_content/Availability Bias.md'))).toBe(false);
  await checkpoint('deferred curation and generated material still use the original accepted scope');
  await preview.closeModal();
  await sourcing.open();
  await sourcing.select('Availability Bias');
  await expect(sourcing.evidence).toContainText('Newly included');
  await sourcing.accept();
  await editor.switchToListView();
  await editor.expectListViewRowByExactNamePresent('Availability Bias');
  await expect(page.getByRole('checkbox', { name: 'Frontier', exact: true })).toHaveCount(0);
  await editor.clickPreview();
  await preview.waitForPreviewComplete();
  expect(fs.existsSync(path.join(directory, 'raw/tracked_page_content/Availability Bias.md'))).toBe(true);
  await checkpoint('accepted expansion generates the newly admitted page and curation keeps its accepted context');
  await preview.closeModal();
  await assertMeadowHomeState({ allowedUntracked: ['bundles/example-bundle/build/', 'bundles/example-bundle/html/', 'bundles/example-bundle/raw/generation_inputs/', 'bundles/example-bundle/raw/tracked_page_content/'] });
});
