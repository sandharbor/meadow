/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { Fixture } from '../src/run/workflows.js';
import { BundleListPage, BundleEditorPage, CreateAndEditBundleModal, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { sourceSnapshot } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.None });

/*
 * Capture a source for the first time. Candidate pages should be visible without being
 * automatically tracked.
 */
test('Sourcing initial capture leaves candidate pages untracked', async ({ page, testServer, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const create = new CreateAndEditBundleModal(page, expect);
  const editor = new BundleEditorPage(page, expect);
  await list.goto();
  await list.clickCreateBundleLink();
  await create.fillSourceDirectory(path.join(testServer.sourceGraphsDir, 'meadow-test-bundles-data'));
  await create.typeInitialPageTitle('t001 - deeply nested');
  await create.selectSuggestion('t001 - deeply nested');
  await create.clickCreateBundle();
  await editor.waitForLoad('t001-deeply-nested');
  await editor.waitForSourceCheck();
  await editor.switchToListView();
  await editor.clickListViewRowByExactName('t001 ---- child 1');
  const detail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await detail.expectPill(Pill.NotTracked);
  await addKeyFrame(sourceSnapshot);
  await snapshot('initially captured candidate page remains untracked');

  // --- Test start ---
  // Compare the tracked starting page.
  await editor.clickListViewRowByExactName('t001 - deeply nested');
  await detail.expectPill(Pill.Tracked);
  await snapshot("initial source capture leaves ordinary pages untracked and the starting page tracked");

  await skipMeadowHomeStateCheck();
});
