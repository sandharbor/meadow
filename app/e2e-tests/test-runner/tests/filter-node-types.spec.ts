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
import { FilterPanelComponent, BundleEditorPage } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { filters } from "../src/scenario-docs/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test("type filter lists concrete file types and solos Markdown", async ({
  page,
  snapshot,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  const workflows = new Workflows(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);

  await workflows.navigateToBigBundle();
  await editor.expectGraphEdgeKindControlsHidden();
  await filterPanel.expandFilterGroup("Types");
  const markdownNodeCount = await filterPanel.getNodeTypeCount("Markdown");
  expect(markdownNodeCount).toBeGreaterThan(0);
  for (const typeName of ["HTML", "JavaScript", "CSS", "PNG", "GIF", "SVG", "Excalidraw"]) {
    expect(await filterPanel.getNodeTypeCount(typeName)).toBeGreaterThan(0);
  }
  await snapshot("type filters expanded");

  await filterPanel.soloNodeType("Markdown");
  await editor.switchToListView();
  await expect.poll(() => editor.getListViewPageCount()).toBe(markdownNodeCount);

  const visibleTypes = await editor.getListViewNodeTypes();
  expect(visibleTypes).toHaveLength(markdownNodeCount);
  expect(visibleTypes.every(type => type.trim() === ".md")).toBe(true);
  await addKeyFrame(filters);
  await snapshot("Markdown nodes soloed");
  void bigBundle;

  await assertMeadowHomeState();
});
