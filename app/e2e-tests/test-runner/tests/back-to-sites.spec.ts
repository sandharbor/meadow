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
import { Workflows } from "../src/run/workflows.js";
import { SiteListPage, SiteEditorPage } from "../src/run/pages/index.js";

test("navigate back to sites list from big site view", async ({ page, snapshot }) => {
  const wf = new Workflows(page, expect);
  const siteList = new SiteListPage(page, expect);
  const editor = new SiteEditorPage(page, expect);

  await wf.navigateToBigSite();
  await snapshot("big site loaded");

  await editor.clickBackToSites();
  await siteList.expectHeadingVisible();
  await snapshot("back at sites list");
});
