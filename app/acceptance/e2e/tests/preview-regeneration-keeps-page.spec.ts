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

import { test, expect } from '../src/run/test-fixtures.js';
import { CustomizeTab, PreviewPublishModal } from '../src/run/pages/index.js';
import { Workflows } from '../src/run/workflows.js';
import { htmlGeneration, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });

const name = linkedScenarioName(conceptText`regenerating from Customize keeps the current preview page`);

const description = linkedScenarioDescription(conceptText`Change a generation option while viewing a child page. The new generated
output should apply the option and keep that child page in the preview.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'beb448bf-8830-4679-ab10-8b55d20306d5' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page, checkpoint, addKeyFrame, skipMeadowHomeStateCheck,
}) => {
  // --- Setup ---
  const modal = new PreviewPublishModal(page, expect);
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundlePreview());
  await sourceCommand(() => modal.generatedBundle.clickPageLink('t001 - deeply nested'));
  await sourceCommand(() => modal.generatedBundle.clickPageLink('t001 ---- child 1'));
  await sourceCommand(() => modal.generatedBundle.expectSingleHeading('t001 ---- child 1'));
  const originalUrl = await sourceCommand(() => modal.generatedBundle.getUrl());
  await sourceCommand(() => modal.openCustomizeSidebar());
  const options = new CustomizeTab(page, expect).generationOptions;
  await sourceCommand(() => options.expectOptionsHeading());
  await sourceCommand(() => checkpoint('child page is open before changing a generation option'));

  // --- Test start ---
  // Disable Search and confirm both the option and page location changed as intended.
  await sourceCommand(() => options.disableSearch());
  await sourceCommand(() => modal.generatedBundle.expectSingleHeading('t001 ---- child 1'));
  await sourceCommand(() => modal.generatedBundle.search.expectUnavailable());
  const regeneratedUrl = await sourceCommand(() => modal.generatedBundle.getUrl());
  expect(new URL(regeneratedUrl).pathname).toBe(new URL(originalUrl).pathname);
  expect(regeneratedUrl).not.toBe(originalUrl);
  await sourceCommand(() => modal.expectPreviewNavigation(true, false));
  await sourceCommand(() => addKeyFrame(htmlGeneration));
  await sourceCommand(() => checkpoint('Search is disabled and regeneration retains the child page'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
