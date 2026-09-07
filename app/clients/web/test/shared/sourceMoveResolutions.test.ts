/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { describe, expect, it } from 'vitest';
import { proposedSourceMoveResolutions } from '../../../../shared_code/utils/sourceMoveResolutions.js';
import type { SourceMoveCandidate } from '../../../../contracts/types/sourcing.js';

const move = (bundleNodeId: string, newPath: string): SourceMoveCandidate => ({ bundleNodeId, oldPath: `${bundleNodeId}.md`, newPath, confidence: 'strong', competing: false, evidence: [], previousRoute: [], currentRoute: [] });

describe('proposed source move resolutions', () => {
  it('uses the first ranked match without requiring a separate decision', () => {
    expect(proposedSourceMoveResolutions([move('a', 'new.md'), move('a', 'alternative.md')])).toEqual({ a: 'new.md' });
  });
  it('preserves an explicit different-pages override', () => {
    expect(proposedSourceMoveResolutions([move('a', 'new.md')], { a: null })).toEqual({ a: null });
  });
  it('reserves explicit choices before proposing other matches', () => {
    expect(proposedSourceMoveResolutions([move('a', 'one.md'), move('a', 'two.md'), move('b', 'one.md')], { b: 'one.md' })).toEqual({ a: 'two.md', b: 'one.md' });
  });
  it('does not propose merging two configured identities into one file', () => {
    expect(proposedSourceMoveResolutions([move('a', 'shared.md'), move('b', 'shared.md')])).toEqual({ a: 'shared.md', b: null });
  });
});
