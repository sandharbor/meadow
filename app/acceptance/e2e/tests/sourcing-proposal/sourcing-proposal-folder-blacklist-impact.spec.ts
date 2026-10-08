/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewTrigger, blacklist, sourceReviewWorkspace, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-folder" });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Sourcing previews folder blacklist and unblacklist reachability consequences`);

const description = linkedScenarioDescription(conceptText`An empty folder can be excluded immediately with Undo. Excluding Branch also removes two pages
outside its subtree and requires a proposal, while Reference retains its independently reached
page. Accept the exclusion, then remove it in curation and review the returning material.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'c18a4909-4dec-4cd5-8755-beee93dceaa2' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-folders'));
  await sourceCommand(() => editor.waitForLoad('sourcing-folders'));
  await sourceCommand(() => editor.switchToListView());
  const configPath = path.join(testServer.configDir, 'bundles/sourcing-folders/config/bundle_node_config.yaml');
  const configuration = () => YAML.parse(fs.readFileSync(configPath, 'utf8'));
  const original = configuration();
  await sourceCommand(() => checkpoint('the folder graph has an empty folder and a branch reaching outside its subtree'));

  // --- Test start ---
  await sourceCommand(() => editor.rightClickListViewRowByNodeKey('folder:Routes/Empty'));
  await sourceCommand(() => page.getByRole('button', { name: 'Blacklist', exact: true }).click());
  const undo = page.getByRole('button', { name: 'Undo blacklist change', exact: true });
  await sourceCommand(() => expect(undo).toBeVisible());
  await sourceCommand(() => expect(sourcing.root).toBeHidden());
  await sourceCommand(() => checkpoint('blacklisting the empty folder changes only that folder and offers Undo'));
  await sourceCommand(() => undo.click());
  await sourceCommand(() => expect(undo).toBeHidden());
  expect(configuration()).toEqual(original);

  await sourceCommand(() => editor.rightClickListViewRowByNodeKey('folder:Routes/Branch'));
  await sourceCommand(() => page.getByRole('button', { name: 'Blacklist', exact: true }).click());
  await sourceCommand(() => expect(sourcing.root).toBeVisible());
  expect(configuration()).toEqual(original);
  await sourceCommand(() => sourcing.select('Outside'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('Change: Remove'));
  await sourceCommand(() => sourcing.expectSelectedRemovalReason('Not reachable'));
  await sourceCommand(() => sourcing.select('Retained'));
  await sourceCommand(() => sourcing.expectSelectedRoute(['Routes', 'Reference', 'Retained']));
  await sourceCommand(() => sourcing.expectNoSelectedSourceChange());
  await sourceCommand(() => addKeyFrame(sourceReviewWorkspace));
  await sourceCommand(() => checkpoint('folder exclusion previews departures outside its subtree and the independent route'));
  await sourceCommand(() => sourcing.accept());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent('Outside'));
  await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent('Departing'));
  expect(configuration().nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Departing')).toBe(false);

  await sourceCommand(() => editor.rightClickListViewRowByNodeKey('folder:Routes/Branch'));
  await sourceCommand(() => page.getByRole('button', { name: 'Remove from Blacklist', exact: true }).click());
  await sourceCommand(() => expect(sourcing.root).toBeVisible());
  await sourceCommand(() => sourcing.select('Outside'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('Change: Add'));
  await sourceCommand(() => checkpoint('unblacklisting the folder stages the returning pages as a proposed expansion'));
  await sourceCommand(() => sourcing.accept());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewRowByExactNamePresent('Outside'));
  await sourceCommand(() => checkpoint('accepted expansion includes the outside pages with fresh curation settings'));
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['bundles/sourcing-folders/raw/folder_scope_snapshot.json'] }));
});
