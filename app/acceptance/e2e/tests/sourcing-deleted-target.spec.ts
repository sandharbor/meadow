/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { prepareSourceScenario } from '../../../shared_code/shared_dev/sourceScenario.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { orphan } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });

/*
 * Delete a file while leaving a section link that points to it. Review should identify the
 * missing file and optionally show the previously accepted route.
 */
test('Sourcing explains a surviving section link to a deleted file with file pills and an optional previous route', async ({ page, meadowCli, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  let command = 0;
  const destination = await prepareSourceScenario(
    args => meadowCli.run(args, { artifactName: `source-setup-${++command}` }),
    'meadow-test-bundle-big', () => sourceChanges.apply('delete-linked-section'),
  );
  const navigationMutations: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && /\/sourcing\/(scan|accept)$/.test(request.url())) navigationMutations.push(request.url());
  });
  // Stand in for the browser: the opener hands over the launch URL, which
  // this page then opens, so the command can report the place it reached.
  const handoff = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-open-'));
  const opener = path.join(handoff, 'open.sh');
  const launched = path.join(handoff, 'launched-url');
  fs.writeFileSync(opener, `#!/bin/sh\nprintf '%s' "$1" > ${JSON.stringify(launched)}\n`, { mode: 0o755 });
  const previousOpener = process.env.MEADOW_BROWSER_OPEN_EXECUTABLE;
  let opened: { url: string; requested: string; reached: string | null };
  try {
    process.env.MEADOW_BROWSER_OPEN_EXECUTABLE = opener;
    const command = meadowCli.runJson<{ url: string; requested: string; reached: string | null }>(
      ['bundle', 'open', 'meadow-test-bundle-big', '--surface', 'source-review'],
      { artifactName: 'open-source-review' },
    );
    await expect.poll(() => fs.existsSync(launched), { timeout: 30_000 }).toBe(true);
    await page.goto(fs.readFileSync(launched, 'utf8'));
    opened = await command;
  } finally {
    if (previousOpener === undefined) delete process.env.MEADOW_BROWSER_OPEN_EXECUTABLE;
    else process.env.MEADOW_BROWSER_OPEN_EXECUTABLE = previousOpener;
    fs.rmSync(handoff, { recursive: true, force: true });
  }
  expect(new URL(opened.url).pathname + new URL(opened.url).search).toBe(destination);
  expect(opened.reached).toBe(destination);
  const editor = new BundleEditorPage(page, expect);
  const review = editor.sourceReview;
  await expect(page.getByRole('dialog', { name: 'Source changes' })).toBeVisible();
  await editor.expectSourceOrphanCount(1);
  await checkpoint('the prepared deletion opens directly in source review');

  // --- Test start ---
  // Inspect the missing target.
  const orphans = await review.reviewOrphans();
  const title = 't003 ---- page with section to link to';
  await orphans.expectSummaryCount(1);
  await orphans.expectCollapsedFile(title);
  await orphans.checkHelp();
  await orphans.showHelp();
  await addKeyFrame(orphan);
  await orphans.toggleExplanationWithKeyboard(title);
  await orphans.toggleExplanationWithKeyboard(title);
  await orphans.expectCollapsedFile(title);
  await orphans.showExplanation(title);
  await orphans.expectMissingLinkedFile(title, 't003 - link to section.md', `${title}.md`);
  await review.expectNoMissingEntry(`${title}.md`);
  await addKeyFrame(orphan);
  expect(navigationMutations).toEqual([]);
  await checkpoint('a surviving section link explains the missing file without showing the full route');

  // Show the previous route.
  await orphans.showPreviousRoute(title);
  await orphans.expectExplanation(title, 'main page.md');
  await addKeyFrame(orphan);
  await checkpoint('the previous route is available when requested');

  // Accept the source update.
  await review.accept();
  await editor.expectSourceOrphanCount(0);
  await checkpoint('acceptance removes the deleted target configuration');

  await skipMeadowHomeStateCheck();
});
