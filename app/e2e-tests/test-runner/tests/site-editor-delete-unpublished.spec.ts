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
import { SiteEditorPage, SiteListPage, DeleteSiteModal } from "../src/run/pages/index.js";
import { Workflows, Site } from "../src/run/workflows.js";
import { deletion, callout } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";

test("Delete unpublished site from within site editor", async ({
  page,
  snapshot,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  const wf = new Workflows(page, expect);
  await wf.navigateToBigSite();

  const editor = new SiteEditorPage(page, expect);
  const deleteModal = new DeleteSiteModal(page, expect);

  // Open site options menu and click Delete site
  await editor.clickSiteOptionsMenu();
  await editor.clickDeleteSiteOption();

  // Verify delete confirmation modal
  await deleteModal.expectVisible();
  await addKeyFrame(callout);
  await addKeyFrame(deletion);
  await snapshot("delete confirmation for unpublished site");

  // Confirm deletion
  await deleteModal.confirmDelete();

  // Should navigate back to site list automatically
  const siteList = new SiteListPage(page, expect);
  await siteList.expectHeadingVisible();
  await siteList.expectSiteNotVisible(Site.Big);
  await snapshot("site list after deletion - site gone");
  void bigSite;

  await assertMeadowHomeState();
});
