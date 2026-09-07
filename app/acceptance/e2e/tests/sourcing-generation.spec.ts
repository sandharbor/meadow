/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEffectivePagespecBlock, getPagespecForBundle } from '../../../runtime/system_tests/pagespecs/index.js';
import { extractMainSectionLinkPaths, extractFooterBacklinkPaths } from '../../../runtime/system_tests/helpers/htmlLinkExtractor.js';
import { test, expect } from '../src/run/test-fixtures.js';
import { BundleEditorPage, PreviewPublishModal } from '../src/run/pages/index.js';
import { Workflows } from '../src/run/workflows.js';
import { sourceSnapshot } from '../../../concepts/index.js';

const slug = 'meadow-test-bundle-big';
const originalTitle = 't003 ---- page with section to link to';

test.use({ bundleMode: "single-file" });
test.use({ isolateSourceGraphs: true });

test('Sourcing keeps generated material stable until a full-page source replacement is accepted', async ({ page, sourceChanges, testServer, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const wf = new Workflows(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const previewModal = new PreviewPublishModal(page, expect);
  await wf.navigateToBigBundlePreview();
  const retainedPath = path.join(testServer.configDir, 'bundles', slug, 'raw/tracked_page_content', `${originalTitle}.md`);
  const before = fs.readFileSync(retainedPath, 'utf8');
  await sourceChanges.apply('replace-section-page');
  // Reopening preview exercises the public generation path with changed live bytes.
  await previewModal.closeModal();
  await editor.clickPreview();
  await previewModal.waitForPreviewComplete();
  expect(fs.readFileSync(retainedPath, 'utf8')).toBe(before);
  await addKeyFrame(sourceSnapshot);
  await snapshot('generation continues using the accepted snapshot while live source differs');
  await previewModal.closeModal();
  await new BundleEditorPage(page, expect).checkSourceChanges();
  await page.getByRole('button', { name: /source changes? available.*Review/i }).click();
  await page.getByRole('button', { name: 'Accept source update' }).click();
  await expect(page.getByRole('dialog', { name: 'Source review' })).not.toBeVisible();
  await editor.clickPreview();
  await previewModal.waitForPreviewComplete();
  expect(fs.readFileSync(retainedPath, 'utf8')).not.toBe(before);
  const generationInputs = path.join(testServer.configDir, 'bundles', slug, 'raw/generation_inputs');
  const record = JSON.parse(fs.readFileSync(path.join(generationInputs, fs.readdirSync(generationInputs)[0]), 'utf8'));
  const accepted = JSON.parse(fs.readFileSync(path.join(testServer.configDir, 'bundles', slug, 'raw/sourcing/state.json'), 'utf8'));
  expect(record.sourceSnapshotId).toBe(accepted.acceptedId);
  // The complete replacement page carries an ordinary, unconditional PageSpec.
  const replacement = fileURLToPath(new URL('../../../shared_data/source_changes/meadow-test-bundles-data/replace-section-page/replacement.md', import.meta.url));
  const pageSpec = getPagespecForBundle(getEffectivePagespecBlock(replacement, fs.readFileSync(replacement, 'utf8')).block!, slug)!;
  const graphResponse = await page.request.get(`/api/bundles/${slug}/curation/working-graph`);
  expect(graphResponse.ok()).toBe(true);
  const graph = await graphResponse.json();
  const node = graph.nodes.find((item: { bundleNodeName: string }) => item.bundleNodeName === originalTitle);
  expect(Boolean(node)).toBe(pageSpec.curation.isInWorkingGraph);
  expect(node.tracked).toBe(pageSpec.curation.isTracked);
  const versionsRoot = path.join(testServer.configDir, 'bundles', slug, 'html/generated_bundle_versions');
  const html = fs.readFileSync(path.join(versionsRoot, fs.readdirSync(versionsRoot).find(name => /^v[A-Za-z0-9]{6}$/.test(name))!, `${originalTitle}.html`), 'utf8');
  expect(extractMainSectionLinkPaths(html).sort()).toEqual(pageSpec.generation.htmlRenderedLinks.mainSectionLinks.map(link => link.relativeLinkPath).sort());
  expect(extractFooterBacklinkPaths(html).sort()).toEqual(pageSpec.generation.htmlRenderedLinks.footerSectionBacklinks.map(link => link.relativeLinkPath).sort());
  await addKeyFrame(sourceSnapshot);
  await snapshot('generation adopts replaced source only after snapshot acceptance');
  await skipMeadowHomeStateCheck();
});
