/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewAcceptance, proposalConfigurationDraft, pendingProposalRevalidation } from '../../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: Fixture.SourcingReview, _backendExtraEnv: {
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(path.resolve(import.meta.dirname, '../../src/run/scripts/sourcing_acceptance_fault.mjs')).href}`,
} });

/*
 * Stage captured material, node/tracking changes, bundle and shared filters, default-policy removal,
 * and cleanup. Fail an actual document rename after partial installation, then interrupt the process
 * at that same boundary. Restart the owned Runtime and verify exact rollback plus a recoverable
 * proposal before accepting the whole change successfully.
 */
test('Failed proposal acceptance preserves accepted state and recoverable node and filter drafts', { annotation: { type: 'scenario-id', description: '585e9b0e-3c46-47c8-b5d3-e0cf71bb3d8e' } }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState, expectLogErrors }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'sourcing-review');
  const filters = new FilterPanelComponent(page, expect);
  const home = testServer.configDir;
  const bundle = path.join(home, 'bundles/sourcing-review');
  const journalPath = path.join(home, 'app/sourcing-transaction.json');
  const faultPath = path.join(home, 'cache/sourcing-acceptance-fault.json');
  const read = (file: string) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const documents = () => Object.fromEntries([
    ...['config/bundle_config.yaml', 'config/bundle_node_config.yaml', 'config/custom_filters.json', 'raw/sourcing/state.json', 'raw/sourcing/tracking.json', 'raw/sourcing/last-acceptance.json', 'raw/sourcing/acceptance-history.json'].map(file => path.join(bundle, file)),
    path.join(home, 'app/global_custom_filters.json'), path.join(home, 'app/app_config.yaml'),
  ].map(file => [file, read(file)]));
  const arm = (mode: 'error' | 'interrupt') => { fs.mkdirSync(path.dirname(faultPath), { recursive: true }); fs.writeFileSync(faultPath, JSON.stringify({ mode })); };
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => sourceChanges.apply('recovery-material', 'sourcing-review-data'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => sourcing.select('Reference'));
  await sourceCommand(() => sourcing.untrackSelected());
  await sourceCommand(() => sourcing.select('Bridge'));
  await sourceCommand(() => sourcing.setSelectedOutlinkDepth(0));
  await sourceCommand(() => filters.clickAddCustomFilter());
  await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Recovered bundle rule', field: 'title', matchType: 'substring', value: 'Reference' }));
  await sourceCommand(() => filters.clickAddCustomFilter());
  await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Recovered shared rule', field: 'title', matchType: 'substring', value: 'Safe One', scope: 'global' }));
  await sourceCommand(() => filters.deleteCustomFilter('Daily Notes (Sensitive)'));
  const acceptedSourceRefs = () => execFileSync('git', ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/meadow-sources/'], { cwd: home, encoding: 'utf8' }).split('\n').filter(line => !line.includes('-candidate '));
  const beforeRefs = acceptedSourceRefs();
  const before = documents();
  const pending = proposal.serialized;
  const proposed = proposal.current;
  await sourceCommand(() => checkpoint('a complete isolated proposal includes source node filter policy and cleanup changes'));

  // --- Test start ---
  // A failed write after node and shared-policy installation rolls every document back.
  arm('error');
  const endFailure = expectLogErrors(/Injected sourcing acceptance storage failure|server responded with a status of 500/);
  await sourceCommand(() => sourcing.root.getByRole('button', { name: 'Accept changes', exact: true }).click());
  await sourceCommand(() => expect(sourcing.root.getByRole('alert')).toContainText('Internal Server Error'));
  expect(fs.existsSync(faultPath)).toBe(false);
  expect(fs.existsSync(journalPath)).toBe(false);
  expect(documents()).toEqual(before);
  expect(acceptedSourceRefs()).toEqual(beforeRefs);
  expect(proposal.serialized).toBe(pending);
  endFailure();
  await sourceCommand(() => addKeyFrame(sourceReviewAcceptance));
  await sourceCommand(() => checkpoint('a real partial application failure restores accepted documents and preserves every draft'));

  // Kill only the scenario service during installation, then restart against its journal and home.
  arm('interrupt');
  const endInterruption = expectLogErrors(/ERR_EMPTY_RESPONSE|ERR_CONNECTION|Failed to fetch|fetch failed|socket hang up|ECONNRESET|502 \(Bad Gateway\)/);
  await sourceCommand(() => sourcing.root.getByRole('button', { name: 'Accept changes', exact: true }).click());
  await sourceCommand(() => expect.poll(() => fs.existsSync(journalPath)).toBe(true));
  await sourceCommand(() => expect.poll(() => fs.existsSync(testServer.runtimeSessionPath)).toBe(false));
  expect(documents()).not.toEqual(before);
  expect(read(path.join(home, 'app/global_custom_filters.json'))).toContain('Recovered shared rule');
  expect(proposal.serialized).toBe(pending);
  await sourceCommand(() => page.goto('about:blank'));
  await sourceCommand(() => testServer.restartRuntime());
  expect(fs.existsSync(journalPath)).toBe(false);
  expect(documents()).toEqual(before);
  expect(acceptedSourceRefs()).toEqual(beforeRefs);
  expect(proposal.serialized).toBe(pending);
  await sourceCommand(() => page.goto(testServer.browserLaunchUrl));
  endInterruption();
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => filters.expectFilterVisible('Recovered bundle rule'));
  await sourceCommand(() => filters.expectFilterVisible('Recovered shared rule'));
  await sourceCommand(() => addKeyFrame(proposalConfigurationDraft));
  await sourceCommand(() => checkpoint('process restart recovers the original accepted state and reopens the complete pending proposal'));

  // The recovered proposal remains actionable, including both kinds of mandatory cleanup.
  await sourceCommand(() => sourcing.accept());
  const accepted = documents();
  expect(accepted).not.toEqual(before);
  expect(proposal.exists).toBe(false);
  expect(fs.existsSync(journalPath)).toBe(false);
  const nodes = YAML.parse(read(path.join(bundle, 'config/bundle_node_config.yaml'))!).nodes;
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Leaf')).toBe(false);
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Departing')).toBe(false);
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Reference')).toBe(false);
  expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === 'Safe One')).toBe(true);
  expect(JSON.parse(read(path.join(bundle, 'raw/sourcing/state.json'))!).acceptedId).toBe(proposed.candidateSnapshotId);
  expect(read(path.join(bundle, 'config/custom_filters.json'))).toContain('Recovered bundle rule');
  expect(read(path.join(home, 'app/global_custom_filters.json'))).toContain('Recovered shared rule');
  expect(YAML.parse(read(path.join(home, 'app/app_config.yaml'))!).deletedDefaultFilterIds).toContain('default-daily-notes-sensitive');
  expect(JSON.parse(read(path.join(bundle, 'raw/sourcing/acceptance-history.json'))!)).toHaveLength(1);
  await sourceCommand(() => addKeyFrame(pendingProposalRevalidation));
  await sourceCommand(() => checkpoint('successful retry accepts the reviewed capture settings shared policy tracking and cleanup together'));
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'], allowedModified: ['source_graphs/sourcing-review-data/Start.md'] }));
});
