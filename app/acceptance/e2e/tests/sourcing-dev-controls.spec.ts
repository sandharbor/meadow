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

/*
 * Apply a shared source-change scenario from Dev Tools to a running fixture. The
 * application should review the same move used by the automated test.
 */
test('Sourcing dev controls apply the same shared move to the running application', async ({ page, testServer, sourceChanges, snapshot, addKeyFrame, skipMeadowHomeStateCheck }, testInfo) => {
  // --- Setup ---
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
  const env = { ...process.env, MEADOW_HOME_DIRECTORY_OVERRIDE: testServer.configDir, PORT: String(serverPort), VITE_DEV_TOOLS_CLIENT_PORT: String(clientPort), MEADOW_E2E_RUNS_DIRECTORY: reports, MEADOW_REPORT_VIEWER_URL: 'http://localhost:5175' };
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
    await snapshot('dev controls are ready on the running fixture');

    // --- Test start ---
    // Apply the shared move.
    await controls.open();
    await expect(fixture.getByRole('tab', { name: 'add', exact: true })).toHaveAttribute('aria-selected', 'true');
    await fixture.getByRole('tab', { name: 'move', exact: true }).click();
    const move = fixture.getByTestId('source-change-move-nested-page');
    await controls.expandChange('move-nested-page',
      'Move child 2 to a new directory, preserving its filename and content.',
      'Review proposes a move, and existing name-only links still resolve.');
    await controls.expectE2eRun('move-nested-page', 'Shared move regression', 'http://localhost:5175/2026-09-21_10-00-00/shared-move');
    await expect(move.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
    await Promise.all([page.waitForResponse('**/source-changes/move-nested-page'), move.getByRole('button', { name: 'Apply', exact: true }).click()]);
    await expect(fixture.getByTestId('source-changes-control')).toHaveAttribute('aria-busy', 'false');
    await expect(move.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
    await expect(move).not.toContainText('Applied to the current fixture');
    expect(fs.existsSync(path.join(testServer.sourceGraphsDir, 'meadow-test-bundles-data/t001/deeper/t001 ---- child 2.md'))).toBe(false);
    await addKeyFrame(sourceChange);
    await expect(sourceChanges.apply('move-nested-page')).rejects.toThrow(/already applied/);
    await snapshot('dev controls apply a real source move to the isolated big graph');

    // Inspect multi-source actions.
    const multiFixture = page.getByTestId('fixture-card-home_fixture_multi_source');
    const multiControls = new DevSourceChangesControl(multiFixture, expect);
    await multiControls.open();
    await expect(multiFixture.getByRole('tab', { name: 'add', exact: true })).toBeDisabled();
    await expect(multiFixture.getByRole('tab', { name: 'rename', exact: true })).toBeDisabled();
    const moveTab = multiFixture.getByRole('tab', { name: 'move', exact: true });
    await expect(moveTab).toHaveAttribute('aria-selected', 'true');
    await moveTab.press('ArrowRight');
    await expect(multiFixture.getByRole('tab', { name: 'modify', exact: true })).toBeFocused();
    await multiFixture.getByRole('tab', { name: 'modify', exact: true }).press('ArrowRight');
    await expect(multiFixture.getByTestId('source-change-competing-cross-source-moves')).toHaveCount(0);
    await multiFixture.getByRole('tab', { name: 'remove', exact: true }).press('Home');
    await expect(moveTab).toBeFocused();
    const competing = await multiControls.expandChange('competing-cross-source-moves',
      'Replace notes://Same/Inside.md with two identical, reachable files in different sources.',
      'Review must not silently assign either one the old identity.');
    await expect(competing).toContainText('No recorded run yet (multi-source-competing-moves)');
    await multiControls.expectOperations('competing-cross-source-moves', [
      { delete: 'notes://Same/Inside.md' },
      { write: { path: 'research://Moved/Inside.md', contentFile: 'Inside.md' } },
      { write: { path: 'reference://Moved/Inside.md', contentFile: 'Inside.md' } },
      { replaceText: { path: 'notes://Start.md', before: '[[Same/Inside]]', after: '[[Moved/Inside::research]] and [[Moved/Inside::reference]]', count: 1 } },
    ]);
    await competing.scrollIntoViewIfNeeded();
    await addKeyFrame(sourceChange);
    await snapshot('multi-source changes have one category home and readable source-qualified operations');

    // Check the shared fixture menus.
    for (const fixtureName of ['nested', 'srs']) {
      const sharedFixture = page.getByTestId(`fixture-card-home_fixture_${fixtureName}`);
      const sharedControls = new DevSourceChangesControl(sharedFixture, expect);
      await sharedControls.open();
      await sharedFixture.getByRole('tab', { name: 'move', exact: true }).click();
      await sharedControls.expandChange('move-nested-page',
        'Move child 2 to a new directory, preserving its filename and content.',
        'Review proposes a move, and existing name-only links still resolve.');
      await sharedControls.expectE2eRun('move-nested-page', 'Shared move regression', 'http://localhost:5175/2026-09-21_10-00-00/shared-move');
    }
    await snapshot('nested and SRS expose the same source-change coverage');

    // Review the move in the application.
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
