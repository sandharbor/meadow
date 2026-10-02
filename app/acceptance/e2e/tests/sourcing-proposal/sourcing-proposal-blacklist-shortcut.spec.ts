/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
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
test('Curation applies blacklist shortcuts only when calculated impact is limited to the selected item', async ({ page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  await list.goto();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  await editor.switchToListView();
  const configPath = path.join(testServer.configDir, 'bundles/sourcing-review/config/bundle_node_config.yaml');
  const configuration = () => YAML.parse(fs.readFileSync(configPath, 'utf8'));
  const original = configuration();
  await checkpoint('a leaf and a bridge have different effects on the complete graph');

  // --- Test start ---
  // A true leaf is a reversible immediate curation edit.
  await editor.rightClickRow('Leaf');
  await page.getByRole('button', { name: 'Blacklist', exact: true }).click();
  const undo = page.getByRole('button', { name: 'Undo blacklist change', exact: true });
  await expect(undo).toBeVisible();
  await expect(sourcing.root).toBeHidden();
  expect(configuration().nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Leaf').listType).toBe('blacklist');
  await addKeyFrame(blacklist);
  await checkpoint('the leaf blacklist was applied with Undo and no wider scope changes');

  await undo.click();
  await expect(undo).toBeHidden();
  expect(configuration()).toEqual(original);
  await editor.expectListViewRowByExactNamePresent('Leaf');
  await checkpoint('Undo restores the original accepted page settings');

  // Filtering the graph to an apparent leaf cannot conceal its actual departures.
  await new FilterPanelComponent(page, expect).fillSearch('Bridge');
  await editor.rightClickRow('Bridge');
  await page.getByRole('button', { name: 'Blacklist', exact: true }).click();
  await expect(sourcing.root).toBeVisible();
  expect(configuration()).toEqual(original);
  await sourcing.select('Outside');
  await expect(sourcing.evidence).toContainText('departing');
  await checkpoint('the hidden wider consequences require a sourcing proposal');

  // Once sourcing is open, even a harmless leaf exclusion remains staged.
  await sourcing.select('Leaf');
  await sourcing.setSelectedBlacklisted(true);
  expect(configuration()).toEqual(original);
  const proposal = JSON.parse(fs.readFileSync(path.join(testServer.configDir, 'bundles/sourcing-review/raw/sourcing/proposal.json'), 'utf8'));
  expect(proposal.proposed.nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Leaf').listType).toBe('blacklist');
  await checkpoint('the harmless leaf edit is staged with the wider pending exclusion');

  await sourcing.root.getByRole('button', { name: 'Discard proposal', exact: true }).click();
  await expect(sourcing.root).toBeHidden();
  expect(configuration()).toEqual(original);
  await checkpoint('discard preserves the accepted configuration after both staged exclusions');
  await assertMeadowHomeState();
});
