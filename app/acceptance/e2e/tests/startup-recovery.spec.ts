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
import { startupRecovery } from '../../../concepts/index.js';
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

test('Safe startup recovery surfaces remain actionable and secret-free', async ({
  page,
  snapshot,
  addKeyFrame,
  assertMeadowHomeState,
}) => {
  const show = async (diagnostic: StartupFailureDiagnostic): Promise<void> => {
    await page.setContent(renderStartupRecoveryHtml(diagnostic));
    await expect(page.getByText('Safe startup recovery')).toBeVisible();
    await expect(page.getByText('Meadow 0.5.41')).toBeVisible();
    await expect(page.getByText('0–1')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry startup' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose another Home…' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reveal relevant file' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy redacted diagnostic' })).toBeVisible();
  };

  await show({
    ...commonDiagnostic,
    category: 'invalid-syntax',
    title: 'The bootstrap file has invalid syntax',
    summary: 'Meadow preserved the existing bootstrap file and did not select a default Home.',
    relevantPath: commonDiagnostic.bootstrapPath,
  });
  await expect(page.getByRole('button', { name: 'Restore verified checkpoint' })).toHaveCount(0);
  await snapshot('invalid bootstrap recovery screen');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await addKeyFrame(startupRecovery);

  await show({
    ...commonDiagnostic,
    category: 'unsupported-home-format',
    title: 'This Meadow Home is not compatible with this app',
    summary: 'Meadow Home format 2 is newer than supported format 1.',
    relevantPath: '/Users/example/Meadow Home/meadow_home.yaml',
  });
  await snapshot('unsupported Home recovery screen');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await addKeyFrame(startupRecovery);

  await show({
    ...commonDiagnostic,
    category: 'incomplete-migration',
    title: 'A migration needs recovery',
    summary: 'Migration provider/example stopped in an ambiguous state. Meadow will not rerun it blindly.',
    relevantPath: '/Users/example/Meadow Home/migrations.yaml',
    lastSuccessfulMigration: 'core/previous-migration',
    checkpointId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    checkpointPath: '/Users/example/Meadow Home/.meadow-migration-recovery',
    checkpointAvailable: true,
  });
  await expect(page.getByText('Pre-migration Git commit', { exact: true })).toBeVisible();
  await expect(page.getByText('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore verified checkpoint' })).toHaveCount(0);
  await snapshot('incomplete migration recovery screen');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await addKeyFrame(startupRecovery);

  await assertMeadowHomeState();
});
