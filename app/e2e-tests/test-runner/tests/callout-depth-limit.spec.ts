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

import path from "path";
import { test, expect } from "../src/run/test-fixtures.js";
import { SiteListPage, SiteEditorPage, CreateAndEditSiteModal } from "../src/run/pages/index.js";
import { callout } from "../src/scenario-docs/index.js";

test.use({ fixtureHome: "none" });

test("Callout depth limit shown on new site and dismissed permanently", async ({
  page,
  testServer,
  snapshot,
  addKeyFrame,
}) => {
  const siteList = new SiteListPage(page, expect);
  await siteList.goto();
  await siteList.expectCalloutVisible("Turn your notes into sites");

  // Click "create a site" in the empty state callout
  await siteList.clickCreateSiteLink();

  // Fill in the Create New Site modal
  const createModal = new CreateAndEditSiteModal(page, expect);
  const sourceDir = path.join(testServer.sourceGraphsDir, "meadow-test-sites-data");
  await createModal.fillSourceDirectory(sourceDir);
  await createModal.typeInitialPageTitle("main page");
  await createModal.selectSuggestion("main page");
  await createModal.clickCreateSite();

  // Wait for graph view to load
  const editor = new SiteEditorPage(page, expect);
  await editor.waitForLoad("main-page");

  // Assert depth callout is visible
  await editor.expectDepthCalloutVisible();
  await addKeyFrame(callout);
  await snapshot("depth callout visible on new site");

  // Dismiss the callout and wait for the API call to complete before navigating
  const dismissalResponse = page.waitForResponse(
    (resp) => resp.url().includes("/callout-dismissal/") && resp.status() === 200
  );
  await editor.dismissDepthCallout();
  await dismissalResponse;

  // Go back to site list
  await editor.clickBackToSites();
  await siteList.expectHeadingVisible();

  // Re-enter the site
  await siteList.clickSite("main-page");
  await editor.waitForLoad("main-page");

  // Assert depth callout is NOT visible (dismissal persisted)
  await editor.expectDepthCalloutNotVisible();
  await snapshot("depth callout not visible after dismissal");
});
