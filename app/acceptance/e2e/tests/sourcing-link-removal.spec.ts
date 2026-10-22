/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { scenarioSections, sourceChange, orphan, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, sourceReviewWorkspace } from '../../../concepts/index.js';


test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Sourcing accepts a shared link deletion only when requested and explains its broken route`);

const description = linkedScenarioDescription(conceptText`Remove a source link and review the broken route. The accepted bundle should stay
unchanged until the user accepts the proposed change.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: the accepted source state is established before changing files.` },
  removeIncomingLink: { type: 'test', text: conceptText`Remove the incoming link.` },
  inspectResultingOrphan: { type: 'test', text: conceptText`Inspect the resulting orphan.` },
  acceptSourceUpdate: { type: 'test', text: conceptText`Accept the source update.` },
});
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewWorkspace] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '4fb06514-5b88-41e5-a377-234c3f5b85e4' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const { editor } = await test.step(sections.steps.setup, async () => {
    await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.waitForSourceCheck());
    await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));
    return { editor };
  });

  const { review, modifiedPath } = await test.step(sections.steps.removeIncomingLink, async () => {
    await sourceCommand(() => sourceChanges.apply('remove-incoming-link'));
    await sourceCommand(() => editor.checkSourceChanges());
    const review = editor.sourceReview;
    const modifiedPath = 't001 - deeply nested.md';
    await sourceCommand(() => review.open());
    await sourceCommand(() => review.expectModified(modifiedPath));
    await sourceCommand(() => review.expectNoRenames());
    await sourceCommand(() => review.expandDetails(modifiedPath));
    await sourceCommand(() => review.expectContentChanges(modifiedPath, {
      removed: /\[\[t001 ---- child 2\]\]/,
      added: /child 2 \(link removed\)/,
    }));
    await sourceCommand(() => addKeyFrame(sourceChange));
    await sourceCommand(() => checkpoint('link deletion is reviewed as a source edit'));
    return { review, modifiedPath };
  });

  await test.step(sections.steps.inspectResultingOrphan, async () => {
    await sourceCommand(() => review.collapseDetails(modifiedPath));
    await sourceCommand(() => review.expandDetails(modifiedPath, 'keyboard'));
    await sourceCommand(() => review.expectNoLongerIncluded('t001/deeper/t001 ---- child 2.md'));
    const orphans = await sourceCommand(() => review.reviewOrphans());
    await sourceCommand(() => orphans.showExplanation('t001 ---- child 2'));
    await sourceCommand(() => orphans.expectExplanation('t001 ---- child 2', 'no longer links to'));
    await sourceCommand(() => addKeyFrame(orphan));
    await sourceCommand(() => checkpoint('orphan details identify the removed connection before acceptance'));
  });

  await test.step(sections.steps.acceptSourceUpdate, async () => {
    await sourceCommand(() => review.accept());
    await sourceCommand(() => editor.expectSourceOrphanCount(0));
    await sourceCommand(() => editor.checkSourceChanges());
    await sourceCommand(() => editor.expectSourceOrphanCount(0));
    await sourceCommand(() => expect(page.getByRole('button', { name: 'Refresh sources', exact: true })).toBeVisible());
    await sourceCommand(() => checkpoint('acceptance removes orphaned configuration and a fresh scan stays clear'));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
