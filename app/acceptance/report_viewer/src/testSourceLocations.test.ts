/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { expect, test } from 'vitest';
import { testSourceLocations, checkpointSourceBlocks } from './testSourceLocations';
import { conceptText } from '../../../concepts/index.js';

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


test('section wrappers are located without moving checkpoints or hiding compact step bodies', () => {
  const source = [
    'const sections = scenarioSections({',
    '  setup: { type: "setup", text: conceptText`Prepare.` },',
    '  review: { type: "test", text: conceptText`Review.` },',
    '});',
    'test(name.name, { annotation: [sections.annotation] }, async () => {',
    '  await test.step(sections.steps.setup, async () => {',
    '    await checkpoint("ready");',
    '  });',
    '  await test.step(',
    '    sections.steps.review,',
    '    async () => {',
    '      await checkpoint("reviewed");',
    '    },',
    '  );',
    '  await test.step(sections.steps.review, async () => { await act(); });',
    '});',
  ].join('\n');
  expect(testSourceLocations(source)).toMatchObject({
    testLine: 5,
    testClosing: { start: 16, end: 16 },
    checkpoints: [{ message: 'ready', line: 7 }, { message: 'reviewed', line: 12 }],
    sections: {
      declaration: { start: 1, end: 4 },
      steps: [
        { id: 'setup', start: 6, end: 6, closingStart: 8, closingEnd: 8 },
        { id: 'review', start: 9, end: 11, closingStart: 13, closingEnd: 14 },
      ],
    },
  });
});

test('the outer closing wrapper keeps executable code and comments that share its line', () => {
  for (const ending of ['  await verify(); });', '}); afterTest();', '}); // Keep this note.']) {
    const source = ['const sections = scenarioSections({});', 'test(name.name, {}, async () => {', ending].join('\n');
    expect(testSourceLocations(source).testClosing).toBeUndefined();
  }
});

test('only a final standalone state-check opt-out is hidden, including wrapped multiline calls', () => {
  for (const call of ['await skipMeadowHomeStateCheck();', 'await sourceCommand(() => skipMeadowHomeStateCheck());']) {
    expect(testSourceLocations(`test("example", async () => {\n  ${call}\n});`).finalStateCheckSkip).toEqual({ start: 2, end: 2 });
  }
  expect(testSourceLocations('test("example", async () => {\n  await sourceCommand(async () =>\n    await skipMeadowHomeStateCheck()\n  );\n});').finalStateCheckSkip).toEqual({ start: 2, end: 4 });
  for (const body of [
    'await skipMeadowHomeStateCheck();\n  await verify();',
    'await verify(); await skipMeadowHomeStateCheck();',
    'await sourceCommand(() => (verify(), skipMeadowHomeStateCheck()));',
    'await assertMeadowHomeState();',
    'await skipMeadowHomeStateCheck(); // Keep this note.',
  ]) {
    expect(testSourceLocations(`test("example", async () => {\n  ${body}\n});`).finalStateCheckSkip).toBeUndefined();
  }
});


test('sections can pass shared values onward without exposing transfer scaffolding as scenario prose', () => {
  const source = [
    'const sections = scenarioSections({});',
    'test(name.name, { annotation: [sections.annotation] }, async () => {',
    '  const { editor, before } = await test.step(sections.steps.setup, async () => {',
    '    const editor = new Editor();',
    '    const before = await capture();',
    '    await checkpoint("ready");',
    '    return { editor, before };',
    '  });',
    '  const result = await test.step(sections.steps.review, async () => {',
    '    return await editor.review(before);',
    '  });',
    '});',
  ].join('\n');
  expect(testSourceLocations(source).sections).toEqual({
    declaration: { start: 1, end: 1 },
    steps: [{ id: 'setup', start: 3, end: 3, closingStart: 8, closingEnd: 8, returnedValues: { start: 7, end: 7 } }],
  });
  expect(testSourceLocations(source).checkpoints).toEqual([{ message: 'ready', line: 6 }]);
});


test('checkpoint prose uses recorded text and source positions while preserving multiline call ranges', () => {
  const source = [
    'await sourceCommand(() => checkpoint(',
    '  conceptText`Review ${conceptLink(orphan.id, "orphan")}.`,',
    '  { keyFrames: [orphan] },',
    '));',
    'await sourceCommand(() => checkpoint("ready"));',
    'await sourceCommand(() => checkpoint("ready"));',
    'if (condition) await checkpoint("keep surrounding code");',
    'await checkpoint(dynamicText);',
  ].join('\n');
  const text = conceptText`Captured prose.`;
  const records = [{ id: 1, message: 'Captured prose.', text, timestamp: '2026-10-30', sourceLine: 1 }];
  expect(checkpointSourceBlocks(source, records)).toEqual([
    { line: 1, endLine: 4, indent: 0, checkpointId: 1, message: 'Captured prose.', text },
    { line: 5, endLine: 5, indent: 0, message: 'ready' },
    { line: 6, endLine: 6, indent: 0, message: 'ready' },
  ]);
  expect(testSourceLocations(source, records).checkpoints[0]).toEqual({ message: 'Captured prose.', line: 1 });
});
