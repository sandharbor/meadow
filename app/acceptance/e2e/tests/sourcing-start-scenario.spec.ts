/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { test, expect } from '../src/run/test-fixtures.js';
import { DevSourceChangesControl } from '../src/run/pages/DevToolsPage/SourceChangesControl.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourceChange } from '../../../concepts/index.js';
import { getRuntimePaths } from '../../../runtime/supervisor/src/runtimePaths.js';
import { readRuntimeSessionDescriptor } from '../../../runtime/supervisor/src/sessionDescriptor.js';
import { createBrowserLaunchUrl, postRuntimeControl, waitForRuntimeHomeRelease } from '../../../runtime/supervisor/src/runtimeClient.js';

async function availablePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  child.kill('SIGTERM'); await exited;
}

test.use({ bundleMode: 'single-file' });

/*
 * Start a source-change scenario from Dev Tools twice. Each start should reset
 * exploration, preserve the original home, and open the application directly in source
 * review.
 */
test('Sourcing Start scenario resets the fixture and hands over directly in source review', async ({ page, addKeyFrame, skipMeadowHomeStateCheck, snapshot }, testInfo) => {
  // --- Setup ---
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-dev-scenario-')));
  const home = path.join(root, 'MeadowHome');
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(home, 'original-home.txt'), 'Preserve the original home');
  const [serverPort, clientPort] = await Promise.all([availablePort(), availablePort()]);
  const directory = path.resolve(import.meta.dirname, '../../../tooling/dev_tools');
  let logs = '';
  const start = (args: string[]) => {
    const child = spawn(process.execPath, args, {
      cwd: directory, env: { ...process.env, MEADOW_HOME_DIRECTORY_OVERRIDE: home, PORT: String(serverPort), VITE_DEV_TOOLS_CLIENT_PORT: String(clientPort) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', data => { logs += String(data); });
    child.stderr?.on('data', data => { logs += String(data); });
    return child;
  };
  const server = start(['--import', 'tsx', 'src/server/index.ts']);
  const client = start(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--strictPort']);
  try {
    for (const url of [`http://127.0.0.1:${serverPort}/api/config/fixtures`, `http://127.0.0.1:${clientPort}`]) {
      await expect.poll(async () => { try { return (await fetch(url)).ok; } catch { return false; } }).toBe(true);
    }
    // Replace only the OS browser opener; fixture reset, CLI, and Runtime are real.
    let destination = '';
    await page.route('**/api/app/open-browser', async route => {
      destination = new URL(route.request().postDataJSON().url).pathname + new URL(route.request().postDataJSON().url).search;
      await route.fulfill({ json: { success: true } });
    });
    await page.goto(`http://127.0.0.1:${clientPort}`);
    await page.getByRole('button', { name: 'Browser', exact: true }).click();
    const fixture = page.getByTestId('fixture-card-home_fixture_big_and_small');
    await new DevSourceChangesControl(fixture, expect).open();
    await fixture.getByRole('tab', { name: 'remove', exact: true }).click();
    const change = fixture.getByTestId('source-change-delete-linked-section');
    await expect(change.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
    await addKeyFrame(sourceChange);
    await snapshot('source changes are available before starting the fixture');

    // --- Test start ---
    // Start the selected source change.
    await Promise.all([page.waitForResponse('**/api/app/open-browser', { timeout: 120000 }), change.getByRole('button', { name: 'Start', exact: true }).click()]);
    await expect(fixture.getByTestId('source-changes-control')).toHaveAttribute('aria-busy', 'false', { timeout: 120000 });
    await expect(fixture.getByTestId('source-changes-control').getByRole('status')).toHaveCount(0);
    await snapshot('starting the scenario resets and applies its source change');

    // Start again after exploring.
    fs.writeFileSync(path.join(home, 'exploration.txt'), 'An earlier exploration');
    await Promise.all([page.waitForResponse('**/api/app/open-browser', { timeout: 120000 }), change.getByRole('button', { name: 'Start', exact: true }).click()]);
    await expect(fixture.getByTestId('source-changes-control')).toHaveAttribute('aria-busy', 'false', { timeout: 120000 });
    expect(fs.existsSync(path.join(home, 'exploration.txt'))).toBe(false);
    expect(destination).toBe('/bundle/meadow-test-bundle-big?sourceReview=1');
    expect(fs.readFileSync(path.join(root, 'MeadowHome_normal/original-home.txt'), 'utf8')).toBe('Preserve the original home');
    await snapshot("starting again resets exploration and preserves the original home");

    // Inspect the source review handoff.
    const descriptor = readRuntimeSessionDescriptor(getRuntimePaths(home).sessionDescriptor);
    const launchUrl = await createBrowserLaunchUrl(descriptor, destination);
    await page.goto(launchUrl);
    const editor = new BundleEditorPage(page, expect);
    await expect(page.getByRole('dialog', { name: 'Source changes', exact: true })).toBeVisible();
    await editor.expectSourceOrphanCount(1);
    const orphans = await editor.sourceReview.reviewOrphans();
    await orphans.showExplanation('t003 ---- page with section to link to');
    await orphans.expectMissingLinkedFile('t003 ---- page with section to link to', 't003 - link to section.md', 't003 ---- page with section to link to.md');
    await addKeyFrame(sourceChange);
    await snapshot('the handoff opens the missing linked page explanation');

  } finally {
    await page.goto('about:blank');
    const sessionPath = getRuntimePaths(home).sessionDescriptor;
    if (fs.existsSync(sessionPath)) {
      const descriptor = readRuntimeSessionDescriptor(sessionPath);
      await postRuntimeControl(descriptor, '/shutdown', { force: true });
      await waitForRuntimeHomeRelease(descriptor);
    }
    await stop(client); await stop(server);
    await testInfo.attach('dev-source-scenario.log', { body: logs, contentType: 'text/plain' });
    fs.rmSync(root, { recursive: true, force: true });
  }
  await skipMeadowHomeStateCheck();
});
