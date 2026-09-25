/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/areas/bundle/sourcing/SourcesControl.js';
import { bundleSource } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

/*
 * Remove a registered source and review its orphaned pages. Ignored source names should
 * stay quiet until the user chooses to reconsider them.
 */
test('Multi-source removal reviews orphans and ignored source names stay quiet until reconsidered', async ({ page, testServer, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  await list.goto();
  await list.clickBundle('multi-source-page');
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad('multi-source-page');
  await editor.waitForSourceCheck();
  const sources = new SourcesControl(page, expect);
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'multi-source-page', expect);
  const study = bundleConfig.requireNode({ bundleNodeName: 'Study' });
  const referenceFile = path.join(testServer.sourceGraphsDir, 'multi-source/reference/Study.md');
  const referenceContent = fs.readFileSync(referenceFile, 'utf8');
  await checkpoint('the reference source and its original pages are connected');

  // --- Test start ---
  // Remove the reference source.
  await sources.open();
  await sources.remove('source000003');
  await sources.stage();
  await editor.sourceReview.orphans.expectSummaryCount(2);
  await editor.sourceReview.orphans.keepInConfig('Study');
  await addKeyFrame(bundleSource);
  await checkpoint('deliberate removal offers orphan cleanup with optional retained configuration');

  // Accept the source update.
  await editor.sourceReview.accept();
  expect(bundleConfig.findNode({ bundleNodeId: study.bundleNodeId })).toEqual(study);
  expect(bundleConfig.findNode({ bundleNodeName: 'Appendix' })).toBeUndefined();
  expect(fs.readFileSync(referenceFile, 'utf8')).toBe(referenceContent);
  expect(bundleConfig.read().sourceOutputLayout).toBe('multi');
  await checkpoint('source removal preserves the explicitly retained page configuration');

  // Ignore the missing source reminder.
  await sources.expectNotice(['reference']);
  await sources.reviewMissing();
  await sources.setIgnored('reference', true);
  await sources.close();
  await page.reload();
  await editor.waitForLoad('multi-source-page');
  await editor.waitForSourceCheck();
  await sources.expectNotice();
  await checkpoint('the ignored source name stays quiet after reloading');

  // Add another reference to the ignored source.
  await sourceChanges.apply('add-reference-to-start', 'multi-source');
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.accept();
  await sources.expectNotice();
  expect(bundleConfig.read().ignoredSourceNames).toContain('reference');
  await sources.open();
  await sources.expectReferences('reference', ['notes://Start', 'notes://Frontier']);
  await addKeyFrame(bundleSource);
  await checkpoint('the saved ignored name also suppresses a newly captured reference');

  // Reconsider the ignored source.
  await sources.setIgnored('reference', false);
  await sources.close();
  await sources.expectNotice(['reference']);
  const otherConfig = new MeadowHomeBundleConfig(testServer.configDir, 'multi-source-mixed', expect).read();
  expect(otherConfig.sources).toHaveLength(3);
  expect(otherConfig.ignoredSourceNames ?? []).toEqual([]);
  await checkpoint('reconsidering the source restores its notice without changing the other bundle');

  await skipMeadowHomeStateCheck();
});
