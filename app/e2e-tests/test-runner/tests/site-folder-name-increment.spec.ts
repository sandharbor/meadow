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
import { SiteListPage, SiteEditorPage, CreateAndEditSiteModal } from "../src/run/pages/index.js";
import { Workflows, Site } from "../src/run/workflows.js";
import { siteConfig, callout } from "../src/scenario-docs/index.js";

test("creating a second site from the same source page auto-increments the folder name", async ({
  page,
  snapshot,
  addKeyFrame,
}) => {
  const wf = new Workflows(page, expect);
  const siteList = new SiteListPage(page, expect);
  const editor = new SiteEditorPage(page, expect);
  const createModal = new CreateAndEditSiteModal(page, expect);

  // Navigate to the big site and use find-in-sites for a page
  await wf.navigateToBigSite();
  await editor.switchToListView();
  await page.waitForTimeout(250);
  await editor.rightClickRow("t001 - deeply nested");
  await editor.clickFindInSites();
  await page.waitForTimeout(500);

  // Site list with find-in-sites filter active — create first site
  await siteList.expectFindInSitesFilterActive("t001 - deeply nested");
  await siteList.clickCreateSiteForPage();
  await createModal.clickCreateSite();

  // Should navigate to the new site editor (slug: t001-deeply-nested)
  await editor.waitForLoad("t001-deeply-nested");
  await snapshot("first site created");

  // Go back to sites, do find-in-sites again for the same page
  await editor.clickBackToSites();
  await siteList.expectHeadingVisible();
  await siteList.clickSite(Site.Big);
  await editor.waitForLoad(Site.Big);
  await editor.switchToListView();
  await page.waitForTimeout(250);
  await editor.rightClickRow("t001 - deeply nested");
  await editor.clickFindInSites();
  await page.waitForTimeout(500);

  // Open create modal — slug should already be auto-incremented
  await siteList.expectFindInSitesFilterActive("t001 - deeply nested");
  await siteList.clickCreateSiteForPage();
  await createModal.showDetails();

  // Verify the slug is already unique (t001-deeply-nested-1)
  const slugText = await createModal.getSlugDisplayText();
  expect(slugText).toBe("t001-deeply-nested-1");
  await snapshot("second create modal shows incremented slug");

  // Keyframe: modal showing the auto-incremented directory name
  await addKeyFrame(siteConfig);

  // Try editing slug to remove the "-1" suffix (conflict)
  await createModal.clickEditSlug();
  await createModal.fillSlug("t001-deeply-nested");

  // Should show a conflict error and disable the Create Site button
  await createModal.expectSlugConflictError('already exists');
  await createModal.expectCreateSiteDisabled();
  await snapshot("slug conflict error shown");

  // Keyframe: callout showing directory already taken
  await addKeyFrame(callout);

  // Cancel the edit by restoring the incremented slug
  await createModal.fillSlug("t001-deeply-nested-1");
  await page.waitForTimeout(100);

  // Create the second site — should succeed with the incremented slug
  await createModal.clickCreateSite();
  await editor.waitForLoad("t001-deeply-nested-1");
  await snapshot("second site created with incremented folder name");
});
