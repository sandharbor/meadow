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
import { BundleListPage, BundleEditorPage, CreateAndEditBundleModal } from "../src/run/pages/index.js";
import { scenarioSections, callout, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleReview, sourceSetupNew, bundleSourcing } from "../../../concepts/index.js";
import { customBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

test.use({ fixtureHome: "home_fixture_minimal" });

const name = linkedScenarioName(conceptText`Callout warns when previewing with only one tracked page`);

const description = linkedScenarioDescription(conceptText`Create a bundle with only its starting page tracked, then preview it. Check that the
single-page warning explains how to include more pages.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: the new bundle contains only its tracked initial page.` },
  previewSinglePageBundleClickPreviewShould: { type: 'test', text: conceptText`Preview the single-page bundle. Click Preview — should trigger single-page warning modal` },
  returnTrackingPages: { type: 'test', text: conceptText`Return to tracking pages.` },
  verifyWeReBackOnGraphView: { type: 'test', text: conceptText`Verify we're back on the graph view (modal closed, not navigated to preview)` },
});
const areas = scenarioAreas([bundleReview, bundleSourcing], { subAreas: [sourceSetupNew] });
test(name.name, { annotation: [{ type: 'scenario-id', description: 'f4209c12-21ad-4a3a-8adc-8a858f1dedf0' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand,
  page,
  testServer,
  checkpoint,
  assertMeadowHomeState,
  addKeyFrame,
}) => {
  const { editor } = await test.step(sections.steps.setup, async () => {
    const bundleList = new BundleListPage(page, expect);
    await sourceCommand(() => bundleList.goto());
    await sourceCommand(() => bundleList.expectCalloutVisible("Turn your notes into bundles"));

    // Click "create a bundle" in the empty state callout
    await sourceCommand(() => bundleList.clickCreateBundleLink());

    // Fill in the Create New Bundle modal
    const createModal = new CreateAndEditBundleModal(page, expect);
    const sourceDir = path.join(testServer.sourceGraphsDir, "meadow-test-bundles-data");
    await sourceCommand(() => createModal.fillSourceDirectory(sourceDir));
    await sourceCommand(() => createModal.typeInitialPageTitle("main page"));
    await sourceCommand(() => createModal.selectSuggestion("main page"));
    await sourceCommand(() => createModal.clickCreateBundle());

    // Wait for graph view to load
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.waitForLoad("main-page"));

    await sourceCommand(() => checkpoint("the new bundle contains only its tracked initial page"));
    return { editor };
  });

  await test.step(sections.steps.previewSinglePageBundleClickPreviewShould, async () => {
    await sourceCommand(() => editor.clickPreview());
    await sourceCommand(() => editor.expectSinglePagePreviewWarningVisible());
    await sourceCommand(() => addKeyFrame(callout));
    await sourceCommand(() => checkpoint("single page preview warning shown"));
  });

  await test.step(sections.steps.returnTrackingPages, async () => {
    await sourceCommand(() => editor.clickGoBackAndTrackMorePages());
  });

  await test.step(sections.steps.verifyWeReBackOnGraphView, async () => {
    await sourceCommand(() => editor.expectGraphViewButtonVisible());
    await sourceCommand(() => checkpoint("back on graph view after dismissing warning"));
  });

  void customBundle;

  await sourceCommand(() => assertMeadowHomeState());
});
