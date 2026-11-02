import { SourceIndexState } from '../src/run/state/SourceIndexState.js';
/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { MeadowHomeBundleConfig, AcceptedSourcingState } from '../src/run/utils/index.js';
import { SourcingProposalState } from '../src/run/state/SourcingProposalState.js';

import { execFileSync } from 'node:child_process';

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { scenarioSections, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, sourceReviewWorkspace } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Sourcing rechecks all source files through a real Rust index rebuild and reviews the resulting update`);

const description = linkedScenarioDescription(conceptText`Change source content, then rebuild the source index. A full scan should discover the
update and present it for review.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: source history exposes a full recheck of the populated index.` },
  rebuildSourceIndex: { type: 'test', text: conceptText`Rebuild the source index.` },
  rebuildAgainAfterSourceEdit: { type: 'test', text: conceptText`Rebuild again after a source edit.` },
  acceptSourceUpdate: { type: 'test', text: conceptText`Accept the source update.` },
});
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '2fd097fe-1920-458d-a0d2-26f66e48c93e' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, sourceChanges, testServer, checkpoint, skipMeadowHomeStateCheck }) => {
  const { editor, proposal, indexPath, readIndex, readState, before, acceptedId, recheck } = await test.step(sections.steps.setup, async () => {
    await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
    const editor = new BundleEditorPage(page, expect);
    const proposal = new SourcingProposalState(testServer, 'meadow-test-bundle-big');
    await sourceCommand(() => editor.waitForSourceCheck());
    await sourceCommand(() => page.clock.install());
    const pausedAt = Date.now();
    // Freeze wall time before pausing timers so protocol latency cannot put the target in the past.
    await sourceCommand(() => page.clock.setFixedTime(pausedAt));
    await sourceCommand(() => page.clock.pauseAt(pausedAt));
    const index = new SourceIndexState(testServer.configDir, 'meadow-test-bundle-big', expect);
    const root = index.sourceRoot;
    const indexPath = index.diagnosticsPath;
    const readIndex = () => index.current;
    const readState = () => new AcceptedSourcingState(testServer.configDir, "meadow-test-bundle-big").current as { acceptedId: string; candidateId?: string };
    const before = readIndex();
    expect(before.sourceRoot).toBe(root);
    const acceptedId = readState().acceptedId;
    await sourceCommand(() => expect(page.getByRole('button', { name: 'Recheck all source files', exact: true })).not.toBeVisible());
    await sourceCommand(() => editor.reviewSourceHistory());
    const recheck = page.getByRole('dialog', { name: 'Source snapshots', exact: true }).getByRole('button', { name: 'Recheck all source files', exact: true });
    await sourceCommand(() => checkpoint('source history exposes a full recheck of the populated index', { keyFrames: [sourceSnapshot] }));
    return { editor, proposal, indexPath, readIndex, readState, before, acceptedId, recheck };
  });

  await test.step(sections.steps.rebuildSourceIndex, async () => {
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
    await sourceCommand(() => checkpoint('a thorough source check rebuilds the populated index without accepting source material', { keyFrames: [sourceSnapshot] }));
  });

  await test.step(sections.steps.rebuildAgainAfterSourceEdit, async () => {
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
    await sourceCommand(() => checkpoint('the full rebuild presents modified content for normal source review', { keyFrames: [sourceSnapshot] }));
  });

  await test.step(sections.steps.acceptSourceUpdate, async () => {
    await sourceCommand(() => editor.sourceReview.accept());
    expect(readState().acceptedId).not.toBe(acceptedId);
    expect(readState().candidateId).toBeUndefined();
    expect(execFileSync('git', ['check-ignore', indexPath], { cwd: testServer.configDir, encoding: 'utf8' }).trim()).toBe(indexPath);
    expect(execFileSync('git', ['ls-files', '--', 'cache/source-index'], { cwd: testServer.configDir, encoding: 'utf8' }).trim()).toBe('');
    await sourceCommand(() => checkpoint('acceptance installs the reviewed source checkpoint while the local index stays untracked', { keyFrames: [sourceSnapshot] }));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
