/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, FilterPanelComponent, SelectedPageDetailComponent, Pill } from '../src/run/pages/index.js';
import { SourcesControl } from '../src/run/pages/areas/bundle/sourcing/SourcesControl.js';
import { sourcingReviewRedesign, bundleSource, frontier, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';
import type { BundleConfig } from '../../../contracts/types/bundleConfig.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: 'home_fixture_multi_source' });

const name = linkedScenarioName(conceptText`Multi-source registration admits a frontier reference only after its page enters the normal boundary`);

const description = linkedScenarioDescription(conceptText`Register another source containing a frontier reference. That page should enter the
bundle only when normal traversal reaches it within the configured boundary.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '01fdc497-0439-4ac2-9272-220e4ef9504e' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const slug = 'multi-source-omitted';
  const list = new BundleListPage(page, expect);
  await sourceCommand(() => list.goto());
  await sourceCommand(() => list.clickBundle(slug));
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForLoad(slug));
  await sourceCommand(() => editor.waitForSourceCheck());
  const sources = new SourcesControl(page, expect);
  await sourceCommand(() => sources.expectNotice());
  const filters = new FilterPanelComponent(page, expect);
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => filters.enableFilter('Frontier'));
  await sourceCommand(() => editor.expectGraphNodePresent('file:_mw_sources/source000001/Frontier.md'));
  await sourceCommand(() => sources.expectNotice());
  await sourceCommand(() => addKeyFrame(frontier, bundleSource));
  await sourceCommand(() => checkpoint('frontier references and unrelated indexed pages do not prompt source registration'));

  // --- Test start ---
  // Expand the normal traversal boundary.
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.clickListViewRowByNodeKey('file:_mw_sources/source000001/Start.md'));
  await sourceCommand(() => new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).setOutlinksDepth(1));
  await sourceCommand(() => editor.sourceReview.accept());
  await sourceCommand(() => sources.expectNotice(['reference']));
  await sourceCommand(() => sources.reviewMissing());
  await sourceCommand(() => sources.expectReferences('reference', ['notes://Frontier', 'research://Report']));
  await sourceCommand(() => expect(page.getByTestId('source-reference-unrelated')).not.toBeVisible());
  await sourceCommand(() => addKeyFrame(bundleSource));
  await sourceCommand(() => checkpoint('newly admitted referrers group their missing-source references'));

  // Register the newly referenced source.
  await sourceCommand(() => sources.addReferencedSource('reference', path.join(testServer.sourceGraphsDir, 'multi-source/reference')));
  await sourceCommand(() => sources.saveWithoutMaterialChanges());
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('registering a source with only frontier references saves without material review'));

  // Inspect the saved source registration.
  await sourceCommand(() => sources.expectNotice());
  const config = YAML.parse(fs.readFileSync(path.join(testServer.configDir, 'bundles', slug, 'config/bundle_config.yaml'), 'utf8')) as BundleConfig;
  const referenceId = config.sources!.find(source => source.name === 'reference')!.id;
  await sourceCommand(() => filters.expandFilterGroup('Folders'));
  await sourceCommand(() => filters.expectFolderCount('reference://', 0));
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => filters.enableFilter('Frontier'));
  await sourceCommand(() => editor.clickListViewRowByNodeKey(`file:_mw_sources/${referenceId}/Study.md`));
  await sourceCommand(() => new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.Frontier));
  await sourceCommand(() => sources.expectNotice());
  await sourceCommand(() => addKeyFrame(bundleSource, frontier));
  await sourceCommand(() => checkpoint('resolved reference pages retain the remaining traversal budget after acceptance'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
