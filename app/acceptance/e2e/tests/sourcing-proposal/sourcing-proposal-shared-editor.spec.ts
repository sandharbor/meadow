/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SelectedPageDetailComponent } from '../../src/run/pages/areas/bundle/curation/SelectedPageDetailComponent.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewWorkspace, sourceReviewViewState, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Sourcing and curation share full editor behavior while retaining mode-specific ownership`);

const description = linkedScenarioDescription(conceptText`Use the complete editor in each mode: folder and selection solos, labels, hidden nodes, graph/list
selection, resize and page details. Curation inspects accepted material; sourcing stages tracking
until acceptance. Unchanged pages retain normal details without a source-change card, and Later
preserves both modes' choices.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '8200e571-3323-4e87-8ca1-817d55a94bee' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const filters = new FilterPanelComponent(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const configPath = path.join(testServer.configDir, 'bundles/sourcing-review/config/bundle_node_config.yaml');
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  const acceptedConfig = fs.readFileSync(configPath, 'utf8');
  await sourceCommand(() => checkpoint('the accepted graph is ready for the common editing tools'));

  // --- Test start ---
  for (const mode of ['curation', 'sourcing'] as const) {
    if (mode === 'sourcing') await sourceCommand(() => sourcing.open());
    await sourceCommand(() => filters.expandFilterGroup('Folders'));
    await sourceCommand(() => filters.soloFolder('Routes'));
    await sourceCommand(() => editor.expectGraphNodePresent('file:Routes/Reference.md'));
    await sourceCommand(() => editor.expectGraphNodeNotPresent('file:Leaf.md'));
    await sourceCommand(() => filters.resetFolderFilters());
    await sourceCommand(() => editor.clickGraphNode('file:Routes/Reference.md'));
    const selected = page.getByTestId('selected-page-file:Routes/Reference.md');
    await sourceCommand(() => expect(selected).toBeVisible());
    await sourceCommand(() => page.getByRole('navigation').getByTitle('Show text labels', { exact: true }).click());
    await sourceCommand(() => editor.expectLabelVisible('Reference'));
    await sourceCommand(() => editor.clickSoloSelection());
    await sourceCommand(() => editor.expectGraphViewPageCount(1));
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => editor.expectListViewRowByExactNamePresent('Reference'));
    await sourceCommand(() => editor.expectListViewRowCount(1));
    const detail = new SelectedPageDetailComponent(selected, expect);
    await sourceCommand(() => detail.openDetails());
    await sourceCommand(() => detail.expectFolder('Routes'));
    await sourceCommand(() => detail.openAndCloseTraversalPath());
    await sourceCommand(() => editor.clickSoloSelection());
    await sourceCommand(() => page.getByRole('navigation').getByTitle('Hide', { exact: true }).click());
    await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent('Reference'));
    await sourceCommand(() => page.getByTitle('Show 1 hidden page', { exact: true }).click());
    await sourceCommand(() => editor.expectListViewRowByExactNamePresent('Reference'));
    await sourceCommand(() => editor.clickListViewRowByExactName('Reference'));
    await sourceCommand(() => detail.openDetails());
    const resize = page.getByRole('separator', { name: 'Resize filters sidebar', exact: true });
    const beforeWidth = await sourceCommand(() => resize.getAttribute('aria-valuenow'));
    await sourceCommand(() => resize.focus());
    await sourceCommand(() => page.keyboard.press('ArrowRight'));
    await sourceCommand(() => expect(resize).not.toHaveAttribute('aria-valuenow', beforeWidth!));
    if (mode === 'curation') {
      await sourceCommand(() => expect(page.getByRole('region', { name: 'Source review evidence' })).toHaveCount(0));
      await sourceCommand(() => addKeyFrame(sourceReviewWorkspace));
      await sourceCommand(() => checkpoint('curation supplies the full graph list filters details and selection tools'));
      await sourceCommand(() => editor.clickSelectNone());
    } else {
      await sourceCommand(() => sourcing.expectNoSelectedSourceChange());
      await sourceCommand(() => sourcing.untrackSelected());
      expect(fs.readFileSync(configPath, 'utf8')).toBe(acceptedConfig);
      await sourceCommand(() => addKeyFrame(sourceReviewWorkspace));
      await sourceCommand(() => checkpoint('sourcing supplies the same editor and isolated tracking without change evidence for unchanged pages'));
    }
  }
  await sourceCommand(() => sourcing.later());
  expect(fs.readFileSync(configPath, 'utf8')).toBe(acceptedConfig);
  await sourceCommand(() => editor.clickListViewRowByExactName('Reference'));
  await sourceCommand(() => expect(page.getByTestId('selected-page-file:Routes/Reference.md').getByText('Tracked', { exact: true })).toBeVisible());
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible());
  await sourceCommand(() => sourcing.accept());
  await sourceCommand(() => expect(page.getByTestId('selected-page-file:Routes/Reference.md').getByText('Not Tracked', { exact: true })).toBeVisible());
  await sourceCommand(() => checkpoint('acceptance applies the sourcing tracking choice to the curation editor'));
  await sourceCommand(() => assertMeadowHomeState());
});
