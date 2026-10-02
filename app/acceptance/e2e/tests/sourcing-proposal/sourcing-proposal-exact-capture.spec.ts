/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../../src/run/test-fixtures.js';
import { BundleListPage, BundleEditorPage, PreviewPublishModal } from '../../src/run/pages/index.js';
import { SourcingWorkspacePage } from '../../src/run/pages/areas/bundle/sourcing/SourcingWorkspacePage.js';
import { Fixture } from '../../src/run/workflows.js';
import { sourcingReviewRedesign, pendingSourceProposal, pendingProposalRevalidation, sourceChangesDuringReview, sourceReviewAcceptance, sourceSnapshot } from '../../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ fixtureHome: Fixture.Example });

/*
 * Review a captured text and diagram revision B, then edit both live files again to C. A background
 * check reports newer material while the comparison stays on B. Accept and generate B, then open
 * the subsequent C proposal. Each phase preserves the exact capture that its review displays.
 */
test('Sourcing accepts the exact reviewed capture while newer live sources remain available', async ({ page, sourceChanges, testServer, checkpoint, addKeyFrame, assertMeadowHomeState }) => {
  // --- Setup ---
  await page.clock.install();
  const list = new BundleListPage(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const sourcing = new SourcingWorkspacePage(page, expect);
  await list.goto();
  await list.clickBundle('example-bundle');
  await editor.waitForLoad('example-bundle');
  const directory = path.join(testServer.configDir, 'bundles/example-bundle');
  const state = () => JSON.parse(fs.readFileSync(path.join(directory, 'raw/sourcing/state.json'), 'utf8'));
  await checkpoint('accepted text and diagram are the original revision A');

  // --- Test start ---
  // Capture B and review both its text and image before any further source edits.
  await sourceChanges.apply('revise-biases-and-diagram', 'example-bundle-data');
  await editor.checkSourceChanges();
  await sourcing.open();
  const candidateB = state().candidateId;
  await sourcing.compare('Cognitive Biases');
  await expect(sourcing.comparison).toContainText('Reviewed revision B explains');
  await sourcing.closeComparison();
  await sourcing.compare('Mental Models Diagram');
  const proposedImage = sourcing.comparison.getByRole('img', { name: 'after captured source', exact: true });
  await expect.poll(() => proposedImage.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await addKeyFrame(sourceSnapshot);
  await sourcing.closeComparison();
  await checkpoint('revision B text and diagram are captured and reviewable');

  // A second edit during the review is deliberately ephemeral: it races the retained capture.
  const sourceRoot = path.join(testServer.sourceGraphsDir, 'example-bundle-data');
  for (const relative of ['Cognitive Biases.md', 'images/Mental Models Diagram.svg']) {
    const filename = path.join(sourceRoot, relative);
    fs.writeFileSync(filename, fs.readFileSync(filename, 'utf8').replaceAll('Reviewed revision B', 'Live revision C'));
  }
  await page.clock.fastForward(30000);
  await expect(sourcing.root.getByRole('status').filter({ hasText: 'Newer sources available' })).toBeVisible();
  expect(state().candidateId).toBe(candidateB);
  await sourcing.compare('Cognitive Biases');
  await expect(sourcing.comparison).toContainText('Reviewed revision B explains');
  await expect(sourcing.comparison).not.toContainText('Live revision C');
  await addKeyFrame(sourceChangesDuringReview);
  await checkpoint('B remains under review while the newer C revision is available');

  // Acceptance and generation use B, including its image, while live C waits.
  await sourcing.closeComparison();
  await sourcing.accept();
  expect(state().acceptedId).toBe(candidateB);
  await editor.clickPreview();
  const preview = new PreviewPublishModal(page, expect);
  await preview.waitForPreviewComplete();
  const generatedText = fs.readFileSync(path.join(directory, 'raw/tracked_page_content/Cognitive Biases.md'), 'utf8');
  expect(generatedText).toContain('Reviewed revision B');
  expect(generatedText).not.toContain('Live revision C');
  const imageResponse = await page.request.get('/api/bundles/example-bundle/generation/source-file/images%2FMental%20Models%20Diagram.svg');
  expect(imageResponse.ok()).toBe(true);
  expect(await imageResponse.text()).toContain('Reviewed revision B');
  await checkpoint('accepted and generated material use the reviewed B capture');

  // C is offered separately, with B as its comparison baseline.
  await preview.closeModal();
  await editor.checkSourceChanges();
  await sourcing.open();
  expect(state().candidateId).not.toBe(candidateB);
  await sourcing.compare('Cognitive Biases');
  await expect(sourcing.comparison).toContainText('Reviewed revision B');
  await expect(sourcing.comparison).toContainText('Live revision C');
  await checkpoint('a subsequent proposal compares C against accepted B');

  // Finish this scenario with the subsequent proposal accepted and all business state saved.
  await sourcing.closeComparison();
  await sourcing.accept();
  await checkpoint('both revisions have distinct accepted source history entries');
  // Preview outputs and the externally edited fixture sources are intentionally uncommitted;
  // proposal, accepted configuration, and tracking metadata must all be saved.
  await assertMeadowHomeState({
    allowedUntracked: ['bundles/example-bundle/build/', 'bundles/example-bundle/html/',
      'bundles/example-bundle/raw/generation_inputs/', 'bundles/example-bundle/raw/tracked_page_content/', 'source_graphs/.source-changes.jsonl'],
    allowedModified: ['source_graphs/example-bundle-data/Cognitive Biases.md', 'source_graphs/example-bundle-data/images/Mental Models Diagram.svg'],
  });
});
