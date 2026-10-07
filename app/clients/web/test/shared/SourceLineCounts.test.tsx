/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SourceLineCounts, useSourceLineCounts } from '../../src/areas/bundle/shared-sourcing-curation/components/SourceLineCounts.js';
import { EditorOperationsContext } from '../../src/areas/bundle/shared-sourcing-curation/types/editorOperations.js';
import type { SourceNodeReview } from '../../../../contracts/types/sourcingProposal.js';
import { SourceComparisonEvidence } from '../../src/areas/bundle/shared-sourcing-curation/components/SourceComparisonEvidence.js';
import { Graph } from '../../../../contracts/types/graph.js';
import { SourceContentComparison } from '../../src/areas/bundle/shared-sourcing-curation/components/SourceContentComparison.js';

type ComparisonResponse = ReturnType<typeof globalThis.Response.json>;

const evidence: SourceNodeReview = { kind: 'modified', orphanedConfiguration: false, explanation: '', previousPath: 'page.md', proposedPath: 'page.md',
  previousRoute: [], proposedRoute: [], beforeSnapshotId: 'accepted', afterSnapshotId: 'reviewed' };
const response = (before: string | null, after: string | null, binary = false) => globalThis.Response.json({ before, after, binary });

function CountsForEvidence({ evidence }: { evidence: SourceNodeReview }) {
  const result = useSourceLineCounts(evidence);
  return <SourceLineCounts counts={result?.counts} removed={evidence.kind === 'departing'} />;
}

describe('captured source line counts', () => {
  it('counts replacements as removed and added lines from the reviewed snapshots', async () => {
    const request = vi.fn().mockResolvedValue(response('Keep\nBefore\nEnd', 'Keep\nAfter\nExtra\nEnd'));
    render(<EditorOperationsContext.Provider value={{ mode: 'sourcing', request }}><CountsForEvidence evidence={evidence} /></EditorOperationsContext.Provider>);
    expect(await screen.findByTestId('source-line-counts')).toHaveAttribute('aria-label', '2 added lines, 1 removed lines');
    expect(screen.getByText('+2')).toHaveClass('text-success-600');
    expect(screen.getByText('-1')).toHaveClass('text-danger-600');
    const query = new globalThis.URLSearchParams(request.mock.calls[0][0].split('?')[1]);
    expect(Object.fromEntries(query)).toEqual({ beforeId: 'accepted', afterId: 'reviewed', beforePath: 'page.md', afterPath: 'page.md' });
  });

  it.each([
    [null, 'One\nTwo', false, '+2', '-0'],
    ['One\nTwo', null, false, '+0', '-2'],
    ['Same', 'Same', false, '+0', '-0'],
    [null, null, true, null, null],
    ['Before', '[File is too large for the inline comparison]', false, null, null],
  ] as const)('handles addition, removal, rename, and unavailable text without inventing counts', async (before, after, binary, added, removed) => {
    const request = vi.fn().mockResolvedValue(response(before, after, binary));
    await act(async () => { render(<EditorOperationsContext.Provider value={{ mode: 'sourcing', request }}><CountsForEvidence evidence={evidence} /></EditorOperationsContext.Provider>); });
    if (added) {
      expect(screen.getByText(added)).toBeInTheDocument();
      expect(screen.getByText(removed!)).toBeInTheDocument();
    } else expect(screen.queryByTestId('source-line-counts')).not.toBeInTheDocument();
  });

  it('ignores a late response for the prior capture when the reviewed capture changes', async () => {
    let resolveOld!: (value: ComparisonResponse) => void;
    const request = vi.fn().mockImplementationOnce(() => new Promise<ComparisonResponse>(resolve => { resolveOld = resolve; }))
      .mockResolvedValue(response('Before', 'Next\nExtra'));
    const content = (afterSnapshotId: string) => <EditorOperationsContext.Provider value={{ mode: 'sourcing', request }}><CountsForEvidence evidence={{ ...evidence, afterSnapshotId }} /></EditorOperationsContext.Provider>;
    const { rerender } = render(content('reviewed'));
    rerender(content('refreshed'));
    expect(await screen.findByText('+2')).toBeInTheDocument();
    await act(async () => { resolveOld(response('Before', 'Old')); });
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.queryByText('+1')).not.toBeInTheDocument();
  });

  it('counts the entire previous page on removal even when the newer capture still contains its bytes', async () => {
    const request = vi.fn().mockResolvedValue(response('One\nTwo', 'One\nTwo'));
    const onCompare = vi.fn();
    render(<EditorOperationsContext.Provider value={{ mode: 'sourcing', request }}>
      <SourceComparisonEvidence evidence={{ ...evidence, kind: 'departing', proposedPath: undefined, removalReason: 'unreachable', orphanedConfiguration: true }} graph={new Graph()} onCompare={onCompare} />
    </EditorOperationsContext.Provider>);
    expect(await screen.findByTestId('source-line-counts')).toHaveAttribute('aria-label', '2 removed lines');
    expect(screen.getByText('-2')).toBeInTheDocument();
    expect(screen.queryByText('+0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'See previous content' }));
    expect(onCompare).toHaveBeenCalledOnce();
    const disclosure = screen.getByText('Details').closest('details')!;
    expect(disclosure).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Details'));
    expect(disclosure).toHaveAttribute('open');
    expect(disclosure).toHaveTextContent('Not reachable');
    expect(disclosure).toHaveTextContent('Excluded by the proposed traversal, links, or blacklist boundaries.');
    expect(screen.queryByText(/Orphaned configuration|location and route/)).not.toBeInTheDocument();
  });

  it.each([null, '', ' \n\t'])('omits See previous content when the previous page has no content (%s)', async before => {
    const request = vi.fn().mockResolvedValue(response(before, null));
    await act(async () => { render(<EditorOperationsContext.Provider value={{ mode: 'sourcing', request }}>
      <SourceComparisonEvidence evidence={{ ...evidence, kind: 'departing' }} graph={new Graph()} onCompare={vi.fn()} />
    </EditorOperationsContext.Provider>); });
    expect(screen.queryByRole('button', { name: 'See previous content' })).not.toBeInTheDocument();
  });

  it('shows the accepted content alone for a removed page', async () => {
    const request = vi.fn().mockResolvedValue(response('Previous page content', 'Newer content outside the proposed scope'));
    render(<SourceContentComparison evidence={{ ...evidence, kind: 'departing', proposedPath: undefined }} request={request} onClose={vi.fn()} />);
    expect(await screen.findByRole('region', { name: 'Previous source content' })).toHaveTextContent('Previous page content');
    expect(screen.queryByText('Newer content outside the proposed scope')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('loads only the accepted image for a removed page even if the newer capture still has the image', async () => {
    const descriptors = ['createObjectURL', 'revokeObjectURL'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis.URL, name)] as const);
    const revoke = vi.fn();
    try {
      Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:previous-image') });
      Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: revoke });
      const request = vi.fn().mockResolvedValueOnce(globalThis.Response.json({ before: null, after: null, binary: true, beforeImage: true, afterImage: true }))
        .mockResolvedValueOnce(new globalThis.Response('captured image bytes'));
      const { unmount } = render(<SourceContentComparison evidence={{ ...evidence, kind: 'departing', previousPath: 'page.png', proposedPath: undefined }} request={request} onClose={vi.fn()} />);
      expect(await screen.findByRole('img', { name: 'before captured source' })).toHaveAttribute('src', 'blob:previous-image');
      expect(request).toHaveBeenCalledTimes(2);
      expect(request.mock.calls[1][0]).toBe('source-image?snapshotId=accepted&path=page.png');
      unmount();
      expect(revoke).toHaveBeenCalledWith('blob:previous-image');
    } finally {
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis.URL, name, descriptor);
        else Reflect.deleteProperty(globalThis.URL, name);
      }
    }
  });
});
