/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, FilterPanelComponent, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, sourceSnapshot, sensitive, filterSensitivity, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Sourcing acceptance leaves filter-sensitive additions untracked and uses the ordinary untracked filter`);

const description = linkedScenarioDescription(conceptText`Enable a custom filter's Mark Sensitive action, then add matching pages without source
sensitivity markings. Acceptance should leave those effectively sensitive pages untracked
and leave the safe addition untracked as well.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '4d83d151-9db8-4af0-8e65-7b701110951f' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => checkpoint('the accepted bundle is ready for new additions'));

  // --- Test start ---
  // Establish an earlier untracked addition.
  await sourceCommand(() => sourceChanges.apply('add-embedded-image'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.accept());
  const filters = new FilterPanelComponent(page, expect);
  await sourceCommand(() => filters.clickAddCustomFilter());
  await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Confidential pages', field: 'title', matchType: 'substring', value: 'confidential', markSensitive: true }));
  await sourceCommand(() => checkpoint('the sensitivity filter and earlier untracked addition are ready'));

  // Add pages matched by the sensitivity filter.
  await sourceCommand(() => sourceChanges.apply('add-filter-sensitive-pages'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  const privateNames = ['added confidential notes', 'added confidential planning'];
  for (const name of privateNames) {
    await sourceCommand(() => editor.sourceReview.expectSensitivity(`source-changes/${name}.md`, 'Sensitive via filter'));
  }
  await sourceCommand(() => addKeyFrame(sourceSnapshot, filterSensitivity));
  await sourceCommand(() => checkpoint('source review identifies sensitive additions before acceptance'));

  // Accept all additions untracked, then inspect them through the normal filter.
  await sourceCommand(() => editor.sourceReview.accept());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => filters.enableAndSoloFilter('Untracked'));
  for (const name of [...privateNames, 'added sunflower', 'added public update']) {
    await sourceCommand(() => editor.clickListViewRowByExactName(name));
    await sourceCommand(() => new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.NotTracked));
    await sourceCommand(() => editor.clickSelectNone());
  }
  await sourceCommand(() => addKeyFrame(sensitive, filterSensitivity));
  await sourceCommand(() => checkpoint('all accepted additions remain untracked and available for ordinary curation'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
