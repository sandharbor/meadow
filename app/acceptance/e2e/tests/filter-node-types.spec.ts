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
import { filters, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`type filter lists concrete file types and solos Markdown`);

const description = linkedScenarioDescription(conceptText`Inspect the available concrete file types and solo Markdown. The graph should retain
only pages of that type.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '463d5905-356e-4fd4-bbc9-ef4078d3ecba' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  // --- Setup ---
  const workflows = new Workflows(page, expect);
  const editor = new BundleEditorPage(page, expect);
  const filterPanel = new FilterPanelComponent(page, expect);

  await sourceCommand(() => workflows.navigateToBigBundle());
  await sourceCommand(() => editor.expectGraphEdgeKindControlsHidden());
  await sourceCommand(() => filterPanel.expandFilterGroup("Types"));
  const markdownNodeCount = await sourceCommand(() => filterPanel.getNodeTypeCount("Markdown"));
  expect(markdownNodeCount).toBeGreaterThan(0);
  for (const typeName of ["HTML", "JavaScript", "CSS", "PNG", "GIF", "SVG", "Excalidraw"]) {
    expect(await sourceCommand(() => filterPanel.getNodeTypeCount(typeName))).toBeGreaterThan(0);
  }
  await sourceCommand(() => checkpoint("type filters expanded"));

  // --- Test start ---
  // Solo Markdown pages.
  await sourceCommand(() => filterPanel.soloNodeType("Markdown"));
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => expect.poll(() => editor.getListViewPageCount()).toBe(markdownNodeCount));

  const visibleTypes = await sourceCommand(() => editor.getListViewNodeTypes());
  expect(visibleTypes).toHaveLength(markdownNodeCount);
  expect(visibleTypes.every(type => type.trim() === ".md")).toBe(true);
  await sourceCommand(() => addKeyFrame(filters));
  await sourceCommand(() => checkpoint("Markdown nodes soloed"));

  void bigBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
