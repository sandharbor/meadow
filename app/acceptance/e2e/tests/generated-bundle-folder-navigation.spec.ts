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
import { customize, htmlGeneration } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

const NORMALIZATION_HOOK_SOURCE = `function pageTitleNormalization(bundleSlug: string, pageTitle: string): string {
  return 'normalized ' + pageTitle;
}
`;

const FOLDER_NAV_DATA_SCRIPT = /folder-nav-data\.js$/;

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

/*
 * Browse generated pages through the folder navigation. Check normalized filenames and
 * persistence of the reader's navigation settings.
 */
test("generated-bundle folder navigation uses normalized filenames and persists its UI state", { annotation: { type: 'scenario-id', description: '9a5da1c5-dbc5-469e-b131-ee051d4de4b4' } }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
}) => {
  // --- Setup ---
  const workflows = new Workflows(page, expect);
  await sourceCommand(() => workflows.navigateToBigBundlePreview());

  const modal = new PreviewPublishModal(page, expect);
  const generatedBundle = modal.generatedBundle;
  const folderNavigation = generatedBundle.folderNavigation;
  const customizeTab = new CustomizeTab(page, expect);

  // Folder navigation is an opt-in generation customization.
  await sourceCommand(() => folderNavigation.expectUnavailable());
  await sourceCommand(() => modal.openCustomizeSidebar());

  // Install a title-normalization hook before enabling the navigation so the
  // test proves its filenames come from final generated output names.
  await sourceCommand(() => customizeTab.hooks.switchScopeToGlobal());
  const pageTitleHook = customizeTab.hooks.getHook("Page Title");
  await sourceCommand(() => pageTitleHook.clickEdit());
  await sourceCommand(() => pageTitleHook.setContent(NORMALIZATION_HOOK_SOURCE));
  const hookPreviewDone = page.waitForResponse(response =>
    response.url().includes("/preview-stream"),
  );
  await sourceCommand(() => pageTitleHook.save());
  await sourceCommand(() => hookPreviewDone);
  await sourceCommand(() => pageTitleHook.close());
  await sourceCommand(() => generatedBundle.expectHeading("normalized main page", 60_000));

  const sourcesPreviewDone = page.waitForResponse(response =>
    response.url().includes("/preview-stream"),
  );
  await sourceCommand(() => customizeTab.generationOptions.enableSourcesExport());
  await sourceCommand(() => sourcesPreviewDone);

  const navigationPreviewDone = page.waitForResponse(response =>
    response.url().includes("/preview-stream"),
  );
  await sourceCommand(() => customizeTab.generationOptions.enableFolderNavigation());
  await sourceCommand(() => navigationPreviewDone);

  // The initial default is open at every width. Close it to inspect the
  // compact header controls in the narrow embedded preview.
  await sourceCommand(() => folderNavigation.expectOpen());
  await sourceCommand(() => folderNavigation.close());
  await sourceCommand(() => folderNavigation.expectMobileHeaderControlsAligned());
  await sourceCommand(() => folderNavigation.expectNoBreadcrumbs());
  await sourceCommand(() => addKeyFrame(customize));
  await sourceCommand(() => checkpoint("mobile generated bundle header without breadcrumbs"));

  // --- Test start ---
  // Open and inspect the folder tree.
  await sourceCommand(() => modal.closeCustomizeSidebar());

  // Direct files in each folder are sorted by their
  // normalized filenames, and clicking one navigates to that generated file.
  await sourceCommand(() => folderNavigation.open());
  await sourceCommand(() => folderNavigation.expectOpen());
  await sourceCommand(() => folderNavigation.expectResizable());
  await sourceCommand(() => folderNavigation.openFolder("t001"));
  await sourceCommand(() => folderNavigation.expectDirectFileNames("t001", [
    "normalized t001 ---- child 1.html",
    "normalized t001 ---- child 3 in same dir as child 1.html",
  ]));
  await sourceCommand(() => checkpoint("normalized folder navigation open and sorted"));

  // Navigate before the folder tree finishes loading.
  // Hold the deferred data script during navigation. The external controller
  // has already applied persisted state, but DOM hydration cannot start yet.
  await sourceCommand(() => navigateWithFolderNavigationHydrationPaused(
    page,
    () => folderNavigation.clickFile(
      "t001",
      "normalized t001 ---- child 1.html",
    ),
    async () => {
      await folderNavigation.expectOpen();
      await folderNavigation.expectContentAlignedWithSidebar();
    },
  ));
  await sourceCommand(() => generatedBundle.expectHeading("normalized t001 ---- child 1"));
  await sourceCommand(() => folderNavigation.expectSelectedFile("normalized t001 ---- child 1.html"));
  await sourceCommand(() => addKeyFrame(htmlGeneration));
  await sourceCommand(() => checkpoint("folder navigation selected page"));

  // Reload the selected page.
  await sourceCommand(() => folderNavigation.reload());
  await sourceCommand(() => folderNavigation.expectOpen());
  await sourceCommand(() => folderNavigation.expectFolderOpen("t001"));
  await sourceCommand(() => folderNavigation.expectSelectedFile("normalized t001 ---- child 1.html"));
  await sourceCommand(() => checkpoint("folder and sidebar remain open after refresh"));

  // Close the navigation panel.
  // An explicit close is also applied before hydration on the next generated
  // page, then remains durable across refreshes.
  await sourceCommand(() => folderNavigation.close());
  await sourceCommand(() => folderNavigation.expectDesktopTriggerFixedAtViewportEdge());
  await sourceCommand(() => checkpoint("desktop folder navigation trigger at viewport edge"));

  // Navigate with the panel closed.
  await sourceCommand(() => navigateWithFolderNavigationHydrationPaused(
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
  ));
  await sourceCommand(() => generatedBundle.expectHeading(
    "normalized t001 ---- child 3 in same dir as child 1",
  ));
  await sourceCommand(() => folderNavigation.expectSelectedFile(
    "normalized t001 ---- child 3 in same dir as child 1.html",
  ));
  await sourceCommand(() => folderNavigation.reload());
  await sourceCommand(() => folderNavigation.expectClosed());
  await sourceCommand(() => folderNavigation.expectSelectedFile(
    "normalized t001 ---- child 3 in same dir as child 1.html",
  ));
  await sourceCommand(() => checkpoint("folder navigation remains closed after refresh"));

  // Check the mobile header.
  // Reopen the Customize panel to exercise the mobile layout on a child page.
  // The controls share one row, breadcrumbs sit beneath without overlap, and
  // selecting a page closes the overlay before the next page loads.
  await sourceCommand(() => modal.openCustomizeSidebar());
  await sourceCommand(() => folderNavigation.expectMobileHeaderControlsAligned());
  await sourceCommand(() => folderNavigation.expectBreadcrumbsBelowHeaderControls());
  await sourceCommand(() => checkpoint("mobile generated bundle header with breadcrumbs"));

  // Select a page from mobile navigation.
  await sourceCommand(() => folderNavigation.open());
  await sourceCommand(() => folderNavigation.openFolder("t001"));
  await sourceCommand(() => folderNavigation.clickFile(
    "t001",
    "normalized t001 ---- child 1.html",
  ));
  await sourceCommand(() => generatedBundle.expectHeading("normalized t001 ---- child 1"));
  await sourceCommand(() => folderNavigation.expectClosed());
  await sourceCommand(() => folderNavigation.expectSelectedFile("normalized t001 ---- child 1.html"));
  await sourceCommand(() => checkpoint("mobile folder navigation closes after page selection"));

  void bigBundle;
  await sourceCommand(() => skipMeadowHomeStateCheck());
});
