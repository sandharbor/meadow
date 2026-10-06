/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewTrigger, blacklist } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * A leaf exclusion stays in curation with a conditional Undo. Hiding the other graph pages does not
 * make a bridge safe to exclude immediately: its wider impact still opens sourcing. A leaf exclusion
 * made inside sourcing stays in that proposal. Empty-folder shortcuts are covered with folder review.
 */
test('Curation applies blacklist shortcuts only when calculated impact is limited to the selected item', { annotation: { type: 'scenario-id', description: '09fc160a-3e39-4bb1-8fe0-7b722c5c91ac' } }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'sourcing-review');
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => editor.switchToListView());
  const configPath = path.join(testServer.configDir, 'bundles/sourcing-review/config/bundle_node_config.yaml');
  const configuration = () => YAML.parse(fs.readFileSync(configPath, 'utf8'));
  const original = configuration();
  await sourceCommand(() => checkpoint('a leaf and a bridge have different effects on the complete graph'));

  // --- Test start ---
  // A true leaf is a reversible immediate curation edit.
  await sourceCommand(() => editor.rightClickRow('Leaf'));
  await sourceCommand(() => page.getByRole('button', { name: 'Blacklist', exact: true }).click());
  const undo = page.getByRole('button', { name: 'Undo blacklist change', exact: true });
  await sourceCommand(() => expect(undo).toBeVisible());
  await sourceCommand(() => expect(sourcing.root).toBeHidden());
  expect(configuration().nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Leaf')?.listType).toBe('blacklist');
  await sourceCommand(() => addKeyFrame(blacklist));
  await sourceCommand(() => checkpoint('the leaf blacklist was applied with Undo and no wider scope changes'));

  await sourceCommand(() => undo.click());
  await sourceCommand(() => expect(undo).toBeHidden());
  expect(configuration()).toEqual(original);
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent('Leaf'));
  await sourceCommand(() => checkpoint('Undo restores the original accepted page settings'));

  // Filtering the graph to an apparent leaf cannot conceal its actual departures.
  await sourceCommand(() => new FilterPanelComponent(page, expect).fillSearch('Bridge'));
  await sourceCommand(() => editor.rightClickRow('Bridge'));
  await sourceCommand(() => page.getByRole('button', { name: 'Blacklist', exact: true }).click());
  await sourceCommand(() => expect(sourcing.root).toBeVisible());
  expect(configuration()).toEqual(original);
  await sourceCommand(() => sourcing.select('Outside'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('departing'));
  await sourceCommand(() => checkpoint('the hidden wider consequences require a sourcing proposal'));

  // Once sourcing is open, even a harmless leaf exclusion remains staged.
  await sourceCommand(() => sourcing.select('Leaf'));
  await sourceCommand(() => sourcing.setSelectedBlacklisted(true));
  expect(configuration()).toEqual(original);
  expect(proposal.current.proposed.nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Leaf')?.listType).toBe('blacklist');
  await sourceCommand(() => checkpoint('the harmless leaf edit is staged with the wider pending exclusion'));

  await sourceCommand(() => sourcing.discard());
  await sourceCommand(() => expect(sourcing.root).toBeHidden());
  expect(configuration()).toEqual(original);
  await sourceCommand(() => checkpoint('discard preserves the accepted configuration after both staged exclusions'));
  await sourceCommand(() => assertMeadowHomeState());
});
