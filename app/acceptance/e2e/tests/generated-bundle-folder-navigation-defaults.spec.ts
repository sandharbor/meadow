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

import { test, expect } from "../src/run/test-fixtures.js";
import { CustomizeTab, GeneratedBundle, PreviewPublishModal } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { customize, htmlGeneration } from "../../../concepts/index.js";
import { bigBundle, smallBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test("folder navigation defaults can be global or per bundle and reader choices stay isolated on one host", async ({
  page, browser, snapshot, skipMeadowHomeStateCheck, addKeyFrame,
}) => {
  const workflows = new Workflows(page, expect);
  const modal = new PreviewPublishModal(page, expect);
  const options = new CustomizeTab(page, expect).generationOptions;
  const navigation = modal.generatedBundle.folderNavigation;

  await workflows.navigateToSmallBundlePreview();
  await modal.openCustomizeSidebar();
  await options.enableFolderNavigation();
  await options.openFolderNavigationSettings();
  await options.setFolderNavigationDefaults('closed', 'inherit');
  await addKeyFrame(customize);
  await options.saveFolderNavigationSettings();
  await navigation.expectClosed();
  await options.openFolderNavigationSettings();
  await options.expectFolderNavigationDefaults('closed', 'inherit');
  await options.cancelFolderNavigationSettings();
  await navigation.open();
  await navigation.reload();
  await navigation.expectOpen();
  await snapshot('small bundle remembers the reader opening navigation');

  // This bundle shares an origin with the first but has no reader preference.
  await workflows.navigateToBigBundlePreview();
  await modal.openCustomizeSidebar();
  await options.enableFolderNavigation();
  await navigation.expectClosed();
  await options.openFolderNavigationSettings();
  await options.expectFolderNavigationDefaults('closed', 'inherit');
  await options.setFolderNavigationDefaults('closed', 'open');
  await options.saveFolderNavigationSettings();
  await navigation.expectOpen();
  const bigUrl = await modal.generatedBundle.getUrl();
  await navigation.close();
  await snapshot('big bundle override opens navigation without borrowing the small bundle preference');

  await workflows.navigateToSmallBundlePreview();
  await navigation.expectOpen();
  const smallUrl = await modal.generatedBundle.getUrl();
  expect(new URL(smallUrl).origin).toBe(new URL(bigUrl).origin);
  await modal.openCustomizeSidebar();
  await options.openFolderNavigationSettings();
  await options.setFolderNavigationDefaults('open', 'closed');
  await options.saveFolderNavigationSettings();
  // A publisher changing the default does not override a returning reader.
  await navigation.expectOpen();
  await options.openFolderNavigationSettings();
  await options.expectFolderNavigationDefaults('open', 'closed');
  await options.cancelFolderNavigationSettings();
  await addKeyFrame(htmlGeneration);
  await snapshot('returning reader choice takes precedence over the new closed default');

  const newVisitor = await browser.newContext();
  try {
    // Local previews require read-only access cookies. Leave local storage
    // empty so this browser still represents a first-time bundle reader.
    await newVisitor.addCookies((await page.context().cookies()).filter(cookie => cookie.name === 'meadow-preview-v1'));
    const reader = await newVisitor.newPage();
    const freshNavigation = GeneratedBundle.onPage(reader, expect).folderNavigation;
    const smallResponse = await reader.goto(smallUrl);
    expect(smallResponse?.ok()).toBe(true);
    await freshNavigation.expectClosed();
    await reader.setViewportSize({ width: 390, height: 844 });
    await freshNavigation.expectClosed();
    await freshNavigation.open();
    await reader.setViewportSize({ width: 1200, height: 800 });
    await freshNavigation.expectOpen();
    await reader.reload();
    await freshNavigation.expectOpen();
    await freshNavigation.close();
    await reader.goto(bigUrl);
    await freshNavigation.expectOpen();
    await reader.setViewportSize({ width: 390, height: 844 });
    await reader.reload();
    await freshNavigation.expectOpen();
  } finally {
    await newVisitor.close();
  }
  void bigBundle;
  void smallBundle;
  await skipMeadowHomeStateCheck();
});
