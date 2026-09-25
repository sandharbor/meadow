/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { expect, test } from 'vitest';
import { testSourceLocations } from './testSourceLocations';

test('checkpoint locations support every literal quote style, escaping, and multiline calls', () => {
  const source = [
    '// checkpoint("ignored comment");',
    'test.use({ bundleMode: "single-file" });',
    'test("scenario", async ({ checkpoint }) => {',
    '  await checkpoint(\'single quotes\');',
    '  await checkpoint("double quotes");',
    '  await checkpoint(`template literal`);',
    "  await checkpoint('page\\'s identity');",
    '  await checkpoint(',
    '    "two\\nlines"',
    '  );',
    '  expect("single quotes").toBeDefined();',
    '});',
  ].join('\n');
  expect(testSourceLocations(source)).toEqual({
    testLine: 3,
    checkpoints: [
      { message: 'single quotes', line: 4 },
      { message: 'double quotes', line: 5 },
      { message: 'template literal', line: 6 },
      { message: "page's identity", line: 7 },
      { message: 'two\nlines', line: 8 },
    ],
  });
});

test('repeated checkpoint messages retain each call location in order', () => {
  expect(testSourceLocations("await checkpoint('ready');\nawait checkpoint('ready');").checkpoints).toEqual([
    { message: 'ready', line: 1 }, { message: 'ready', line: 2 },
  ]);
});

test('runs recorded before the checkpoint rename still locate snapshot() calls', () => {
  expect(testSourceLocations("await snapshot('legacy');").checkpoints).toEqual([
    { message: 'legacy', line: 1 },
  ]);
});
