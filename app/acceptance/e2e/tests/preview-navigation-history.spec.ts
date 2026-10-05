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
test('preview history navigates back and forward through generated pages', { annotation: { type: 'scenario-id', description: '862fa2d0-3ce1-4398-a5cc-821eb8ba8549' } }, async ({ sourceCommand,
  page, checkpoint, addKeyFrame, skipMeadowHomeStateCheck,
}) => {
  // --- Setup ---
  const modal = new PreviewPublishModal(page, expect);
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundlePreview());
  await sourceCommand(() => modal.generatedBundle.expectSingleHeading('main page'));
  await sourceCommand(() => modal.expectPreviewNavigation(false, false));
  await sourceCommand(() => checkpoint('generated preview starts at the main page with empty history'));

  // --- Test start ---
  // Follow two generated links to build a three-page history.
  await sourceCommand(() => modal.generatedBundle.clickPageLink('t001 - deeply nested'));
  await sourceCommand(() => modal.generatedBundle.expectSingleHeading('t001 - deeply nested'));
  await sourceCommand(() => modal.expectPreviewNavigation(true, false));
  await sourceCommand(() => modal.generatedBundle.clickPageLink('t001 ---- child 1'));
  await sourceCommand(() => modal.generatedBundle.expectSingleHeading('t001 ---- child 1'));
  await sourceCommand(() => addKeyFrame(htmlGeneration));
  await sourceCommand(() => checkpoint('two followed links appear in preview history'));

  // Return through history and then move forward again.
  await sourceCommand(() => modal.goBackInPreview());
  await sourceCommand(() => modal.generatedBundle.expectSingleHeading('t001 - deeply nested'));
  await sourceCommand(() => modal.expectPreviewNavigation(true, true));
  await sourceCommand(() => modal.goBackInPreview());
  await sourceCommand(() => modal.generatedBundle.expectSingleHeading('main page'));
  await sourceCommand(() => modal.expectPreviewNavigation(false, true));
  await sourceCommand(() => modal.goForwardInPreview());
  await sourceCommand(() => modal.generatedBundle.expectSingleHeading('t001 - deeply nested'));
  await sourceCommand(() => modal.goForwardInPreview());
  await sourceCommand(() => modal.generatedBundle.expectSingleHeading('t001 ---- child 1'));
  await sourceCommand(() => modal.expectPreviewNavigation(true, false));
  await sourceCommand(() => addKeyFrame(htmlGeneration));
  await sourceCommand(() => checkpoint('back and forward restore the expected generated pages'));

  // A different link from the middle replaces the old forward branch.
  await sourceCommand(() => modal.goBackInPreview());
  await sourceCommand(() => modal.generatedBundle.expectSingleHeading('t001 - deeply nested'));
  await sourceCommand(() => modal.generatedBundle.clickPageLink('t001 ---- child 2'));
  await sourceCommand(() => modal.generatedBundle.expectSingleHeading('t001 ---- child 2'));
  await sourceCommand(() => modal.expectPreviewNavigation(true, false));
  await sourceCommand(() => checkpoint('following a new link clears the old forward branch'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
