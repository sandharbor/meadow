/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../src/run/test-fixtures.js';
import { DevSourceChangesControl } from '../src/run/pages/DevToolsPage/SourceChangesControl.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { Workflows } from '../src/run/workflows.js';
import { sourceChange, sourceSnapshot } from '../../../concepts/index.js';

const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url));

async function availablePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a dev-tool test port');
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise<void>(resolve => child.once('exit', () => resolve()));
  child.kill('SIGTERM');
  await done;
}

test.use({ bundleMode: "single-file" });
test.use({ isolateSourceGraphs: true });

test('Sourcing dev controls apply the same shared move to the running application', async ({ page, testServer, sourceChanges, snapshot, addKeyFrame, skipMeadowHomeStateCheck }, testInfo) => {
  await new Workflows(page, expect).navigateToBigBundle();
  await new BundleEditorPage(page, expect).waitForSourceCheck();
  const devDirectory = path.join(projectRoot, 'app/tooling/dev_tools');
  const [serverPort, clientPort] = await Promise.all([availablePort(), availablePort()]);
  const marker = path.join(path.dirname(testServer.configDir), 'meadow_active_fixture');
  const backup = path.join(path.dirname(testServer.configDir), 'MeadowHome_normal');
  const markerBefore = fs.existsSync(marker) ? fs.readFileSync(marker) : null;
  const hadBackup = fs.existsSync(backup);
  fs.writeFileSync(marker, 'home_fixture_big_and_small');
  fs.mkdirSync(backup, { recursive: true });
  const env = { ...process.env, MEADOW_HOME_DIRECTORY_OVERRIDE: testServer.configDir, PORT: String(serverPort), VITE_DEV_TOOLS_CLIENT_PORT: String(clientPort) };
  let logs = '';
  const start = (args: string[]) => {
    const child = spawn(process.execPath, args, { cwd: devDirectory, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', bytes => { logs += String(bytes); });
    child.stderr?.on('data', bytes => { logs += String(bytes); });
    return child;
  };
  const server = start(['--import', 'tsx', 'src/server/index.ts']);
  const client = start(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--strictPort']);
  try {
    await expect.poll(async () => {
      try { return (await fetch(`http://127.0.0.1:${serverPort}/api/config/fixtures`)).ok; }
      catch { return false; }
    }).toBe(true);
    await expect.poll(async () => {
      try { return (await fetch(`http://127.0.0.1:${clientPort}`)).ok; }
      catch { return false; }
    }).toBe(true);
    await page.goto(`http://127.0.0.1:${clientPort}`);
    const fixture = page.getByTestId('fixture-card-home_fixture_big_and_small');
    const controls = new DevSourceChangesControl(fixture, expect);
    await controls.checkHelpWhileClosed();
    await controls.open();
    await expect(fixture.getByRole('tab', { name: 'add', exact: true })).toHaveAttribute('aria-selected', 'true');
    await fixture.getByRole('tab', { name: 'move', exact: true }).click();
    const move = fixture.getByTestId('source-change-move-nested-page');
    await expect(move.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
    await Promise.all([page.waitForResponse('**/source-changes/move-nested-page'), move.getByRole('button', { name: 'Apply', exact: true }).click()]);
    await expect(fixture.getByTestId('source-changes-control')).toHaveAttribute('aria-busy', 'false');
    await expect(move.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
    expect(fs.existsSync(path.join(testServer.sourceGraphsDir, 'meadow-test-bundles-data/t001/deeper/t001 ---- child 2.md'))).toBe(false);
    await addKeyFrame(sourceChange);
    await snapshot('dev controls apply a real source move to the isolated big graph');
    await expect(sourceChanges.apply('move-nested-page')).rejects.toThrow(/already applied/);
    await new Workflows(page, expect).navigateToBigBundle();
    const review = new BundleEditorPage(page, expect).sourceReview;
    await review.open();
    await review.expectMove('Moved', 't001/deeper/t001 ---- child 2.md', 'source-changes/moved/t001 ---- child 2.md');
    await addKeyFrame(sourceSnapshot);
    await snapshot('the running application discovers the move made through dev controls');
  } finally {
    await stop(client);
    await stop(server);
    if (markerBefore) fs.writeFileSync(marker, markerBefore); else fs.rmSync(marker, { force: true });
    if (!hadBackup) fs.rmSync(backup, { recursive: true, force: true });
    await testInfo.attach('dev-tools-processes.log', { body: logs, contentType: 'text/plain' });
  }
  await skipMeadowHomeStateCheck();
});
