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

import { softwareUpdate } from '../src/scenario-docs/index.js';
import { expect, test } from '../src/run/test-fixtures.js';

test.use({ bundleMode: 'single-file' });

test('Verified update failure remains retryable without offering installation', async ({
  page,
  testServer,
  snapshot,
  addKeyFrame,
  assertMeadowHomeState,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const backendConnection = testServer.getBackendConnectionForRendererTest();
  await page.addInitScript(({ backendConnection: connection }) => {
    const target = window as unknown as {
      electronAPI?: Record<string, unknown>;
      openUpdateModalForTest?: () => void;
    };
    target.electronAPI = {
      getBackendConnection: async () => connection,
      getTargetPageInfo: async () => null,
      onOpenFindInBundles: () => undefined,
      offOpenFindInBundles: () => undefined,
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true }),
      openExternal: async () => undefined,
      windowMinimize: async () => undefined,
      windowMaximize: async () => undefined,
      windowClose: async () => undefined,
      checkForUpdate: async () => undefined,
      downloadUpdate: async () => undefined,
      installUpdate: async () => undefined,
      getUpdateState: async () => ({
        status: 'error',
        currentVersion: '0.5.41',
        errorMessage: 'Download failed: the artifact checksum did not match signed metadata. The installed Meadow app was preserved.',
      }),
      onUpdateStatus: () => undefined,
      offUpdateStatus: () => undefined,
      onOpenUpdateModal: (callback: () => void) => {
        target.openUpdateModalForTest = callback;
      },
      offOpenUpdateModal: () => undefined,
    };
  }, { backendConnection });
  await page.goto('/');
  await expect.poll(async () => ({
    registered: await page.evaluate(() => Boolean(
      (window as unknown as { openUpdateModalForTest?: () => void }).openUpdateModalForTest,
    )),
    pageErrors,
  })).toEqual({ registered: true, pageErrors: [] });
  await page.evaluate(() => {
    (window as unknown as { openUpdateModalForTest?: () => void }).openUpdateModalForTest?.();
  });

  await expect(page.getByRole('heading', { name: 'Software Update' })).toBeVisible();
  await expect(page.getByText('Update Error')).toBeVisible();
  await expect(page.getByText(/checksum did not match signed metadata/i)).toBeVisible();
  await expect(page.getByText(/installed Meadow app was preserved/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restart to Update' })).toHaveCount(0);
  await snapshot('verified update checksum failure preserved installed app');
  await addKeyFrame(softwareUpdate);
  await assertMeadowHomeState();
});
