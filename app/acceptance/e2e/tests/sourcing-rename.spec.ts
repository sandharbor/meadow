/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { Workflows } from '../src/run/workflows.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, sourceSnapshot, sourceMove, sourceChange, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';
import { MeadowHomeBundleConfig } from '../src/run/utils/index.js';

const slug = 'meadow-test-bundle-big';
const originalTitle = 't003 ---- page with section to link to';
const renamedTitle = 't003 ---- renamed section page';

test.use({ bundleMode: "single-file" });

const name = linkedScenarioName(conceptText`Sourcing reviews a shared rename without disrupting curation and preserves page identity`);

const description = linkedScenarioDescription(conceptText`Rename a source page that already has curation settings. Review should preserve those
settings and retain the page's identity after acceptance.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: '86ec9574-29c5-4f44-b44e-58cfbbbae216' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, sourceChanges, testServer, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  const wf = new Workflows(page, expect);
  await sourceCommand(() => wf.navigateToBigBundle());
  const editor = new BundleEditorPage(page, expect);
  const bundleConfig = new MeadowHomeBundleConfig(testServer.configDir, slug, expect);
  const original = bundleConfig.requireNode({ bundleNodeName: originalTitle });
  await sourceCommand(() => editor.waitForSourceCheck());
  await sourceCommand(() => editor.expectSourceOrphanCount(13));
  await sourceCommand(() => checkpoint('the accepted source state is established before changing files'));

  // --- Test start ---
  // Rename the page and its links.
  await sourceCommand(() => sourceChanges.apply('rename-page-with-links'));
  await sourceCommand(() => editor.checkSourceChanges());
  await sourceCommand(() => expect(page.getByRole('button', { name: /source changes? available.*Review/i })).toBeVisible());
  await sourceCommand(() => editor.sourceReview.expectClosed());
  await sourceCommand(() => editor.expectSourceOrphanCount(13));
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('candidate waits while accepted curation remains stable'));

  // Open source review.
  const review = editor.sourceReview;
  await sourceCommand(() => review.open());
  await sourceCommand(() => review.expectIdentityReviewRequired());
  await sourceCommand(() => review.expectMove('Renamed', `${originalTitle}.md`, `${renamedTitle}.md`));
  const rename = await sourceCommand(() => review.moveFrom(`${originalTitle}.md`));
  await sourceCommand(() => addKeyFrame(sourceMove));
  await sourceCommand(() => checkpoint('proposed rename opens required identity review with the rename suggested'));

  // Inspect the unchanged traversal route.
  await sourceCommand(() => review.confirmSuggestedIdentities());
  await sourceCommand(() => rename.expectSamePageSelected());
  await sourceCommand(() => rename.expectNoContentComparison());
  await sourceCommand(() => rename.expectSingleRoute(['main page.md', 't003 - link to section.md']));
  await sourceCommand(() => addKeyFrame(sourceMove));
  await sourceCommand(() => checkpoint('an unchanged traversal route uses file pills without repeating the renamed endpoint'));

  // Reopen review and inspect the link edit.
  await sourceCommand(() => review.defer());
  await sourceCommand(() => review.open());
  await sourceCommand(() => review.expandDetails('t003 - link to section.md'));
  await sourceCommand(() => review.expectInlineChanges('t003 - link to section.md', ['page with section to link to'], ['renamed section page']));
  await sourceCommand(() => addKeyFrame(sourceChange));
  await sourceCommand(() => checkpoint('renamed link text uses readable replacement phrases'));

  // Accept the source update.
  await sourceCommand(() => review.accept());
  await sourceCommand(() => expect.poll(() => bundleConfig.findNode({ bundleNodeId: original.bundleNodeId })?.bundleNodeName).toBe(renamedTitle));
  await sourceCommand(() => editor.expectSourceOrphanCount(0));
  await sourceCommand(() => editor.switchToListView());
  await sourceCommand(() => expect(page.getByText(renamedTitle, { exact: true }).first()).toBeVisible());
  await sourceCommand(() => addKeyFrame(sourceSnapshot));
  await sourceCommand(() => checkpoint('accepted rename keeps the existing tracked page identity'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
