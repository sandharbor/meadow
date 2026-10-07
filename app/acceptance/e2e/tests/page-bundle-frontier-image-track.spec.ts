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
import { sourcingReviewRedesign, frontier, frontierEmbeddedAssets, tracking, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`tracks a frontier image in a page-derived bundle`);

const description = linkedScenarioDescription(conceptText`Find and track a frontier image in a page-rooted bundle. The image should be included
when the bundle is generated.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'c6ff4187-9d76-4de3-bb43-b697ee898364' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  addKeyFrame,
  assertMeadowHomeState,
}) => {
  // --- Setup ---
  const workflows = new Workflows(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const imageTitle = "t016 ---- level 5 - frontier image";

  await sourceCommand(() => workflows.navigateToBigBundle());
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => editor.expectListViewRowByTitleAndFileTypePresent(imageTitle, "png"));
  await sourceCommand(() => editor.expectListViewThumbnailVisible(imageTitle, "png"));
  await sourceCommand(() => editor.clickListViewRowByExactName(imageTitle));

  const detail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
  await sourceCommand(() => detail.expectPill(Pill.FrontierImage));
  await sourceCommand(() => detail.expectNoPill(Pill.Frontier));
  await sourceCommand(() => detail.expectNoPill(Pill.Tracked));
  await sourceCommand(() => detail.expectButtonEnabled(ActionButton.Track));
  await sourceCommand(() => addKeyFrame(frontier, frontierEmbeddedAssets));
  await sourceCommand(() => checkpoint("page-derived frontier image is available to track"));

  // --- Test start ---
  // Track the frontier image.
  await sourceCommand(() => detail.clickAction(ActionButton.Track, page));
  await sourceCommand(() => detail.expectPill(Pill.FrontierImage));
  await sourceCommand(() => detail.expectPill(Pill.Tracked));
  await sourceCommand(() => addKeyFrame(tracking));
  await sourceCommand(() => checkpoint("frontier image tracked in the page-derived bundle"));

  void bigBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
