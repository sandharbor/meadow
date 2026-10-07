/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, orphan, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';

const originalTitle = 't003 ---- page with section to link to';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Sourcing treats a rejected rename as different pages and removes the old configuration on acceptance`);

const description = linkedScenarioDescription(conceptText`Reject a proposed rename by keeping the old and new files separate. Acceptance should
remove the old configuration instead of transferring its identity.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '30c13a6a-547f-4c87-ac13-cc68a5a6592a' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  await sourceCommand(() => new Workflows(page, expect).navigateToBigBundle());
  const editor = new BundleEditorPage(page, expect);
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));

  // --- Test start ---
  // Rename the page and its links.
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

  // Accept the source update.
  await sourceCommand(() => review.accept());
  await sourceCommand(() => editor.expectSourceOrphanCount(0));
  await sourceCommand(() => expect(page.getByRole('button', { name: 'Refresh sources', exact: true })).toBeVisible());
  await sourceCommand(() => checkpoint('acceptance removes the old identity after rejecting the rename'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
