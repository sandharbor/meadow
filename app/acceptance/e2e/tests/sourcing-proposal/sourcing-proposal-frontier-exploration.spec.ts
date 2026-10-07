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
test('Sourcing explores the frontier without changing accepted material until acceptance', { annotation: { type: 'scenario-id', description: 'add4249e-bd6a-4747-8995-e8600181e8d1' } }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const filters = new FilterPanelComponent(page, expect);
  const preview = new PreviewPublishModal(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('example-bundle'));
  await sourceCommand(() => editor.waitForLoad('example-bundle'));
  const directory = path.join(testServer.configDir, 'bundles/example-bundle');
  const accepted = JSON.parse(fs.readFileSync(path.join(directory, 'raw/sourcing/state.json'), 'utf8')).acceptedId;
  await sourceCommand(() => expect(page.getByRole('checkbox', { name: 'Frontier', exact: true })).toHaveCount(0));
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => checkpoint('sourcing opens for exploration without pending external source changes'));

  // --- Test start ---
  await sourceCommand(() => filters.enableFilter('Frontier'));
  await sourceCommand(() => sourcing.select('Availability Bias'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('Live frontier beyond the proposed scope'));
  await sourceCommand(() => expect(sourcing.root.getByRole('button', { name: 'See content', exact: true })).toHaveCount(0));
  await sourceCommand(() => addKeyFrame(frontier));
  await sourceCommand(() => checkpoint('boundary exploration shows live frontier separately from captured candidate material'));
  await sourceCommand(() => sourcing.select('Cognitive Biases'));
  await sourceCommand(() => sourcing.setSelectedOutlinkDepth(1));
  await sourceCommand(() => sourcing.select('Availability Bias'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('Change: Added'));
  await sourceCommand(() => expect(sourcing.root.getByRole('button', { name: 'See content', exact: true })).toBeVisible());
  await sourceCommand(() => expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible());
  await sourceCommand(() => sourcing.trackSelected());
  await sourceCommand(() => checkpoint('the traversal edit captures the frontier page and explicit tracking prepares it for generation'));
  await sourceCommand(() => sourcing.later());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent('Availability Bias'));
  expect(JSON.parse(fs.readFileSync(path.join(directory, 'raw/sourcing/state.json'), 'utf8')).acceptedId).toBe(accepted);
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => preview.waitForPreviewComplete());
  expect(fs.existsSync(path.join(directory, 'raw/tracked_page_content/Availability Bias.md'))).toBe(false);
  await sourceCommand(() => checkpoint('deferred curation and generated material still use the original accepted scope'));
  await sourceCommand(() => preview.closeModal());
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => sourcing.select('Availability Bias'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('Change: Added'));
  await sourceCommand(() => sourcing.accept());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent('Availability Bias'));
  await sourceCommand(() => expect(page.getByRole('checkbox', { name: 'Frontier', exact: true })).toHaveCount(0));
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => preview.waitForPreviewComplete());
  expect(fs.existsSync(path.join(directory, 'raw/tracked_page_content/Availability Bias.md'))).toBe(true);
  await sourceCommand(() => checkpoint('accepted expansion generates the newly admitted page and curation keeps its accepted context'));
  await sourceCommand(() => preview.closeModal());
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['bundles/example-bundle/build/', 'bundles/example-bundle/html/', 'bundles/example-bundle/raw/generation_inputs/', 'bundles/example-bundle/raw/tracked_page_content/'] }));
});
