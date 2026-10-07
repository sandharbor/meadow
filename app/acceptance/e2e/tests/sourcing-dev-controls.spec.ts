/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../src/run/test-fixtures.js';
import { startDevTools } from '../src/run/devTools.js';
import { DevSourceChangesControl } from '../src/run/pages/dev-tools/SourceChangesControl.js';
import { DevSavedStatesPage } from '../src/run/pages/dev-tools/SavedStatesPage.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { Workflows } from '../src/run/workflows.js';
import { sourcingReviewRedesign, sourceChange, sourceSnapshot, savedState, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';
import { createBrowserLaunchUrl } from '../../../runtime/supervisor/src/runtimeClient.js';
import { readRuntimeSessionDescriptor } from '../../../runtime/supervisor/src/sessionDescriptor.js';

const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url));

test.use({ executionSurfaces: ['dev-tools', 'browser'] });
test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Sourcing dev controls apply the same shared move to the running application`);

const description = linkedScenarioDescription(conceptText`Apply a shared source change from Dev Tools to the open saved state, which is
this scenario's own running home. The application should review the same move
used by the automated test, and fixture menus that share the graph agree.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'e990e4cb-3410-43f9-9054-f3f40ce902e7' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }, testInfo) => {
  // --- Setup ---
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
  await sourceCommand(() => new BundleEditorPage(page, expect).waitForSourceCheck());
  const reports = path.join(testInfo.outputDir, 'source-change-reports');
  for (const [run, slug, spec, title] of [
    ['2026-09-20_10-00-00', 'old-move', 'sourcing-move-page.spec.ts', 'Older move scenario'],
    ['2026-09-21_10-00-00', 'shared-move', 'sourcing-move-page.spec.ts', 'Shared move regression'],
    ['2026-09-22_10-00-00', 'unrelated', 'unrelated.spec.ts', 'Unrelated latest scenario'],
  ]) {
    const directory = path.join(reports, run, slug);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'test-file.txt'), path.join(projectRoot, 'app/acceptance/e2e/tests', spec));
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ testName: title }));
  }
  // Dev Tools adopts this scenario's running home as its open saved state.
  const devHomes = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-dev-homes-'));
  fs.writeFileSync(path.join(devHomes, 'current.json'), JSON.stringify({
    id: 'e2e-scenario-home',
    origin: { kind: 'fixture', fixture: 'home_fixture_big_and_small' },
    label: 'big_and_small',
    homeDirectory: testServer.configDir,
    logsDirectory: testServer.logsDirectory,
    serviceTarget: 'hosted',
    openedAt: new Date().toISOString(),
    currentCode: { revision: 'unknown', uncommitted: false },
    serviceEnvironment: {},
  }));
  const devTools = await sourceCommand(() => startDevTools(expect, {
    MEADOW_HOME_DIRECTORY_OVERRIDE: path.join(devHomes, 'normal-home'),
    MEADOW_DEV_HOMES_DIRECTORY: devHomes,
    MEADOW_E2E_RUNS_DIRECTORY: reports,
    MEADOW_REPORT_VIEWER_URL: 'http://localhost:5175',
  }));
  try {
    await sourceCommand(() => page.goto(devTools.clientUrl));
    await sourceCommand(() => new DevSavedStatesPage(page, expect).expectOpen({ origin: 'Home fixture big_and_small', services: 'Hosted Development' }));
    await sourceCommand(() => addKeyFrame(savedState));
    const fixture = page.getByTestId('fixture-card-home_fixture_big_and_small');
    const controls = new DevSourceChangesControl(fixture, expect);
    await sourceCommand(() => controls.checkHelpWhileClosed());
    await sourceCommand(() => checkpoint('dev controls are ready on the open saved state'));

    // --- Test start ---
    // Apply the shared move.
    await sourceCommand(() => controls.open());
    await sourceCommand(() => expect(fixture.getByRole('tab', { name: 'add', exact: true })).toHaveAttribute('aria-selected', 'true'));
    await sourceCommand(() => fixture.getByRole('tab', { name: 'move', exact: true }).click());
    const move = fixture.getByTestId('source-change-move-nested-page');
    await sourceCommand(() => controls.expandChange('move-nested-page',
      'Move child 2 to a new directory, preserving its filename and content.',
      'Review proposes a move, and existing name-only links still resolve.'));
    await sourceCommand(() => controls.expectE2eRun('move-nested-page', 'Shared move regression', 'http://localhost:5175/2026-09-21_10-00-00/shared-move'));
    await sourceCommand(() => expect(move.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled());
    await sourceCommand(() => Promise.all([page.waitForResponse('**/source-changes/move-nested-page'), move.getByRole('button', { name: 'Apply', exact: true }).click()]));
    await sourceCommand(() => expect(fixture.getByTestId('source-changes-control')).toHaveAttribute('aria-busy', 'false'));
    await sourceCommand(() => expect(move.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled());
    await sourceCommand(() => expect(move).not.toContainText('Applied to the current fixture'));
    expect(fs.existsSync(path.join(testServer.sourceGraphsDir, 'meadow-test-bundles-data/t001/deeper/t001 ---- child 2.md'))).toBe(false);
    await sourceCommand(() => addKeyFrame(sourceChange));
    await sourceCommand(() => expect(sourceChanges.apply('move-nested-page')).rejects.toThrow(/already applied/));
    await sourceCommand(() => checkpoint('dev controls apply a real source move to the isolated big graph'));

    // Inspect multi-source actions.
    const multiFixture = page.getByTestId('fixture-card-home_fixture_multi_source');
    const multiControls = new DevSourceChangesControl(multiFixture, expect);
    await sourceCommand(() => multiControls.open());
    await sourceCommand(() => expect(multiFixture.getByRole('tab', { name: 'add', exact: true })).toBeDisabled());
    await sourceCommand(() => expect(multiFixture.getByRole('tab', { name: 'rename', exact: true })).toBeDisabled());
    const moveTab = multiFixture.getByRole('tab', { name: 'move', exact: true });
    await sourceCommand(() => expect(moveTab).toHaveAttribute('aria-selected', 'true'));
    await sourceCommand(() => moveTab.press('ArrowRight'));
    await sourceCommand(() => expect(multiFixture.getByRole('tab', { name: 'modify', exact: true })).toBeFocused());
    await sourceCommand(() => multiFixture.getByRole('tab', { name: 'modify', exact: true }).press('ArrowRight'));
    await sourceCommand(() => expect(multiFixture.getByTestId('source-change-competing-cross-source-moves')).toHaveCount(0));
    await sourceCommand(() => multiFixture.getByRole('tab', { name: 'remove', exact: true }).press('Home'));
    await sourceCommand(() => expect(moveTab).toBeFocused());
    const competing = await sourceCommand(() => multiControls.expandChange('competing-cross-source-moves',
      'Replace notes://Same/Inside.md with two identical, reachable files in different sources.',
      'Review must not silently assign either one the old identity.'));
    await sourceCommand(() => expect(competing).toContainText('No recorded run yet (multi-source-competing-moves)'));
    await sourceCommand(() => multiControls.expectOperations('competing-cross-source-moves', [
      { delete: 'notes://Same/Inside.md' },
      { write: { path: 'research://Moved/Inside.md', contentFile: 'Inside.md' } },
      { write: { path: 'reference://Moved/Inside.md', contentFile: 'Inside.md' } },
      { replaceText: { path: 'notes://Start.md', before: '[[Same/Inside]]', after: '[[Moved/Inside::research]] and [[Moved/Inside::reference]]', count: 1 } },
    ]));
    await sourceCommand(() => competing.scrollIntoViewIfNeeded());
    await sourceCommand(() => addKeyFrame(sourceChange));
    await sourceCommand(() => checkpoint('multi-source changes have one category home and readable source-qualified operations'));

    // Check the shared fixture menus.
    for (const fixtureName of ['nested', 'srs']) {
      const sharedFixture = page.getByTestId(`fixture-card-home_fixture_${fixtureName}`);
      const sharedControls = new DevSourceChangesControl(sharedFixture, expect);
      await sourceCommand(() => sharedControls.open());
      await sourceCommand(() => sharedFixture.getByRole('tab', { name: 'move', exact: true }).click());
      await sourceCommand(() => sharedControls.expandChange('move-nested-page',
        'Move child 2 to a new directory, preserving its filename and content.',
        'Review proposes a move, and existing name-only links still resolve.'));
      await sourceCommand(() => sharedControls.expectE2eRun('move-nested-page', 'Shared move regression', 'http://localhost:5175/2026-09-21_10-00-00/shared-move'));
    }
    await sourceCommand(() => checkpoint('nested and SRS expose the same source-change coverage'));

    // Review the move in the application.
    // Leaving the app for Dev Tools closes its browser session. Exchange a new
    // launch token before returning, including when this review takes longer.
    const runtimeSession = readRuntimeSessionDescriptor(testServer.runtimeSessionPath);
    await sourceCommand(async () => page.goto(await createBrowserLaunchUrl(runtimeSession)));
    await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
    const review = new BundleEditorPage(page, expect).sourceReview;
    await sourceCommand(() => review.open());
    await sourceCommand(() => review.expectMove('Moved', 't001/deeper/t001 ---- child 2.md', 'source-changes/moved/t001 ---- child 2.md'));
    await sourceCommand(() => addKeyFrame(sourceSnapshot));
    await sourceCommand(() => checkpoint('the running application discovers the move made through dev controls'));
  } finally {
    await sourceCommand(() => devTools.stop());
    await sourceCommand(() => testInfo.attach('dev-tools-processes.log', { body: devTools.logs(), contentType: 'text/plain' }));
    fs.rmSync(devHomes, { recursive: true, force: true });
  }
  await sourceCommand(() => skipMeadowHomeStateCheck());
});
