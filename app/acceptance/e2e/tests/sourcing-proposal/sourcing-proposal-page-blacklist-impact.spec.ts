/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import path from 'node:path';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewTrigger, blacklist, sourceReviewWorkspace, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Sourcing previews page blacklist effects beyond the selected page`);

const description = linkedScenarioDescription(conceptText`Excluding Bridge removes two pages outside its folder, while an independent route retains another
page. Sourcing preserves the departing pages and their prior connections for inspection. Removing
the staged exclusion restores the saved settings; accepted curation remains unchanged throughout.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'ba79e6c7-4b50-4a72-882a-de0230a677f0' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'sourcing-review');
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent('Outside'));
  const configPath = path.join(testServer.configDir, 'bundles/sourcing-review/config/bundle_node_config.yaml');
  const saved = fs.readFileSync(configPath, 'utf8');
  await sourceCommand(() => checkpoint('the bridge supplies the sole route to configured pages outside its folder'));

  // --- Test start ---
  // The complete impact automatically enters sourcing instead of saving the exclusion in curation.
  await sourceCommand(() => editor.rightClickRow('Bridge'));
  await sourceCommand(() => page.getByRole('button', { name: 'Blacklist', exact: true }).click());
  await sourceCommand(() => expect(sourcing.root).toBeVisible());
  expect(fs.readFileSync(configPath, 'utf8')).toBe(saved);
  await sourceCommand(() => sourcing.select('Outside'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('Change: Remove'));
  await sourceCommand(() => sourcing.expectSelectedRemovalReason('Not reachable'));
  await sourceCommand(() => sourcing.expectSelectedRoute(['Start', 'Bridge', 'Departing']));
  await sourceCommand(() => sourcing.select('Retained'));
  await sourceCommand(() => sourcing.expectNoSelectedSourceChange());
  await sourceCommand(() => sourcing.expectSelectedRoute(['Start', 'Reference', 'Retained']));
  await sourceCommand(() => addKeyFrame(sourceReviewWorkspace));
  await sourceCommand(() => checkpoint('wider departures remain inspectable while an independent route retains its page'));

  // Reverse the pending exclusion and inspect the restored configuration before accepting anything.
  await sourceCommand(() => sourcing.select('Bridge'));
  await sourceCommand(() => sourcing.setSelectedBlacklisted(false));
  await sourceCommand(() => sourcing.select('Departing'));
  await sourceCommand(() => sourcing.expectNoSelectedSourceChange());
  expect(proposal.current.proposed.nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Departing')?.outlinksDepth).toBe(1);
  expect(fs.readFileSync(configPath, 'utf8')).toBe(saved);
  await sourceCommand(() => checkpoint('reversing the exclusion restores the page and its saved depth setting'));

  await sourceCommand(() => sourcing.discard());
  await sourceCommand(() => expect(sourcing.root).toBeHidden());
  await sourceCommand(() => checkpoint('accepted curation has kept its original source scope and configuration'));
  await sourceCommand(() => assertMeadowHomeState());
});
