/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { ActionButton, BundleEditorPage, FilterPanelComponent, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, frontierEmbeddedAssets, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });

const name = linkedScenarioName(conceptText`a plain link to an image beyond the boundary stays untrackable in the live frontier`);

const description = linkedScenarioDescription(conceptText`Add a plain link to an image beyond the traversal boundary. The live frontier should
show it without allowing it to be tracked there.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'caec0c25-9239-4906-8896-87b6bf817779' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
  await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));

  // --- Test start ---
  // Replace the image embed with a plain link.
  await sourceCommand(() => sourceChanges.apply('link-frontier-image'));
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.checkAgain());
  await sourceCommand(() => editor.sourceReview.expectNoLongerIncluded('t016 ---- level 5 - frontier image.png'));
  await sourceCommand(() => editor.sourceReview.orphans.expectNotListed('t016 ---- level 5 - frontier image'));
  await sourceCommand(() => addKeyFrame(frontierEmbeddedAssets));
  await sourceCommand(() => checkpoint('the formerly embedded image is no longer included, without orphaned configuration'));

  // Accept the source update.
  await sourceCommand(() => editor.sourceReview.accept());

  // Show the live frontier in curation.
  await sourceCommand(() => new FilterPanelComponent(page, expect).enableFilter('Frontier'));
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.clickListViewRowByExactName('t016 ---- level 5 - frontier image'));
  const detail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await sourceCommand(() => detail.expectPill(Pill.Frontier));
  await sourceCommand(() => detail.expectNoPill(Pill.FrontierImage));
  await sourceCommand(() => detail.expectButtonDisabled(ActionButton.Track));
  await sourceCommand(() => addKeyFrame(frontierEmbeddedAssets));
  await sourceCommand(() => checkpoint('an ordinary image link has the same frontier restrictions as a linked note'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
