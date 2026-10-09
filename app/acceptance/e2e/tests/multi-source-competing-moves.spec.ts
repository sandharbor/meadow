/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, sourceMove, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

const name = linkedScenarioName(conceptText`Multi-source competing moves never assign the old identity to either identical destination`);

const description = linkedScenarioDescription(conceptText`Replace one accepted page with two identical, reachable pages in different sources.
Review must require an identity choice; keeping them separate should retire the old
identity.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'a429b1b9-137e-4567-a045-287920b81efc' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('multi-source-page'));
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForLoad('multi-source-page'));
  await sourceCommand(() => editor.waitForSourceCheck());
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'multi-source-page', expect);
  const original = bundleConfig.requireNode({ sourceId: 'source000001', bundleNodeName: 'Inside' });
  await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));

  // --- Test start ---
  // Create competing move candidates.
  await sourceCommand(() => sourceChanges.apply('competing-cross-source-moves', 'multi-source'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.expectMoveCount(1));
  const move = await sourceCommand(() => editor.sourceReview.moveForNode(original.bundleNodeId));
  await sourceCommand(() => move.expectUnresolved(['research://Moved/Inside.md', 'reference://Moved/Inside.md']));
  await sourceCommand(() => editor.sourceReview.expectIdentityChoiceRequired());
  expect(bundleConfig.findNode({ bundleNodeId: original.bundleNodeId })).toEqual(original);
  await sourceCommand(() => addKeyFrame(sourceMove));
  await sourceCommand(() => checkpoint('two equally plausible destinations require an explicit identity choice'));

  // Keep the destinations separate.
  await sourceCommand(() => move.keepSeparate());
  await sourceCommand(() => editor.sourceReview.continueToGraph());
  await sourceCommand(() => editor.sourceReview.expectReadyToAccept());
  await sourceCommand(() => checkpoint('the user chose different pages and the update is ready to accept'));

  // Accept the source update.
  await sourceCommand(() => editor.sourceReview.accept());
  const updated = bundleConfig.readNodes();
  // Both destinations are tracked as new pages; neither takes the old identity.
  const destinations = updated.filter(node => node.bundleNodeName === 'Inside' && node.sourceGraphSubdirectory === 'Moved');
  expect(destinations).toHaveLength(2);
  expect(destinations.some(node => node.bundleNodeId === original.bundleNodeId)).toBe(false);
  expect(updated.some(node => node.bundleNodeId === original.bundleNodeId)).toBe(false);
  await sourceCommand(() => editor.switchToListView());
  for (const source of ['source000002', 'source000003']) await sourceCommand(() => editor.expectListViewNodeVisible(`file:_mw_sources/${source}/Moved/Inside.md`, true));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('explicitly keeping pages separate removes the old identity and leaves both additions untracked for curation'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
