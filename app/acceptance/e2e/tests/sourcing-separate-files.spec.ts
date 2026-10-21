/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { scenarioSections, sourcingReviewRedesign, orphan, conceptText, linkedScenarioName, linkedScenarioDescription, scenarioAreas, bundleSourcing, sourceReviewIdentity } from '../../../concepts/index.js';

const originalTitle = 't003 ---- page with section to link to';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Sourcing treats a rejected rename as different pages and removes the old configuration on acceptance`);

const description = linkedScenarioDescription(conceptText`Reject a proposed rename by keeping the old and new files separate. Acceptance should
remove the old configuration instead of transferring its identity.`);
const sections = scenarioSections({
  setup: { type: 'setup', text: conceptText`Establish the starting state: the accepted source state is established before changing files.` },
  renamePageLinks: { type: 'test', text: conceptText`Rename the page and its links.` },
  acceptSourceUpdate: { type: 'test', text: conceptText`Accept the source update.` },
});
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewIdentity] });
test(name.name, { annotation: [{ type: 'scenario-id', description: '30c13a6a-547f-4c87-ac13-cc68a5a6592a' }, name.annotation, description.annotation, areas.annotation, sections.annotation] }, async ({ sourceCommand, page, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  const { editor } = await test.step(sections.steps.setup, async () => {
    await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
    const editor = new BundleEditorPage(page, expect);
    await sourceCommand(() => editor.waitForSourceCheck());
    await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));
    return { editor };
  });

  const { review } = await test.step(sections.steps.renamePageLinks, async () => {
    await sourceCommand(() => sourceChanges.apply('rename-page-with-links'));
    await sourceCommand(() => editor.checkSourceChanges());
    const review = editor.sourceReview;
    await sourceCommand(() => review.open());
    const rename = await sourceCommand(() => review.moveFrom(`${originalTitle}.md`));
    await sourceCommand(() => rename.keepSeparate());
    await sourceCommand(() => rename.showDifferentHelp());
    await sourceCommand(() => rename.expectPreviousRoute('t003 - link to section.md'));
    await sourceCommand(() => addKeyFrame(orphan));
    await sourceCommand(() => checkpoint('different pages shows the previous route and proposes removing the old configuration'));
    return { review };
  });

  await test.step(sections.steps.acceptSourceUpdate, async () => {
    await sourceCommand(() => review.accept());
    await sourceCommand(() => editor.expectSourceOrphanCount(0));
    await sourceCommand(() => expect(page.getByRole('button', { name: 'Refresh sources', exact: true })).toBeVisible());
    await sourceCommand(() => checkpoint('acceptance removes the old identity after rejecting the rename'));
  });

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
