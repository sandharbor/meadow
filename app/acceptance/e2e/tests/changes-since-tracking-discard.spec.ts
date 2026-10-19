/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent, PreviewPublishModal } from '../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/MeadowHomeBundleConfig.js';
import { SourcingProposalState } from '../src/run/state/SourcingProposalState.js';
import { trackedNodeBecomesSensitive, changesSinceTracking, conceptText, conceptLink,
  linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, bundleCuration,
  bundleGeneration, sourceReviewWorkspace, scenarioDesignPressures, preventAccidentalSharing } from '../../../concepts/index.js';

test.use({ bundleMode: 'mixed-starts' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

const name = linkedScenarioName(conceptText`Changes since tracking remain reviewable after discarding and previewing`);
const description = linkedScenarioDescription(conceptText`Discard the inclusion review while retaining saved policy, then return from a successful preview warning. ${conceptLink(trackedNodeBecomesSensitive.id, 'Tracked Bundle Node Becomes Sensitive')} keeps existing inclusion visible while the user reviews its cause.`);
const areas = scenarioAreas([bundleCuration, bundleSourcing, bundleGeneration], { subAreas: [sourceReviewWorkspace] });
const pressures = scenarioDesignPressures([preventAccidentalSharing]);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'd21b76d4-4a7b-47ae-ab11-79fb5ffc16ca' }, name.annotation, description.annotation, areas.annotation, pressures.annotation] }, async ({ sourceCommand, page, testServer, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const filters = new FilterPanelComponent(page, expect);
  const review = new SourcingWorkspacePage(page, expect);
  const preview = new PreviewPublishModal(page, expect);
  const proposal = new SourcingProposalState(testServer, 'multi-source-mixed');
  const directory = path.join(testServer.configDir, 'bundles/multi-source-mixed');
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'multi-source-mixed', expect);
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

  // Discard review; the saved filter and unresolved node survive reopening.
  await sourceCommand(() => review.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click());
  await sourceCommand(() => review.discard());
  const savedFilters = JSON.parse(fs.readFileSync(path.join(testServer.configDir, 'app/global_custom_filters.json'), 'utf8'));
  expect(savedFilters.filters.find((filter: { name: string }) => filter.name === 'Review existing inclusion').enabled).toBe(true);
  await sourceCommand(() => page.reload());
  await sourceCommand(() => review.expectSensitivityReviewReady());
  await sourceCommand(() => review.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click());
  await sourceCommand(() => review.discard());
  await sourceCommand(() => checkpoint('discard and reload preserve the unresolved sensitivity policy'));

  // Preview is available, and its warning returns to the exact review.
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => preview.waitForPreviewCompleteAllTracked());
  await sourceCommand(() => expect(page.getByTestId('sensitivity-warning')).toContainText('1 tracked node'));
  expect(bundleConfig.generatedPreviewPages().some(name => name.endsWith('/research/Incoming.html'))).toBe(true);
  await sourceCommand(() => addKeyFrame(trackedNodeBecomesSensitive));
  await sourceCommand(() => checkpoint('preview warns without blocking generation'));
  await sourceCommand(() => page.getByTestId('sensitivity-warning').getByRole('button', { name: 'Review pages', exact: true }).click());
  await sourceCommand(() => review.expectSensitivityReviewReady());
  await sourceCommand(() => expect(review.sensitivityReview).toContainText('Incoming.md'));
  await sourceCommand(() => review.sensitivityReview.getByRole('button', { name: 'Untrack for now', exact: true }).click());
  await sourceCommand(() => review.sensitivityReview.getByRole('button', { name: 'Close', exact: true }).click());
  await sourceCommand(() => review.accept());
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => preview.waitForPreviewCompleteAllTracked());
  await sourceCommand(() => expect(page.getByTestId('sensitivity-warning')).toHaveCount(0));
  expect(bundleConfig.generatedPreviewPages().some(name => name.endsWith('/research/Incoming.html'))).toBe(false);
  await sourceCommand(() => checkpoint('untracking resolves the issue and preview remains available'));
  // A global policy changed elsewhere is surfaced on entry to the other bundle.
  await sourceCommand(() => preview.closeModal());
  await sourceCommand(() => editor.clickBackToBundles());
  await sourceCommand(() => list.clickBundle('multi-source-page'));
  await sourceCommand(() => review.expectSensitivityReviewReady());
  await sourceCommand(() => expect(review.sensitivityReview).toContainText('Incoming.md'));
  await sourceCommand(() => expect(review.sensitivityReview).toContainText('Global filter “Review existing inclusion”'));
  await sourceCommand(() => addKeyFrame(trackedNodeBecomesSensitive));
  await sourceCommand(() => checkpoint('opening another bundle surfaces policy changed elsewhere'));
  await sourceCommand(() => skipMeadowHomeStateCheck());
});
