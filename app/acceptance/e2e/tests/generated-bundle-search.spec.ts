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
import { pathToFileURL } from "url";
import { test, expect } from "../src/run/test-fixtures.js";
import {
  ChangesTab,
  CustomizeTab,
  GeneratedBundle,
  PreviewPublishModal,
} from "../src/run/pages/index.js";
import { Bundle, Workflows } from "../src/run/workflows.js";
import { customize, generatedBundleSearch, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`generated bundle search finds titles and contents, navigates, and can be disabled`);

const description = linkedScenarioDescription(conceptText`Search generated page titles and content, then follow a result. Disable search and
verify that the generated bundle removes the search controls.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'becacc26-9e46-40a8-98b7-701c607af0f7' }, name.annotation, description.annotation] }, async ({ sourceCommand,
  page,
  checkpoint,
  skipMeadowHomeStateCheck,
  addKeyFrame,
  testServer,
}) => {
  // --- Setup ---
  const workflows = new Workflows(page, expect);
  await sourceCommand(() => workflows.navigateToBigBundlePreview());
  const modal = new PreviewPublishModal(page, expect);
  const generatedBundle = modal.generatedBundle;
  const customizeTab = new CustomizeTab(page, expect);

  await sourceCommand(() => modal.openCustomizeSidebar());
  await sourceCommand(() => customizeTab.generationOptions.enableSourcesExport());
  await sourceCommand(() => generatedBundle.search.expectSameHeightAsSources());
  await sourceCommand(() => checkpoint("generated bundle search and sources controls align"));

  // --- Test start ---
  // Search by page title.
  await sourceCommand(() => generatedBundle.search.open());
  await sourceCommand(() => generatedBundle.search.search("t021"));
  await sourceCommand(() => generatedBundle.search.expectTitleResults([
    "t021 - link gaps",
    "t021 ---- inlink gap",
    "t021 ---- outlink gap",
  ]));
  await sourceCommand(() => addKeyFrame(generatedBundleSearch));
  await sourceCommand(() => checkpoint("generated bundle title search results"));

  // Follow the title result and search content.
  await sourceCommand(() => generatedBundle.search.clickResult("title", "t021 ---- outlink gap"));
  await sourceCommand(() => generatedBundle.expectHeading("t021 ---- outlink gap"));

  await sourceCommand(() => generatedBundle.search.open());
  await sourceCommand(() => generatedBundle.search.search("Animated GIF"));
  await sourceCommand(() => generatedBundle.search.expectContentResult(
    "t006 - embedded media",
    "Animated GIF",
  ));
  await sourceCommand(() => checkpoint("generated bundle content search results"));

  // Follow the content result.
  await sourceCommand(() => generatedBundle.search.clickResult("content", "t006 - embedded media"));
  await sourceCommand(() => generatedBundle.expectHeading("t006 - embedded media"));
  await sourceCommand(() => checkpoint("navigated from generated bundle search"));

  // Check search when opened from disk.
  // The same script-shard loader works when the self-contained HTML is opened
  // directly from disk, without an HTTP server.
  const localPage = await sourceCommand(() => page.context().newPage());
  // Fetch through the active browser page so Chromium owns stale keep-alive
  // recovery. Playwright's APIRequestContext can reuse an idle proxy socket
  // here and surface a sporadic ECONNRESET instead of retrying this safe GET.
  const versionState = await sourceCommand(() => page.evaluate(async (bundleSlug) => {
    const response = await fetch(
      `/api/bundles/${encodeURIComponent(bundleSlug)}/review/versions`,
    );
    if (!response.ok) {
      throw new Error(`Could not load generated versions (${response.status})`);
    }
    return response.json();
  }, Bundle.Big)) as {
    versions: Array<{ versionId: string; derivedState: string }>;
  };
  const currentVersionId = versionState.versions.find(
    version => version.derivedState === "current",
  )?.versionId;
  expect(currentVersionId).toBeTruthy();
  const localMainPage = path.join(
    testServer.configDir,
    "bundles",
    Bundle.Big,
    "html",
    "generated_bundle_versions",
    currentVersionId!,
    "main page.html",
  );
  await sourceCommand(() => localPage.goto(pathToFileURL(localMainPage).href));
  const localGeneratedBundle = GeneratedBundle.onPage(localPage, expect);
  await sourceCommand(() => localGeneratedBundle.search.open());
  await sourceCommand(() => localGeneratedBundle.search.search("t021"));
  await sourceCommand(() => localGeneratedBundle.search.expectTitleResults([
    "t021 - link gaps",
    "t021 ---- inlink gap",
    "t021 ---- outlink gap",
  ]));
  await sourceCommand(() => localGeneratedBundle.close());

  await sourceCommand(() => modal.openCustomizeSidebar());
  await sourceCommand(() => customizeTab.generationOptions.disableSearch());
  const changesTab = new ChangesTab(page, expect);
  await sourceCommand(() => changesTab.waitForRegenerationComplete());
  await sourceCommand(() => generatedBundle.search.expectUnavailable());
  await sourceCommand(() => addKeyFrame(customize));
  await sourceCommand(() => checkpoint("generated bundle search disabled"));

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
