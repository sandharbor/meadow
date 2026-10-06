/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { describe, expect, it } from 'vitest';
import { proposedSourceMoveResolutions, sourceIdentityRecommendations } from '../../../../shared_code/utils/sourceMoveResolutions.js';
import type { SourceMoveCandidate } from '../../../../contracts/types/sourcing.js';

const move = (bundleNodeId: string, newPath: string): SourceMoveCandidate => ({ bundleNodeId, oldPath: `${bundleNodeId}.md`, newPath, similarity: { score: 0.9, criteria: [] }, confidence: 'strong', competing: false, evidence: [], previousRoute: [], currentRoute: [] });

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


describe('source identity recommendations', () => {
  it('only recommends defaults for confident identities', () => {
    const weak = { ...move('weak', 'weak.md'), similarity: { score: 0.55, criteria: [] } };
    const competing = ['one.md', 'two.md'].map(path => ({ ...move('ambiguous', path), competing: true }));
    expect(sourceIdentityRecommendations([weak, ...competing], {}).every(item => item.destination === undefined)).toBe(true);
    expect(sourceIdentityRecommendations([weak, ...competing, move('strong', 'strong.md')], {})).toMatchObject([
      { id: 'weak', confident: false },
      { id: 'ambiguous', confident: false },
      { id: 'strong', destination: 'strong.md', confident: true },
    ]);
  });
  it('keeps confident identities in the same group after choices are saved', () => {
    expect(sourceIdentityRecommendations([move('a', 'one.md'), move('b', 'two.md'), move('c', 'three.md')], { a: null, b: 'two.md' })).toMatchObject([
      { id: 'a', decided: true, confident: true },
      { id: 'b', decided: true, confident: true },
      { id: 'c', decided: false, confident: true },
    ]);
  });
  it('never recommends assigning two identities to the same destination', () => {
    expect(sourceIdentityRecommendations([move('a', 'shared.md'), move('b', 'shared.md')], {}).every(item => item.destination === undefined && !item.confident)).toBe(true);
  });
  it('ranks candidates while leaving every competing match to the user', () => {
    const lower = { ...move('a', 'lower.md'), competing: true, similarity: { score: 0.65, criteria: [] } };
    const result = sourceIdentityRecommendations([lower, { ...move('a', 'best.md'), competing: true }], {});
    expect(result[0].destination).toBeUndefined();
    expect(result).toMatchObject([
      { confident: false, moves: [{ newPath: 'best.md' }, { newPath: 'lower.md' }] },
    ]);
  });
});
