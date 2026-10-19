/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent, PreviewPublishModal } from '../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { SourcingProposalState } from '../src/run/state/SourcingProposalState.js';
import { trackedNodeBecomesSensitive, changesSinceTracking, conceptText, conceptLink,
  linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, bundleCuration,
  bundleGeneration, sourceReviewWorkspace, scenarioDesignPressures, preventAccidentalSharing } from '../../../concepts/index.js';

test.use({ bundleMode: 'mixed-starts' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

const name = linkedScenarioName(conceptText`Changes since tracking and untracked nodes have independent preview warnings`);
const description = linkedScenarioDescription(conceptText`Show both actionable warnings at normal and narrow window widths. ${conceptLink(trackedNodeBecomesSensitive.id, 'Tracked Bundle Node Becomes Sensitive')} keeps existing inclusion visible while the user reviews its cause.`);
const areas = scenarioAreas([bundleCuration, bundleSourcing, bundleGeneration], { subAreas: [sourceReviewWorkspace] });
const pressures = scenarioDesignPressures([preventAccidentalSharing]);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'c04a7606-5b14-4473-9302-ec5875746a8b' }, name.annotation, description.annotation, areas.annotation, pressures.annotation] }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const filters = new FilterPanelComponent(page, expect);
  const review = new SourcingWorkspacePage(page, expect);
  const preview = new PreviewPublishModal(page, expect);
  const proposal = new SourcingProposalState(testServer, 'multi-source-mixed');
  const directory = path.join(testServer.configDir, 'bundles/multi-source-mixed');
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('multi-source-mixed'));
  await sourceCommand(() => editor.waitForLoad('multi-source-mixed'));
  await sourceCommand(() => editor.waitForSourceCheck());
  const accepted = JSON.parse(fs.readFileSync(path.join(directory, 'raw/sourcing/state.json'), 'utf8')).acceptedId;
  await sourceCommand(() => checkpoint('tracked nodes use the accepted source capture'));

  // --- Test start ---
  // Apply sensitivity policy without refreshing the captured sources.
  await sourceCommand(() => filters.clickAddCustomFilter());
  await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Review existing inclusion', field: 'title', matchType: 'regex', value: '^Incoming$', markSensitive: true, scope: 'global' }));
  await sourceCommand(() => review.expectSensitivityReviewReady());
  await sourceCommand(() => expect(review.sensitivityReview).toContainText('Global filter “Review existing inclusion”'));
  expect(proposal.current.candidateSnapshotId).toBe(accepted);
  await sourceCommand(() => addKeyFrame(trackedNodeBecomesSensitive, changesSinceTracking));
  await sourceCommand(() => checkpoint('the named global policy explains the sensitivity change'));

  // Leave the review pending and generate with ordinary untracked nodes still present.
  await sourceCommand(() => review.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click());
  await sourceCommand(() => review.discard());
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => preview.waitForPreviewComplete());
  await sourceCommand(() => expect(page.getByTestId('sensitivity-warning')).toBeVisible());
  await sourceCommand(() => expect(page.getByRole('button', { name: /Check (them|it)/ })).toBeVisible());
  await sourceCommand(() => addKeyFrame(trackedNodeBecomesSensitive));
  await sourceCommand(() => checkpoint('both preview warnings have independent review actions'));

  // The warning wraps within the modal at a narrow desktop width.
  await sourceCommand(() => page.setViewportSize({ width: 850, height: 850 }));
  const warning = page.getByTestId('sensitivity-warning');
  await sourceCommand(() => expect(warning.getByRole('button', { name: 'Review pages', exact: true })).toBeVisible());
  const dimensions = await warning.evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
  await sourceCommand(() => addKeyFrame(trackedNodeBecomesSensitive));
  await sourceCommand(() => checkpoint('both warnings remain readable in a narrow preview'));
  await sourceCommand(() => preview.clickCheckUntrackedPages());
  await sourceCommand(() => editor.waitForLoad('multi-source-mixed'));
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => preview.waitForPreviewComplete());
  await sourceCommand(() => warning.getByRole('button', { name: 'Review pages', exact: true }).click());
  await sourceCommand(() => expect(review.sensitivityReview).toContainText('Incoming.md'));
  await sourceCommand(() => checkpoint('each warning leads to its own affected nodes'));
  await sourceCommand(() => skipMeadowHomeStateCheck());
});
