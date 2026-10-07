/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { startDevTools } from '../src/run/devTools.js';
import { DevSourceChangesControl } from '../src/run/pages/dev-tools/SourceChangesControl.js';
import { DevSavedStatesPage } from '../src/run/pages/dev-tools/SavedStatesPage.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, savedState, sourceChange, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';
import { getRuntimePaths } from '../../../runtime/supervisor/src/runtimePaths.js';
import { readRuntimeSessionDescriptor } from '../../../runtime/supervisor/src/sessionDescriptor.js';
import { postRuntimeControl, waitForRuntimeHomeRelease } from '../../../runtime/supervisor/src/runtimeClient.js';

test.use({ executionSurfaces: ['dev-tools', 'browser'] });
test.use({ bundleMode: 'single-file' });

async function stopRuntime(home: string): Promise<void> {
  const sessionPath = getRuntimePaths(home).sessionDescriptor;
  if (!fs.existsSync(sessionPath)) return;
  const descriptor = readRuntimeSessionDescriptor(sessionPath);
  await postRuntimeControl(descriptor, '/shutdown', { force: true });
  await waitForRuntimeHomeRelease(descriptor);
}

const name = linkedScenarioName(conceptText`Sourcing Start scenario opens a fresh home and hands over directly in source review`);

const description = linkedScenarioDescription(conceptText`Start a source-change scenario from Dev Tools twice. Each start opens the
change's designated fixture in a fresh home with Local services, accepts the
baseline, applies the change, and hands over directly in source review. The
developer's real home is never touched.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '673d01ca-cd33-43b5-9c5b-224d1bdbe26c' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, addKeyFrame, skipMeadowHomeStateCheck, checkpoint }, testInfo) => {
  // --- Setup ---
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-dev-scenario-')));
  const realHome = path.join(root, 'MeadowHome');
  fs.mkdirSync(realHome);
  fs.writeFileSync(path.join(realHome, 'original-home.txt'), 'Preserve the original home');
  const devHomes = path.join(root, 'dev-homes');
  const devTools = await sourceCommand(() => startDevTools(expect, { MEADOW_HOME_DIRECTORY_OVERRIDE: realHome, MEADOW_DEV_HOMES_DIRECTORY: devHomes }));
  const opened: string[] = [];
  try {
    await sourceCommand(() => page.goto(devTools.clientUrl));
    const savedStates = new DevSavedStatesPage(page, expect);
    await sourceCommand(() => savedStates.expectOpen({ origin: 'Your real Meadow Home', services: 'As configured in your Meadow Home' }));
    await sourceCommand(() => savedStates.useBrowserLaunches());
    const fixture = savedStates.card('home_fixture_big_and_small');
    await sourceCommand(() => new DevSourceChangesControl(fixture, expect).open());
    await sourceCommand(() => fixture.getByRole('tab', { name: 'remove', exact: true }).click());
    const change = fixture.getByTestId('source-change-delete-linked-section');
    await sourceCommand(() => expect(change.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled());
    await sourceCommand(() => addKeyFrame(sourceChange));
    await sourceCommand(() => checkpoint('source changes are browsable while the real home is open'));

    // --- Test start ---
    // Start the selected source change.
    const startScenario = async () => {
      const [response] = await Promise.all([
        page.waitForResponse('**/api/source-scenarios/delete-linked-section/start', { timeout: 120_000 }),
        change.getByRole('button', { name: 'Start', exact: true }).click(),
      ]);
      expect(response.ok()).toBe(true);
      await expect(fixture.getByTestId('source-changes-control')).toHaveAttribute('aria-busy', 'false', { timeout: 120_000 });
      const result = await response.json() as { targetPath: string; destination: string };
      await savedStates.expectOpen({ origin: 'Home fixture big_and_small', services: /^Local · partition dev-/ });
      opened.push(await savedStates.openHome());
      return result;
    };
    const first = await sourceCommand(() => startScenario());
    expect(first.targetPath).toBe('/bundle/meadow-test-bundle-big?surface=source-review');
    await sourceCommand(() => addKeyFrame(savedState));
    await sourceCommand(() => checkpoint('starting the scenario opens its fixture with Local services'));

    // Start again after exploring.
    fs.writeFileSync(path.join(opened[0], 'exploration.txt'), 'An earlier exploration');
    const second = await sourceCommand(() => startScenario());
    expect(opened[1]).not.toBe(opened[0]);
    expect(fs.existsSync(path.join(opened[1], 'exploration.txt'))).toBe(false);
    expect(fs.readdirSync(realHome)).toEqual(['original-home.txt']);
    expect(fs.existsSync(path.join(root, 'MeadowHome_normal'))).toBe(false);
    await sourceCommand(() => checkpoint('starting again opens a fresh home and leaves the real home alone'));

    // Inspect the source review handoff.
    await sourceCommand(() => page.goto(second.destination));
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => expect(page.getByTestId('sourcing-workspace')).toBeVisible());
    await sourceCommand(() => editor.expectSourceOrphanCount(1));
    const orphans = await sourceCommand(() => editor.sourceReview.reviewOrphans());
    await sourceCommand(() => orphans.showExplanation('t003 ---- page with section to link to'));
    await sourceCommand(() => orphans.expectMissingLinkedFile('t003 ---- page with section to link to', 't003 - link to section.md', 't003 ---- page with section to link to.md'));
    await sourceCommand(() => addKeyFrame(sourceChange));
    await sourceCommand(() => checkpoint('the handoff opens the missing linked page explanation'));
  } finally {
    await sourceCommand(() => page.goto('about:blank').catch(() => undefined));
    await sourceCommand(() => devTools.stop());
    for (const home of opened) await sourceCommand(() => stopRuntime(home).catch(() => undefined));
    await sourceCommand(() => testInfo.attach('dev-source-scenario.log', { body: devTools.logs(), contentType: 'text/plain' }));
    fs.rmSync(root, { recursive: true, force: true });
  }
  await sourceCommand(() => skipMeadowHomeStateCheck());
});
