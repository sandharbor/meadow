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
import { PreviewPublishModal } from '../src/run/pages/index.js';
import { Workflows } from '../src/run/workflows.js';
import { htmlGeneration } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });

/*
 * Follow links inside the generated preview, then use the editor's Back and Forward
 * controls. A new link after going back should discard the forward branch.
 */
test('preview history navigates back and forward through generated pages', async ({
  page, checkpoint, addKeyFrame, skipMeadowHomeStateCheck,
}) => {
  // --- Setup ---
  const modal = new PreviewPublishModal(page, expect);
  await new Workflows(page, expect).navigateToBigBundlePreview();
  await modal.generatedBundle.expectSingleHeading('main page');
  await modal.expectPreviewNavigation(false, false);
  await checkpoint('generated preview starts at the main page with empty history');

  // --- Test start ---
  // Follow two generated links to build a three-page history.
  await modal.generatedBundle.clickPageLink('t001 - deeply nested');
  await modal.generatedBundle.expectSingleHeading('t001 - deeply nested');
  await modal.expectPreviewNavigation(true, false);
  await modal.generatedBundle.clickPageLink('t001 ---- child 1');
  await modal.generatedBundle.expectSingleHeading('t001 ---- child 1');
  await addKeyFrame(htmlGeneration);
  await checkpoint('two followed links appear in preview history');

  // Return through history and then move forward again.
  await modal.goBackInPreview();
  await modal.generatedBundle.expectSingleHeading('t001 - deeply nested');
  await modal.expectPreviewNavigation(true, true);
  await modal.goBackInPreview();
  await modal.generatedBundle.expectSingleHeading('main page');
  await modal.expectPreviewNavigation(false, true);
  await modal.goForwardInPreview();
  await modal.generatedBundle.expectSingleHeading('t001 - deeply nested');
  await modal.goForwardInPreview();
  await modal.generatedBundle.expectSingleHeading('t001 ---- child 1');
  await modal.expectPreviewNavigation(true, false);
  await addKeyFrame(htmlGeneration);
  await checkpoint('back and forward restore the expected generated pages');

  // A different link from the middle replaces the old forward branch.
  await modal.goBackInPreview();
  await modal.generatedBundle.expectSingleHeading('t001 - deeply nested');
  await modal.generatedBundle.clickPageLink('t001 ---- child 2');
  await modal.generatedBundle.expectSingleHeading('t001 ---- child 2');
  await modal.expectPreviewNavigation(true, false);
  await checkpoint('following a new link clears the old forward branch');

  await skipMeadowHomeStateCheck();
});
