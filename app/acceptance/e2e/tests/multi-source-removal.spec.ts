/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/areas/bundle/sourcing/SourcesControl.js';
import { sourcingReviewRedesign, bundleSource } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

/*
 * Remove a registered source and review its orphaned pages. Ignored source names should
 * stay quiet until the user chooses to reconsider them.
 */
test('Multi-source removal reviews orphans and ignored source names stay quiet until reconsidered', { annotation: { type: 'scenario-id', description: '94c8b2ba-c324-4d76-ac2e-c6923fcb3356' } }, async ({ sourceCommand, page, testServer, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle('multi-source-page'));
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForLoad('multi-source-page'));
  await sourceCommand(() => editor.waitForSourceCheck());
  const sources = new SourcesControl(page, expect);
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'multi-source-page', expect);
  const study = bundleConfig.requireNode({ bundleNodeName: 'Study' });
  const referenceFile = path.join(testServer.sourceGraphsDir, 'multi-source/reference/Study.md');
  const referenceContent = fs.readFileSync(referenceFile, 'utf8');
  await sourceCommand(() => checkpoint('the reference source and its original pages are connected'));

  // --- Test start ---
  // Remove the reference source.
  await sourceCommand(() => sources.open());
  await sourceCommand(() => sources.remove('source000003'));
  await sourceCommand(() => sources.stage());
  await sourceCommand(() => editor.sourceReview.orphans.expectSummaryCount(2));
  await sourceCommand(() => editor.sourceReview.orphans.showExplanation('Study'));
  expect(bundleConfig.findNode({ bundleNodeId: study.bundleNodeId })).toEqual(study);
  await sourceCommand(() => addKeyFrame(bundleSource));
  await sourceCommand(() => checkpoint('deliberate removal offers mandatory cleanup while preserving saved configuration until acceptance'));

  // Accept the source update.
  await sourceCommand(() => editor.sourceReview.accept());
  expect(bundleConfig.findNode({ bundleNodeId: study.bundleNodeId })).toBeUndefined();
  expect(bundleConfig.findNode({ bundleNodeName: 'Appendix' })).toBeUndefined();
  expect(fs.readFileSync(referenceFile, 'utf8')).toBe(referenceContent);
  expect(bundleConfig.read().sourceOutputLayout).toBe('multi');
  await sourceCommand(() => checkpoint('source removal cleans both unreachable entries and preserves the source files'));

  // Ignore the missing source reminder.
  await sourceCommand(() => sources.expectNotice(['reference']));
  await sourceCommand(() => sources.reviewMissing());
  await sourceCommand(() => sources.setIgnored('reference', true));
  await sourceCommand(() => sources.close());
  await sourceCommand(() => page.reload());
  await sourceCommand(() => editor.waitForLoad('multi-source-page'));
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => sources.expectNotice());
  await sourceCommand(() => checkpoint('the ignored source name stays quiet after reloading'));

  // Add another reference to the ignored source.
  await sourceCommand(() => sourceChanges.apply('add-reference-to-start', 'multi-source'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.accept());
  await sourceCommand(() => sources.expectNotice());
  expect(bundleConfig.read().ignoredSourceNames).toContain('reference');
  await sourceCommand(() => sources.open());
  await sourceCommand(() => sources.expectReferences('reference', ['notes://Start', 'notes://Frontier']));
  await sourceCommand(() => addKeyFrame(bundleSource));
  await sourceCommand(() => checkpoint('the saved ignored name also suppresses a newly captured reference'));

  // Reconsider the ignored source.
  await sourceCommand(() => sources.setIgnored('reference', false));
  await sourceCommand(() => sources.close());
  await sourceCommand(() => sources.expectNotice(['reference']));
  const otherConfig = new MeadowHomeBundleConfig(testServer.configDir, 'multi-source-mixed', expect).read();
  expect(otherConfig.sources).toHaveLength(3);
  expect(otherConfig.ignoredSourceNames ?? []).toEqual([]);
  await sourceCommand(() => checkpoint('reconsidering the source restores its notice without changing the other bundle'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
