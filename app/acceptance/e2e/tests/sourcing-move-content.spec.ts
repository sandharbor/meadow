/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { prepareSourceScenario } from '../../../shared_code/shared_dev/sourceScenario.js';
import { sourcingReviewRedesign, sourceMove } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });

/*
 * Move and edit a page at the same time. Review should compare the content and show the
 * unchanged leading part of its route only once.
 */
test('Sourcing compares edited content for a move while showing its unchanged leading route once', { annotation: { type: 'scenario-id', description: '465772d6-3cc4-4f5d-8cc7-081292592343' } }, async ({ sourceCommand, page, meadowCli, sourceChanges, addKeyFrame, checkpoint, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  let command = 0;
  const destination = await sourceCommand(() => prepareSourceScenario(
    args => meadowCli.run(args, { artifactName: `source-setup-${++command}` }),
    'meadow-test-bundle-big', () => sourceChanges.apply('move-and-edit-page'),
  ));
  await sourceCommand(() => page.goto(destination));
  const editor = new BundleEditorPage(page, expect);
  const move = await sourceCommand(() => editor.sourceReview.moveFrom('t024 - markdown links.md'));
  await sourceCommand(() => checkpoint('the prepared move is ready for content review'));

  // --- Test start ---
  // Compare the moved content.
  await sourceCommand(() => move.expectSingleRoute(['main page.md']));
  await sourceCommand(() => move.compareContent());
  await sourceCommand(() => move.expectContentEdit('This test covers standard markdown link syntax.', 'This updated page demonstrates standard Markdown links after a directory move.'));
  await sourceCommand(() => addKeyFrame(sourceMove));
  await sourceCommand(() => checkpoint('a moved page with edited content offers an actual diff and one leading route'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
