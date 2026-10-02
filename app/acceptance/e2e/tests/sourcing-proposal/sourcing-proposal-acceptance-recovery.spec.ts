/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
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
test('Failed proposal acceptance preserves accepted state and recoverable node and filter drafts', async ({ page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState, expectLogErrors }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const filters = new FilterPanelComponent(page, expect);
  const home = testServer.configDir;
  const bundle = path.join(home, 'bundles/sourcing-review');
  const proposalPath = path.join(bundle, 'raw/sourcing/proposal.json');
  const journalPath = path.join(home, 'app/sourcing-transaction.json');
  const faultPath = path.join(home, 'cache/sourcing-acceptance-fault.json');
  const read = (file: string) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const documents = () => Object.fromEntries([
    ...['config/bundle_config.yaml', 'config/bundle_node_config.yaml', 'config/custom_filters.json', 'raw/sourcing/state.json', 'raw/sourcing/tracking.json', 'raw/sourcing/last-acceptance.json', 'raw/sourcing/acceptance-history.json'].map(file => path.join(bundle, file)),
    path.join(home, 'app/global_custom_filters.json'), path.join(home, 'app/app_config.yaml'),
  ].map(file => [file, read(file)]));
  const arm = (mode: 'error' | 'interrupt') => { fs.mkdirSync(path.dirname(faultPath), { recursive: true }); fs.writeFileSync(faultPath, JSON.stringify({ mode })); };
  await list.goto();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  await sourceChanges.apply('recovery-material', 'sourcing-review-data');
  await editor.checkSourceChanges();
  await sourcing.open();
  await sourcing.select('Reference');
  await sourcing.untrackSelected();
  await sourcing.select('Bridge');
  await sourcing.setSelectedOutlinkDepth(0);
  await filters.clickAddCustomFilter();
  await filters.fillAndSaveCustomFilter({ name: 'Recovered bundle rule', field: 'title', matchType: 'substring', value: 'Reference' });
  await filters.clickAddCustomFilter();
  await filters.fillAndSaveCustomFilter({ name: 'Recovered shared rule', field: 'title', matchType: 'substring', value: 'Safe One', scope: 'global' });
  await filters.deleteCustomFilter('Daily Notes (Sensitive)');
  const acceptedSourceRefs = () => execFileSync('git', ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/meadow-sources/'], { cwd: home, encoding: 'utf8' }).split('\n').filter(line => !line.includes('-candidate '));
  const beforeRefs = acceptedSourceRefs();
  const before = documents();
  const pending = read(proposalPath);
  const proposed = JSON.parse(pending!);
  await checkpoint('a complete isolated proposal includes source node filter policy and cleanup changes');

  // --- Test start ---
  // A failed write after node and shared-policy installation rolls every document back.
  arm('error');
  const endFailure = expectLogErrors(/Injected sourcing acceptance storage failure|server responded with a status of 500/);
  await sourcing.root.getByRole('button', { name: 'Accept source changes', exact: true }).click();
  await expect(sourcing.root.getByRole('alert')).toContainText('Internal Server Error');
  expect(fs.existsSync(faultPath)).toBe(false);
  expect(fs.existsSync(journalPath)).toBe(false);
  expect(documents()).toEqual(before);
  expect(acceptedSourceRefs()).toEqual(beforeRefs);
  expect(read(proposalPath)).toBe(pending);
  endFailure();
  await addKeyFrame(sourceReviewAcceptance);
  await checkpoint('a real partial application failure restores accepted documents and preserves every draft');

  // Kill only the scenario service during installation, then restart against its journal and home.
  arm('interrupt');
  const endInterruption = expectLogErrors(/ERR_EMPTY_RESPONSE|ERR_CONNECTION|Failed to fetch|fetch failed|socket hang up|ECONNRESET|502 \(Bad Gateway\)/);
  await sourcing.root.getByRole('button', { name: 'Accept source changes', exact: true }).click();
  await expect.poll(() => fs.existsSync(journalPath)).toBe(true);
  await expect.poll(() => fs.existsSync(testServer.runtimeSessionPath)).toBe(false);
  expect(documents()).not.toEqual(before);
  expect(read(path.join(home, 'app/global_custom_filters.json'))).toContain('Recovered shared rule');
  expect(read(proposalPath)).toBe(pending);
  await page.goto('about:blank');
  await testServer.restartRuntime();
  expect(fs.existsSync(journalPath)).toBe(false);
  expect(documents()).toEqual(before);
  expect(acceptedSourceRefs()).toEqual(beforeRefs);
  expect(read(proposalPath)).toBe(pending);
  await page.goto(testServer.browserLaunchUrl);
  endInterruption();
  await list.clickBundle('sourcing-review');
  await editor.waitForLoad('sourcing-review');
  await sourcing.open();
  await filters.expectFilterVisible('Recovered bundle rule');
  await filters.expectFilterVisible('Recovered shared rule');
  await addKeyFrame(proposalConfigurationDraft);
  await checkpoint('process restart recovers the original accepted state and reopens the complete pending proposal');

  // The recovered proposal remains actionable, including both kinds of mandatory cleanup.
  await sourcing.accept();
  const accepted = documents();
  expect(accepted).not.toEqual(before);
  expect(fs.existsSync(proposalPath)).toBe(false);
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
  await addKeyFrame(pendingProposalRevalidation);
  await checkpoint('successful retry accepts the reviewed capture settings shared policy tracking and cleanup together');
  await assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'], allowedModified: ['source_graphs/sourcing-review-data/Start.md'] });
});
