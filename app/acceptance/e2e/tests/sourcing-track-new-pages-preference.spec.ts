/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Bundle, Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, BundleListPage, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { scenarioSections, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, sourceReviewWorkspace } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Turning off Track added pages applies to one review; the next review starts with it on`);

const description = linkedScenarioDescription(conceptText`Turn off Track added pages and accept a new page untracked. After reopening the bundle, a
later review starts with Track added pages on again and accepts its addition tracked.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: the accepted source state is established before changing files.` },
  addLinkedPage: { type: 'test', text: conceptText`Add a linked page.` },
  acceptSourceUpdate: { type: 'test', text: conceptText`Accept the source update.` },
  reopenBundle: { type: 'test', text: conceptText`Reopen the bundle.` },
  addEmbeddedImage: { type: 'test', text: conceptText`Add an embedded image.` },
  acceptSourceUpdate2: { type: 'test', text: conceptText`Accept the source update.` },
});
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '1529fd21-a754-4e10-aa6e-d48eff2a6f10' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const { editor } = await test.step(sections.steps.setup, async () => {
    const workflows = new Workflows(page, expect);
    await sourceCommand(() => workflows.navigateToBigBundle());
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.waitForSourceCheck());
    await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));
    return { editor };
  });

  await test.step(sections.steps.addLinkedPage, async () => {
    await sourceCommand(() => sourceChanges.apply('add-linked-page'));
    await sourceCommand(() => editor.checkSourceChanges());
    await sourceCommand(() => editor.sourceReview.open());
    await sourceCommand(() => editor.sourceReview.expectTrackAdditions(true));
    await sourceCommand(() => editor.sourceReview.setTrackAdditions(false));
    await sourceCommand(() => checkpoint('Track added pages is turned off for this review'));
  });

  await test.step(sections.steps.acceptSourceUpdate, async () => {
    await sourceCommand(() => editor.sourceReview.accept());
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => editor.clickListViewRowByExactName('added field notes'));
    await sourceCommand(() => new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.NotTracked));
    await sourceCommand(() => addKeyFrame(sourceSnapshot));
    await sourceCommand(() => checkpoint('acceptance leaves the accepted addition untracked'));
  });

  await test.step(sections.steps.reopenBundle, async () => {
    await sourceCommand(() => editor.clickBackToBundles());
    await sourceCommand(() => new BundleListPage(page, expect).clickBundle(Bundle.Big));
    await sourceCommand(() => editor.waitForLoad(Bundle.Big));
    await sourceCommand(() => editor.waitForSourceCheck());
    await sourceCommand(() => checkpoint('the bundle is reopened with its existing tracking choices'));
  });

  await test.step(sections.steps.addEmbeddedImage, async () => {
    await sourceCommand(() => sourceChanges.apply('add-embedded-image'));
    await sourceCommand(() => editor.checkSourceChanges());
    await sourceCommand(() => editor.sourceReview.open());
    await sourceCommand(() => editor.sourceReview.expectTrackAdditions(true));
    await sourceCommand(() => addKeyFrame(sourceSnapshot));
    await sourceCommand(() => checkpoint('a later source review starts with Track added pages on again'));
  });

  await test.step(sections.steps.acceptSourceUpdate2, async () => {
    await sourceCommand(() => editor.sourceReview.accept());
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => editor.clickListViewRowByExactName('added sunflower'));
    await sourceCommand(() => new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.Tracked));
    await sourceCommand(() => checkpoint('the later image is tracked'));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
