/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { expect, test } from 'vitest';
import { testSourceLocations } from './testSourceLocations';

test('snapshot locations support every literal quote style, escaping, and multiline calls', () => {
  const source = [
    '// snapshot("ignored comment");',
    'test.use({ bundleMode: "single-file" });',
    'test("scenario", async ({ snapshot }) => {',
    '  await snapshot(\'single quotes\');',
    '  await snapshot("double quotes");',
    '  await snapshot(`template literal`);',
    "  await snapshot('page\\'s identity');",
    '  await snapshot(',
    '    "two\\nlines"',
    '  );',
    '  expect("single quotes").toBeDefined();',
    '});',
  ].join('\n');
  expect(testSourceLocations(source)).toEqual({
    testLine: 3,
    snapshots: [
      { message: 'single quotes', line: 4 },
      { message: 'double quotes', line: 5 },
      { message: 'template literal', line: 6 },
      { message: "page's identity", line: 7 },
      { message: 'two\nlines', line: 8 },
    ],
  });
});

test('repeated snapshot messages retain each call location in order', () => {
  expect(testSourceLocations("await snapshot('ready');\nawait snapshot('ready');").snapshots).toEqual([
    { message: 'ready', line: 1 }, { message: 'ready', line: 2 },
  ]);
});
