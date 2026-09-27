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
import { htmlGeneration } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });

/*
 * Change a generation option while viewing a child page. The new generated
 * output should apply the option and keep that child page in the preview.
 */
test('regenerating from Customize keeps the current preview page', async ({
  page, checkpoint, addKeyFrame, skipMeadowHomeStateCheck,
}) => {
  // --- Setup ---
  const modal = new PreviewPublishModal(page, expect);
  await new Workflows(page, expect).navigateToBigBundlePreview();
  await modal.generatedBundle.clickPageLink('t001 - deeply nested');
  await modal.generatedBundle.clickPageLink('t001 ---- child 1');
  await modal.generatedBundle.expectSingleHeading('t001 ---- child 1');
  const originalUrl = await modal.generatedBundle.getUrl();
  await modal.openCustomizeSidebar();
  const options = new CustomizeTab(page, expect).generationOptions;
  await options.expectOptionsHeading();
  await checkpoint('child page is open before changing a generation option');

  // --- Test start ---
  // Disable Search and confirm both the option and page location changed as intended.
  await options.disableSearch();
  await modal.generatedBundle.expectSingleHeading('t001 ---- child 1');
  await modal.generatedBundle.search.expectUnavailable();
  const regeneratedUrl = await modal.generatedBundle.getUrl();
  expect(new URL(regeneratedUrl).pathname).toBe(new URL(originalUrl).pathname);
  expect(regeneratedUrl).not.toBe(originalUrl);
  await modal.expectPreviewNavigation(true, false);
  await addKeyFrame(htmlGeneration);
  await checkpoint('Search is disabled and regeneration retains the child page');

  await skipMeadowHomeStateCheck();
});
