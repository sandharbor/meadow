/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, sourceReviewIdentity, pendingProposalRevalidation, sourceReviewAcceptance, sourceMove } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

/*
 * Confirm a rename, untrack that identity, then revise the match to separate pages. The dependent
 * tracking choice needs review against the new identity. Later preserves that revised decision;
 * acceptance records immutable identity evidence and a subsequent review starts a new proposal.
 */
test('Sourcing identity choices remain revisable only while the proposal is pending', { annotation: { type: 'scenario-id', description: '0724132a-c64b-45a4-b38f-84ec951f6b49' } }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'sourcing-review');
  const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => sourceChanges.apply('rename-review-pages', 'sourcing-review-data'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => sourcing.acceptAllIdentitySuggestions());
  await sourceCommand(() => sourcing.chooseIdentity('100000000002', 'Routes/Branch/Gateway.md'));
  await sourceCommand(() => sourcing.chooseIdentity('100000000003', 'Routes/Independent.md'));
  await sourceCommand(() => sourcing.chooseIdentity('100000000006', 'Retained One.md'));
  await sourceCommand(() => sourcing.continueToGraph());
  const pendingId = proposal.current.id;
  await sourceCommand(() => sourcing.select('Gateway'));
  await sourceCommand(() => sourcing.untrackSelected());
  await sourceCommand(() => sourcing.expectSelectedRename('Routes/Branch/Bridge.md', 'Routes/Branch/Gateway.md'));
  await sourceCommand(() => sourcing.expectNodeVisible('Bridge', false));
  await sourceCommand(() => checkpoint('a confirmed renamed identity has an explicit pending untrack choice'));

  // --- Test start ---
  // Revising identity keeps the old and new pages separate and revalidates the dependent choice.
  await sourceCommand(() => sourcing.root.getByRole('button', { name: 'Review identities', exact: true }).click());
  await sourceCommand(() => sourcing.chooseIdentity('100000000002', null));
  await sourceCommand(() => sourcing.continueToGraph());
  await sourceCommand(() => sourcing.select('Gateway'));
  await sourceCommand(() => expect(sourcing.evidence).toContainText('Change: Added'));
  await sourceCommand(() => sourcing.expectNodeVisible('Bridge'));
  await sourceCommand(() => expect(sourcing.root.getByRole('button', { name: 'Accept changes', exact: true })).toBeDisabled());
  await sourceCommand(() => sourcing.reviewTrackingChoices(1));
  await sourceCommand(() => expect(sourcing.sensitivityReview).toContainText('The page identity changed'));
  await sourceCommand(() => addKeyFrame(sourceReviewIdentity));
  await sourceCommand(() => checkpoint('revised identity exposes an unresolved dependent tracking choice'));

  // Explicit confirmation tracks the new page with a fresh identity.
  await sourceCommand(() => sourcing.sensitivityReview.getByRole('button', { name: 'Confirm tracking current page', exact: true }).click());
  await sourceCommand(() => expect(sourcing.sensitivityReview).toContainText('All tracking choices reviewed.'));
  await sourceCommand(() => sourcing.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click());
  const newId = proposal.current.tracking['file:Routes/Branch/Gateway.md'].bundleNodeId;
  expect(newId).not.toBe('100000000002');
  await sourceCommand(() => sourcing.later());
  await sourceCommand(() => page.reload());
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => sourcing.open());
  expect(proposal.current.id).toBe(pendingId);
  expect(proposal.current.identities['100000000002']).toBe(null);
  expect(proposal.current.tracking['file:Routes/Branch/Gateway.md'].bundleNodeId).toBe(newId);
  await sourceCommand(() => checkpoint('the revised identity and renewed tracking survive Later and reload'));
  await sourceCommand(() => sourcing.accept());
  const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes;
  expect(nodes.some((node: { bundleNodeId: string }) => node.bundleNodeId === '100000000002')).toBe(false);
  expect(nodes.find((node: { bundleNodeName: string }) => node.bundleNodeName === 'Gateway').bundleNodeId).toBe(newId);

  // Completed decisions remain visible as history, and cannot reopen the finished proposal.
  await sourceCommand(() => editor.reviewSourceHistory());
  const history = page.getByRole('dialog', { name: 'Source snapshots', exact: true });
  await sourceCommand(() => history.getByText('Accepted identity decisions', { exact: true }).click());
  await sourceCommand(() => expect(history).toContainText('Routes/Branch/Bridge.md'));
  await sourceCommand(() => expect(history).toContainText('Different pages; old configuration removed'));
  await sourceCommand(() => expect(history.getByRole('radio')).toHaveCount(0));
  await sourceCommand(() => addKeyFrame(sourceReviewAcceptance));
  await sourceCommand(() => checkpoint('accepted identity evidence is inspectable as read-only history'));
  await sourceCommand(() => history.getByRole('button', { name: 'Close source snapshots', exact: true }).click());
  await sourceCommand(() => sourcing.open());
  expect(proposal.current.id).not.toBe(pendingId);
  expect(proposal.current.identities).toEqual({});
  await sourceCommand(() => expect(sourcing.root.getByRole('button', { name: 'Review identities', exact: true })).toHaveCount(0));
  await sourceCommand(() => sourcing.discard());
  await sourceCommand(() => expect(sourcing.root).toBeHidden());
  await sourceCommand(() => checkpoint('a new review starts a fresh proposal instead of editing accepted decisions'));
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl', 'source_graphs/sourcing-review-data/Petal.md', 'source_graphs/sourcing-review-data/Retained One.md', 'source_graphs/sourcing-review-data/Retained Twin.md', 'source_graphs/sourcing-review-data/Routes/Branch/Gateway.md', 'source_graphs/sourcing-review-data/Routes/Independent.md'], allowedModified: ['source_graphs/sourcing-review-data/Start.md', 'source_graphs/sourcing-review-data/Leaf.md', 'source_graphs/sourcing-review-data/Retained.md', 'source_graphs/sourcing-review-data/Routes/Branch/Bridge.md', 'source_graphs/sourcing-review-data/Routes/Reference.md'] }));
});
