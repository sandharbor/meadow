/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, PreviewPublishModal, PublishToS3Tab, PublishedBundlePage } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/BundleEditorPage/components/SourcesControl.js';
import { GeneratedBundleVersions } from '../src/run/utils/index.js';
import { bundleSource, versioning, publicationRevision } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source', isolateSourceGraphs: true });

/*
 * Publish a multi-source bundle, rename a source, and publish a successor. Previously
 * published pages should remain available and link to their corresponding new pages.
 */
test('Multi-source publication retains old pages and connects their stable identities through a source rename', async ({ page, testServer, minioS3, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await testServer.activateS3Provider();
  const slug = 'multi-source-page';
  const list = new BundleListPage(page, expect);
  await list.goto();
  await list.clickBundle(slug);
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad(slug);
  await editor.waitForSourceCheck();
  const authored = path.join(testServer.sourceGraphsDir, 'multi-source/notes/Start.md');
  const originalContent = fs.readFileSync(authored, 'utf8');
  await editor.clickPreview();
  const modal = new PreviewPublishModal(page, expect);
  await modal.waitForPreviewCompleteAllTracked();
  await modal.saveChangesIfNeeded();
  const versions = new GeneratedBundleVersions(page, expect, slug);
  const initialVersion = await versions.waitForOnlyVersion();
  await modal.clickShareTab();
  const publish = new PublishToS3Tab(page, expect);
  await publish.expectVisible();
  await publish.setPublishSlug('multi-source-published');
  await publish.clickPublish();
  const originalUrl = await publish.expectPublishSuccess();
  const originalNamespace = `multi-source-published-${initialVersion.versionId}`;
  const originalKeys = await minioS3.listKeys(`${originalNamespace}/`);
  expect(originalKeys).toContain(`${originalNamespace}/sources/notes/Overview.html`);
  expect(originalKeys).toContain(`${originalNamespace}/sources/research/Overview.html`);
  expect(originalKeys).toContain(`${originalNamespace}/sources/notes/diagram.svg`);
  expect(originalKeys).toContain(`${originalNamespace}/sources/research/diagram.svg`);
  await addKeyFrame(publicationRevision);
  await snapshot('namesake pages and assets have distinct published source paths');

  // --- Test start ---
  // Move a source page and create its successor.
  await modal.closeModal();
  const sources = new SourcesControl(page, expect);
  await sources.open();
  await sources.rename('notes', 'notebook');
  await sources.stage();
  await expect(page.getByRole('dialog', { name: 'Source changes', exact: true })).toContainText('we recommend creating a new generated version');
  await expect(page.getByRole('dialog', { name: 'Source changes', exact: true })).toContainText('You can keep working without publishing.');
  await addKeyFrame(bundleSource);
  await snapshot('route-impact guidance recommends connected publication while acceptance stays optional');

  // Open the old published page.
  await editor.sourceReview.accept();
  expect(fs.readFileSync(authored, 'utf8')).toBe(originalContent);
  const config = YAML.parse(fs.readFileSync(path.join(testServer.configDir, 'bundles', slug, 'config/bundle_config.yaml'), 'utf8'));
  expect(config.sources.find((source: { id: string }) => source.id === 'source000001')).toMatchObject({ name: 'notebook', aliases: ['notes'] });
  const other = YAML.parse(fs.readFileSync(path.join(testServer.configDir, 'bundles/multi-source-mixed/config/bundle_config.yaml'), 'utf8'));
  expect(other.sources[0].name).toBe('notes');
  const providerApi = `/api/sharing/publishing-providers/S3PublishingProvider/bundles/${slug}`;
  const stateAfterAcceptance = await page.request.get(`${providerApi}/publication-state`);
  expect(stateAfterAcceptance.ok()).toBe(true);
  expect((await stateAfterAcceptance.json()).revisions).toHaveLength(1);
  await editor.clickPreview();
  await modal.waitForPreviewCompleteAllTracked();
  await modal.openCreateNewVersionDialog();
  await modal.createConnectedVersion('Canonical source name changed');
  const [, successor] = await versions.waitForCount(2);
  await modal.clickChangesTab();
  await modal.clickSaveChanges();
  await modal.waitForSaveComplete();
  await modal.clickShareTab();
  await modal.selectShareVersion(successor.versionId);
  await publish.clickPublish();
  await publish.confirmConnectedRevisionKeepingEarlierFiles();
  const successorUrl = await publish.expectPublishSuccess();
  const successorNamespace = `multi-source-published-${successor.versionId}`;
  await minioS3.expectHasFiles(`${originalNamespace}/`);
  const successorKeys = await minioS3.listKeys(`${successorNamespace}/`);
  expect(successorKeys).toContain(`${successorNamespace}/sources/notebook/Overview.html`);
  expect(successorKeys).not.toContain(`${successorNamespace}/sources/notes/Overview.html`);
  const routeKey = successorKeys.find(key => /\/_mw_assets\/versioning\/routes\./.test(key))!;
  const routes = JSON.parse(await minioS3.getObjectContent(routeKey));
  expect(routes.routesByBundleNodeId['95b568da6b98']).toBe('sources/notebook/Overview.html');
  await addKeyFrame(versioning, publicationRevision);
  await snapshot('a connected successor is published while its predecessor remains available');

  // Follow the stable page identity.
  const oldPageUrl = new URL('Overview.html', originalUrl).toString();
  const newPageUrl = new URL('Overview.html', successorUrl).toString();
  const reader = new PublishedBundlePage(page, expect);
  await reader.goto(oldPageUrl);
  await reader.expectMainHeadingVisible('Overview');
  await reader.expectNewerPageLink(newPageUrl);
  await addKeyFrame(publicationRevision);
  await snapshot('the retained old page offers its stable counterpart at the new source path');

  // Open the newer page.
  await reader.openNewerVersion();
  await expect(page).toHaveURL(newPageUrl);
  await reader.expectMainHeadingVisible('Overview');
  await addKeyFrame(publicationRevision);
  await snapshot("the newer version opens the same page at its moved source path");

  await skipMeadowHomeStateCheck();
});
