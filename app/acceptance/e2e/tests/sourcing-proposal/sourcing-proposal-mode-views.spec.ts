/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewViewState, sourceReviewWorkspace, sourceReviewAcceptance } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * Remember different folder filters, mixes, labels, selection, hidden pages and framing in each
 * mode. First sourcing entry shows additions despite curation's solo. Later, reload and acceptance
 * restore the appropriate view, including list sorting and a graph viewport after switching back.
 */
test('Sourcing and curation restore independent graph and list view state on transitions', async ({ page, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const filters = new FilterPanelComponent(page, expect);
  const savedView = (mode: string) => page.evaluate(mode => JSON.parse(localStorage.getItem(`meadow.editor-view.v1:sourcing-review:${mode}`) ?? '{}'), mode);
  const frameGraph = async (delta: number) => {
    const graph = page.getByTestId('graph-canvas');
    const box = (await graph.boundingBox())!;
    const before = await graph.getAttribute('viewBox');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, delta);
    await expect(graph).not.toHaveAttribute('viewBox', before!);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 25, { steps: 4 });
    await page.mouse.up({ button: 'middle' });
    return graph.getAttribute('viewBox');
  };
  await list.goto();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  await filters.expandFilterGroup('Folders');
  await filters.expandFolder('Routes');
  await filters.soloFolder('Routes');
  await filters.hideFolder('Routes/Branch');
  await page.getByTitle('Show titles for folder Routes', { exact: true }).click();
  await filters.openMixFilters();
  await filters.chooseMixOperator('All');
  await filters.closeMixFilters();
  await editor.switchToListView();
  await editor.clickListViewRowByExactName('Reference');
  await editor.clickListSort('Title');
  await editor.switchToGraphView();
  const curationFrame = await frameGraph(-200);
  await editor.expectLabelVisible('Reference');
  await checkpoint('curation remembers a solo mix labels selection and a custom graph frame');
  const curation = await savedView('curation');

  // --- Test start ---
  // New sourcing starts with its complete comparison, independently of the curation solo.
  await sourceChanges.apply('add-review-pages', 'sourcing-review-data');
  await editor.checkSourceChanges();
  await sourcing.open();
  await editor.expectGraphNodePresent('file:Additions/Safe One.md');
  await expect(page.getByTitle('Solo folder Routes', { exact: true })).toHaveCount(0);
  await sourcing.select('Safe One');
  await sourcing.clearSelection();
  await filters.expandFilterGroup('Folders');
  await filters.expandFolder('Routes');
  await filters.hideFolder('Routes/Branch');
  await filters.enableAndSoloFilter('Added');
  await filters.clickShowTitlesOnFilter('Added');
  await filters.openMixFilters();
  await filters.chooseMixOperator('Any');
  await filters.closeMixFilters();
  await sourcing.select('Safe One');
  await editor.clickListSort('Title');
  await editor.clickListSort('Title');
  await editor.switchToGraphView();
  const sourcingFrame = await frameGraph(180);
  await editor.expectLabelVisible('Safe One');
  await editor.switchToListView();
  await expect(page.getByRole('columnheader', { name: /^Title/ })).toHaveAttribute('aria-sort', 'descending');
  await addKeyFrame(sourceReviewViewState);
  await checkpoint('sourcing remembers a different mix selection labels and descending list');
  const proposalView = await savedView('sourcing');
  await sourcing.later();
  await editor.expectGraphViewActive();
  await expect(page.getByTestId('graph-canvas')).toHaveAttribute('viewBox', curationFrame!);
  await expect(page.getByTestId('selected-page-file:Routes/Reference.md')).toBeVisible();
  await expect.poll(() => savedView('curation')).toEqual(curation);
  await checkpoint('Later resumes the original curation view');

  // Reload and reopen preserve sourcing's list while retaining its previous graph framing.
  await page.reload();
  await editor.waitForLoad('sourcing-review');
  await sourcing.open();
  await expect(page.getByRole('columnheader', { name: /^Title/ })).toHaveAttribute('aria-sort', 'descending');
  await expect(page.getByTestId('selected-page-file:Additions/Safe One.md')).toBeVisible();
  await expect.poll(() => savedView('sourcing')).toEqual(proposalView);
  await editor.switchToGraphView();
  await expect(page.getByTestId('graph-canvas')).toHaveAttribute('viewBox', sourcingFrame!);
  await editor.expectLabelVisible('Safe One');
  await checkpoint('reopened sourcing restores its selection filters labels and graph frame');
  await sourcing.accept();
  await editor.expectGraphViewActive();
  await expect(page.getByTestId('graph-canvas')).toHaveAttribute('viewBox', curationFrame!);
  await expect(page.getByTestId('selected-page-file:Routes/Reference.md')).toBeVisible();
  await expect.poll(() => savedView('curation')).toEqual(curation);
  await checkpoint('acceptance returns to the independently remembered curation view');
  await assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'], allowedModified: ['source_graphs/sourcing-review-data/Start.md'] });
});
