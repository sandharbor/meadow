/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, sourceMove, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });

const name = linkedScenarioName(conceptText`Sourcing moves a nested group while unchanged name-only links retain all three identities`);

const description = linkedScenarioDescription(conceptText`Move a nested group whose links use page names. Accept the move and verify that all
three page identities survive.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '2f0bd0e6-f5e7-4016-ad12-eeade9f8569b' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForSourceCheck());
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'meadow-test-bundle-big', expect);
  const original = bundleConfig.readNodes().filter(node => node.bundleNodeName.startsWith('t001 ---- child'));
  expect(original).toHaveLength(3);
  await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));

  // --- Test start ---
  // Move the nested group.
  await sourceCommand(() => sourceChanges.apply('move-nested-group'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.expectMoveCount(3));
  await sourceCommand(() => editor.sourceReview.expectDirectoryGroupCollapsed('t001', 'source-changes/nested', 3));
  await sourceCommand(() => editor.sourceReview.refreshIdentitySources());
  await sourceCommand(() => addKeyFrame(sourceMove));
  await sourceCommand(() => checkpoint('a collapsed overview summarizes the shared change for three files'));

  // Change every identity directly from the collapsed group's choice column.
  await sourceCommand(() => editor.sourceReview.chooseCompactIdentity(original[0].bundleNodeId, 'Different'));
  await sourceCommand(() => editor.sourceReview.expectCompactIdentity(original[0].bundleNodeId, 'Different', 3));
  await sourceCommand(() => addKeyFrame(sourceMove));
  await sourceCommand(() => checkpoint('the compact group choice applies Different to all three files'));
  await sourceCommand(() => editor.sourceReview.chooseCompactIdentity(original[0].bundleNodeId, 'Same'));
  await sourceCommand(() => editor.sourceReview.expectCompactIdentity(original[0].bundleNodeId, 'Same', 3));
  for (const node of original) {
    await sourceCommand(() => editor.sourceReview.expectMoveListed(node.bundleNodeId));
  }
  await sourceCommand(() => editor.sourceReview.expectIdentityActionsStayVisibleWhenScrolling());
  await sourceCommand(() => addKeyFrame(sourceMove));
  await sourceCommand(() => editor.sourceReview.scrollIdentityListToStart());

  // Keep the expanded group intact when one file gets a different decision.
  // Hold the write so the selection and counts must update before a server response.
  let releaseSave!: () => void;
  const heldSave = new Promise<void>(resolve => { releaseSave = resolve; });
  const identityEndpoint = '**/sourcing/proposal/identities';
  await page.route(identityEndpoint, async route => { await heldSave; await route.continue(); });
  const savedChoice = page.waitForResponse(response => response.url().endsWith('/sourcing/proposal/identities') && response.ok());
  const changedRecord = page.getByTestId(`source-move-${original[0].bundleNodeId}`);
  try {
    await sourceCommand(() => changedRecord.getByRole('radio', { name: 'Different', exact: true }).click());
    await sourceCommand(() => expect(changedRecord.getByRole('radio', { name: 'Different', exact: true })).toBeChecked());
    await sourceCommand(() => editor.sourceReview.expectCompactIdentity(original[0].bundleNodeId, 'Same', 2));
    await sourceCommand(() => editor.sourceReview.expectCompactIdentity(original[0].bundleNodeId, 'Different', 1));
    await sourceCommand(() => expect(page.getByRole('status').filter({ hasText: 'Saving choices' })).toBeVisible());
    await sourceCommand(() => expect(changedRecord.getByRole('radio', { name: 'Same', exact: true })).toBeEnabled());
    await sourceCommand(() => addKeyFrame(sourceMove));
  } finally { releaseSave(); }
  await savedChoice;
  await page.unroute(identityEndpoint);
  await sourceCommand(() => expect(page.getByRole('status').filter({ hasText: 'Saving choices' })).toHaveCount(0));
  await sourceCommand(() => editor.sourceReview.expectDirectoryGroupExpanded('t001', 'source-changes/nested', 3));
  await sourceCommand(() => editor.sourceReview.expectCompactIdentity(original[0].bundleNodeId, 'Same', 2));
  await sourceCommand(() => editor.sourceReview.expectCompactIdentity(original[0].bundleNodeId, 'Different', 1));
  await sourceCommand(() => addKeyFrame(sourceMove));
  await sourceCommand(() => checkpoint('one expanded group keeps all three files with Same 2 and Different 1 in its choice column'));

  // Change just the Different subset back to Same.
  await sourceCommand(() => editor.sourceReview.chooseCompactIdentity(original[0].bundleNodeId, 'Same', 'Different'));
  await sourceCommand(() => editor.sourceReview.expectCompactIdentity(original[0].bundleNodeId, 'Same', 3));
  await sourceCommand(() => editor.sourceReview.expectDirectoryGroupExpanded('t001', 'source-changes/nested', 3));
  await sourceCommand(() => editor.sourceReview.continueToGraph());
  for (const node of original) await sourceCommand(() => editor.sourceReview.orphans.expectNotListed(node.bundleNodeName));
  await sourceCommand(() => addKeyFrame(sourceMove));
  await sourceCommand(() => checkpoint('all three reachable pages are proposed as moves'));

  // Accept the source update.
  await sourceCommand(() => editor.sourceReview.accept());
  const updated = bundleConfig.readNodes();
  await sourceCommand(() => editor.switchToListView());
  for (const node of original) {
    const directory = node.bundleNodeName === 't001 ---- child 2' ? 'source-changes/nested/deeper' : 'source-changes/nested';
    expect(updated.find(item => item.bundleNodeId === node.bundleNodeId)).toEqual({ ...node, sourceGraphSubdirectory: directory });
    await sourceCommand(() => editor.expectListViewNodeVisible(`file:${directory}/${node.bundleNodeName}.md`, true));
  }
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('unchanged links reach the relocated group after acceptance'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
