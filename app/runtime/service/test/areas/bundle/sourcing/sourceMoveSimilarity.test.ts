/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { describe, expect, it } from 'vitest';
import { sourceMoveSimilarity, sourceTextProfile } from '../../../../src/areas/bundle/sourcing/services/sourceMoveSimilarity.js';
import type { SourceSnapshot } from '../../../../src/shared/source-snapshot/sourceSnapshots.js';

const snapshot: SourceSnapshot = { id: 'snapshot', capturedAt: '', fileCount: 0, digest: '', files: {}, directories: [] };
const compare = (before: string, after: string) => sourceMoveSimilarity({ oldPath: 'type-driven design.md', newPath: 'example.md', exact: before === after, before: sourceTextProfile(before), after: sourceTextProfile(after), previous: snapshot, current: snapshot });

describe('source move similarity evidence', () => {
  it('gives blank contents and a shared file extension no identity weight', () => {
    const result = compare(' \n\t', ' \n\t');
    expect(result.score).toBe(0);
    expect(result.criteria.find(item => item.id === 'contents')).toMatchObject({ score: 0 });
    expect(result.criteria.find(item => item.id === 'filename')).toMatchObject({ score: 0 });
    expect(result.criteria.find(item => item.id === 'incoming')).toMatchObject({ score: null });
  });
  it('reduces support from identical short text and does not double-count identical substantial blocks', () => {
    expect(compare('Hi', 'Hi').score).toBeCloseTo(0.075);
    const result = compare('This is a substantial paragraph of text.', 'This is a substantial paragraph of text.');
    expect(result.score).toBe(0.75);
    expect(result.criteria.find(item => item.id === 'blocks')).toMatchObject({ score: 1, weight: 0 });
  });
  it('reports weighted block overlap when content changes', () => {
    const result = compare('A'.repeat(60) + '\n\n' + 'B'.repeat(20), 'A'.repeat(60) + '\n\n' + 'C'.repeat(40));
    expect(result.score).toBeCloseTo(0.45);
    expect(result.criteria.find(item => item.id === 'contents')).toMatchObject({ score: 0, weight: 0 });
    expect(result.criteria.find(item => item.id === 'blocks')).toMatchObject({ score: 0.6, weight: 0.75 });
    expect(result.criteria).toHaveLength(8);
  });
  it('exposes the corroborated folder and word-rewrite evidence in the same scoring model', () => {
    const result = sourceMoveSimilarity({ oldPath: 'old/page.md', newPath: 'new/page.md', exact: false, previous: snapshot, current: snapshot, group: { anchors: 2, overlap: 0.95 } });
    expect(result.score).toBeCloseTo(0.8675);
    expect(result.criteria.find(item => item.id === 'folderMove')).toMatchObject({ score: 1, weight: 0.1 });
    expect(result.criteria.find(item => item.id === 'words')).toMatchObject({ score: 0.95, weight: 0.65 });
  });
  it('explains folder identity through identical contents and relative paths', () => {
    const result = sourceMoveSimilarity({ oldPath: 'old', newPath: 'new', exact: true, previous: snapshot, current: snapshot, folder: true });
    expect(result.score).toBe(1);
    expect(result.criteria.find(item => item.id === 'folderContents')).toMatchObject({ score: 1, weight: 1 });
    expect(result.criteria.find(item => item.id === 'contents')).toMatchObject({ score: null, weight: 0 });
  });
});
