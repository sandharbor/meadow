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
    setupLine: 2,
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

test('linked scenario prose replaces only its declaration and adjacent description', () => {
  const source = [
    'test.use({ bundleMode: "single-file" });',
    'const name = linkedScenarioName(',
    '  conceptText`Review ${conceptLink(scopeExclusion.id)}`);',
    '',
    '/*',
    ' * Review the excluded page.',
    ' */',
    'test(name.name, { annotation: [name.annotation] }, async () => {',
    "  await checkpoint('ready');",
    '});',
  ].join('\n');
  expect(testSourceLocations(source)).toEqual({
    testLine: 8,
    setupLine: 1,
    checkpoints: [{ message: 'ready', line: 9 }],
    scenarioProse: { name: { start: 2, end: 3 }, description: { start: 5, end: 7 } },
  });
});

test('the setup boundary ignores imports, comments, and nested test.use calls', () => {
  const source = [
    '/* Copyright. test.use({ ignored: true }); */',
    'import { test } from "./fixtures";',
    'function helper() { test.use({ ignored: true }); }',
    'test.use({',
    '  fixtureHome: Fixture.SourcingReview,',
    '});',
    'test("review", async () => {});',
  ].join('\n');
  expect(testSourceLocations(source)).toEqual({ testLine: 7, setupLine: 4, checkpoints: [] });
});

test('a formal linked description replaces its declaration while preserving checkpoint locations', () => {
  const source = [
    'const name = linkedScenarioName(conceptText`Review scope exclusions`);',
    'const description = linkedScenarioDescription(',
    '  conceptText`Stage ${conceptLink(bridgeExclusion.id)} before accepting.`);',
    'const unrelated = "Keep this visible";',
    'test(name.name, { annotation: [name.annotation, description.annotation] }, async () => {',
    "  await checkpoint('ready');",
    '});',
  ].join('\n');
  expect(testSourceLocations(source)).toEqual({
    testLine: 5,
    checkpoints: [{ message: 'ready', line: 6 }],
    scenarioProse: { name: { start: 1, end: 1 }, description: { start: 2, end: 3 } },
  });
});
