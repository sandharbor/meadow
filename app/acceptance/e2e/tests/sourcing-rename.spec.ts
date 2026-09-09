/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourceSnapshot, sourceMove, sourceChange } from '../../../concepts/index.js';
import { parseBundleNodeConfig } from '../../../shared_code/utils/bundleNodeConfigUtils.js';

const slug = 'meadow-test-bundle-big';
const originalTitle = 't003 ---- page with section to link to';
const renamedTitle = 't003 ---- renamed section page';

test.use({ bundleMode: "single-file" });
test.use({ isolateSourceGraphs: true });

test('Sourcing reviews a shared rename without disrupting curation and preserves page identity', async ({ page, sourceChanges, testServer, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const wf = new Workflows(page, expect);
  await wf.navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  const configPath = path.join(testServer.configDir, 'bundles', slug, 'config/bundle_node_config.yaml');
  const original = parseBundleNodeConfig(fs.readFileSync(configPath, 'utf8')).find(node => node.bundleNodeName === originalTitle)!;
  await editor.waitForSourceCheck();
  await editor.expectSourceOrphanCount(13);
  await sourceChanges.apply('rename-page-with-links');
  await editor.checkSourceChanges();
  await expect(page.getByRole('button', { name: /source changes? available.*Review/i })).toBeVisible();
  await editor.sourceReview.expectClosed();
  await editor.expectSourceOrphanCount(13);
  await addKeyFrame(sourceSnapshot);
  await snapshot('candidate waits while accepted curation remains stable');

  const review = editor.sourceReview;
  await review.open();
  await review.expectReadyToAccept();
  await review.expectFocusTrapped();
  await review.expectMove('Renamed', `${originalTitle}.md`, `${renamedTitle}.md`);
  const rename = await review.moveFrom(`${originalTitle}.md`);
  await rename.expectDetailsCollapsed();
  await addKeyFrame(sourceMove);
  await snapshot('proposed rename is ready to accept with choices and evidence collapsed');
  await rename.expandDetails();
  await rename.collapseDetails();
  await rename.expandDetails('keyboard');
  await rename.expectSamePageSelected();
  await rename.expectNoContentComparison();
  await rename.expectSingleRoute(['main page.md', 't003 - link to section.md']);
  await addKeyFrame(sourceMove);
  await snapshot('an unchanged traversal route uses file pills without repeating the renamed endpoint');
  await review.closeWithEscape();
  await review.open();
  await rename.expectDetailsCollapsed();
  await review.expandDetails('t003 - link to section.md');
  await review.expectInlineChanges('t003 - link to section.md', ['page with section to link to'], ['renamed section page']);
  await addKeyFrame(sourceChange);
  await snapshot('renamed link text uses readable replacement phrases');
  await review.accept();
  await expect.poll(() => parseBundleNodeConfig(fs.readFileSync(configPath, 'utf8')).find(node => node.bundleNodeId === original.bundleNodeId)?.bundleNodeName).toBe(renamedTitle);
  await editor.expectSourceOrphanCount(0);
  await editor.switchToListView();
  await expect(page.getByText(renamedTitle, { exact: true }).first()).toBeVisible();
  await addKeyFrame(sourceSnapshot);
  await snapshot('accepted rename keeps the existing tracked page identity');
  await skipMeadowHomeStateCheck();
});
