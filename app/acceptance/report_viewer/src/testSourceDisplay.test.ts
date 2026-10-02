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
