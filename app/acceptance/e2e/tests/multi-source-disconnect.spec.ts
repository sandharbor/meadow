/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/areas/bundle/sourcing/SourcesControl.js';
import { bundleSource, sourceSnapshot } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

/*
 * Make one registered source unavailable. Captured pages should remain usable until the
 * source is explicitly removed and the removal is accepted.
 */
test('Multi-source disconnection preserves captured pages until the source is explicitly removed', async ({ page, testServer, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const list = new BundleListPage(page, expect);
  await list.goto();
  await list.clickBundle('multi-source-page');
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad('multi-source-page');
  await editor.waitForSourceCheck();
  const sources = new SourcesControl(page, expect);
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, 'multi-source-page', expect);
  const beforeNodes = bundleConfig.readNodesText();
  await checkpoint('the accepted source state is established before changing files');

  // --- Test start ---
  // Disconnect the reference source.
  await sourceChanges.apply('disconnect-reference', 'multi-source');
  await sources.open();
  await sources.expectDisconnected('source000003');
  await addKeyFrame(bundleSource);
  await checkpoint('a disconnected source is identified without discarding its captured material');

  // Verify the captured pages remain available.
  await sources.close();
  await editor.switchToListView();
  await editor.expectListViewNodeVisible('_mw_sources/source000003/Study.md', true);
  expect(bundleConfig.readNodesText()).toBe(beforeNodes);
  await checkpoint('captured pages and configuration remain intact while the source is disconnected');

  // Remove the reference source.
  await sources.open();
  await sources.remove('source000003');
  await sources.stage();
  const registryChanges = page.getByRole('region', { name: 'Source registry changes', exact: true });
  await expect(registryChanges).toContainText('Removed source reference');
  await expect(registryChanges.getByTestId('source-registry-change-source000001')).toHaveCount(0);
  await expect(registryChanges.getByTestId('source-registry-change-source000002')).toHaveCount(0);
  expect(bundleConfig.read().sources?.map(source => source.id)).toContain('source000003');
  expect(bundleConfig.readNodesText()).toBe(beforeNodes);
  await editor.sourceReview.orphans.expectOrphanListed('Study');
  await editor.sourceReview.orphans.expectOrphanListed('Appendix');
  await addKeyFrame(sourceSnapshot);
  await checkpoint('review shows only the removed source and affected pages while accepted material stays intact');

  // Inspect cancellation help without adding a permanent explanation to the footer.
  const cancellationHelp = page.getByRole('button', { name: 'About cancelling source settings', exact: true });
  const cancellationTooltip = page.getByRole('tooltip').filter({ hasText: 'Keep your current sources and included material.' });
  await expect(cancellationTooltip).not.toBeVisible();
  await cancellationHelp.hover();
  await expect(cancellationTooltip).toBeVisible();
  await expect(cancellationTooltip).toHaveCSS('opacity', '1');
  await expect(cancellationTooltip).toContainText('Your source files won’t be changed.');
  await addKeyFrame(sourceSnapshot);
  await checkpoint('the question mark explains cancellation on hover');
  await page.getByRole('heading', { name: 'Source changes', exact: true }).hover();
  await expect(cancellationTooltip).not.toBeVisible();
  await cancellationHelp.focus();
  await expect(cancellationTooltip).toBeVisible();
  await expect(cancellationTooltip).toHaveCSS('opacity', '1');

  // Later retains the proposed registry across reloads, with a direct route back to its review.
  await editor.sourceReview.defer();
  await page.reload();
  await editor.waitForLoad('multi-source-page');
  await editor.waitForSourceCheck();
  await sources.open();
  const manageSources = page.getByRole('dialog', { name: 'Manage sources', exact: true });
  const pendingChanges = manageSources.getByRole('button', { name: 'Changes awaiting review', exact: true });
  await expect(pendingChanges).toBeEnabled();
  await expect(manageSources.getByTestId('source-source000003')).toHaveCount(0);
  await expect(manageSources.getByRole('textbox', { name: 'Source name notes', exact: true })).toHaveValue('notes');
  await expect(manageSources.getByRole('textbox', { name: 'Source name research', exact: true })).toHaveValue('research');
  expect(bundleConfig.read().sources?.map(source => source.id)).toContain('source000003');
  expect(bundleConfig.readNodesText()).toBe(beforeNodes);
  await addKeyFrame(bundleSource);
  await checkpoint('Manage sources restores the pending removal after Later and reload while accepted material is retained');
  await pendingChanges.click();
  await expect(manageSources).not.toBeVisible();
  await expect(registryChanges).toContainText('Removed source reference');
  await editor.sourceReview.orphans.expectOrphanListed('Study');
  await editor.sourceReview.orphans.expectOrphanListed('Appendix');
  expect(bundleConfig.readNodesText()).toBe(beforeNodes);
  await addKeyFrame(sourceSnapshot);
  await checkpoint('the pending changes indicator returns directly to the source and material review');

  // Cancel the proposed removal without altering the source files or accepted material.
  await page.getByRole('button', { name: 'Cancel source removal', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Source changes', exact: true })).not.toBeVisible();
  expect(bundleConfig.read().sources?.map(source => source.id)).toContain('source000003');
  expect(bundleConfig.readNodesText()).toBe(beforeNodes);
  expect(fs.existsSync(path.join(testServer.sourceGraphsDir, 'multi-source/reference-disconnected/Study.md'))).toBe(true);
  await editor.expectListViewNodeVisible('_mw_sources/source000003/Study.md', true);
  await sources.open();
  await sources.expectDisconnected('source000003');
  await expect(pendingChanges).toHaveCount(0);
  await addKeyFrame(bundleSource);
  await checkpoint('cancelling source removal retains the registry, captured pages, and source files');

  // Propose the removal again.
  await sources.remove('source000003');
  await sources.stage();

  // Accept the source update.
  await editor.sourceReview.accept();
  const config = bundleConfig.read();
  expect(config.sources?.map(source => source.id)).toEqual(['source000001', 'source000002']);
  expect(bundleConfig.readNodes().some(node => node.sourceId === 'source000003')).toBe(false);
  expect(fs.existsSync(path.join(testServer.sourceGraphsDir, 'multi-source/reference-disconnected/Study.md'))).toBe(true);
  await editor.expectListViewNodeVisible('_mw_sources/source000003/Study.md', false);
  await checkpoint('acceptance removes the disconnected source and its orphaned configuration');

  await skipMeadowHomeStateCheck();
});
