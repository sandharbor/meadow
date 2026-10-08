/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewViewState, sourceReviewWorkspace, sourceReviewAcceptance, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Sourcing and curation restore independent graph and list view state on transitions`);

const description = linkedScenarioDescription(conceptText`Remember different folder filters, mixes, labels, selection, hidden pages and framing in each
mode. First sourcing entry shows additions despite curation's solo. Later, reload and acceptance
restore the appropriate view, including list sorting and a graph viewport after switching back.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '859397f6-6a44-4c43-814a-dd65f147754d' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
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
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => filters.expandFilterGroup('Folders'));
  await sourceCommand(() => filters.expandFolder('Routes'));
  await sourceCommand(() => filters.soloFolder('Routes'));
  await sourceCommand(() => filters.hideFolder('Routes/Branch'));
  await sourceCommand(() => page.getByTitle('Show titles for folder Routes', { exact: true }).click());
  await sourceCommand(() => filters.openMixFilters());
  await sourceCommand(() => filters.chooseMixOperator('All'));
  await sourceCommand(() => filters.closeMixFilters());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.clickListViewRowByExactName('Reference'));
  await sourceCommand(() => editor.clickListSort('Title'));
  await sourceCommand(() => editor.switchToGraphView());
  const curationFrame = await sourceCommand(() => frameGraph(-200));
  await sourceCommand(() => editor.expectLabelVisible('Reference'));
  await sourceCommand(() => checkpoint('curation remembers a solo mix labels selection and a custom graph frame'));
  const curation = await sourceCommand(() => savedView('curation'));

  // --- Test start ---
  // New sourcing starts with its complete comparison, independently of the curation solo.
  await sourceCommand(() => sourceChanges.apply('add-review-pages', 'sourcing-review-data'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => editor.expectGraphNodePresent('file:Additions/Safe One.md'));
  await sourceCommand(() => expect(page.getByTitle('Solo folder Routes', { exact: true })).toHaveCount(0));
  await sourceCommand(() => sourcing.select('Safe One'));
  await sourceCommand(() => sourcing.clearSelection());
  await sourceCommand(() => filters.expandFilterGroup('Folders'));
  await sourceCommand(() => filters.expandFolder('Routes'));
  await sourceCommand(() => filters.hideFolder('Routes/Branch'));
  await sourceCommand(() => filters.enableAndSoloFilter('Add'));
  await sourceCommand(() => filters.clickShowTitlesOnFilter('Add'));
  await sourceCommand(() => filters.openMixFilters());
  await sourceCommand(() => filters.chooseMixOperator('Any'));
  await sourceCommand(() => filters.closeMixFilters());
  await sourceCommand(() => sourcing.select('Safe One'));
  await sourceCommand(() => editor.clickListSort('Title'));
  await sourceCommand(() => editor.clickListSort('Title'));
  await sourceCommand(() => editor.switchToGraphView());
  const sourcingFrame = await sourceCommand(() => frameGraph(180));
  await sourceCommand(() => editor.expectLabelVisible('Safe One'));
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => expect(page.getByRole('columnheader', { name: /^Title/ })).toHaveAttribute('aria-sort', 'descending'));
  await sourceCommand(() => addKeyFrame(sourceReviewViewState));
  await sourceCommand(() => checkpoint('sourcing remembers a different mix selection labels and descending list'));
  const proposalView = await sourceCommand(() => savedView('sourcing'));
  await sourceCommand(() => sourcing.later());
  await sourceCommand(() => editor.expectGraphViewActive());
  await sourceCommand(() => expect(page.getByTestId('graph-canvas')).toHaveAttribute('viewBox', curationFrame!));
  await sourceCommand(() => expect(page.getByTestId('selected-page-file:Routes/Reference.md')).toBeVisible());
  await sourceCommand(() => expect.poll(() => savedView('curation')).toEqual(curation));
  await sourceCommand(() => checkpoint('Later resumes the original curation view'));

  // Reload and reopen preserve sourcing's list while retaining its previous graph framing.
  await sourceCommand(() => page.reload());
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => expect(page.getByRole('columnheader', { name: /^Title/ })).toHaveAttribute('aria-sort', 'descending'));
  await sourceCommand(() => expect(page.getByTestId('selected-page-file:Additions/Safe One.md')).toBeVisible());
  await sourceCommand(() => expect.poll(() => savedView('sourcing')).toEqual(proposalView));
  await sourceCommand(() => editor.switchToGraphView());
  await sourceCommand(() => expect(page.getByTestId('graph-canvas')).toHaveAttribute('viewBox', sourcingFrame!));
  await sourceCommand(() => editor.expectLabelVisible('Safe One'));
  await sourceCommand(() => checkpoint('reopened sourcing restores its selection filters labels and graph frame'));
  await sourceCommand(() => sourcing.accept());
  await sourceCommand(() => editor.expectGraphViewActive());
  await sourceCommand(() => expect(page.getByTestId('graph-canvas')).toHaveAttribute('viewBox', curationFrame!));
  await sourceCommand(() => expect(page.getByTestId('selected-page-file:Routes/Reference.md')).toBeVisible());
  await sourceCommand(() => expect.poll(() => savedView('curation')).toEqual(curation));
  await sourceCommand(() => checkpoint('acceptance returns to the independently remembered curation view'));
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'], allowedModified: ['source_graphs/sourcing-review-data/Start.md'] }));
});
