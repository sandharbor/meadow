/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourceMove, sourceSnapshot } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ isolateSourceGraphs: true });

/*
 * Move a nested page while leaving name-only links unchanged. Review and acceptance should
 * preserve the page's identity and working links.
 */
test('Sourcing moves a nested page while preserving its identity and name-only links', async ({ page, testServer, sourceChanges, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'meadow-test-bundle-big', expect);
  const original = bundleConfig.requireNode({ bundleNodeName: 't001 ---- child 2' });
  expect(original.listType).toBe('whitelist');
  await snapshot('the accepted source state is established before changing files');

  // --- Test start ---
  // Move the nested page.
  await sourceChanges.apply('move-nested-page');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.expectMoveCount(1);
  await editor.sourceReview.expectMove('Moved', 't001/deeper/t001 ---- child 2.md', 'source-changes/moved/t001 ---- child 2.md');
  await editor.sourceReview.expectMoveListed(original.bundleNodeId);
  await editor.sourceReview.orphans.expectNotListed(original.bundleNodeName);
  await addKeyFrame(sourceMove);
  await snapshot('review identifies the move through the shared source change');

  // Accept the source update.
  await editor.sourceReview.accept();
  expect(bundleConfig.findNode({ bundleNodeId: original.bundleNodeId })).toEqual({ ...original, sourceGraphSubdirectory: 'source-changes/moved' });
  await editor.switchToListView();
  await editor.expectListViewNodeVisible('source-changes/moved/t001 ---- child 2.md', true);
  await editor.expectListViewNodeVisible('t001/deeper/t001 ---- child 2.md', false);
  await addKeyFrame(sourceSnapshot);
  await snapshot('the moved file remains reachable with the same identity and tracking');

  await skipMeadowHomeStateCheck();
});
