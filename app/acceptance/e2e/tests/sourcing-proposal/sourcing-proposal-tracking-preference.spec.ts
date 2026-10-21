/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent, PreviewPublishModal } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, pendingSourceProposal, sourceReviewSensitivity, tracking, sensitive, sourceSensitivity, filterSensitivity, conceptText, conceptLink, linkedScenarioName, linkedScenarioDescription, scenarioSections, scenarioAreas, bundleSourcing, sourceReviewWorkspace } from '../../../../concepts/index.js';
import { scenarioDesignPressures, preventAccidentalSharing } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Sourcing tracks safe additions by default and skips sensitive additions`);

const description = linkedScenarioDescription(conceptText`Track added pages starts on: safe additions are tracked, while ${conceptLink(sourceSensitivity.id, 'source-sensitive')} and ${conceptLink(filterSensitivity.id, 'filter-sensitive')} additions are skipped.
Accept the automatic choices, then verify that only the sensitive additions remain in the ordinary Untracked filter and preview reports two untracked pages.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Open the accepted bundle and mark policy drafts sensitive with a custom filter.` },
  review: { type: 'test', text: conceptText`Add two safe pages, a ${conceptLink(sourceSensitivity.id, 'source-sensitive')} page, and a ${conceptLink(filterSensitivity.id, 'filter-sensitive')} policy draft. Review the automatic choices: safe pages are tracked, both sensitive pages are skipped, and only those skipped pages appear in Untracked.` },
  accept: { type: 'test', text: conceptText`Accept the automatic choices without page-specific overrides. Verify the saved configuration tracks both safe pages and the ordinary Untracked filter contains only the sensitive additions.` },
  preview: { type: 'test', text: conceptText`Preview the accepted bundle and verify the untracked-page warning reports two pages: the sensitive additions left untracked.` },
});
const pressures = scenarioDesignPressures([preventAccidentalSharing]);
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '33353032-44bd-4d0e-a8e8-e43617f5628f' }, name.annotation, description.annotation, sections.annotation, areas.annotation, pressures.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const filters = new FilterPanelComponent(page, expect);
  await test.step(sections.steps.setup, async () => {
    await sourceCommand(() => list.goto());
    await sourceCommand(() => list.clickBundle('sourcing-review'));
    await sourceCommand(() => editor.waitForLoad('sourcing-review'));
    await sourceCommand(() => filters.clickAddCustomFilter());
    await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Policy drafts are sensitive', field: 'title', matchType: 'substring', value: 'Policy', markSensitive: true }));
    await sourceCommand(() => checkpoint('accepted sensitivity policy is ready before additions arrive'));
  });

  await test.step(sections.steps.review, async () => {
    await sourceCommand(() => sourceChanges.apply('add-review-pages', 'sourcing-review-data'));
    await sourceCommand(() => editor.checkSourceChanges());
    await sourceCommand(() => sourcing.open());
    for (const name of ['Safe One', 'Safe Two']) {
      await sourceCommand(() => sourcing.select(name));
      await sourceCommand(() => expect(sourcing.selectedPage.getByText('Tracked', { exact: true })).toBeVisible());
    }
    for (const name of ['Secret', 'Policy Draft']) {
      await sourceCommand(() => sourcing.select(name));
      await sourceCommand(() => expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible());
      await sourceCommand(() => expect(sourcing.selectedPage.getByText('Sensitive', { exact: true })).toBeVisible());
    }
    await sourceCommand(() => sourcing.expectTrackAdditions(true));
    await sourceCommand(() => expect(sourcing.root.getByTestId('track-additions-sensitive')).toHaveText('· 2 sensitive skipped'));
    await sourceCommand(() => filters.enableAndSoloFilter('Untracked'));
    for (const name of ['Secret', 'Policy Draft']) await sourceCommand(() => editor.expectListViewRowByExactNamePresent(name));
    for (const name of ['Safe One', 'Safe Two']) await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent(name));
    await sourceCommand(() => addKeyFrame(sourceReviewSensitivity));
    await sourceCommand(() => checkpoint('safe additions are tracked by default while sensitive additions stay untracked'));
  });

  await test.step(sections.steps.accept, async () => {
    await sourceCommand(() => filters.clickSoloOnFilter('Untracked'));
    await sourceCommand(() => sourcing.accept());
    const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
    const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes;
    for (const name of ['Safe One', 'Safe Two']) expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === name)).toBe(true);
    for (const name of ['Secret', 'Policy Draft']) expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === name)).toBe(false);
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => filters.enableAndSoloFilter('Untracked'));
    for (const name of ['Secret', 'Policy Draft']) await sourceCommand(() => editor.expectListViewRowByExactNamePresent(name));
    for (const name of ['Safe One', 'Safe Two']) await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent(name));
    await sourceCommand(() => addKeyFrame(sourceReviewSensitivity));
    await sourceCommand(() => checkpoint('acceptance retains both safe additions and leaves only sensitive additions untracked'));
  });

  await test.step(sections.steps.preview, async () => {
    await sourceCommand(() => editor.clickPreview());
    const preview = new PreviewPublishModal(page, expect);
    await sourceCommand(() => preview.waitForPreviewComplete());
    await sourceCommand(() => preview.expectUntrackedPagesWarning(2));
    await sourceCommand(() => checkpoint('preview warns about two untracked pages after sensitive additions were skipped'));
    await sourceCommand(() => preview.closeModal());
  });
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl', 'bundles/sourcing-review/config/generated_bundle_versions.yaml', 'bundles/sourcing-review/build/', 'bundles/sourcing-review/html/', 'bundles/sourcing-review/raw/generation_inputs/', 'bundles/sourcing-review/raw/tracked_page_content/'], allowedModified: ['source_graphs/sourcing-review-data/Start.md'] }));
});
