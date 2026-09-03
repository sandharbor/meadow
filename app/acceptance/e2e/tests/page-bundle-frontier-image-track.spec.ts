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
  ActionButton,
  BundleEditorPage,
  Pill,
  SelectedPageDetailComponent,
} from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { frontier, tracking } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test("tracks a frontier image in a page-derived bundle", async ({
  page,
  snapshot,
  addKeyFrame,
  assertMeadowHomeState,
}) => {
  const workflows = new Workflows(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const imageTitle = "t016 ---- level 5 - frontier image";

  await workflows.navigateToBigBundle();
  await editor.switchToListView();
  await editor.expectListViewRowByTitleAndFileTypePresent(imageTitle, "png");
  await editor.expectListViewThumbnailVisible(imageTitle, "png");
  await editor.clickListViewRowByExactName(imageTitle);

  const detail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await detail.expectPill(Pill.FrontierImage);
  await detail.expectNoPill(Pill.Frontier);
  await detail.expectNoPill(Pill.Tracked);
  await detail.expectButtonEnabled(ActionButton.Track);
  await addKeyFrame(frontier);
  await snapshot("page-derived frontier image is available to track");

  await detail.clickAction(ActionButton.Track, page);
  await detail.expectPill(Pill.FrontierImage);
  await detail.expectPill(Pill.Tracked);
  await addKeyFrame(tracking);
  await snapshot("frontier image tracked in the page-derived bundle");
  void bigBundle;

  await assertMeadowHomeState();
});
