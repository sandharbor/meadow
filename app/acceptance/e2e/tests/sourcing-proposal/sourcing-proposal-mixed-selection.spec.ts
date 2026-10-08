/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewWorkspace, tracking, sourceReviewCleanup, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Sourcing bulk tracking explicitly reports departing comparison nodes it cannot track`);

const description = linkedScenarioDescription(conceptText`Track an eligible untracked candidate together with a departing comparison node. The action
stages the eligible page and explicitly names the departure it skipped. Acceptance applies the
complete scope and mandatory cleanup without any per-page source approval.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'e6c2836c-da56-4f84-9488-64b007b3989a' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'sourcing-review');
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
  const saved = fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8');
  await sourceCommand(() => sourcing.openByLink('sourcing-review'));
  await sourceCommand(() => sourcing.select('Bridge'));
  await sourceCommand(() => sourcing.setSelectedOutlinkDepth(0));
  await sourceCommand(() => sourcing.select('Reference'));
  await sourceCommand(() => sourcing.untrackSelected());
  await sourceCommand(() => checkpoint('the proposed graph contains an eligible untracked page and departing configured pages'));

  // --- Test start ---
  await sourceCommand(() => sourcing.addToSelection('Departing'));
  await sourceCommand(() => expect(sourcing.root.getByRole('button', { name: 'Track All', exact: true })).toBeEnabled());
  await sourceCommand(() => checkpoint('the mixed selection contains a candidate and a departing comparison node'));
  await sourceCommand(() => sourcing.root.getByRole('button', { name: 'Track All', exact: true }).click());
  await sourceCommand(() => expect(sourcing.root.getByRole('status')).toContainText('Skipped 1 selected page: Departing'));
  expect(proposal.current.tracking['file:Routes/Reference.md']).toMatchObject({ track: true, origin: 'explicit' });
  expect(proposal.current.tracking['file:Departing.md']).toBeUndefined();
  expect(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).toBe(saved);
  await sourceCommand(() => addKeyFrame(sourceReviewWorkspace));
  await sourceCommand(() => checkpoint('the bulk action explicitly reports the skipped departure and stages only the eligible page'));
  await sourceCommand(() => sourcing.accept());
  const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes;
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Reference')).toBe(true);
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Departing')).toBe(false);
  await sourceCommand(() => checkpoint('acceptance applies the full source proposal including cleanup of the skipped departure'));
  await sourceCommand(() => assertMeadowHomeState());
});
