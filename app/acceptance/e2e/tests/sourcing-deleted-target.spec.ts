/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { test, expect } from '../src/run/test-fixtures.js';
import { prepareSourceScenario } from '../../../shared_code/shared_dev/sourceScenario.js';
import { BundleEditorPage } from '../src/run/pages/index.js';
import { orphan } from '../../../concepts/index.js';

test.use({ bundleMode: 'single-file' });
test.use({ isolateSourceGraphs: true });

test('Sourcing explains a surviving section link to a deleted file with file pills and an optional previous route', async ({ page, meadowCli, sourceChanges, snapshot, addKeyFrame, skipMeadowHomeStateCheck }) => {
  let command = 0;
  const destination = await prepareSourceScenario(
    args => meadowCli.run(args, { artifactName: `source-setup-${++command}` }),
    'meadow-test-bundle-big', () => sourceChanges.apply('delete-linked-section'),
  );
  const navigationMutations: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && /\/sourcing\/(scan|accept)$/.test(request.url())) navigationMutations.push(request.url());
  });
  const opener = process.env.MEADOW_BROWSER_OPEN_EXECUTABLE;
  let opened: { url: string };
  try {
    process.env.MEADOW_BROWSER_OPEN_EXECUTABLE = '/usr/bin/true';
    opened = await meadowCli.runJson<{ url: string }>(['bundle', 'open', 'meadow-test-bundle-big', '--source-review'], { artifactName: 'open-source-review' });
  } finally {
    if (opener === undefined) delete process.env.MEADOW_BROWSER_OPEN_EXECUTABLE;
    else process.env.MEADOW_BROWSER_OPEN_EXECUTABLE = opener;
  }
  expect(new URL(opened.url).pathname + new URL(opened.url).search).toBe(destination);
  await page.goto(opened.url);
  const editor = new BundleEditorPage(page, expect);
  const review = editor.sourceReview;
  await expect(page.getByRole('dialog', { name: 'Source changes' })).toBeVisible();
  await editor.expectSourceOrphanCount(1);
  const orphans = await review.reviewOrphans();
  const title = 't003 ---- page with section to link to';
  await orphans.showExplanation(title);
  await orphans.expectMissingLinkedFile(title, 't003 - link to section.md', `${title}.md`);
  await review.expectNoMissingEntry(`${title}.md`);
  await addKeyFrame(orphan);
  expect(navigationMutations).toEqual([]);
  await snapshot('a surviving section link explains the missing file without showing the full route');
  await orphans.showPreviousRoute(title);
  await orphans.expectExplanation(title, 'main page.md');
  await addKeyFrame(orphan);
  await snapshot('the previous route is available when requested');
  await review.accept();
  await editor.expectSourceOrphanCount(0);
  await skipMeadowHomeStateCheck();
});
