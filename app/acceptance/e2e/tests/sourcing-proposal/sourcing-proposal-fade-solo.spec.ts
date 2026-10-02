/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, graphFade, sourceReviewFiltering, sourceReviewViewState, tracking } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * Unchanged context is faded in both graph and list. An explicit untrack immediately matches the
 * ordinary Untracked filter. Solo brings that context to full prominence without rewriting Fade,
 * selection remains usable, and leaving Solo restores the remembered presentation.
 */
test('Solo temporarily restores full prominence for faded unchanged context without rewriting Fade', async ({ page, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const filters = new FilterPanelComponent(page, expect);
  await list.goto();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  await sourcing.open();
  await sourcing.expectGraphOpacity('file:Routes/Reference.md', 0.4);
  const fade = sourcing.root.getByRole('button', { name: 'Fade Unchanged', exact: true });
  await expect(fade).toHaveAttribute('aria-pressed', 'true');
  await checkpoint('the full source comparison begins with unchanged context faded');

  // --- Test start ---
  await sourcing.select('Reference');
  await sourcing.untrackSelected();
  await sourcing.clearSelection();
  await sourcing.expectListOpacity('Reference', 0.45);
  await filters.enableAndSoloFilter('Untracked');
  await sourcing.expectListOpacity('Reference', 1);
  await sourcing.expectNodeVisible('Start', false);
  await expect(fade).toHaveAttribute('aria-pressed', 'true');
  await sourcing.select('Reference');
  await expect(sourcing.evidence).toContainText('Unchanged source material');
  await expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible();
  await addKeyFrame(graphFade);
  await checkpoint('soloed untracked context has full prominence while Fade remains configured');
  await sourcing.clearSelection();
  await filters.clickSoloOnFilter('Untracked');
  await sourcing.expectListOpacity('Reference', 0.45);
  await sourcing.expectNodeVisible('Start');
  await sourcing.root.getByRole('button', { name: 'Graph View', exact: true }).click();
  await sourcing.expectGraphOpacity('file:Routes/Reference.md', 0.4);
  await expect(fade).toHaveAttribute('aria-pressed', 'true');
  await checkpoint('leaving Solo restores the original Fade in graph and list');
  await sourcing.root.getByRole('button', { name: 'Discard proposal', exact: true }).click();
  await expect(sourcing.root).toBeHidden();
  await assertMeadowHomeState();
});
