/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../../src/run/state/SourcingProposalState.js';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, pendingProposalRevalidation, sourceChangesDuringReview, pendingSourceProposal, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.SourcingReview });

const name = linkedScenarioName(conceptText`Updating a sourcing proposal preserves applicable decisions and exposes invalidated decisions`);

const description = linkedScenarioDescription(conceptText`Refresh after a tracked page loses its route. The proposal keeps a compatible untrack choice and
exposes the now-unavailable tracked target. A disconnected-source failure preserves that complete
proposal; the user can leave the unavailable page untracked and accept the reviewed capture.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '47eff446-9951-43f2-9c24-e60fea06abfc' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, assertMeadowHomeState, expectLogErrors }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'sourcing-review');
  const directory = path.join(testServer.configDir, 'bundles/sourcing-review');
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('sourcing-review'));
  await sourceCommand(() => editor.waitForLoad('sourcing-review'));
  await sourceCommand(() => sourcing.openByLink('sourcing-review'));
  await sourceCommand(() => sourcing.select('Reference'));
  await sourceCommand(() => sourcing.untrackSelected());
  await sourceCommand(() => sourcing.select('Leaf'));
  await sourceCommand(() => sourcing.untrackSelected());
  await sourceCommand(() => sourcing.trackSelected());
  const captured = proposal.current.candidateSnapshotId;
  await sourceCommand(() => checkpoint('the reviewed capture has explicit tracking and untracking choices'));

  // --- Test start ---
  // Discovery announces newer material without replacing the capture or its decisions.
  await sourceCommand(() => sourceChanges.apply('remove-leaf-link', 'sourcing-review-data'));
  await sourceCommand(() => sourcing.later());
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => sourcing.open());
  await sourceCommand(() => expect(sourcing.root.getByRole('status')).toContainText('Newer sources available'));
  await sourceCommand(() => expect(proposal.current.candidateSnapshotId).toBe(captured));
  await sourceCommand(() => checkpoint('newer sources are available while the reviewed capture remains unchanged'));
  await sourceCommand(() => sourcing.updateSources());
  await sourceCommand(() => expect(proposal.current.candidateSnapshotId).not.toBe(captured));
  await sourceCommand(() => expect(proposal.current.tracking['file:Routes/Reference.md']).toMatchObject({ track: false, origin: 'explicit' }));
  await sourceCommand(() => expect(proposal.current.tracking['file:Leaf.md'].invalidated).toContain('no longer included'));
  await sourceCommand(() => expect(sourcing.root.getByRole('button', { name: 'Accept changes', exact: true })).toBeDisabled());
  await sourceCommand(() => sourcing.reviewTrackingChoices(1));
  await sourceCommand(() => expect(sourcing.sensitivityReview).toContainText('This page is no longer included'));
  await sourceCommand(() => addKeyFrame(pendingProposalRevalidation));
  await sourceCommand(() => checkpoint('the refreshed proposal retains the applicable choice and exposes the invalidated target'));
  await sourceCommand(() => sourcing.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click());

  // An unavailable source cannot replace the existing capture or any pending decisions.
  const beforeFailure = proposal.serialized;
  const source = path.join(testServer.sourceGraphsDir, 'sourcing-review-data');
  await sourceCommand(() => fs.renameSync(source, `${source}-unavailable`));
  const endExpectedErrors = expectLogErrors(/disconnected: its directory is unavailable|server responded with a status of 409/);
  try {
    await sourceCommand(() => sourcing.refreshSourcesButton.click());
    await sourceCommand(() => expect(sourcing.root.getByRole('alert')).toContainText('disconnected'));
    await sourceCommand(() => expect(proposal.serialized).toBe(beforeFailure));
    await sourceCommand(() => checkpoint('failed refresh keeps the complete proposal intact while its source is unavailable'));
  } finally {
    await sourceCommand(() => fs.renameSync(`${source}-unavailable`, source));
    await sourceCommand(() => endExpectedErrors());
  }

  // Resolving the unavailable choice permits acceptance without silently restoring it.
  await sourceCommand(() => sourcing.reviewTrackingChoices(1));
  await sourceCommand(() => sourcing.resolveSensitiveTracking('Leaf.md', false));
  await sourceCommand(() => sourcing.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click());
  await sourceCommand(() => sourcing.accept());
  const nodes = YAML.parse(fs.readFileSync(path.join(directory, 'config/bundle_node_config.yaml'), 'utf8')).nodes;
  for (const name of ['Leaf', 'Reference']) await sourceCommand(() => expect(nodes.some((node: { bundleNodeName: string }) => node.bundleNodeName === name)).toBe(false));
  await sourceCommand(() => expect(fs.existsSync(path.join(source, 'Leaf.md'))).toBe(true));
  await sourceCommand(() => checkpoint('acceptance installs the refreshed scope and both resolved untrack choices'));
  await sourceCommand(() => assertMeadowHomeState({ allowedUntracked: ['source_graphs/.source-changes.jsonl'], allowedModified: ['source_graphs/sourcing-review-data/Start.md'] }));
});
