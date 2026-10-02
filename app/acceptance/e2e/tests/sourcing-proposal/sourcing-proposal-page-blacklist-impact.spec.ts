/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import path from 'node:path';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewTrigger, blacklist, sourceReviewWorkspace } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * Excluding Bridge removes two pages outside its folder, while an independent route retains another
 * page. Sourcing preserves the departing pages and their prior connections for inspection. Removing
 * the staged exclusion restores the saved settings; accepted curation remains unchanged throughout.
 */
test('Sourcing previews page blacklist effects beyond the selected page', async ({ page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'sourcing-review');
  await list.goto();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  await editor.switchToListView();
  await editor.expectListViewRowByExactNamePresent('Outside');
  const configPath = path.join(testServer.configDir, 'bundles/sourcing-review/config/bundle_node_config.yaml');
  const saved = fs.readFileSync(configPath, 'utf8');
  await checkpoint('the bridge supplies the sole route to configured pages outside its folder');

  // --- Test start ---
  // The complete impact automatically enters sourcing instead of saving the exclusion in curation.
  await editor.rightClickRow('Bridge');
  await page.getByRole('button', { name: 'Blacklist', exact: true }).click();
  await expect(sourcing.root).toBeVisible();
  expect(fs.readFileSync(configPath, 'utf8')).toBe(saved);
  await sourcing.select('Outside');
  await expect(sourcing.evidence).toContainText('departing');
  await expect(sourcing.evidence).toContainText('Orphaned configuration');
  await expect(sourcing.evidence).toContainText('Start → Bridge → Departing');
  await sourcing.select('Retained');
  await expect(sourcing.evidence).toContainText('Unchanged source material');
  await expect(sourcing.evidence).toContainText('Reference');
  await addKeyFrame(sourceReviewWorkspace);
  await checkpoint('wider departures remain inspectable while an independent route retains its page');

  // Reverse the pending exclusion and inspect the restored configuration before accepting anything.
  await sourcing.select('Bridge');
  await sourcing.setSelectedBlacklisted(false);
  await sourcing.select('Departing');
  await expect(sourcing.evidence).toContainText('Unchanged source material');
  await expect(sourcing.evidence).not.toContainText('Orphaned configuration');
  expect(proposal.current.proposed.nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Departing')?.outlinksDepth).toBe(1);
  expect(fs.readFileSync(configPath, 'utf8')).toBe(saved);
  await checkpoint('reversing the exclusion restores the page and its saved depth setting');

  await sourcing.root.getByRole('button', { name: 'Discard proposal', exact: true }).click();
  await expect(sourcing.root).toBeHidden();
  await checkpoint('accepted curation has kept its original source scope and configuration');
  await assertMeadowHomeState();
});
