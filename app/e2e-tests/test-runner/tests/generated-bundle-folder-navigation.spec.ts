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

import type { Page, Route } from "@playwright/test";
import { test, expect } from "../src/run/test-fixtures.js";
import {
  CustomizeTab,
  PreviewPublishModal,
} from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { customize, htmlGeneration } from "../src/scenario-docs/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

const NORMALIZATION_HOOK_SOURCE = `function pageTitleNormalization(bundleSlug: string, pageTitle: string): string {
  return 'normalized ' + pageTitle;
}
`;

const FOLDER_NAV_DATA_SCRIPT = /folder-nav-data\.[a-f0-9]{8}\.js$/;

async function navigateWithFolderNavigationHydrationPaused(
  page: Page,
  navigate: () => Promise<void>,
  expectInitialLayout: () => Promise<void>,
) {
  let signalRequest!: () => void;
  let resumeScript!: () => void;
  const requestSeen = new Promise<void>(resolve => {
    signalRequest = resolve;
  });
  const scriptCanResume = new Promise<void>(resolve => {
    resumeScript = resolve;
  });
  const routeHandler = async (route: Route) => {
    signalRequest();
    await scriptCanResume;
    await route.continue();
  };

  await page.route(FOLDER_NAV_DATA_SCRIPT, routeHandler);
  const navigation = navigate();
  try {
    await requestSeen;
    await expectInitialLayout();
  } finally {
    resumeScript();
    try {
      await navigation;
    } finally {
      await page.unroute(FOLDER_NAV_DATA_SCRIPT, routeHandler);
    }
  }
}

test.use({ bundleMode: "single-file" });

test("generated-bundle folder navigation uses normalized filenames and persists its UI state", async ({
  page,
  snapshot,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  const workflows = new Workflows(page, expect);
  await workflows.navigateToBigBundlePreview();

  const modal = new PreviewPublishModal(page, expect);
  const generatedBundle = modal.generatedBundle;
  const folderNavigation = generatedBundle.folderNavigation;
  const customizeTab = new CustomizeTab(page, expect);

  // Folder navigation is an opt-in generation customization.
  await folderNavigation.expectUnavailable();
  await modal.openCustomizeSidebar();

  // Install a title-normalization hook before enabling the navigation so the
  // test proves its filenames come from final generated output names.
  await customizeTab.hooks.switchScopeToGlobal();
  const pageTitleHook = customizeTab.hooks.getHook("Page Title");
  await pageTitleHook.clickEdit();
  await pageTitleHook.setContent(NORMALIZATION_HOOK_SOURCE);
  const hookPreviewDone = page.waitForResponse(response =>
    response.url().includes("/preview-stream"),
  );
  await pageTitleHook.save();
  await hookPreviewDone;
  await pageTitleHook.close();
  await generatedBundle.expectHeading("normalized main page", 60_000);

  const sourcesPreviewDone = page.waitForResponse(response =>
    response.url().includes("/preview-stream"),
  );
  await customizeTab.generationOptions.enableSourcesExport();
  await sourcesPreviewDone;

  const navigationPreviewDone = page.waitForResponse(response =>
    response.url().includes("/preview-stream"),
  );
  await customizeTab.generationOptions.enableFolderNavigation();
  await navigationPreviewDone;

  // The narrow embedded preview uses the mobile default until the outer
  // Customize panel closes and gives the generated page desktop width.
  await folderNavigation.expectClosed();
  await folderNavigation.expectMobileHeaderControlsAligned();
  await folderNavigation.expectNoBreadcrumbs();
  await addKeyFrame(customize);
  await snapshot("mobile generated bundle header without breadcrumbs");
  await modal.closeCustomizeSidebar();

  // Desktop defaults open. Direct files in each folder are sorted by their
  // normalized filenames, and clicking one navigates to that generated file.
  await folderNavigation.expectOpen();
  await folderNavigation.expectResizable();
  await folderNavigation.openFolder("t001");
  await folderNavigation.expectDirectFileNames("t001", [
    "normalized t001 ---- child 1.html",
    "normalized t001 ---- child 3 in same dir as child 1.html",
  ]);
  await snapshot("normalized folder navigation open and sorted");

  // Hold the deferred data script during navigation. The external controller
  // has already applied persisted state, but DOM hydration cannot start yet.
  await navigateWithFolderNavigationHydrationPaused(
    page,
    () => folderNavigation.clickFile(
      "t001",
      "normalized t001 ---- child 1.html",
    ),
    async () => {
      await folderNavigation.expectOpen();
      await folderNavigation.expectContentAlignedWithSidebar();
    },
  );
  await generatedBundle.expectHeading("normalized t001 ---- child 1");
  await folderNavigation.expectSelectedFile("normalized t001 ---- child 1.html");
  await addKeyFrame(htmlGeneration);
  await snapshot("folder navigation selected page");

  // Expanded folders and the selected page survive a generated-page refresh.
  await folderNavigation.reload();
  await folderNavigation.expectOpen();
  await folderNavigation.expectFolderOpen("t001");
  await folderNavigation.expectSelectedFile("normalized t001 ---- child 1.html");
  await snapshot("folder and sidebar remain open after refresh");

  // An explicit close is also applied before hydration on the next generated
  // page, then remains durable across refreshes.
  await folderNavigation.close();
  await folderNavigation.expectDesktopTriggerFixedAtViewportEdge();
  await snapshot("desktop folder navigation trigger at viewport edge");
  await navigateWithFolderNavigationHydrationPaused(
    page,
    () => folderNavigation.clickFile(
      "t001",
      "normalized t001 ---- child 3 in same dir as child 1.html",
      true,
    ),
    async () => {
      await folderNavigation.expectClosed();
      await folderNavigation.expectContentNotOffset();
    },
  );
  await generatedBundle.expectHeading(
    "normalized t001 ---- child 3 in same dir as child 1",
  );
  await folderNavigation.expectSelectedFile(
    "normalized t001 ---- child 3 in same dir as child 1.html",
  );
  await folderNavigation.reload();
  await folderNavigation.expectClosed();
  await folderNavigation.expectSelectedFile(
    "normalized t001 ---- child 3 in same dir as child 1.html",
  );
  await snapshot("folder navigation remains closed after refresh");

  // Reopen the Customize panel to exercise the mobile layout on a child page.
  // The controls share one row, breadcrumbs sit beneath without overlap, and
  // selecting a page closes the overlay before the next page loads.
  await modal.openCustomizeSidebar();
  await folderNavigation.expectMobileHeaderControlsAligned();
  await folderNavigation.expectBreadcrumbsBelowHeaderControls();
  await snapshot("mobile generated bundle header with breadcrumbs");
  await folderNavigation.open();
  await folderNavigation.openFolder("t001");
  await folderNavigation.clickFile(
    "t001",
    "normalized t001 ---- child 1.html",
  );
  await generatedBundle.expectHeading("normalized t001 ---- child 1");
  await folderNavigation.expectClosed();
  await folderNavigation.expectSelectedFile("normalized t001 ---- child 1.html");
  await snapshot("mobile folder navigation closes after page selection");

  void bigBundle;
  await skipMeadowHomeStateCheck();
});
