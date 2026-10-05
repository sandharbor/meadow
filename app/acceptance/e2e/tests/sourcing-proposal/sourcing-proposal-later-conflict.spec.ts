/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, pendingSourceProposal, pendingProposalRevalidation, sourceReviewConfigurationMerge, proposalConfigurationDraft, tracking, blacklist, checkpointViewRestoration } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * Untrack a leaf in a proposal, defer it, and blacklist the same leaf in accepted curation. A separate
 * tracking edit must survive either resolution. Two proposals exercise keeping the saved blacklist
 * and applying the proposed untrack, with each conflict captured open before choosing.
 */
test('Pending sourcing proposals preserve later curation decisions and require conflict resolution', { annotation: { type: 'scenario-id', description: 'b5ad609f-77b6-4cbf-9e1f-80ff8d52db07' } }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
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
  await sourceCommand(() => checkpoint('an unrelated page is available for a later accepted tracking edit'));

  // --- Test start ---
  for (const [name, resolution] of [['Leaf', 'saved'], ['Retained', 'proposed']] as const) {
    // The proposal's untrack remains isolated while accepted curation stays editable.
    await sourceCommand(() => sourcing.open());
    await sourceCommand(() => sourcing.select(name));
    await sourceCommand(() => sourcing.untrackSelected());
    await sourceCommand(() => checkpoint(`${name} has a pending untrack choice before Later`));
    await sourceCommand(() => sourcing.later());
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => editor.rightClickRow(name));
    await sourceCommand(() => page.getByRole('button', { name: 'Blacklist', exact: true }).click());
    await sourceCommand(() => expect(page.getByRole('button', { name: 'Undo blacklist change', exact: true })).toBeVisible());
    await sourceCommand(() => expect(sourcing.root).toBeHidden());
    if (name === 'Leaf') {
      await sourceCommand(() => editor.clickListViewRowByExactName('Reference'));
      await sourceCommand(() => Promise.all([
        page.waitForResponse(response => response.url().includes('/curation/node/track') && response.request().method() === 'POST' && response.ok()),
        page.getByTestId('selected-page-file:Routes/Reference.md').getByRole('button', { name: 'Track', exact: true }).click(),
      ]));
    }
    const referenceId = nodes().find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Reference').bundleNodeId;
    expect(nodes().find((node: { bundleNodeName: string }) => node.bundleNodeName === name).listType).toBe('blacklist');
    await sourceCommand(() => checkpoint(`accepted curation blacklists ${name} and retains the independent tracked page`));

    // Reload recomputes the conflict without overwriting either side.
    await sourceCommand(() => page.reload());
    await sourceCommand(() => editor.waitForLoad('sourcing-review'));
    await sourceCommand(() => sourcing.open());
    await sourceCommand(() => expect(sourcing.root.getByRole('button', { name: 'Accept source changes', exact: true })).toBeDisabled());
    await sourceCommand(() => sourcing.root.getByRole('button', { name: 'Resolve 1 configuration conflicts', exact: true }).click());
    const conflict = page.getByRole('dialog', { name: 'Resolve configuration conflicts', exact: true });
    await sourceCommand(() => expect(conflict).toContainText(name));
    await sourceCommand(() => expect(conflict).toContainText('blacklist'));
    await sourceCommand(() => expect(conflict).toContainText('Removed'));
    await sourceCommand(() => addKeyFrame(sourceReviewConfigurationMerge));
    await sourceCommand(() => checkpoint(`${name} conflict is open and unresolved before choosing ${resolution}`));
    await sourceCommand(() => conflict.getByRole('button', { name: `Use ${resolution}`, exact: true }).click());
    await sourceCommand(() => expect(conflict).toContainText('All conflicts resolved.'));
    await sourceCommand(() => conflict.getByRole('button', { name: 'Close', exact: true }).click());
    await sourceCommand(() => sourcing.accept());
    expect(nodes().find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Reference').bundleNodeId).toBe(referenceId);
    const resolved = nodes().find((node: { bundleNodeName: string }) => node.bundleNodeName === name);
    if (resolution === 'saved') expect(resolved.listType).toBe('blacklist');
    else expect(resolved).toBeUndefined();
    await sourceCommand(() => checkpoint(`${resolution} resolution for ${name} is accepted with unrelated tracking preserved`));
  }
  await sourceCommand(() => assertMeadowHomeState());
});
