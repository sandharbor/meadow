/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { ActionButton, BundleEditorPage, FilterPanelComponent, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { scenarioSections, sourcingReviewRedesign, frontierEmbeddedAssets, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, bundleCuration, sourceReviewWorkspace } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });

const name = linkedScenarioName(conceptText`a plain link to an image beyond the boundary stays untrackable in the live frontier`);

const description = linkedScenarioDescription(conceptText`Add a plain link to an image beyond the traversal boundary. The live frontier should
show it without allowing it to be tracked there.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: the accepted source state is established before changing files.` },
  replaceImageEmbedPlainLink: { type: 'test', text: conceptText`Replace the image embed with a plain link.` },
  acceptSourceUpdate: { type: 'test', text: conceptText`Accept the source update.` },
  showLiveFrontierInCuration: { type: 'test', text: conceptText`Show the live frontier in curation.` },
});
const areas = scenarioAreas([bundleSourcing, bundleCuration], { subAreas: [sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: 'caec0c25-9239-4906-8896-87b6bf817779' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  await test.step(sections.steps.setup, async () => {
    await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
    await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));
  });

  const { editor } = await test.step(sections.steps.replaceImageEmbedPlainLink, async () => {
    await sourceCommand(() => sourceChanges.apply('link-frontier-image'));
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.sourceReview.open());
    await sourceCommand(() => editor.sourceReview.checkAgain());
    await sourceCommand(() => editor.sourceReview.expectNoLongerIncluded('t016 ---- level 5 - frontier image.png'));
    await sourceCommand(() => editor.sourceReview.orphans.expectNotListed('t016 ---- level 5 - frontier image'));
    await sourceCommand(() => addKeyFrame(frontierEmbeddedAssets));
    await sourceCommand(() => checkpoint('the formerly embedded image is no longer included, without orphaned configuration'));
    return { editor };
  });

  await test.step(sections.steps.acceptSourceUpdate, async () => {
    await sourceCommand(() => editor.sourceReview.accept());
  });

  await test.step(sections.steps.showLiveFrontierInCuration, async () => {
    await sourceCommand(() => new FilterPanelComponent(page, expect).enableFilter('Frontier'));
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => editor.clickListViewRowByExactName('t016 ---- level 5 - frontier image'));
    const detail = new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect);
    await sourceCommand(() => detail.expectPill(Pill.Frontier));
    await sourceCommand(() => detail.expectNoPill(Pill.FrontierImage));
    await sourceCommand(() => detail.expectButtonDisabled(ActionButton.Track));
    await sourceCommand(() => addKeyFrame(frontierEmbeddedAssets));
    await sourceCommand(() => checkpoint('an ordinary image link has the same frontier restrictions as a linked note'));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
