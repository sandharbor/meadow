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
import { BundleListPage, BundleEditorPage, PreviewPublishModal } from "../src/run/pages/index.js";
import { Fixture } from "../src/run/workflows.js";
import { scenarioSections, htmlGeneration, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundles as bundlesArea, bundleReview } from "../../../concepts/index.js";
import { exampleBundle } from "../src/bundle-docs/index.js";
import { bundles } from "../../../concepts/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: Fixture.Minimal });

const name = linkedScenarioName(conceptText`add example bundle from empty state and preview it`);

const description = linkedScenarioDescription(conceptText`Add the example bundle to an empty MeadowHome and generate its preview. The example
should open with its expected content.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: empty bundle list.` },
  addExampleBundle: { type: 'test', text: conceptText`Add the example bundle.` },
  waitForNavigationIntoExampleBundleEditor: { type: 'test', text: conceptText`Wait for navigation into the example bundle editor` },
  previewBundle: { type: 'test', text: conceptText`Preview the bundle.` },
  checkGeneratedHomePage: { type: 'test', text: conceptText`Check the generated home page.` },
});
const areas = scenarioAreas([bundlesArea, bundleReview]);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'a309795d-d7b8-4abd-8ca6-74c7f5ea2ea9' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand,
  page, checkpoint, skipMeadowHomeStateCheck, addKeyFrame,
}) => {
  const { bundleList, editor, previewModal } = await test.step(sections.steps.setup, async () => {
    const bundleList = new BundleListPage(page, expect);
    const editor = new BundleEditorPage(page, expect);
    const previewModal = new PreviewPublishModal(page, expect);

    // Start at empty bundle list
    await sourceCommand(() => bundleList.goto());
    await sourceCommand(() => checkpoint("empty bundle list"));
    return { bundleList, editor, previewModal };
  });

  await test.step(sections.steps.addExampleBundle, async () => {
    await sourceCommand(() => bundleList.clickAddExampleBundleLink());
  });

  await test.step(sections.steps.waitForNavigationIntoExampleBundleEditor, async () => {
    await sourceCommand(() => editor.waitForLoad("example-bundle"));
    await sourceCommand(() => checkpoint("example bundle editor loaded"));
  });

  await test.step(sections.steps.previewBundle, async () => {
    await sourceCommand(() => editor.clickPreview());
    await sourceCommand(() => previewModal.waitForPreviewComplete());
    await sourceCommand(() => previewModal.expectUntrackedPagesWarning());
    await sourceCommand(() => checkpoint("preview complete"));
  });

  await test.step(sections.steps.checkGeneratedHomePage, async () => {
    await sourceCommand(() => previewModal.expectPreviewIframeHeading("Notable Mental Models"));
    await sourceCommand(() => addKeyFrame(htmlGeneration));
    await sourceCommand(() => checkpoint("example bundle preview visible"));
  });

  void exampleBundle;
  void bundles;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
