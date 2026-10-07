/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, sourceMove, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });

const name = linkedScenarioName(conceptText`Sourcing moves a nested page while preserving its identity and name-only links`);

const description = linkedScenarioDescription(conceptText`Move a nested page while leaving name-only links unchanged. Review and acceptance should
preserve the page's identity and working links.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '53c939c8-a8cf-4d90-b52f-b20924e0b6c1' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForSourceCheck());
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'meadow-test-bundle-big', expect);
  const original = bundleConfig.requireNode({ bundleNodeName: 't001 ---- child 2' });
  expect(original.listType).toBe('whitelist');
  await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));

  // --- Test start ---
  // Move the nested page.
  await sourceCommand(() => sourceChanges.apply('move-nested-page'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.expectMoveCount(1));
  await sourceCommand(() => editor.sourceReview.expectMove('Moved', 't001/deeper/t001 ---- child 2.md', 'source-changes/moved/t001 ---- child 2.md'));
  await sourceCommand(() => editor.sourceReview.expectMoveListed(original.bundleNodeId));
  await sourceCommand(() => editor.sourceReview.confirmSuggestedIdentities());
  await sourceCommand(() => editor.sourceReview.continueToGraph());
  await sourceCommand(() => editor.sourceReview.orphans.expectNotListed(original.bundleNodeName));
  await sourceCommand(() => addKeyFrame(sourceMove));
  await sourceCommand(() => checkpoint('review identifies the move through the shared source change'));

  // Accept the source update.
  await sourceCommand(() => editor.sourceReview.accept());
  expect(bundleConfig.findNode({ bundleNodeId: original.bundleNodeId })).toEqual({ ...original, sourceGraphSubdirectory: 'source-changes/moved' });
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewNodeVisible('file:source-changes/moved/t001 ---- child 2.md', true));
  await sourceCommand(() => editor.expectListViewNodeVisible('file:t001/deeper/t001 ---- child 2.md', false));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('the moved file remains reachable with the same identity and tracking'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
