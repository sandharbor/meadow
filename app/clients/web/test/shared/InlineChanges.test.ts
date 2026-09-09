/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { describe, expect, it } from 'vitest';
import { matchInlineChanges } from '../../shared_components/ConfigFileExplorer/inlineChanges.js';

const match = (before: string[], after: string[]) => matchInlineChanges(before, after, { remaining: 1_000_000 });

describe('minor edits within changed lines', () => {
  it('highlights only the changed digit, preserving the complete original text', () => {
    const before = 'nested under folder `t001/` : [[t001 ---- child 1]]';
    const after = before.replace('[[t001', '[[t101');
    const [pair] = match([before], [after]);
    expect(pair.before.filter(part => part.changed).map(part => part.text)).toEqual(['0']);
    expect(pair.after.filter(part => part.changed).map(part => part.text)).toEqual(['1']);
    expect(pair.before.map(part => part.text).join('')).toBe(before);
    expect(pair.after.map(part => part.text).join('')).toBe(after);
  });

  it('groups incidental matching letters into a readable renamed phrase', () => {
    const before = 'Here we are with a link to a specific section: [[t003 ---- page with section to link to#Section 2]]';
    const after = 'Here we are with a link to a specific section: [[t003 ---- renamed section page#Section 2]]';
    const [pair] = match([before], [after]);
    expect(pair.before.filter(part => part.changed).map(part => part.text)).toEqual(['page with section to link to']);
    expect(pair.after.filter(part => part.changed).map(part => part.text)).toEqual(['renamed section page']);
    expect(pair.before.map(part => part.text).join('')).toBe(before);
    expect(pair.after.map(part => part.text).join('')).toBe(after);
  });

  it('keeps a meaningful unchanged phrase between separate replacements', () => {
    const [pair] = match(['Start old, with a meaningful unchanged phrase, old end'], ['Start new, with a meaningful unchanged phrase, new end']);
    expect(pair.before.filter(part => part.changed).map(part => part.text)).toEqual(['old', 'old']);
    expect(pair.after.filter(part => part.changed).map(part => part.text)).toEqual(['new', 'new']);
  });

  it.each([
    ['abcdefghij', 'abcXYfghij', true],
    ['abcdefghij', 'abcXYZghij', false],
    ['abcdefghij', 'abcWXYZhij', false],
    ['abcdefghij', 'abcdefghij!', true],
    ['abcdefghij!', 'abcdefghij', true],
  ])('uses a strict 30 percent cutoff for %s → %s', (before, after, highlighted) => {
    expect(match([before], [after]).length > 0).toBe(highlighted);
  });

  it('matches replacements in order past an unrelated inserted line', () => {
    const before = ['first page 001 links here', 'second page 002 links there'];
    const after = ['a brand new introduction', 'first page 101 links here', 'second page 102 links there'];
    const pairs = match(before, after);
    expect(pairs.map(pair => [pair.beforeIndex, pair.afterIndex])).toEqual([[0, 1], [1, 2]]);
  });

  it('marks separate edits without splitting Unicode code points', () => {
    const [pair] = match(['shared text 😀 with old suffix'], ['shared text 😁 with new suffix']);
    expect(pair.before.filter(part => part.changed).map(part => part.text)).toEqual(['😀', 'old']);
    expect(pair.after.filter(part => part.changed).map(part => part.text)).toEqual(['😁', 'new']);
  });

  it('does not manufacture a pair for a pure addition or deletion', () => {
    expect(match([], ['page'])).toEqual([]);
    expect(match(['page'], [])).toEqual([]);
  });

  it('falls back to whole-line shading when the detail budget is exhausted', () => {
    expect(matchInlineChanges(['long old contents'], ['long new contents'], { remaining: 1 })).toEqual([]);
    expect(match(Array(50).fill('old line'), Array(50).fill('new line'))).toEqual([]);
  });
});
