/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, SelectedPageDetailComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, pendingSourceProposal, sourceReviewTrigger, sourceReviewWorkspace, overrides } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.Example });

/*
 * Increase a page's traversal depth from curation and enter sourcing. Inspect newly admitted nodes
 * immediately, the staged depth in the header summary, and the unchanged accepted settings. Choose
 * Later, reload, and verify accepted curation still uses the old scope and reopening restores the
 * proposed depth. Required checkpoints: accepted baseline; expanded candidate; reopened deferred
 * proposal.
 */
test('Sourcing depth edits preview the proposal while accepted curation stays stable', async ({ page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  await list.goto();
  await list.clickBundle('example-bundle');
  await editor.waitForLoad('example-bundle');
  await editor.switchToListView();
  await editor.expectListViewRowByExactNameNotPresent('Availability Bias');
  await editor.clickListViewRowByExactName('Cognitive Biases');
  const detail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await detail.openDetails();
  const configPath = path.join(testServer.configDir, 'bundles/example-bundle/config/bundle_node_config.yaml');
  const saved = fs.readFileSync(configPath, 'utf8');
  await checkpoint('accepted scope excludes the pages behind the Cognitive Biases stop');

  // --- Test start ---
  // Expand the stop and inspect the captured proposal without changing accepted settings.
  await editor.getSelectedPageRoot().getByTitle('Edit outlink depth override', { exact: true }).click();
  await detail.setOutlinksDepth(1);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const workspace = sourcing.root;
  await expect(workspace).toBeVisible();
  await expect(workspace.getByRole('button', { name: 'Accept source changes', exact: true })).toBeEnabled();
  await workspace.getByRole('button', { name: 'List View', exact: true }).click();
  await sourcing.expectNodeVisible('Availability Bias');
  expect(fs.readFileSync(configPath, 'utf8')).toBe(saved);
  await addKeyFrame(sourceReviewWorkspace);
  await checkpoint('expanded candidate includes Availability Bias while accepted configuration stays unchanged');

  // Later and reload retain the original curation graph and the durable proposal.
  await workspace.getByRole('button', { name: 'Later', exact: true }).click();
  await expect(workspace).toBeHidden();
  await page.reload();
  await editor.waitForLoad('example-bundle');
  await editor.switchToListView();
  await editor.expectListViewRowByExactNameNotPresent('Availability Bias');
  await page.getByTestId('sourcing-status').getByRole('button', { name: /source changes? available.*Review/i }).click();
  await expect(workspace).toBeVisible();
  await workspace.getByRole('button', { name: 'List View', exact: true }).click();
  await sourcing.expectNodeVisible('Availability Bias');
  expect(fs.readFileSync(configPath, 'utf8')).toBe(saved);
  await checkpoint('reopened deferred proposal retains the expanded capture and staged depth');

  // Discard leaves the accepted fixture exactly as it was.
  await workspace.getByRole('button', { name: 'Discard proposal', exact: true }).click();
  await expect(workspace).toBeHidden();
  expect(fs.readFileSync(configPath, 'utf8')).toBe(saved);
  await checkpoint('discard returned to the unchanged accepted scope');
  await assertMeadowHomeState();
});
