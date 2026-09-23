/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { prepareSourceScenario } from '../../../shared_code/shared_dev/sourceScenario.js';
import { sourceMove } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ isolateSourceGraphs: true });

/*
 * Move and edit a page at the same time. Review should compare the content and show the
 * unchanged leading part of its route only once.
 */
test('Sourcing compares edited content for a move while showing its unchanged leading route once', async ({ page, meadowCli, sourceChanges, addKeyFrame, snapshot, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  let command = 0;
  const destination = await prepareSourceScenario(
    args => meadowCli.run(args, { artifactName: `source-setup-${++command}` }),
    'meadow-test-bundle-big', () => sourceChanges.apply('move-and-edit-page'),
  );
  await page.goto(destination);
  const editor = new BundleEditorPage(page, expect);
  const move = await editor.sourceReview.moveFrom('t024 - markdown links.md');
  await snapshot('the prepared move is ready for content review');

  // --- Test start ---
  // Compare the moved content.
  await move.expandDetails();
  await move.expectSingleRoute(['main page.md']);
  await move.compareContent();
  await move.expectContentEdit('This test covers standard markdown link syntax.', 'This updated page demonstrates standard Markdown links after a directory move.');
  await addKeyFrame(sourceMove);
  await snapshot('a moved page with edited content offers an actual diff and one leading route');

  await skipMeadowHomeStateCheck();
});
