/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { describe, expect, it } from 'vitest';
import { pairGeneratedOutputs, type PairingEndpoint } from '../../../../src/areas/bundle/review/services/generatedOutputPairing.js';
import { ownedOutput } from '../../../shared/support/generationRecordTestUtils.js';

const endpoint = (files: Record<string, string>, owners: PairingEndpoint['owners'] = []): PairingEndpoint => ({
  files: new Map(Object.entries(files)),
  owners,
});

describe('generated output pairing', () => {
  it('pairs an accepted rename by recorded identity and reports the reused old path as a separate addition', () => {
    const left = endpoint({ 'A.html': 'a1' }, [ownedOutput('A.html', 'aaaaaaaaaaaa')]);
    const right = endpoint(
      { 'B.html': 'a1', 'A.html': 'z9' },
      [ownedOutput('B.html', 'aaaaaaaaaaaa'), ownedOutput('A.html', 'bbbbbbbbbbbb')],
    );
    expect(pairGeneratedOutputs(left, right)).toEqual([
      {
        entryId: 'added:A.html',
        kind: 'added',
        moved: false,
        modified: false,
        before: null,
        after: { path: 'A.html', objectId: 'z9' },
        owner: { bundleNodeId: 'bbbbbbbbbbbb', role: 'page' },
      },
      {
        entryId: 'owner:aaaaaaaaaaaa:page',
        kind: 'changed',
        moved: true,
        modified: false,
        before: { path: 'A.html', objectId: 'a1' },
        after: { path: 'B.html', objectId: 'a1' },
        owner: { bundleNodeId: 'aaaaaaaaaaaa', role: 'page' },
      },
    ]);
  });

  it('reports a move with generated content changes as one moved and modified entry', () => {
    const entries = pairGeneratedOutputs(
      endpoint({ 'notes/A.html': 'old' }, [ownedOutput('notes/A.html', 'aaaaaaaaaaaa')]),
      endpoint({ 'archive/A.html': 'new' }, [ownedOutput('archive/A.html', 'aaaaaaaaaaaa')]),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'changed', moved: true, modified: true });
  });

  it('keeps different identities apart even when their bytes match', () => {
    const entries = pairGeneratedOutputs(
      endpoint({ 'A.html': 'same' }, [ownedOutput('A.html', 'aaaaaaaaaaaa')]),
      endpoint({ 'B.html': 'same' }, [ownedOutput('B.html', 'bbbbbbbbbbbb')]),
    );
    expect(entries.map(entry => entry.entryId)).toEqual(['deleted:A.html', 'added:B.html']);
  });

  it('gives a deletion and an addition at the same path distinct entry IDs', () => {
    const entries = pairGeneratedOutputs(
      endpoint({ 'A.html': 'old' }, [ownedOutput('A.html', 'aaaaaaaaaaaa')]),
      endpoint({ 'A.html': 'new' }, [ownedOutput('A.html', 'bbbbbbbbbbbb')]),
    );
    expect(entries.map(entry => [entry.entryId, entry.kind])).toEqual([
      ['added:A.html', 'added'],
      ['deleted:A.html', 'deleted'],
    ]);
  });

  it('pairs each role of one owner separately', () => {
    const left = endpoint(
      { 'Old.html': 'p', 'Old.excalidraw.md': 'd' },
      [ownedOutput('Old.html', 'cccccccccccc'), ownedOutput('Old.excalidraw.md', 'cccccccccccc', 'drawing-data')],
    );
    const right = endpoint(
      { 'New.html': 'p2', 'New.excalidraw.md': 'd' },
      [ownedOutput('New.html', 'cccccccccccc'), ownedOutput('New.excalidraw.md', 'cccccccccccc', 'drawing-data')],
    );
    expect(pairGeneratedOutputs(left, right).map(entry => [entry.entryId, entry.moved, entry.modified])).toEqual([
      ['owner:cccccccccccc:drawing-data', true, false],
      ['owner:cccccccccccc:page', true, true],
    ]);
  });

  it('falls back to path and byte comparison without guessing moves when either side lacks identity', () => {
    const entries = pairGeneratedOutputs(
      endpoint({ 'A.html': 'a', 'shared.css': 'x' }, null),
      endpoint({ 'B.html': 'a', 'shared.css': 'y' }, [ownedOutput('B.html', 'aaaaaaaaaaaa')]),
    );
    expect(entries.map(entry => [entry.entryId, entry.kind])).toEqual([
      ['deleted:A.html', 'deleted'],
      ['added:B.html', 'added'],
      ['path:shared.css', 'changed'],
    ]);
  });

  it('omits unchanged files, including unowned support files', () => {
    expect(pairGeneratedOutputs(
      endpoint({ 'index.html': 'i', '_mw_assets/style.css': 's' }, [ownedOutput('index.html', 'aaaaaaaaaaaa')]),
      endpoint({ 'index.html': 'i', '_mw_assets/style.css': 's' }, [ownedOutput('index.html', 'aaaaaaaaaaaa')]),
    )).toEqual([]);
  });
});
