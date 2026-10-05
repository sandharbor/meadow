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

/*
 * Set global and per-bundle folder navigation defaults. Reader choices should persist for
 * each bundle without leaking into another bundle on the same host.
 */
test("folder navigation defaults can be global or per bundle and reader choices stay isolated on one host", { annotation: { type: 'scenario-id', description: 'ed1db37f-0e07-43db-af7c-bda2a5d6fdee' } }, async ({ sourceCommand,
  page, browser, checkpoint, skipMeadowHomeStateCheck, addKeyFrame,
}) => {
  // --- Setup ---
  const workflows = new Workflows(page, expect);
  const modal = new PreviewPublishModal(page, expect);
  const options = new CustomizeTab(page, expect).generationOptions;
  const navigation = modal.generatedBundle.folderNavigation;

  await sourceCommand(() => workflows.navigateToSmallBundlePreview());
  await sourceCommand(() => modal.openCustomizeSidebar());
  await sourceCommand(() => options.enableFolderNavigation());
  await sourceCommand(() => options.openFolderNavigationSettings());
  await sourceCommand(() => options.setFolderNavigationDefaults('closed', 'inherit'));
  await sourceCommand(() => addKeyFrame(customize));
  await sourceCommand(() => options.saveFolderNavigationSettings());
  await sourceCommand(() => navigation.expectClosed());
  await sourceCommand(() => options.openFolderNavigationSettings());
  await sourceCommand(() => options.expectFolderNavigationDefaults('closed', 'inherit'));
  await sourceCommand(() => options.cancelFolderNavigationSettings());
  await sourceCommand(() => navigation.open());
  await sourceCommand(() => navigation.reload());
  await sourceCommand(() => navigation.expectOpen());
  await sourceCommand(() => checkpoint('small bundle remembers the reader opening navigation'));

  // --- Test start ---
  // Check another bundle with no reader preference.
  await sourceCommand(() => workflows.navigateToBigBundlePreview());
  await sourceCommand(() => modal.openCustomizeSidebar());
  await sourceCommand(() => options.enableFolderNavigation());
  await sourceCommand(() => navigation.expectClosed());
  await sourceCommand(() => options.openFolderNavigationSettings());
  await sourceCommand(() => options.expectFolderNavigationDefaults('closed', 'inherit'));
  await sourceCommand(() => options.setFolderNavigationDefaults('closed', 'open'));
  await sourceCommand(() => options.saveFolderNavigationSettings());
  await sourceCommand(() => navigation.expectOpen());
  const bigUrl = await sourceCommand(() => modal.generatedBundle.getUrl());
  await sourceCommand(() => navigation.close());
  await sourceCommand(() => checkpoint('big bundle override opens navigation without borrowing the small bundle preference'));

  // Reopen the first bundle.
  await sourceCommand(() => workflows.navigateToSmallBundlePreview());
  await sourceCommand(() => navigation.expectOpen());
  const smallUrl = await sourceCommand(() => modal.generatedBundle.getUrl());
  expect(new URL(smallUrl).origin).toBe(new URL(bigUrl).origin);
  await sourceCommand(() => modal.openCustomizeSidebar());
  await sourceCommand(() => options.openFolderNavigationSettings());
  await sourceCommand(() => options.setFolderNavigationDefaults('open', 'closed'));
  await sourceCommand(() => options.saveFolderNavigationSettings());
  // A publisher changing the default does not override a returning reader.
  await sourceCommand(() => navigation.expectOpen());
  await sourceCommand(() => options.openFolderNavigationSettings());
  await sourceCommand(() => options.expectFolderNavigationDefaults('open', 'closed'));
  await sourceCommand(() => options.cancelFolderNavigationSettings());
  await sourceCommand(() => addKeyFrame(htmlGeneration));
  await sourceCommand(() => checkpoint('returning reader choice takes precedence over the new closed default'));

  // Check a new reader session.
  const newVisitor = await sourceCommand(() => browser.newContext());
  try {
    // Local previews require read-only access cookies. Leave local storage
    // empty so this browser still represents a first-time bundle reader.
    await sourceCommand(async () => newVisitor.addCookies((await page.context().cookies()).filter(cookie => cookie.name === 'meadow-preview-v1')));
    const reader = await sourceCommand(() => newVisitor.newPage());
    const freshNavigation = GeneratedBundle.onPage(reader, expect).folderNavigation;
    const smallResponse = await sourceCommand(() => reader.goto(smallUrl));
    expect(smallResponse?.ok()).toBe(true);
    await sourceCommand(() => freshNavigation.expectClosed());
    await sourceCommand(() => reader.setViewportSize({ width: 390, height: 844 }));
    await sourceCommand(() => freshNavigation.expectClosed());
    await sourceCommand(() => freshNavigation.open());
    await sourceCommand(() => reader.setViewportSize({ width: 1200, height: 800 }));
    await sourceCommand(() => freshNavigation.expectOpen());
    await sourceCommand(() => reader.reload());
    await sourceCommand(() => freshNavigation.expectOpen());
    await sourceCommand(() => freshNavigation.close());
    await sourceCommand(() => reader.goto(bigUrl));
    await sourceCommand(() => freshNavigation.expectOpen());
    await sourceCommand(() => reader.setViewportSize({ width: 390, height: 844 }));
    await sourceCommand(() => reader.reload());
    await sourceCommand(() => freshNavigation.expectOpen());
  } finally {
    await sourceCommand(() => newVisitor.close());
  }
  void bigBundle;
  void smallBundle;
  await sourceCommand(() => checkpoint("a new reader receives the bundle default while returning readers retain their choice"));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
