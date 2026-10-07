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
import { PreviewPublishModal, ChangesTab, CustomizeTab } from "../src/run/pages/index.js";
import { Workflows } from "../src/run/workflows.js";
import { hooks, customize, conceptText, linkedScenarioName, linkedScenarioDescription } from "../../../concepts/index.js";
import { bigBundle } from "../src/bundle-docs/index.js";

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`HTML post-processing hook: create, validate, save, and verify diff`);

const description = linkedScenarioDescription(conceptText`Create and validate an HTML post-processing hook, then save it. Review the generated
diff to confirm that the hook changed the output.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '6e16ca6b-afe5-492d-9627-37c1aac8f45e' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, checkpoint, skipMeadowHomeStateCheck, addKeyFrame }) => {
  // --- Setup ---
  // Navigate to big bundle preview
  const wf = new Workflows(page, expect);
  await sourceCommand(() => wf.navigateToBigBundlePreview());
  const modal = new PreviewPublishModal(page, expect);
  const changesTab = new ChangesTab(page, expect);
  await sourceCommand(() => checkpoint("preview loaded"));

  // --- Test start ---
  // Save the baseline.
  await sourceCommand(() => modal.clickSaveChanges());
  await sourceCommand(() => modal.waitForSaveComplete());
  await sourceCommand(() => checkpoint("baseline saved"));

  // Open customization.
  await sourceCommand(() => modal.clickStep1Review());
  await sourceCommand(() => modal.openCustomizeSidebar());
  const customizeTab = new CustomizeTab(page, expect);
  await sourceCommand(() => checkpoint("customize tab open"));

  // Create an HTML hook.
  const htmlHook = customizeTab.hooks.getHook("HTML");
  await sourceCommand(() => htmlHook.clickCreate());
  await sourceCommand(() => checkpoint("hook editor opened with template"));

  // Save the hook.
  await sourceCommand(() => changesTab.expectNoBadge());

  // Save the hook (triggers preview regeneration), then close the floating editor
  await sourceCommand(() => htmlHook.save());
  await sourceCommand(() => htmlHook.close());
  await sourceCommand(() => changesTab.waitForRegenerationComplete());
  await sourceCommand(() => checkpoint("hook saved and regeneration complete"));

  // Review the generated diff.
  await sourceCommand(() => changesTab.expectBadgeVisible());

  // Go to Changes tab and inspect the diff
  await sourceCommand(() => modal.clickChangesTab());
  await sourceCommand(() => changesTab.clickFirstHtmlFile());
  await sourceCommand(() => changesTab.fileDetails.ensureOnDiffTab());
  await sourceCommand(() => changesTab.fileDetails.clickCodeSubTab());
  await sourceCommand(() => changesTab.fileDetails.expectDiffContainsText("Hello from Meadow"));
  await sourceCommand(() => addKeyFrame(hooks));
  await sourceCommand(() => addKeyFrame(customize));
  await sourceCommand(() => checkpoint("diff shows Hello from Meadow"));

  void bigBundle;

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
