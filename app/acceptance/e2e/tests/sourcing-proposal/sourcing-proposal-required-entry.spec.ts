/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent } from '../../src/run/pages/index.js';
import { SourcesControl } from '../../src/run/pages/areas/bundle/sourcing/SourcesControl.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { sourcingReviewRedesign, sourceReviewCleanup, sourceReviewAcceptance, startingSelection, sourceMove } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: 'home_fixture_multi_source' });

/*
 * Remove the required start while page and filter edits are pending. Acceptance and graph entry stay
 * blocked until source management selects a replacement. The repair retains the proposal's identity
 * and edits, and a deliberately disconnected source is described as disconnected, never deleted.
 */
test('Sourcing requires repair of missing required entries before acceptance', async ({ page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'multi-source-page');
  const sources = new SourcesControl(page, expect);
  const panel = new FilterPanelComponent(page, expect);
  const directory = path.join(testServer.configDir, 'bundles/multi-source-page');
  const bundlePath = path.join(directory, 'config/bundle_config.yaml');
  const before = fs.readFileSync(bundlePath, 'utf8');
  await list.goto();
  await list.clickBundle('multi-source-page');
  await editor.waitForLoad('multi-source-page');
  await sourcing.open();
  await sourcing.select('Study');
  await sourcing.untrackSelected();
  await panel.clickAddCustomFilter();
  await panel.fillAndSaveCustomFilter({ name: 'Preserved during repair', field: 'title', matchType: 'substring', value: 'Overview' });
  const pendingId = proposal.current.id;
  await checkpoint('page and filter edits are pending before the required start disappears');

  // --- Test start ---
  await sourceChanges.apply('remove-required-start', 'multi-source');
  await sourcing.updateSources();
  await expect(sourcing.root.getByRole('alert')).toContainText('Repair missing required entries');
  await expect(sourcing.root.getByRole('alert')).toContainText('Start');
  await expect(sourcing.root.getByRole('button', { name: 'Accept source changes', exact: true })).toBeDisabled();
  await expect(page.getByTestId('graph-canvas')).toHaveCount(0);
  expect(fs.readFileSync(bundlePath, 'utf8')).toBe(before);
  expect(proposal.current.id).toBe(pendingId);
  await addKeyFrame(sourceReviewCleanup);
  await checkpoint('the missing required entry blocks graph entry and acceptance without removing its configuration');
  await sourcing.later();
  await sources.open();
  await sources.editStartingSelections();
  await sources.setStartingSelection(1, 'notes', 'file', 'Overview.md');
  await sources.remove('source000002');
  await checkpoint('source settings explicitly replace the missing entry and disconnect a separate source');
  await sources.stage();
  await expect(sourcing.root.getByRole('alert')).toHaveCount(0);
  expect(proposal.current.id).toBe(pendingId);
  expect(proposal.current.tracking['file:_mw_sources/source000003/Study.md']).toMatchObject({ track: false, origin: 'explicit' });
  expect(proposal.current.proposed.bundleFilters.some((filter: { name: string }) => filter.name === 'Preserved during repair')).toBe(true);
  expect(fs.readFileSync(bundlePath, 'utf8')).toBe(before);
  await sourcing.select('Incoming');
  await expect(sourcing.evidence).toContainText('source is no longer connected');
  await expect(sourcing.evidence).not.toContainText('source was missing');
  expect(fs.existsSync(path.join(testServer.sourceGraphsDir, 'multi-source/research/Incoming.md'))).toBe(true);
  await addKeyFrame(startingSelection);
  await checkpoint('the repaired proposal keeps its pending decisions and distinguishes disconnected material');
  await sourcing.accept();
  const accepted = YAML.parse(fs.readFileSync(bundlePath, 'utf8'));
  expect(accepted.entryBundleNodeId).toBe('95b568da6b98');
  expect(accepted.defaultTraversalBundleNodeId).toBe('95b568da6b98');
  expect(accepted.sources.map((source: { name: string }) => source.name)).toEqual(['notes', 'reference']);
  const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes;
  expect(nodes.some((node: { bundleNodeId: string }) => node.bundleNodeId === '3265a081dc61')).toBe(false);
  await panel.expectFilterVisible('Preserved during repair');
  await checkpoint('acceptance installs the repaired required entries pending filter and mandatory cleanup');
  await assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'], allowedModified: ['source_graphs/multi-source/notes/Start.md'] });
});
