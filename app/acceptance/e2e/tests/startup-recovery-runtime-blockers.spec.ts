/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import type { StartupFailureDiagnostic } from '../../../contracts/types/startupRecovery.js';
import { renderStartupRecoveryHtml } from '../../../shared_code/utils/startupRecoveryHtml.js';
import { callout, startupRecovery } from '../../../concepts/index.js';
import { expect, test } from '../src/run/test-fixtures.js';

test.use({ fixtureHome: 'none' });
test.use({ bundleMode: 'single-file' });

const commonDiagnostic: Omit<StartupFailureDiagnostic, 'category' | 'title' | 'summary'> = {
  schemaVersion: 1,
  selectedHomePath: '/Users/example/Meadow Home',
  bootstrapPath: '/Users/example/.config/meadow/bootstrap_config.yaml',
  relevantPath: null,
  appVersion: '0.5.41',
  supportedHomeFormatMinimum: 0,
  supportedHomeFormatMaximum: 1,
  lastSuccessfulMigration: null,
  checkpointId: null,
  checkpointPath: null,
  checkpointAvailable: false,
};

test('Known Runtime blockers explain the active session and offer direct recovery', async ({
  page,
  snapshot,
  addKeyFrame,
  assertMeadowHomeState,
}) => {
  const show = async (diagnostic: StartupFailureDiagnostic): Promise<void> => {
    await page.setContent(renderStartupRecoveryHtml(diagnostic));
    await expect(page.getByRole('banner').getByText('Meadow', { exact: true })).toBeVisible();
    await expect(page.getByText('Your Home is safe.', { exact: false })).toBeVisible();
  };

  await show({
    ...commonDiagnostic,
    category: 'runtime-busy',
    title: 'Meadow is already open in your browser',
    summary: 'The browser session is keeping another copy of Meadow active. You can move this Home into the app now.',
    runtimeBlocker: {
      instanceId: 'runtime-a',
      supervisorPid: 123,
      appVersion: '0.5.40',
      startedAt: '2026-09-01T12:00:00.000Z',
      clientLeases: 1,
      browserSessions: 1,
      operationLeases: 0,
      sessionAvailable: true,
    },
  });
  await expect(page.getByText('Browser session', { exact: true })).toBeVisible();
  await expect(page.getByText('Meadow 0.5.40 · 1 browser window')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open here instead' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Return to browser' })).toBeVisible();
  await snapshot('browser session blocks a Runtime handoff');
  await addKeyFrame(startupRecovery, callout);

  await show({
    ...commonDiagnostic,
    category: 'runtime-busy',
    title: 'Meadow is finishing work in another session',
    summary: 'Another Meadow session is running a background operation. Meadow paused so two copies cannot change this Home at once.',
    runtimeBlocker: {
      instanceId: 'runtime-b',
      supervisorPid: 456,
      appVersion: '0.5.40',
      startedAt: '2026-09-01T12:00:00.000Z',
      clientLeases: 1,
      browserSessions: 0,
      operationLeases: 1,
      sessionAvailable: true,
    },
  });
  await expect(page.getByText('Background operation', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop other session and open here' })).toBeVisible();
  await snapshot('active operation blocks a Runtime handoff');
  await addKeyFrame(startupRecovery, callout);

  await show({
    ...commonDiagnostic,
    category: 'runtime-unavailable',
    title: 'A previous Meadow session is still closing',
    summary: 'That session still has exclusive access to this Home, but Meadow can no longer reconnect to it. Meadow will wait rather than opening a second copy.',
    runtimeBlocker: {
      instanceId: 'runtime-c',
      supervisorPid: 789,
      appVersion: null,
      startedAt: null,
      clientLeases: 0,
      browserSessions: 0,
      operationLeases: 0,
      sessionAvailable: false,
    },
  });
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open here instead' })).toHaveCount(0);
  await snapshot('previous Runtime is still releasing Home ownership');
  await addKeyFrame(startupRecovery, callout);

  await assertMeadowHomeState();
});
