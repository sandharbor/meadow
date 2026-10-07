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

import { renderStartupRecoveryHtml } from '../../../shared_code/utils/startupRecoveryHtml.js';
import { callout, startupRecovery, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';
import { expect, test } from '../src/run/test-fixtures.js';

test.use({ fixtureHome: 'home_fixture_minimal' });
test.use({ bundleMode: 'single-file' });

const name = linkedScenarioName(conceptText`Unknown startup failures use branded progressive disclosure`);

const description = linkedScenarioDescription(conceptText`Trigger an unknown startup failure. The branded recovery screen should provide useful
guidance while keeping technical details behind disclosure.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'd482e3bd-67e5-4162-b047-bcd9875615ea' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  addKeyFrame,
  assertMeadowHomeState,
}) => {
  // --- Setup ---
  await sourceCommand(() => page.setContent(renderStartupRecoveryHtml({
    schemaVersion: 1,
    category: 'startup-failure',
    title: 'Meadow didn’t open',
    summary: 'Something unexpected stopped Meadow before it opened. Your Home was left unchanged.',
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
  })));

  // --- Test start ---
  // Inspect the recovery guidance and hidden details.
  await sourceCommand(() => expect(page.getByRole('banner').getByText('Meadow', { exact: true })).toBeVisible());
  await sourceCommand(() => expect(page.getByRole('heading', { name: 'Meadow didn’t open' })).toBeVisible());
  await sourceCommand(() => expect(page.getByRole('button', { name: 'Try again' })).toBeVisible());
  await sourceCommand(() => expect(page.getByText('Selected Meadow Home')).toBeHidden());
  await sourceCommand(() => expect(page.getByText('Running app')).toBeHidden());
  await sourceCommand(() => addKeyFrame(startupRecovery, callout));
  await sourceCommand(() => checkpoint('unknown startup failure'));

  await sourceCommand(() => assertMeadowHomeState());
});
