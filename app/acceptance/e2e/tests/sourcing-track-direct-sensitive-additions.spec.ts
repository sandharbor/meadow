/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, FilterPanelComponent, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, sourceSnapshot, sensitive, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Sourcing acceptance tracks safe additions and leaves direct-sensitive additions in the ordinary untracked filter`);

const description = linkedScenarioDescription(conceptText`Add pages that are directly marked sensitive alongside a safe peer. Acceptance tracks the
safe additions and leaves the sensitive ones untracked in the ordinary Untracked filter.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '0b132f4e-f39f-47eb-b609-dc8151afb48e' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => checkpoint('the accepted bundle is ready for new additions'));

  // --- Test start ---
  // Establish an earlier addition, tracked by default.
  await sourceCommand(() => sourceChanges.apply('add-embedded-image'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.accept());
  await sourceCommand(() => checkpoint('an earlier addition is accepted and tracked'));

  // Add sensitive pages and a safe peer.
  await sourceCommand(() => sourceChanges.apply('add-direct-sensitive-pages'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  const privateNames = ['added confidential notes', 'added confidential planning'];
  for (const name of privateNames) {
    await sourceCommand(() => editor.sourceReview.expectSensitivity(`source-changes/${name}.md`, 'Sensitive'));
  }
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('source review identifies sensitive additions before acceptance'));

  // Accept the additions: the safe ones are tracked, and the sensitive ones remain in the normal Untracked filter.
  await sourceCommand(() => editor.sourceReview.accept());
  await sourceCommand(() => editor.switchToListView());
  const filters = new FilterPanelComponent(page, expect);
  await sourceCommand(() => filters.enableAndSoloFilter('Untracked'));
  for (const name of privateNames) {
    await sourceCommand(() => editor.clickListViewRowByExactName(name));
    await sourceCommand(() => new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.NotTracked));
    await sourceCommand(() => editor.clickSelectNone());
  }
  for (const name of ['added sunflower', 'added public update']) await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent(name));
  await sourceCommand(() => addKeyFrame(sensitive));
  await sourceCommand(() => checkpoint('sensitive additions remain untracked for ordinary curation while safe additions are tracked'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
