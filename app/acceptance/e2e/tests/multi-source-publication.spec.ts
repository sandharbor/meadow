/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, PreviewPublishModal, PublishToS3Tab, PublishedBundlePage } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/areas/bundle/sourcing/SourcesControl.js';
import { GeneratedBundleVersions } from '../src/run/utils/index.js';
import { sourcingReviewRedesign, bundleSource, versioning, publicationRevision, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ fixtureHome: 'home_fixture_multi_source' });

const name = linkedScenarioName(conceptText`Multi-source publication retains old pages and connects their stable identities through a source rename`);

const description = linkedScenarioDescription(conceptText`Publish a multi-source bundle, rename a source, and publish a successor. Previously
published pages should remain available and link to their corresponding new pages.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'ee4a97bf-6cac-45f3-8f0e-a1504a703777' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, minioS3, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await sourceCommand(() => testServer.activateS3Provider());
  const slug = 'multi-source-page';
  const list = new BundleListPage(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle(slug));
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForLoad(slug));
  await sourceCommand(() => editor.waitForSourceCheck());
  const authored = path.join(testServer.sourceGraphsDir, 'multi-source/notes/Start.md');
  const originalContent = fs.readFileSync(authored, 'utf8');
  await sourceCommand(() => editor.clickPreview());
  const modal = new PreviewPublishModal(page, expect);
  await sourceCommand(() => modal.waitForPreviewCompleteAllTracked());
  await sourceCommand(() => modal.saveChangesIfNeeded());
  const versions = new GeneratedBundleVersions(page, expect, slug);
  const initialVersion = await sourceCommand(() => versions.waitForOnlyVersion());
  await sourceCommand(() => modal.clickShareTab());
  const publish = new PublishToS3Tab(page, expect);
  await sourceCommand(() => publish.expectVisible());
  await sourceCommand(() => publish.setPublishSlug('multi-source-published'));
  await sourceCommand(() => publish.clickPublish());
  const originalUrl = await sourceCommand(() => publish.expectPublishSuccess());
  const originalNamespace = `multi-source-published-${initialVersion.versionId}`;
  const originalKeys = await sourceCommand(() => minioS3.listKeys(`${originalNamespace}/`));
  expect(originalKeys).toContain(`${originalNamespace}/sources/notes/Overview.html`);
  expect(originalKeys).toContain(`${originalNamespace}/sources/research/Overview.html`);
  expect(originalKeys).toContain(`${originalNamespace}/sources/notes/diagram.svg`);
  expect(originalKeys).toContain(`${originalNamespace}/sources/research/diagram.svg`);
  await sourceCommand(() => addKeyFrame(publicationRevision));
  await sourceCommand(() => checkpoint('namesake pages and assets have distinct published source paths'));

  // --- Test start ---
  // Move a source page and create its successor.
  await sourceCommand(() => modal.closeModal());
  const sources = new SourcesControl(page, expect);
  await sourceCommand(() => sources.open());
  await sourceCommand(() => sources.rename('notes', 'notebook'));
  await sourceCommand(() => expect(page.getByRole('dialog', { name: 'Manage sources', exact: true })).toContainText('we recommend creating a new generated version'));
  await sourceCommand(() => expect(page.getByRole('dialog', { name: 'Manage sources', exact: true })).toContainText('You can keep working without publishing.'));
  await sourceCommand(() => addKeyFrame(bundleSource));
  await sourceCommand(() => checkpoint('source settings explain publication path changes before saving the rename'));

  // Open the old published page.
  await sourceCommand(() => sources.saveWithoutMaterialChanges());
  expect(fs.readFileSync(authored, 'utf8')).toBe(originalContent);
  const config = YAML.parse(fs.readFileSync(path.join(testServer.configDir, 'bundles', slug, 'config/bundle_config.yaml'), 'utf8'));
  expect(config.sources.find((source: { id: string }) => source.id === 'source000001')).toMatchObject({ name: 'notebook', aliases: ['notes'] });
  const other = YAML.parse(fs.readFileSync(path.join(testServer.configDir, 'bundles/multi-source-mixed/config/bundle_config.yaml'), 'utf8'));
  expect(other.sources[0].name).toBe('notes');
  const providerApi = `/api/sharing/publishing-providers/S3PublishingProvider/bundles/${slug}`;
  const stateAfterAcceptance = await sourceCommand(() => page.request.get(`${providerApi}/publication-state`));
  expect(stateAfterAcceptance.ok()).toBe(true);
  expect((await sourceCommand(() => stateAfterAcceptance.json())).revisions).toHaveLength(1);
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => modal.waitForPreviewCompleteAllTracked());
  await sourceCommand(() => modal.openCreateNewVersionDialog());
  await sourceCommand(() => modal.createConnectedVersion('Canonical source name changed'));
  const [, successor] = await sourceCommand(() => versions.waitForCount(2));
  await sourceCommand(() => modal.clickChangesTab());
  await sourceCommand(() => modal.clickSaveChanges());
  await sourceCommand(() => modal.waitForSaveComplete());
  await sourceCommand(() => modal.clickShareTab());
  await sourceCommand(() => modal.selectShareVersion(successor.versionId));
  await sourceCommand(() => publish.clickPublish());
  await sourceCommand(() => publish.confirmConnectedRevisionKeepingEarlierFiles());
  const successorUrl = await sourceCommand(() => publish.expectPublishSuccess());
  const successorNamespace = `multi-source-published-${successor.versionId}`;
  await sourceCommand(() => minioS3.expectHasFiles(`${originalNamespace}/`));
  const successorKeys = await sourceCommand(() => minioS3.listKeys(`${successorNamespace}/`));
  expect(successorKeys).toContain(`${successorNamespace}/sources/notebook/Overview.html`);
  expect(successorKeys).not.toContain(`${successorNamespace}/sources/notes/Overview.html`);
  const routeKey = successorKeys.find(key => /\/_mw_assets\/versioning\/routes\./.test(key))!;
  const routes = JSON.parse(await sourceCommand(() => minioS3.getObjectContent(routeKey)));
  expect(routes.routesByBundleNodeId['95b568da6b98']).toBe('sources/notebook/Overview.html');
  await sourceCommand(() => addKeyFrame(versioning, publicationRevision));
  await sourceCommand(() => checkpoint('a connected successor is published while its predecessor remains available'));

  // Follow the stable page identity.
  const oldPageUrl = new URL('Overview.html', originalUrl).toString();
  const newPageUrl = new URL('Overview.html', successorUrl).toString();
  const reader = new PublishedBundlePage(page, expect);
  await sourceCommand(() => reader.goto(oldPageUrl));
  await sourceCommand(() => reader.expectMainHeadingVisible('Overview'));
  await sourceCommand(() => reader.expectNewerPageLink(newPageUrl));
  await sourceCommand(() => addKeyFrame(publicationRevision));
  await sourceCommand(() => checkpoint('the retained old page offers its stable counterpart at the new source path'));

  // Open the newer page.
  await sourceCommand(() => reader.openNewerVersion());
  await sourceCommand(() => expect(page).toHaveURL(newPageUrl));
  await sourceCommand(() => reader.expectMainHeadingVisible('Overview'));
  await sourceCommand(() => addKeyFrame(publicationRevision));
  await sourceCommand(() => checkpoint("the newer version opens the same page at its moved source path"));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
