/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { expect, test } from 'vitest';
import { testSourceDisplay } from './testSourceDisplay';

test('capture wrappers disappear without moving multiline source or subsequent commands', () => {
  const source = [
    '// sourceCommand(() => ignored());',
    'await sourceCommand(() => sourcing.open());',
    'await sourceCommand(() => sourcing.select(',
    '  "sourceCommand(() => literal())"',
    '));',
    'await checkpoint("ready");',
  ].join('\n');
  expect(testSourceDisplay(source)).toEqual({
    source: [
      '// sourceCommand(() => ignored());',
      'await sourcing.open();',
      'await sourcing.select(',
      '  "sourceCommand(() => literal())"',
      ');',
      'await checkpoint("ready");',
    ].join('\n'),
    commandLines: [2, 3],
  });
});

test('block callbacks retain their full capture code', () => {
  const source = 'await sourceCommand(() => { prepare(); return act(); });';
  expect(testSourceDisplay(source)).toEqual({ source, commandLines: [] });
});

test('awaits used only for capture disappear from synchronous value assertions', () => {
  const source = [
    '  await sourceCommand(() => expect(proposal.current.id).toBe(captured));',
    '  await sourceCommand(() => expect(proposal.current.id).not.toBe(captured));',
    '  await sourceCommand(() => expect.soft(value).toEqual({ ready: true }));',
    '  await sourceCommand(async () => await sourcing.open());',
  ].join('\n');
  expect(testSourceDisplay(source).source).toBe([
    '  expect(proposal.current.id).toBe(captured);',
    '  expect(proposal.current.id).not.toBe(captured);',
    '  expect.soft(value).toEqual({ ready: true });',
    '  await sourcing.open();',
  ].join('\n'));
});

test('asynchronous commands, polling, and promise assertions retain necessary awaits', () => {
  for (const command of [
    'sourcing.open()',
    'expect(locator).toBeVisible()',
    'expect.poll(() => current()).toBe(1)',
    'expect(response).resolves.toEqual({ ready: true })',
    'expect(response).rejects.not.toThrow()',
    'expect(async () => retry()).toPass()',
  ]) {
    expect(testSourceDisplay(`await sourceCommand(() => ${command});`).source).toBe(`await ${command};`);
  }
});

test('removing capture-only awaits preserves multiline positions and indentation', () => {
  const source = '  await sourceCommand(() => expect(value).toEqual(\n    expected\n  ));\n  next();';
  expect(testSourceDisplay(source)).toEqual({
    source: '  expect(value).toEqual(\n    expected\n  );\n  next();', commandLines: [1],
  });
});

test('known synchronous file and serialization operations do not show capture-only awaits', () => {
  for (const command of ['fs.renameSync(before, after)', 'fs.readFileSync(filename)', 'JSON.parse(text)', 'YAML.stringify(value)']) {
    expect(testSourceDisplay(`await sourceCommand(() => ${command});`).source).toBe(`${command};`);
  }
});
