/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SelectedPageDetailComponent } from '../../src/run/pages/areas/bundle/curation/SelectedPageDetailComponent.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewWorkspace, sourceReviewViewState } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * Use the complete editor in each mode: folder and selection solos, labels, hidden nodes, graph/list
 * selection, resize and page details. Curation inspects accepted material; sourcing supplies source
 * evidence and stages its tracking action until acceptance. Returning through Later preserves both.
 */
test('Sourcing and curation share full editor behavior while retaining mode-specific ownership', async ({ page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const filters = new FilterPanelComponent(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const configPath = path.join(testServer.configDir, 'bundles/sourcing-review/config/bundle_node_config.yaml');
  await list.goto();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  const acceptedConfig = fs.readFileSync(configPath, 'utf8');
  await checkpoint('the accepted graph is ready for the common editing tools');

  // --- Test start ---
  for (const mode of ['curation', 'sourcing'] as const) {
    if (mode === 'sourcing') await sourcing.open();
    await filters.expandFilterGroup('Folders');
    await filters.soloFolder('Routes');
    await editor.expectGraphNodePresent('file:Routes/Reference.md');
    await editor.expectGraphNodeNotPresent('file:Leaf.md');
    await filters.resetFolderFilters();
    await editor.clickGraphNode('file:Routes/Reference.md');
    const selected = page.getByTestId('selected-page-file:Routes/Reference.md');
    await expect(selected).toBeVisible();
    await page.getByRole('navigation').getByTitle('Show text labels', { exact: true }).click();
    await editor.expectLabelVisible('Reference');
    await editor.clickSoloSelection();
    await editor.expectGraphViewPageCount(1);
    await editor.switchToListView();
    await editor.expectListViewRowByExactNamePresent('Reference');
    await editor.expectListViewRowCount(1);
    const detail = new SelectedPageDetailComponent(selected, expect);
    await detail.openDetails();
    await detail.expectFolder('Routes');
    await detail.openAndCloseTraversalPath();
    await editor.clickSoloSelection();
    await page.getByRole('navigation').getByTitle('Hide', { exact: true }).click();
    await editor.expectListViewRowByExactNameNotPresent('Reference');
    await page.getByTitle('Show 1 hidden page', { exact: true }).click();
    await editor.expectListViewRowByExactNamePresent('Reference');
    await editor.clickListViewRowByExactName('Reference');
    await detail.openDetails();
    const resize = page.getByRole('separator', { name: 'Resize filters sidebar', exact: true });
    const beforeWidth = await resize.getAttribute('aria-valuenow');
    await resize.focus();
    await page.keyboard.press('ArrowRight');
    await expect(resize).not.toHaveAttribute('aria-valuenow', beforeWidth!);
    if (mode === 'curation') {
      await expect(page.getByRole('region', { name: 'Source review evidence' })).toHaveCount(0);
      await addKeyFrame(sourceReviewWorkspace);
      await checkpoint('curation supplies the full graph list filters details and selection tools');
      await editor.clickSelectNone();
    } else {
      await expect(sourcing.evidence).toContainText('Accepted location and route');
      await expect(sourcing.evidence).toContainText('Proposed location and route');
      await sourcing.untrackSelected();
      expect(fs.readFileSync(configPath, 'utf8')).toBe(acceptedConfig);
      await sourcing.root.getByRole('button', { name: 'Compare captured content', exact: true }).click();
      await expect(sourcing.comparison).toContainText('Reference');
      await sourcing.closeComparison();
      await addKeyFrame(sourceReviewWorkspace);
      await checkpoint('sourcing supplies the same editor with captured evidence and isolated tracking');
    }
  }
  await sourcing.later();
  expect(fs.readFileSync(configPath, 'utf8')).toBe(acceptedConfig);
  await editor.clickListViewRowByExactName('Reference');
  await expect(page.getByTestId('selected-page-file:Routes/Reference.md').getByText('Tracked', { exact: true })).toBeVisible();
  await sourcing.open();
  await expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible();
  await sourcing.accept();
  await expect(page.getByTestId('selected-page-file:Routes/Reference.md').getByText('Not Tracked', { exact: true })).toBeVisible();
  await checkpoint('acceptance applies the sourcing tracking choice to the curation editor');
  await assertMeadowHomeState();
});
