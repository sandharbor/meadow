/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Sourcing tracks safe additions by default and Track added pages can be turned off`);

const description = linkedScenarioDescription(conceptText`Add a reachable page and review the source changes. Track added pages starts on, so the
page is counted among the tracking changes and arrives tracked. Turning it off leaves the page untracked until it is
turned back on; acceptance applies whichever choice is current.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '7437de34-d543-4c52-950b-c3d7c192ee15' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
  const editor = new BundleEditorPage(page, expect);
  const review = editor.sourceReview;
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));

  // --- Test start ---
  // Add a linked page; Track added pages starts on and counts it.
  await sourceCommand(() => sourceChanges.apply('add-linked-page'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => review.open());
  await sourceCommand(() => review.expectTrackAdditions(true));
  await sourceCommand(() => expect(review.acceptedChange('1 tracking change')).toBeVisible());
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('the added page is tracked by default'));

  // Turning it off leaves the page untracked; turning it back on tracks it again.
  await sourceCommand(() => review.setTrackAdditions(false));
  await sourceCommand(() => expect(review.acceptedChange(/tracking changes?$/)).toHaveCount(0));
  await sourceCommand(() => review.setTrackAdditions(true));
  await sourceCommand(() => expect(review.acceptedChange('1 tracking change')).toBeVisible());
  await sourceCommand(() => checkpoint('Track added pages can be turned off and on before acceptance'));

  // Accept the source update.
  await sourceCommand(() => review.accept());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.clickListViewRowByExactName('added field notes'));
  await sourceCommand(() => new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.Tracked));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('the accepted addition is tracked in curation'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
