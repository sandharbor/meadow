/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { scenarioSections, sourcingReviewRedesign, sourceSnapshot, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, sourceReviewWorkspace } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });

const name = linkedScenarioName(conceptText`Sourcing previews an added image and its inclusion route before explicitly tracking it`);

const description = linkedScenarioDescription(conceptText`Add a reachable image and inspect its proposed inclusion route. Explicit tracking should retain
the new image without changing the accepted graph beforehand.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: the accepted source state is established before changing files.` },
  addEmbeddedImage: { type: 'test', text: conceptText`Add an embedded image.` },
  thisScenarioAboutExplicitTrackingChoicesSo: { type: 'test', text: conceptText`This scenario is about explicit tracking choices, so Track added pages is off.` },
  trackInspectedImageThroughOrdinaryControlsThen: { type: 'test', text: conceptText`Track the inspected image through the ordinary controls, then accept.` },
});
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: 'bf4dde21-65c3-4632-ab21-f1b8b5f23e6e' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const { editor } = await test.step(sections.steps.setup, async () => {
    await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.waitForSourceCheck());
    await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));
    return { editor };
  });

  await test.step(sections.steps.addEmbeddedImage, async () => {
    await sourceCommand(() => sourceChanges.apply('add-embedded-image'));
    await sourceCommand(() => editor.checkSourceChanges());
    await sourceCommand(() => editor.sourceReview.open());
  });

  await test.step(sections.steps.thisScenarioAboutExplicitTrackingChoicesSo, async () => {
    await sourceCommand(() => editor.sourceReview.setTrackAdditions(false));
    await sourceCommand(() => editor.sourceReview.previewImage('source-changes/added sunflower.png', ['main page.md', 't006 - embedded media.md']));
    await sourceCommand(() => addKeyFrame(sourceSnapshot));
    await sourceCommand(() => checkpoint('the shared added image has a thumbnail and a real inclusion route'));
  });

  await test.step(sections.steps.trackInspectedImageThroughOrdinaryControlsThen, async () => {
    await sourceCommand(() => editor.sourceReview.closeComparison());
    await sourceCommand(() => editor.sourceReview.trackSelected());
    await sourceCommand(() => editor.sourceReview.accept());
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => editor.clickListViewRowByExactName('added sunflower'));
    await sourceCommand(() => new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.Tracked));
    await sourceCommand(() => addKeyFrame(sourceSnapshot));
    await sourceCommand(() => checkpoint('acceptance includes and tracks the new embedded image'));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
