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
import { scenarioSections, callout, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleReview } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Callout preview warns about untracked pages`);

const description = linkedScenarioDescription(conceptText`Preview a bundle with untracked pages. Inspect the warning that prompts the user to
review those pages before publishing.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: bundle list loaded.` },
  openBigBundle: { type: 'test', text: conceptText`Open the big bundle.` },
  previewBundle: { type: 'test', text: conceptText`Preview the bundle.` },
});
const areas = scenarioAreas([bundleReview]);
test(name.name, { annotation: [{ type: 'scenario-id', description: '4ca9ede4-b658-40dc-96e2-487c29608fea' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, checkpoint, skipMeadowHomeStateCheck, addKeyFrame }) => {
  const { bundleList } = await test.step(sections.steps.setup, async () => {
    const bundleList = new BundleListPage(page, expect);
    await sourceCommand(() => bundleList.goto());
    await sourceCommand(() => checkpoint("bundle list loaded"));
    return { bundleList };
  });

  const { editor } = await test.step(sections.steps.openBigBundle, async () => {
    await sourceCommand(() => bundleList.clickBundle("meadow-test-bundle-big"));
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.waitForLoad("meadow-test-bundle-big"));
    await sourceCommand(() => checkpoint("bundle editor loaded"));
    return { editor };
  });

  await test.step(sections.steps.previewBundle, async () => {
    await sourceCommand(() => editor.clickPreview());
    const modal = new PreviewPublishModal(page, expect);
    await sourceCommand(() => modal.waitForPreviewComplete());
    await sourceCommand(() => modal.expectUntrackedPagesWarning());
    await sourceCommand(() => addKeyFrame(callout));
    await sourceCommand(() => checkpoint("preview shows untracked warning"));
  });

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
