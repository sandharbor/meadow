/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '../src/run/test-fixtures.js';
import { prepareSourceScenario } from '../../../shared_code/shared_dev/sourceScenario.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { sourcingReviewRedesign, orphan, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });

const name = linkedScenarioName(conceptText`Sourcing explains a surviving section link to a deleted file with file pills and an optional previous route`);

const description = linkedScenarioDescription(conceptText`Delete a file while leaving a section link that points to it. Review should identify the
missing file and optionally show the previously accepted route.`);
test(name.name, { annotation: [{ type: 'scenario-id', description: 'b6e58804-dcbc-44fa-9777-326aa3855648' }, name.annotation, description.annotation] }, async ({ sourceCommand, page, meadowCli, sourceChanges, checkpoint, addKeyFrame, skipMeadowHomeStateCheck }) => {
  // --- Setup ---
  let command = 0;
  const destination = await sourceCommand(() => prepareSourceScenario(
    args => meadowCli.run(args, { artifactName: `source-setup-${++command}` }),
    'meadow-test-bundle-big', () => sourceChanges.apply('delete-linked-section'),
  ));
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
    await sourceCommand(() => expect.poll(() => fs.existsSync(launched), { timeout: 30_000 }).toBe(true));
    await sourceCommand(() => page.goto(fs.readFileSync(launched, 'utf8')));
    opened = await sourceCommand(() => command);
  } finally {
    if (previousOpener === undefined) delete process.env.MEADOW_BROWSER_OPEN_EXECUTABLE;
    else process.env.MEADOW_BROWSER_OPEN_EXECUTABLE = previousOpener;
    fs.rmSync(handoff, { recursive: true, force: true });
  }
  expect(new URL(opened.url).pathname + new URL(opened.url).search).toBe(destination);
  expect(opened.reached).toBe(destination.replace('?surface=', '?editorMode=sourcing&surface='));
  const editor = new BundleEditorPage(page, expect);
  const review = editor.sourceReview;
  await sourceCommand(() => expect(page.getByTestId('sourcing-workspace')).toBeVisible());
  await sourceCommand(() => editor.expectSourceOrphanCount(1));
  await sourceCommand(() => checkpoint('the prepared deletion opens directly in source review'));

  // --- Test start ---
  // Inspect the missing target.
  const orphans = await sourceCommand(() => review.reviewOrphans());
  const title = 't003 ---- page with section to link to';
  await sourceCommand(() => orphans.expectSummaryCount(1));
  await sourceCommand(() => orphans.expectCollapsedFile(title));
  await sourceCommand(() => addKeyFrame(orphan));
  await sourceCommand(() => orphans.toggleExplanationWithKeyboard(title));
  await sourceCommand(() => orphans.toggleExplanationWithKeyboard(title));
  await sourceCommand(() => orphans.expectCollapsedFile(title));
  await sourceCommand(() => orphans.showExplanation(title));
  await sourceCommand(() => orphans.expectMissingLinkedFile(title, 't003 - link to section.md', `${title}.md`));
  await sourceCommand(() => addKeyFrame(orphan));
  expect(navigationMutations).toEqual([]);
  await sourceCommand(() => checkpoint('a surviving section link explains the missing file without showing the full route'));

  // Show the previous route.
  await sourceCommand(() => review.expectSelectedRoute(['main page']));
  await sourceCommand(() => addKeyFrame(orphan));
  await sourceCommand(() => checkpoint('the previous route is available when requested'));

  // Accept the source update.
  await sourceCommand(() => review.accept());
  await sourceCommand(() => editor.expectSourceOrphanCount(0));
  await sourceCommand(() => checkpoint('acceptance removes the deleted target configuration'));

  await sourceCommand(() => skipMeadowHomeStateCheck());
});
