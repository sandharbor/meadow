/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleEditorPage, ChangesTab, PreviewPublishModal } from '../src/run/pages/index.js';
import { acceptSourceBaseline } from '../../../shared_code/shared_dev/sourceScenario.js';
import { appPlacePath } from '../../../contracts/places/index.js';
import type { GenerateBundleCliResult } from '../../../contracts/types/cliOperations.js';
import { changesTab as changesTabDoc, generationRecord, conceptLink, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });

const slug = 'meadow-test-bundle-big';

const name = linkedScenarioName(conceptText`Review shows a tracked image move with its before and after previews`);

const description = linkedScenarioDescription(conceptText`Save a generation, then move a tracked image and accept it as the same file. Review should
pair the image's generated copies through its ${conceptLink(generationRecord.id, "generation record")} as one unmodified move and preview its saved and
current bytes side by side.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'e6332af2-80c8-4c20-9104-8bb2e1375b37' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, meadowCli, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  let command = 0;
  const run = (args: string[]) => meadowCli.run(args, { artifactName: `setup-${++command}` });
  await sourceCommand(() => acceptSourceBaseline(run, slug));
  const generated = await sourceCommand(() => meadowCli.runJson<GenerateBundleCliResult>(['bundle', 'generate', slug], { artifactName: 'generate' }));
  await sourceCommand(() => run(['bundle', 'save-generation', slug, '--version', generated.versionId]));
  await sourceCommand(() => page.goto(appPlacePath({ page: 'bundle', slug })));
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => checkpoint('a saved generation includes the tracked image'));

  // --- Test start ---
  // Move the tracked image, keeping it as the same file.
  await sourceCommand(() => sourceChanges.apply('move-tracked-image'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.confirmSuggestedIdentities());
  await sourceCommand(() => editor.sourceReview.continueToGraph());
  await sourceCommand(() => editor.sourceReview.accept());
  await sourceCommand(() => checkpoint('the moved image keeps its identity'));

  // Review the regenerated image.
  const modal = new PreviewPublishModal(page, expect);
  const changes = new ChangesTab(page, expect);
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => modal.waitForPreviewComplete());
  await sourceCommand(() => modal.clickChangesTab());
  await sourceCommand(() => changes.expectMovedFile('t024 ---- test image.png', { modified: false }));
  await sourceCommand(() => changes.selectFile('t024 ---- test image.png'));
  await sourceCommand(() => changes.expectSelectedFileMove('t024/t024 ---- test image.png', 't024/images/t024 ---- test image.png'));
  await sourceCommand(() => changes.expectImageComparison());
  await sourceCommand(() => addKeyFrame(changesTabDoc));
  await sourceCommand(() => checkpoint('the moved image shows both paths and both previews'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
