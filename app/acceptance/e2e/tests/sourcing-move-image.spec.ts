/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, sourceMove, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });

const name = linkedScenarioName(conceptText`Sourcing moves a tracked image while preserving its identity and tracking`);

const description = linkedScenarioDescription(conceptText`Move a tracked image and review the proposed match. Accepting it should preserve both
the image's identity and tracking state.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'd9e784cb-3a46-431c-bdb7-e93cd91739e3' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForSourceCheck());
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'meadow-test-bundle-big', expect);
  const original = bundleConfig.requireNode({ bundleNodeName: 't024 ---- test image' });
  expect(original.listType).toBe('whitelist');
  await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));

  // --- Test start ---
  // Move the tracked image.
  await sourceCommand(() => sourceChanges.apply('move-tracked-image'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.expectMoveCount(1));
  await sourceCommand(() => editor.sourceReview.expectMove('Moved', 't024/t024 ---- test image.png', 't024/images/t024 ---- test image.png'));
  await sourceCommand(() => editor.sourceReview.expectMoveListed(original.bundleNodeId));
  await sourceCommand(() => editor.sourceReview.confirmSuggestedIdentities());
  await sourceCommand(() => editor.sourceReview.continueToGraph());
  await sourceCommand(() => editor.sourceReview.orphans.expectNotListed(original.bundleNodeName));
  await sourceCommand(() => addKeyFrame(sourceMove));
  await sourceCommand(() => checkpoint('review identifies the move through the shared source change'));

  // Accept the source update.
  await sourceCommand(() => editor.sourceReview.accept());
  expect(bundleConfig.findNode({ bundleNodeId: original.bundleNodeId })).toEqual({ ...original, sourceGraphSubdirectory: 't024/images' });
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewNodeVisible('file:t024/images/t024 ---- test image.png', true));
  await sourceCommand(() => editor.expectListViewNodeVisible('file:t024/t024 ---- test image.png', false));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('the moved file remains reachable with the same identity and tracking'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
