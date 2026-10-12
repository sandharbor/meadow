/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleEditorPage, ChangesTab, PreviewPublishModal } from '../src/run/pages/index.js';
import { acceptSourceBaseline } from '../../../shared_code/shared_dev/sourceScenario.js';
import { appPlacePath } from '../../../contracts/places/index.js';
import type { GenerateBundleCliResult } from '../../../contracts/types/cliOperations.js';
import { changesTab as changesTabDoc, generationRecord, conceptLink, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, bundleGeneration, bundleReview } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });

const slug = 'meadow-test-bundle-big';

const name = linkedScenarioName(conceptText`Review shows an accepted page move as one moved and modified generated file`);

const description = linkedScenarioDescription(conceptText`Save a generation, then move and edit a source page and accept it as the same file. Review
should pair the page's old and new generated paths through its ${conceptLink(generationRecord.id, "generation record")}, list it once under its destination,
show both paths with the edited content, and keep it visible under either the Moved or Modified filter.`);
const areas = scenarioAreas([bundleSourcing, bundleGeneration, bundleReview]);
test(name.name, { annotation: [{ type: 'scenario-id', description: '20cb59b9-e1a1-49f7-910d-c17bcf1f8e64' }, name.annotation, description.annotation, areas.annotation] }, async ({ sourceCommand, page, meadowCli, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  let command = 0;
  const run = (args: string[]) => meadowCli.run(args, { artifactName: `setup-${++command}` });
  await sourceCommand(() => acceptSourceBaseline(run, slug));
  const generated = await sourceCommand(() => meadowCli.runJson<GenerateBundleCliResult>(['bundle', 'generate', slug], { artifactName: 'generate' }));
  await sourceCommand(() => run(['bundle', 'save-generation', slug, '--version', generated.versionId]));
  await sourceCommand(() => page.goto(appPlacePath({ page: 'bundle', slug })));
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => checkpoint('a saved generation is the comparison baseline'));

  // --- Test start ---
  // Move and edit a page, keeping it as the same file.
  await sourceCommand(() => sourceChanges.apply('move-and-edit-page'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => editor.sourceReview.open());
  await sourceCommand(() => editor.sourceReview.confirmSuggestedIdentities());
  await sourceCommand(() => editor.sourceReview.continueToGraph());
  await sourceCommand(() => editor.sourceReview.accept());
  await sourceCommand(() => checkpoint('the moved page keeps its identity'));

  // Review the regenerated site.
  const modal = new PreviewPublishModal(page, expect);
  const changes = new ChangesTab(page, expect);
  await sourceCommand(() => editor.clickPreview());
  await sourceCommand(() => modal.waitForPreviewComplete());
  await sourceCommand(() => modal.clickChangesTab());
  await sourceCommand(() => changes.expectComparisonBaseline('Compared with the last saved generation of this version'));
  await sourceCommand(() => changes.expectNoIdentityNotice());
  await sourceCommand(() => changes.expectMovedFile('t024 - markdown links.html', { modified: true }));
  await sourceCommand(() => changes.selectFile('t024 - markdown links.html'));
  await sourceCommand(() => changes.expectSelectedFileMove('t024 - markdown links.html', 'source-changes/t024 - markdown links.html'));
  await sourceCommand(() => changes.fileDetails.ensureOnDiffTab());
  await sourceCommand(() => changes.fileDetails.expectRenderedInsertion('demonstrates'));
  await sourceCommand(() => addKeyFrame(changesTabDoc));
  await sourceCommand(() => checkpoint('the moved page appears once with its old and new paths and its edits'));

  // A moved and modified file matches either filter.
  await sourceCommand(() => changes.openHtmlSectionChangesFilter());
  await sourceCommand(() => changes.expectChangeTypeCount('Moved', 1));
  await sourceCommand(() => changes.uncheckChangeType('Modified'));
  await sourceCommand(() => changes.expectMovedFile('t024 - markdown links.html', { modified: true }));
  await sourceCommand(() => changes.checkChangeType('Modified'));
  await sourceCommand(() => changes.uncheckChangeType('Moved'));
  await sourceCommand(() => changes.expectMovedFile('t024 - markdown links.html', { modified: true }));
  await sourceCommand(() => checkpoint('the moved and modified page stays visible under either filter'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
