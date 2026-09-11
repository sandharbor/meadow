/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourceSnapshot } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });
test.use({ isolateSourceGraphs: true });

test('Sourcing rechecks all source files through a real Rust index rebuild and reviews the resulting update', async ({ page, sourceChanges, testServer, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
  await new Workflows(page, expect).navigateToBigBundle();
  const editor = new BundleEditorPage(page, expect);
  await editor.waitForSourceCheck();
  await page.clock.install();
  const pausedAt = Date.now();
  // Freeze wall time before pausing timers so protocol latency cannot put the target in the past.
  await page.clock.setFixedTime(pausedAt);
  await page.clock.pauseAt(pausedAt);
  const bundle = path.join(testServer.configDir, 'bundles/meadow-test-bundle-big');
  const config = YAML.parse(fs.readFileSync(path.join(bundle, 'config/bundle_config.yaml'), 'utf8')) as { sourceDirectory: string };
  const root = fs.realpathSync(config.sourceDirectory);
  const key = createHash('sha256').update(root).digest('hex');
  const indexPath = path.join(testServer.configDir, 'cache/source-index', key, 'index.json');
  const readIndex = () => JSON.parse(fs.readFileSync(indexPath, 'utf8')) as {
    sourceRoot: string; generation: number; rebuilt: boolean; filesRead: number; files: Record<string, unknown>;
  };
  const readState = () => JSON.parse(fs.readFileSync(path.join(bundle, 'raw/sourcing/state.json'), 'utf8')) as { acceptedId: string; candidateId?: string };
  const before = readIndex();
  expect(before.sourceRoot).toBe(root);
  const acceptedId = readState().acceptedId;
  await expect(page.getByRole('button', { name: 'Recheck all source files', exact: true })).not.toBeVisible();
  await editor.reviewSourceHistory();
  const recheck = page.getByRole('dialog', { name: 'Source snapshots', exact: true }).getByRole('button', { name: 'Recheck all source files', exact: true });
  await addKeyFrame(sourceSnapshot);
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/sourcing/scan') && response.request().postDataJSON()?.rebuildIndex === true && response.ok()),
    recheck.click(),
  ]);
  await expect(page.getByRole('dialog', { name: 'Source snapshots', exact: true })).not.toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Source changes', exact: true }).getByRole('button', { name: 'Check again', exact: true })).toBeEnabled();
  const rebuilt = readIndex();
  expect(rebuilt.generation).toBeGreaterThan(before.generation);
  expect(rebuilt.rebuilt).toBe(true);
  expect(rebuilt.filesRead).toBe(Object.keys(rebuilt.files).length);
  expect(readState().acceptedId).toBe(acceptedId);
  await addKeyFrame(sourceSnapshot);
  await snapshot('a thorough source check rebuilds the populated index without accepting source material');

  await editor.sourceReview.defer();
  await editor.reviewSourceHistory();
  await sourceChanges.apply('replace-section-page');
  const modalRecheck = recheck;
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/sourcing/scan') && response.request().postDataJSON()?.rebuildIndex === true && response.ok()),
    modalRecheck.click(),
  ]);
  await expect(page.getByRole('dialog', { name: 'Source changes', exact: true }).getByRole('button', { name: 'Check again', exact: true })).toBeEnabled();
  await editor.sourceReview.expectModified('t003 ---- page with section to link to.md');
  expect(readIndex().filesRead).toBe(Object.keys(readIndex().files).length);
  expect(readState().acceptedId).toBe(acceptedId);
  expect(readState().candidateId).toBeTruthy();
  await addKeyFrame(sourceSnapshot);
  await snapshot('the full rebuild presents modified content for normal source review');
  await editor.sourceReview.accept();
  expect(readState().acceptedId).not.toBe(acceptedId);
  expect(readState().candidateId).toBeUndefined();
  expect(execFileSync('git', ['check-ignore', indexPath], { cwd: testServer.configDir, encoding: 'utf8' }).trim()).toBe(indexPath);
  expect(execFileSync('git', ['ls-files', '--', 'cache/source-index'], { cwd: testServer.configDir, encoding: 'utf8' }).trim()).toBe('');
  await addKeyFrame(sourceSnapshot);
  await snapshot('acceptance installs the reviewed source snapshot while the local index stays untracked');
  await skipMeadowHomeStateCheck();
});
