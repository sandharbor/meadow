/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent, SelectedPageDetailComponent, Pill } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/BundleEditorPage/components/SourcesControl.js';
import { bundleSource, frontier, sourceSnapshot } from '../../../concepts/index.js';
import type { BundleConfig } from '../../../contracts/types/bundleConfig.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: 'home_fixture_multi_source' });

/*
 * Register another source containing a frontier reference. That page should enter the
 * bundle only when normal traversal reaches it within the configured boundary.
 */
test('Multi-source registration admits a frontier reference only after its page enters the normal boundary', async ({ page, testServer, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const slug = 'multi-source-omitted';
  const list = new BundleListPage(page, expect);
  await list.goto();
  await list.clickBundle(slug);
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForLoad(slug);
  await editor.waitForSourceCheck();
  const sources = new SourcesControl(page, expect);
  await sources.expectNotice();
  const filters = new FilterPanelComponent(page, expect);
  await filters.enableFilter('Frontier');
  await editor.expectGraphNodePresent('_mw_sources/source000001/Frontier.md');
  await sources.expectNotice();
  await addKeyFrame(frontier, bundleSource);
  await checkpoint('frontier references and unrelated indexed pages do not prompt source registration');

  // --- Test start ---
  // Expand the normal traversal boundary.
  await editor.switchToListView();
  await editor.clickListViewRowByNodeKey('_mw_sources/source000001/Start.md');
  await new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).setOutlinksDepth(1);
  await editor.clickSave();
  await editor.checkSourceChanges();
  await editor.sourceReview.open();
  await editor.sourceReview.accept();
  await sources.expectNotice(['reference']);
  await filters.disableFilter('Frontier');
  await sources.reviewMissing();
  await sources.expectReferences('reference', ['notes://Frontier', 'research://Report']);
  await expect(page.getByTestId('source-reference-unrelated')).not.toBeVisible();
  await addKeyFrame(bundleSource);
  await checkpoint('newly admitted referrers group their missing-source references');

  // Register the newly referenced source.
  await sources.addReferencedSource('reference', path.join(testServer.sourceGraphsDir, 'multi-source/reference'));
  await sources.saveWithoutMaterialChanges();
  await addKeyFrame(sourceSnapshot);
  await checkpoint('registering a source with only frontier references saves without material review');

  // Inspect the saved source registration.
  await sources.expectNotice();
  const config = YAML.parse(fs.readFileSync(path.join(testServer.configDir, 'bundles', slug, 'config/bundle_config.yaml'), 'utf8')) as BundleConfig;
  const referenceId = config.sources!.find(source => source.name === 'reference')!.id;
  await filters.expandFilterGroup('Folders');
  await filters.expectFolderCount('reference://', 0);
  await filters.enableFilter('Frontier');
  await editor.clickListViewRowByNodeKey(`_mw_sources/${referenceId}/Study.md`);
  await new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.Frontier);
  await sources.expectNotice();
  await addKeyFrame(bundleSource, frontier);
  await checkpoint('resolved reference pages retain the remaining traversal budget after acceptance');

  await skipMeadowHomeStateCheck();
});
