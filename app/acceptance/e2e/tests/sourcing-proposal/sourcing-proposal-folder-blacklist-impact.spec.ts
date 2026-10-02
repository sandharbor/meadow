/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewTrigger, blacklist, sourceReviewWorkspace } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-folder" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * An empty folder can be excluded immediately with Undo. Excluding Branch also removes two pages
 * outside its subtree and requires a proposal, while Reference retains its independently reached
 * page. Accept the exclusion, then remove it in curation and review the returning material.
 */
test('Sourcing previews folder blacklist and unblacklist reachability consequences', async ({ page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  await list.goto();
  await list.clickBundle('sourcing-folders');
  await editor.waitForLoad('sourcing-folders');
  await editor.switchToListView();
  const configPath = path.join(testServer.configDir, 'bundles/sourcing-folders/config/bundle_node_config.yaml');
  const configuration = () => YAML.parse(fs.readFileSync(configPath, 'utf8'));
  const original = configuration();
  await checkpoint('the folder graph has an empty folder and a branch reaching outside its subtree');

  // --- Test start ---
  await editor.rightClickListViewRowByNodeKey('folder:Routes/Empty');
  await page.getByRole('button', { name: 'Blacklist', exact: true }).click();
  const undo = page.getByRole('button', { name: 'Undo blacklist change', exact: true });
  await expect(undo).toBeVisible();
  await expect(sourcing.root).toBeHidden();
  await checkpoint('blacklisting the empty folder changes only that folder and offers Undo');
  await undo.click();
  await expect(undo).toBeHidden();
  expect(configuration()).toEqual(original);

  await editor.rightClickListViewRowByNodeKey('folder:Routes/Branch');
  await page.getByRole('button', { name: 'Blacklist', exact: true }).click();
  await expect(sourcing.root).toBeVisible();
  expect(configuration()).toEqual(original);
  await sourcing.select('Outside');
  await expect(sourcing.evidence).toContainText('departing');
  await expect(sourcing.evidence).toContainText('Orphaned configuration');
  await sourcing.select('Retained');
  await expect(sourcing.evidence).toContainText('Reference');
  await expect(sourcing.evidence).toContainText('Unchanged source material');
  await addKeyFrame(sourceReviewWorkspace);
  await checkpoint('folder exclusion previews departures outside its subtree and the independent route');
  await sourcing.accept();
  await editor.switchToListView();
  await editor.expectListViewRowByExactNameNotPresent('Outside');
  await editor.expectListViewRowByExactNameNotPresent('Departing');
  expect(configuration().nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Departing')).toBe(false);

  await editor.rightClickListViewRowByNodeKey('folder:Routes/Branch');
  await page.getByRole('button', { name: 'Remove from Blacklist', exact: true }).click();
  await expect(sourcing.root).toBeVisible();
  await sourcing.select('Outside');
  await expect(sourcing.evidence).toContainText('Newly included');
  await checkpoint('unblacklisting the folder stages the returning pages as a proposed expansion');
  await sourcing.accept();
  await editor.switchToListView();
  await editor.expectListViewRowByExactNamePresent('Outside');
  await checkpoint('accepted expansion includes the outside pages with fresh curation settings');
  await assertMeadowHomeState({ allowedUntracked: ['bundles/sourcing-folders/raw/folder_scope_snapshot.json'] });
});
