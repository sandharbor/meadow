/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { Fixture } from '../src/run/workflows.js';
import { BundleListPage, BundleEditorPage, CreateAndEditBundleModal, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.Minimal });

const name = linkedScenarioName(conceptText`Sourcing initial capture leaves candidate pages untracked`);

const description = linkedScenarioDescription(conceptText`Capture a source for the first time. Candidate pages should be visible without being
automatically tracked.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '04728f44-2598-4428-8e09-ea18f8e8e390' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const create = new CreateAndEditBundleModal(page, expect);
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickCreateBundleLink());
  await sourceCommand(() => create.fillSourceDirectory(path.join(testServer.sourceGraphsDir, 'meadow-test-bundles-data')));
  await sourceCommand(() => create.typeInitialPageTitle('t001 - deeply nested'));
  await sourceCommand(() => create.selectSuggestion('t001 - deeply nested'));
  await sourceCommand(() => create.clickCreateBundle());
  await sourceCommand(() => editor.waitForLoad('t001-deeply-nested'));
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.clickListViewRowByExactName('t001 ---- child 1'));
  const detail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await sourceCommand(() => detail.expectPill(Pill.NotTracked));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('initially captured candidate page remains untracked'));

  // --- Test start ---
  // Compare the tracked starting page.
  await sourceCommand(() => editor.clickListViewRowByExactName('t001 - deeply nested'));
  await sourceCommand(() => detail.expectPill(Pill.Tracked));
  await sourceCommand(() => checkpoint("initial source capture leaves ordinary pages untracked and the starting page tracked"));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
