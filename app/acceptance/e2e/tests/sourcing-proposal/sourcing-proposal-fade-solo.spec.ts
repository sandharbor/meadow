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
test('Solo temporarily restores full prominence for faded unchanged context without rewriting Fade', { annotation: { type: 'scenario-id', description: '3b2016ed-f843-43a3-830f-0088eeb5f0df' } }, async ({ sourceCommand, page, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const filters = new FilterPanelComponent(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => sourcing.expectGraphOpacity('file:Routes/Reference.md', 0.5));
  await sourceCommand(() => expect(sourcing.root.getByRole('button', { name: /^Fade / })).toHaveCount(0));
  await sourceCommand(() => checkpoint('the full source comparison begins with unchanged context faded'));

  // --- Test start ---
  await sourceCommand(() => sourcing.select('Reference'));
  await sourceCommand(() => sourcing.untrackSelected());
  await sourceCommand(() => sourcing.clearSelection());
  await sourceCommand(() => sourcing.expectListOpacity('Reference', 0.45));
  await sourceCommand(() => filters.enableAndSoloFilter('Untracked'));
  await sourceCommand(() => sourcing.expectListOpacity('Reference', 1));
  await sourceCommand(() => sourcing.expectNodeVisible('Start', false));
  await sourceCommand(() => sourcing.select('Reference'));
  await sourceCommand(() => sourcing.expectNoSelectedSourceChange());
  await sourceCommand(() => expect(sourcing.selectedPage.getByText('Not Tracked', { exact: true })).toBeVisible());
  await sourceCommand(() => addKeyFrame(graphFade));
  await sourceCommand(() => checkpoint('soloed untracked context has full prominence while Fade remains configured'));
  await sourceCommand(() => sourcing.clearSelection());
  await sourceCommand(() => filters.clickSoloOnFilter('Untracked'));
  await sourceCommand(() => sourcing.expectListOpacity('Reference', 0.45));
  await sourceCommand(() => sourcing.expectNodeVisible('Start'));
  await sourceCommand(() => sourcing.root.getByRole('button', { name: 'Graph View', exact: true }).click());
  await sourceCommand(() => sourcing.expectGraphOpacity('file:Routes/Reference.md', 0.5));
  await sourceCommand(() => checkpoint('leaving Solo restores the original Fade in graph and list'));
  await sourceCommand(() => sourcing.discard());
  await sourceCommand(() => expect(sourcing.root).toBeHidden());
  await sourceCommand(() => assertMeadowHomeState());
});
