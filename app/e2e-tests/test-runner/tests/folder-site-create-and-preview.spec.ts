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
import {
  PreviewPublishModal,
  SiteEditorPage,
  SiteListPage,
} from "../src/run/pages/index.js";
import { Fixture, Site } from "../src/run/workflows.js";
import { folderSites, htmlGeneration } from "../src/scenario-docs/index.js";
import { customSite } from "../src/site-docs/index.js";

test.use({ siteMode: "single-folder" });

test.use({ fixtureHome: Fixture.FolderStructureSingle });

test("previews a configured site from one recursively scanned folder", async ({
  page,
  snapshot,
  addKeyFrame,
  assertMeadowHomeState,
}) => {
  const siteList = new SiteListPage(page, expect);
  const editor = new SiteEditorPage(page, expect);
  const previewModal = new PreviewPublishModal(page, expect);

  await siteList.goto();
  await siteList.clickSite(Site.FolderStructureSingle);
  await editor.waitForLoad(Site.FolderStructureSingle);
  await editor.expectGraphViewHasPages();
  await snapshot("single folder graph with two linked depth rows");
  await addKeyFrame(folderSites);
  await editor.switchToListView();
  await editor.switchToStructuralListView();
  await editor.expectListViewRowByExactNamePresent("Alpha note");
  await editor.expectListViewRowByExactNamePresent("Nested note");
  await editor.expectListViewRowByExactNameNotPresent("Beta note");
  await editor.expectListViewRowByExactNamePresent("Outside note");
  await editor.expectListViewRowByExactNamePresent("Beyond outside");
  await snapshot("single folder recursive structure in the editor");

  await editor.clickPreview();
  await previewModal.waitForPreviewComplete();
  await previewModal.generatedSite.expectHeading("Alpha", 60_000);
  await previewModal.generatedSite.folderNavigation.expectAvailable();
  await snapshot("single folder generated home");
  await addKeyFrame(htmlGeneration);
  void customSite;

  await assertMeadowHomeState({
    allowedUntracked: [
      "sites/single-folder-site/html/",
      "sites/single-folder-site/raw/",
    ],
  });
});
