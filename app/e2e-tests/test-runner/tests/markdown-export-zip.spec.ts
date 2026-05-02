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
import { PreviewPublishModal, ChangesTab, CustomizeTab } from "../src/run/pages/index.js";
import { Workflows, Site } from "../src/run/workflows.js";
import { MeadowHomeGit } from "../src/run/utils/index.js";
import { customize, markdown, git } from "../src/scenario-docs/index.js";
import { bigSite } from "../src/site-docs/index.js";

test("Markdown export ZIP: enable, preview, save, and verify MeadowHome is fully committed", async ({
  page, snapshot, addKeyFrame, testServer,
}) => {
  const wf = new Workflows(page, expect);
  await wf.navigateToBigSitePreview();
  const modal = new PreviewPublishModal(page, expect);
  await snapshot("preview loaded");

  // Open Customize sidebar and enable Markdown ZIP at site level
  await modal.openCustomizeSidebar();
  const customizeTab = new CustomizeTab(page, expect);
  await customizeTab.generationOptions.enableMarkdownZip();
  await addKeyFrame(customize);
  await snapshot("markdown zip enabled");

  // Wait for preview regeneration with markdown export
  const changesTab = new ChangesTab(page, expect);
  await changesTab.waitForRegenerationComplete();
  await addKeyFrame(markdown);
  await snapshot("regeneration complete with markdown export");

  // Save changes — commits generated files (HTML + markdown ZIP) to MeadowHome
  await modal.clickSitePreviewTab();
  await modal.clickSaveChanges();
  await modal.waitForSaveComplete();
  await snapshot("save completed");

  // Verify the site directory in MeadowHome is fully committed — no untracked
  // or uncommitted files under the site (including build/markdown_export/).
  const siteDir = path.join(testServer.configDir, "sites", Site.Big);
  const meadowGit = new MeadowHomeGit(testServer.configDir, expect);
  await meadowGit.expectDirFullyCommitted(siteDir);
  await addKeyFrame(git);
  await snapshot("site directory fully committed");
  void bigSite;
});
