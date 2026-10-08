/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, pendingSourceProposal, pendingProposalRevalidation, sourceReviewConfigurationMerge, proposalConfigurationDraft, tracking, blacklist, checkpointViewRestoration, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Pending sourcing proposals preserve later curation decisions and require conflict resolution`);

const description = linkedScenarioDescription(conceptText`Untrack two pages in a proposal, defer it, and blacklist the same pages in accepted curation. A separate
tracking edit must survive either resolution. The conflicts are captured open before choosing, then
one keeps the saved blacklist and the other applies the proposed untrack.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'b5ad609f-77b6-4cbf-9e1f-80ff8d52db07' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const filename = path.join(testServer.configDir, 'bundles/sourcing-review/config/bundle_node_config.yaml');
  const nodes = () => YAML.parse(fs.readFileSync(filename, 'utf8')).nodes;
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.rightClickRow('Reference'));
  await sourceCommand(() => editor.clickContextMenuItemAndAwaitAutoSave('Untrack'));
  expect(nodes().some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Reference')).toBe(false);
  await sourceCommand(() => sourcing.openByLink('sourcing-review'));
  await sourceCommand(() => checkpoint('an unrelated page is available for a later accepted tracking edit'));

  // --- Test start ---
  // The proposal's untracks remain isolated while accepted curation stays editable.
  for (const name of ['Leaf', 'Retained']) {
    await sourceCommand(() => sourcing.select(name));
    await sourceCommand(() => sourcing.untrackSelected());
  }
  await sourceCommand(() => checkpoint('Leaf and Retained have pending untrack choices before Later'));
  await sourceCommand(() => sourcing.later());
  await sourceCommand(() => editor.switchToListView());
  for (const name of ['Leaf', 'Retained']) {
    await sourceCommand(() => editor.rightClickRow(name));
    await sourceCommand(() => page.getByRole('button', { name: 'Blacklist', exact: true }).click());
    await sourceCommand(() => expect(page.getByRole('button', { name: 'Undo blacklist change', exact: true })).toBeVisible());
    await sourceCommand(() => expect(sourcing.root).toBeHidden());
  }
  await sourceCommand(() => editor.clickListViewRowByExactName('Reference'));
  await sourceCommand(() => Promise.all([
    page.waitForResponse(response => response.url().includes('/curation/node/track') && response.request().method() === 'POST' && response.ok()),
    page.getByTestId('selected-page-file:Routes/Reference.md').getByRole('button', { name: 'Track', exact: true }).click(),
  ]));
  const referenceId = nodes().find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Reference').bundleNodeId;
  for (const name of ['Leaf', 'Retained']) expect(nodes().find((node: { bundleNodeName: string }) => node.bundleNodeName === name).listType).toBe('blacklist');
  await sourceCommand(() => checkpoint('accepted curation blacklists Leaf and Retained and retains the independent tracked page'));

  // Reload recomputes the conflicts without overwriting either side.
  await sourceCommand(() => page.reload());
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => expect(sourcing.root.getByRole('button', { name: 'Accept changes', exact: true })).toBeDisabled());
  await sourceCommand(() => sourcing.resolveConflicts(2));
  const conflict = sourcing.conflictReview;
  for (const text of ['Leaf', 'Retained', 'blacklist', 'Removed']) await sourceCommand(() => expect(conflict).toContainText(text));
  await sourceCommand(() => addKeyFrame(sourceReviewConfigurationMerge));
  await sourceCommand(() => checkpoint('both conflicts are open and unresolved before choosing'));

  // Keep the saved blacklist for Leaf and apply the proposed untrack for Retained.
  await sourceCommand(() => sourcing.resolveConflict('Leaf', 'saved'));
  await sourceCommand(() => sourcing.resolveConflict('Retained', 'proposed'));
  await sourceCommand(() => expect(conflict).toContainText('All conflicts resolved.'));
  await sourceCommand(() => conflict.getByRole('button', { name: 'Close', exact: true }).click());
  await sourceCommand(() => sourcing.accept());
  expect(nodes().find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Reference').bundleNodeId).toBe(referenceId);
  expect(nodes().find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Leaf').listType).toBe('blacklist');
  expect(nodes().find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Retained')).toBeUndefined();
  await sourceCommand(() => checkpoint('saved and proposed resolutions are accepted with unrelated tracking preserved'));
  await sourceCommand(() => assertMeadowHomeState());
});
