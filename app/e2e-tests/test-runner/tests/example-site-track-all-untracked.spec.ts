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
import { SiteListPage, SiteEditorPage } from "../src/run/pages/index.js";
import { Fixture } from "../src/run/workflows.js";
import {
  tracking,
  sensitive,
} from "../src/scenario-docs/index.js";
import { exampleSite } from "../src/site-docs/index.js";

test.use({ fixtureHome: Fixture.None });

test("Track All on example site untracked pages auto-saves without a save click", async ({
  page,
  snapshot,
  addKeyFrame,
}) => {
  const siteList = new SiteListPage(page, expect);
  const editor = new SiteEditorPage(page, expect);

  // Add the example site from the empty state
  await siteList.goto();
  await siteList.clickAddExampleSiteLink();
  await editor.waitForLoad("example-site");
  await snapshot("example site loaded");

  // Baseline: no pending changes, so no Save / Undo buttons visible.
  await editor.expectUndoNotVisible();

  // Select all pages — this opens the selection sidebar and reveals the
  // bulk action buttons.
  await editor.clickSelectAll();
  await page.waitForTimeout(500);

  // Deselect sensitive pages. The example site ships with sensitive pages
  // the user hasn't yet acknowledged, so Track All is disabled until they
  // are removed from the selection.
  await editor.clickDeselectSensitivePagesIfVisible();
  await page.waitForTimeout(250);
  await addKeyFrame(sensitive);
  await snapshot("sensitive pages deselected");

  // Track All is a "simple op": it auto-saves the config and commits in a
  // single request. The Save/Undo buttons must never appear — tracking a
  // batch of pages shouldn't feel like "make-work" to the user.
  await editor.clickTrackAll();
  await editor.expectUndoNotVisible();
  await addKeyFrame(tracking);
  await snapshot("track all applied — no save button");
  void exampleSite;
});
