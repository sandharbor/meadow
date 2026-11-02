/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'node:path';
import { sourceSensitivity } from '../src/run/utils/sourceSensitivity.js';
import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage, FilterPanelComponent, Pill, SelectedPageDetailComponent } from '../src/run/pages/index.js';
import { trackAddedPages, trackingChangesPanel, changesTray, scenarioSections, exemplarySpec, sourceSnapshot, sensitive, filterSensitivity, sourceReviewAcceptance, tracking, conceptText, conceptLink, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, sourceReviewWorkspace } from '../../../concepts/index.js';
import { scenarioDesignPressures, preventAccidentalSharing } from '../../../concepts/index.js';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`${conceptLink(filterSensitivity.id, 'Filter-Derived Sensitivity')} leaves sensitive additions untracked after acceptance`);

const description = linkedScenarioDescription(conceptText`Enable a custom filter's Mark Sensitive action, then add matching pages and a safe page without source sensitivity markings. ${conceptLink(filterSensitivity.id, 'Filter-Derived Sensitivity')} identifies the matching additions before acceptance. ${conceptLink(sourceReviewAcceptance.id, 'Proposal Acceptance')} leaves them untracked in the ordinary Untracked filter and tracks the safe addition.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Open the accepted ${conceptLink(sourceSnapshot.id, 'Source Snapshot')} and enable a custom filter that supplies ${conceptLink(filterSensitivity.id, 'Filter-Derived Sensitivity')}.` },
  reviewAdditions: { type: 'test', text: conceptText`Add a safe page and pages matched by the filter. Verify ${conceptLink(filterSensitivity.id, 'Filter-Derived Sensitivity')} identifies the matching pages without source markings and lists them as skipped in the ${conceptLink(trackingChangesPanel.id, 'Tracking Changes Panel')} opened from the ${conceptLink(changesTray.id, 'Changes Tray')}.` },
  acceptAdditions: { type: 'test', text: conceptText`Use ${conceptLink(sourceReviewAcceptance.id, 'Proposal Acceptance')} and verify ${conceptLink(tracking.id, 'Bundle Node Tracking')} includes the safe addition while the sensitive additions remain in Untracked.` },
});
const pressures = scenarioDesignPressures([preventAccidentalSharing]);
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '4d83d151-9db8-4af0-8e65-7b701110951f' }, { type: 'concept', description: exemplarySpec.id }, name.annotation, description.annotation, areas.annotation, pressures.annotation, sections.annotation] }, async ({ sourceCommand, page, testServer, sourceChanges, checkpoint, skipMeadowHomeStateCheck }) => {
  const { editor, filters } = await test.step(sections.steps.setup, async () => {
    await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.waitForSourceCheck());
    const filters = new FilterPanelComponent(page, expect);
    await sourceCommand(() => filters.clickAddCustomFilter());
    await sourceCommand(() => filters.fillAndSaveCustomFilter({ name: 'Confidential pages', field: 'title', matchType: 'substring', value: 'confidential', markSensitive: true }));
    await sourceCommand(() => checkpoint(conceptText`The accepted bundle has a filter ready to supply ${conceptLink(filterSensitivity.id, 'Filter-Derived Sensitivity')} to matching additions.`));
    return { editor, filters };
  });

  const { privateNames } = await test.step(sections.steps.reviewAdditions, async () => {
    await sourceCommand(() => sourceChanges.apply('add-filter-sensitive-pages'));
    await sourceCommand(() => editor.checkSourceChanges());
    await sourceCommand(() => editor.sourceReview.open());
    const privateNames = ['added confidential notes', 'added confidential planning'];
    for (const name of privateNames) {
      await sourceCommand(() => editor.sourceReview.expectSensitivity(`source-changes/${name}.md`, 'Sensitive via filter'));
    }
    for (const name of privateNames) {
      expect(sourceSensitivity(path.join(testServer.sourceGraphsDir, 'meadow-test-bundles-data', 'source-changes', `${name}.md`))).toBeUndefined();
    }
    await sourceCommand(() => editor.sourceReview.expectSensitiveSkippedPages(privateNames));
    await sourceCommand(() => checkpoint(conceptText`${conceptLink(filterSensitivity.id, 'Filter-Derived Sensitivity')} identifies the unmarked matching additions, and only those additions appear in the sensitive-skipped list.`, { keyFrames: [sourceSnapshot, filterSensitivity, changesTray, trackAddedPages, trackingChangesPanel] }));
    return { privateNames };
  });

  await test.step(sections.steps.acceptAdditions, async () => {
    await sourceCommand(() => editor.sourceReview.closeAcceptedChangeDetail());
    await sourceCommand(() => editor.sourceReview.accept());
    await sourceCommand(() => editor.switchToListView());
    await sourceCommand(() => editor.clickListViewRowByExactName('added public update'));
    await sourceCommand(() => new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.Tracked));
    await sourceCommand(() => editor.clickSelectNone());
    await sourceCommand(() => filters.enableAndSoloFilter('Untracked'));
    for (const name of privateNames) {
      await sourceCommand(() => editor.clickListViewRowByExactName(name));
      await sourceCommand(() => new SelectedPageDetailComponent(editor.getSelectedPageRoot(), expect).expectPill(Pill.NotTracked));
      await sourceCommand(() => editor.clickSelectNone());
    }
    await sourceCommand(() => editor.expectListViewRowByExactNameNotPresent('added public update'));
    await sourceCommand(() => checkpoint(conceptText`After ${conceptLink(sourceReviewAcceptance.id, 'Proposal Acceptance')}, the safe addition is tracked and the additions with ${conceptLink(filterSensitivity.id, 'Filter-Derived Sensitivity')} remain untracked in curation.`, { keyFrames: [sensitive, filterSensitivity] }));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
