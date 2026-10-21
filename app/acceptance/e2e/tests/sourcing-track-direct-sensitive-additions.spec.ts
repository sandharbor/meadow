/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'node:path';
import { sourceSensitivity } from '../src/run/utils/sourceSensitivity.js';
import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, FilterPanelComponent, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { scenarioSections, sourcingReviewRedesign, sourceSnapshot, sensitive, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, sourceReviewWorkspace } from '../../../concepts/index.js';
import { scenarioDesignPressures, preventAccidentalSharing } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Sourcing acceptance tracks safe additions and leaves direct-sensitive additions in the ordinary untracked filter`);

const description = linkedScenarioDescription(conceptText`Add pages that are directly marked sensitive alongside a safe peer. Acceptance tracks the
safe additions and leaves the sensitive ones untracked in the ordinary Untracked filter.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: the accepted bundle is ready for new additions.` },
  establishEarlierAdditionTrackedByDefault: { type: 'test', text: conceptText`Establish an earlier addition, tracked by default.` },
  addSensitivePagesSafePeer: { type: 'test', text: conceptText`Add sensitive pages and a safe peer.` },
  selectExactlyOneSkippedAdditionWithoutIncluding: { type: 'test', text: conceptText`Select exactly one skipped addition without including safe or unrelated pages.` },
  acceptAdditionsSafeOnesAreTrackedSensitive: { type: 'test', text: conceptText`Accept the additions: the safe ones are tracked, and the sensitive ones remain in the normal Untracked filter.` },
});
const pressures = scenarioDesignPressures([preventAccidentalSharing]);
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '0b132f4e-f39f-47eb-b609-dc8151afb48e' }, name.annotation, description.annotation, areas.annotation, pressures.annotation, sections.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const { editor } = await test.step(sections.steps.setup, async () => {
    await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.waitForSourceCheck());
    await sourceCommand(() => checkpoint('the accepted bundle is ready for new additions'));
    return { editor };
  });

  await test.step(sections.steps.establishEarlierAdditionTrackedByDefault, async () => {
    await sourceCommand(() => sourceChanges.apply('add-embedded-image'));
    await sourceCommand(() => editor.checkSourceChanges());
    await sourceCommand(() => editor.sourceReview.open());
    await sourceCommand(() => editor.sourceReview.accept());
    await sourceCommand(() => checkpoint('an earlier addition is accepted and tracked'));
  });

  const { privateNames } = await test.step(sections.steps.addSensitivePagesSafePeer, async () => {
    await sourceCommand(() => sourceChanges.apply('add-direct-sensitive-pages'));
    await sourceCommand(() => editor.checkSourceChanges());
    await sourceCommand(() => editor.sourceReview.open());
    const privateNames = ['added confidential notes', 'added confidential planning'];
    for (const name of privateNames) {
      await sourceCommand(() => editor.sourceReview.expectSensitivity(`source-changes/${name}.md`, 'Sensitive'));
    }
    for (const name of privateNames) {
      expect(sourceSensitivity(path.join(testServer.sourceGraphsDir, 'meadow-test-bundles-data', 'source-changes', `${name}.md`))).toBe(true);
    }
    await sourceCommand(() => editor.sourceReview.expectSensitiveSkippedPages(privateNames));
    await sourceCommand(() => addKeyFrame(sourceSnapshot));
    await sourceCommand(() => checkpoint('source review identifies sensitive additions before acceptance'));
    return { privateNames };
  });

  await test.step(sections.steps.selectExactlyOneSkippedAdditionWithoutIncluding, async () => {
    await sourceCommand(() => editor.sourceReview.selectSensitiveSkippedPage(privateNames[0]));
    await sourceCommand(() => checkpoint('the skipped-pages panel selects only the requested sensitive addition'));
  });

  await test.step(sections.steps.acceptAdditionsSafeOnesAreTrackedSensitive, async () => {
    await sourceCommand(() => editor.sourceReview.accept());
    await sourceCommand(() => editor.switchToListView());
    const filters = new FilterPanelComponent(page, expect);
    await sourceCommand(() => filters.enableAndSoloFilter('Untracked'));
    for (const name of privateNames) {
      await sourceCommand(() => editor.clickListViewRowByExactName(name));
      await sourceCommand(() => new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.NotTracked));
      await sourceCommand(() => editor.clickSelectNone());
    }
    for (const name of ['added sunflower', 'added public update']) await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent(name));
    await sourceCommand(() => addKeyFrame(sensitive));
    await sourceCommand(() => checkpoint('sensitive additions remain untracked for ordinary curation while safe additions are tracked'));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
