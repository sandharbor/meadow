/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent, PreviewPublishModal } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, pendingSourceProposal, sourceReviewSensitivity, tracking, sensitive, filterSensitivity, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Sourcing starts additions untracked and preserves explicit selection tracking`);

const description = linkedScenarioDescription(conceptText`All additions start untracked, including safe and sensitive pages. Explicit tracking
and untracking use the ordinary selection controls and survive refresh. All source material
is accepted, the ordinary Untracked filter finds the remaining choices, and preview warns about them.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '33353032-44bd-4d0e-a8e8-e43617f5628f' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const filters = new FilterPanelComponent(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => filters.clickAddCustomFilter());
  await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Policy drafts are sensitive', field: 'title', matchType: 'substring', value: 'Policy', markSensitive: true }));
  await sourceCommand(() => checkpoint('accepted sensitivity policy is ready before additions arrive'));

  // --- Test start ---
  await sourceCommand(() => sourceChanges.apply('add-review-pages', 'sourcing-review-data'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => sourcing.open());
  for (const name of ['Safe One', 'Safe Two']) {
    await sourceCommand(() => sourcing.select(name));
    await sourceCommand(() => expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible());
  }
  for (const name of ['Secret', 'Policy Draft']) {
    await sourceCommand(() => sourcing.select(name));
    await sourceCommand(() => expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible());
    await sourceCommand(() => expect(sourcing.selectedPage.getByText('Sensitive', { exact: true })).toBeVisible());
  }
  await sourceCommand(() => sourcing.expectNoAutomaticTrackingOption());
  await sourceCommand(() => filters.enableAndSoloFilter('Untracked'));
  for (const name of ['Safe One', 'Safe Two', 'Secret', 'Policy Draft']) await sourceCommand(() => editor.expectListViewRowByExactNamePresent(name));
  await sourceCommand(() => addKeyFrame(sourceReviewSensitivity));
  await sourceCommand(() => checkpoint('all additions start untracked and can be reviewed through the ordinary filter'));

  // Track one inspected page and leave the others untracked.
  await sourceCommand(() => sourcing.select('Safe One'));
  await sourceCommand(() => sourcing.trackSelected());
  await sourceCommand(() => filters.clickSoloOnFilter('Untracked'));
  await sourceCommand(() => sourcing.select('Safe Two'));
  await sourceCommand(() => sourcing.trackSelected());
  await sourceCommand(() => sourcing.untrackSelected());
  await sourceCommand(() => sourcing.updateSources());
  await sourceCommand(() => sourcing.select('Safe One'));
  await sourceCommand(() => expect(sourcing.selectedPage.getByText('Tracked', { exact: true })).toBeVisible());
  await sourceCommand(() => sourcing.select('Safe Two'));
  await sourceCommand(() => expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible());
  await sourceCommand(() => checkpoint('explicit tracking choices survive refresh without automatic tracking'));
  await sourceCommand(() => sourcing.accept());
  const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
  const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes;
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Safe One')).toBe(true);
  for (const name of ['Safe Two', 'Secret', 'Policy Draft']) expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === name)).toBe(false);
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => filters.enableAndSoloFilter('Untracked'));
  for (const name of ['Safe Two', 'Secret', 'Policy Draft']) await sourceCommand(() => editor.expectListViewRowByExactNamePresent(name));
  await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent('Safe One'));
  await sourceCommand(() => editor.clickPreview());
  const preview = new PreviewPublishModal(page, expect);
  await sourceCommand(() => preview.waitForPreviewComplete());
  await sourceCommand(() => checkpoint('accepted untracked additions remain visible through curation and the preview warning'));
  await sourceCommand(() => preview.closeModal());
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl', 'bundles/sourcing-review/config/generated_bundle_versions.yaml', 'bundles/sourcing-review/build/', 'bundles/sourcing-review/html/', 'bundles/sourcing-review/raw/generation_inputs/', 'bundles/sourcing-review/raw/tracked_page_content/'], allowedModified: ['source_graphs/sourcing-review-data/Start.md'] }));
});
