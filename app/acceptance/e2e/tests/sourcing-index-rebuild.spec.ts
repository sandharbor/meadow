/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { SourcingProposalState } from '../src/run/state/SourcingProposalState.js';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Sourcing rechecks all source files through a real Rust index rebuild and reviews the resulting update`);

const description = linkedScenarioDescription(conceptText`Change source content, then rebuild the source index. A full scan should discover the
update and present it for review.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '2fd097fe-1920-458d-a0d2-26f66e48c93e' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, sourceChanges, testServer, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
  const editor = new BundleEditorPage(page, expect);
  const proposal = new SourcingProposalState(testServer, 'meadow-test-bundle-big');
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => page.clock.install());
  const pausedAt = Date.now();
  // Freeze wall time before pausing timers so protocol latency cannot put the target in the past.
  await sourceCommand(() => page.clock.setFixedTime(pausedAt));
  await sourceCommand(() => page.clock.pauseAt(pausedAt));
  const bundle = path.join(testServer.configDir, 'bundles/meadow-test-bundle-big');
  const config = YAML.parse(fs.readFileSync(path.join(bundle, 'config/bundle_config.yaml'), 'utf8')) as { sourceDirectory: string };
  const root = fs.realpathSync(config.sourceDirectory);
  const key = createHash('sha256').update(root).digest('hex');
  const indexPath = path.join(testServer.configDir, 'cache/source-index', key, 'last-run.json');
  const readIndex = () => JSON.parse(fs.readFileSync(indexPath, 'utf8')) as {
    sourceRoot: string; completedAtNanos: number; metrics: { cacheRebuilt: boolean; filesRead: number; indexedFiles: number };
  };
  const readState = () => JSON.parse(fs.readFileSync(path.join(bundle, 'raw/sourcing/state.json'), 'utf8')) as { acceptedId: string; candidateId?: string };
  const before = readIndex();
  expect(before.sourceRoot).toBe(root);
  const acceptedId = readState().acceptedId;
  await sourceCommand(() => expect(page.getByRole('button', { name: 'Recheck all source files', exact: true })).not.toBeVisible());
  await sourceCommand(() => editor.reviewSourceHistory());
  const recheck = page.getByRole('dialog', { name: 'Source snapshots', exact: true }).getByRole('button', { name: 'Recheck all source files', exact: true });
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('source history exposes a full recheck of the populated index'));

  // --- Test start ---
  // Rebuild the source index.
  await sourceCommand(() => Promise.all([
    page.waitForResponse(response => response.url().endsWith('/sourcing/scan') && response.request().postDataJSON()?.rebuildIndex === true && response.ok()),
    recheck.click(),
  ]));
  await sourceCommand(() => expect(page.getByRole('dialog', { name: 'Source snapshots', exact: true })).not.toBeVisible());
  await sourceCommand(() => editor.sourceReview.open());
  const rebuilt = readIndex();
  expect(rebuilt.completedAtNanos).toBeGreaterThan(before.completedAtNanos);
  expect(rebuilt.metrics.cacheRebuilt).toBe(true);
  expect(rebuilt.metrics.filesRead).toBe(rebuilt.metrics.indexedFiles);
  expect(readState().acceptedId).toBe(acceptedId);
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('a thorough source check rebuilds the populated index without accepting source material'));

  // Rebuild again after a source edit.
  await sourceCommand(() => editor.sourceReview.defer());
  await sourceCommand(() => editor.reviewSourceHistory());
  await sourceCommand(() => sourceChanges.apply('replace-section-page'));
  const modalRecheck = recheck;
  await sourceCommand(() => Promise.all([
    page.waitForResponse(response => response.url().endsWith('/sourcing/scan') && response.request().postDataJSON()?.rebuildIndex === true && response.ok()),
    modalRecheck.click(),
  ]));
  await sourceCommand(() => editor.sourceReview.open());
  expect(readIndex().metrics.filesRead).toBe(readIndex().metrics.indexedFiles);
  await sourceCommand(() => editor.sourceReview.checkAgain());
  await sourceCommand(() => editor.sourceReview.expectModified('t003 ---- page with section to link to.md'));
  expect(readState().acceptedId).toBe(acceptedId);
  expect(proposal.current.candidateSnapshotId).not.toBe(acceptedId);
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('the full rebuild presents modified content for normal source review'));

  // Accept the source update.
  await sourceCommand(() => editor.sourceReview.accept());
  expect(readState().acceptedId).not.toBe(acceptedId);
  expect(readState().candidateId).toBeUndefined();
  expect(execFileSync('git', ['check-ignore', indexPath], { cwd: testServer.configDir, encoding: 'utf8' }).trim()).toBe(indexPath);
  expect(execFileSync('git', ['ls-files', '--', 'cache/source-index'], { cwd: testServer.configDir, encoding: 'utf8' }).trim()).toBe('');
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('acceptance installs the reviewed source checkpoint while the local index stays untracked'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
