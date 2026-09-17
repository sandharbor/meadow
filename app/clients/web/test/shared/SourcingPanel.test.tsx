/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourcingPanel } from '../../src/areas/bundle/sourcing/components/SourcingPanel.js';
import { apiRequest } from '../../src/shared/utils/apiClient.js';
import type { SourcingReview } from '../../../../contracts/types/sourcing.js';
import type { SerializableBundleNode } from '../../../../contracts/types/IBundleNode.js';

vi.mock('../../src/shared/utils/apiClient.js', () => ({ apiRequest: vi.fn() }));

const review: SourcingReview = {
  accepted: { id: 'a'.repeat(32), capturedAt: '2026-09-07T12:00:00Z', fileCount: 1 },
  moves: [], changes: [], orphans: [], history: [], reviewToken: 'unchanged',
};
function deferredResponse() {
  let resolve!: (response: Awaited<ReturnType<typeof apiRequest>>) => void;
  const promise = new Promise<Awaited<ReturnType<typeof apiRequest>>>(done => { resolve = done; });
  return { promise, resolve };
}
const response = (value: unknown, status = 200) => new globalThis.Response(JSON.stringify(value), { status });
const panel = (slug = 'example') => <StrictMode><SourcingPanel bundleSlug={slug} hasDraftChanges={false} onAccepted={() => {}} /></StrictMode>;

afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

describe('source checks during development effect replay', () => {
  it('sends one initial scan, delivers its result to the active effect, and allows another check', async () => {
    vi.useFakeTimers();
    const pending = deferredResponse();
    vi.mocked(apiRequest).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response(review));
    render(panel());
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Refreshing sources')).toBeInTheDocument();
    await act(async () => { pending.resolve(response(review)); });
    expect(screen.getByText('No changes')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh sources' })); });
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(screen.getByText('No changes')).toBeInTheDocument();
  });

  it('lets a failed initial scan be retried', async () => {
    const pending = deferredResponse();
    vi.mocked(apiRequest).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response(review));
    render(panel());
    await act(async () => { pending.resolve(response({ error: 'Runtime Supervisor could not protect this operation.' }, 503)); });
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Runtime Supervisor could not protect this operation.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh sources' })); });
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('No changes')).toBeInTheDocument();
  });

  it('does not reuse another bundle’s pending scan or display its late result', async () => {
    const first = deferredResponse();
    const second = deferredResponse();
    vi.mocked(apiRequest).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(panel('first'));
    view.rerender(panel('second'));
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(vi.mocked(apiRequest).mock.calls.map(([url]) => url)).toEqual(['bundles/first/sourcing/scan', 'bundles/second/sourcing/scan']);
    await act(async () => { second.resolve(response({ ...review, candidate: { ...review.accepted, id: 'b'.repeat(32) }, changes: [{ kind: 'added', path: 'New page.md' }] })); });
    await act(async () => { first.resolve(response(review)); });
    expect(screen.getByRole('button', { name: '1 source change available – Review' })).toBeInTheDocument();
    expect(screen.queryByText('No changes')).not.toBeInTheDocument();
  });
});


describe('tracking source additions', () => {
  it.each([true, false])('restores the bundle preference %s and submits the changed value with acceptance', async savedPreference => {
    const pending = deferredResponse();
    vi.mocked(apiRequest).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response(review));
    render(panel());
    await act(async () => { pending.resolve(response({ ...review, trackNewPages: savedPreference,
      candidate: { ...review.accepted, id: 'b'.repeat(32) }, changes: [{ kind: 'added', path: 'New page.md' }] })); });
    fireEvent.click(screen.getByRole('button', { name: '1 source change available – Review' }));
    const checkbox = screen.getByRole('checkbox', { name: 'Track added pages' });
    expect(checkbox).toHaveProperty('checked', savedPreference);
    fireEvent.click(checkbox);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accept source changes' })); });
    const [url, options] = vi.mocked(apiRequest).mock.calls.at(-1)!;
    expect(url).toBe('bundles/example/sourcing/accept');
    expect(JSON.parse(options!.body as string).trackNewPages).toBe(!savedPreference);
  });
});

describe('source traversal details', () => {
  it('shows candidate directions, budgets, and added steps along the path, then closes back to review', async () => {
    // Given the accepted graph has different budgets for a shared path node.
    const paths = ['Start.md', 'Bridge.md', 'Incoming.md'];
    const nodes: SerializableBundleNode[] = paths.map((key, index) => ({
      bundleNodeKey: key as SerializableBundleNode['bundleNodeKey'], bundleNodeKind: 'file',
      bundleNodeName: key.slice(0, -3), sourceGraphSubdirectory: '', fileType: 'md', label: key,
      depth: index, remaining_depth: 3 - index, remaining_inlinks_depth: 2 - index,
      path: index === 1 ? ['Alternate start.md', key] : paths.slice(0, index + 1), traversal_details: {
        link_type: index === 0 ? 'start' : index === 1 ? 'outlink' : 'inlink',
        ...(index === 1 && { outlinks_depth_inherited: 2, outlinks_depth_overridden: 3 }),
      },
    }));
    const pending: SourcingReview = { ...review, reviewToken: 'candidate-traversal',
      candidate: { ...review.accepted, id: 'b'.repeat(32) },
      changes: [{ kind: 'added', path: 'Bridge.md', route: paths.slice(0, 2) }, { kind: 'added', path: 'Incoming.md', route: paths }],
      traversalGraphs: {
        accepted: { snapshotId: review.accepted.id, nodes: nodes.slice(0, 1).map(node => ({ ...node, remaining_depth: 99 })), edges: [] },
        candidate: { snapshotId: 'b'.repeat(32), nodes, edges: [
          { source: 'Start.md', target: 'Bridge.md', bundleEdgeKind: 'semanticLink' },
          { source: 'Incoming.md', target: 'Bridge.md', bundleEdgeKind: 'semanticLink' },
        ] },
      },
    };
    vi.mocked(apiRequest).mockResolvedValueOnce(response(pending)).mockResolvedValueOnce(response({ before: null, after: '[[Bridge]]', binary: false }));
    render(panel());
    fireEvent.click(await screen.findByRole('button', { name: '2 source changes available – Review' }));
    fireEvent.click(screen.getByLabelText('Details Incoming.md'));
    const details = await screen.findByRole('button', { name: 'Traversal details for Incoming.md' });
    expect(within(details.parentElement!).getByRole('img', { name: 'outlink' })).toHaveTextContent('→');
    expect(within(details.parentElement!).getByRole('img', { name: 'inlink' })).toHaveTextContent('←');

    // When the candidate's details are opened, the shared modal uses that same snapshot.
    fireEvent.click(details);
    const modal = screen.getByRole('dialog', { name: 'Traversal Path' });
    expect(within(modal).getByText('↓ outlink')).toBeInTheDocument();
    expect(within(modal).getByText('↑ inlink')).toBeInTheDocument();
    expect(within(modal).getByText(/depth values below come from this page’s separately recorded route/)).toBeInTheDocument();
    expect(within(modal).queryByText('99')).not.toBeInTheDocument();
    // Both the earlier addition and the selected addition are marked; existing steps stay unmarked.
    for (const title of ['Bridge', 'Incoming']) {
      const header = within(modal).getByRole('heading', { name: title }).parentElement!;
      expect(within(header).getByText('Added')).toBeInTheDocument();
      expect(within(header).getByRole('button', { name: 'About added pages' })).toHaveAccessibleDescription('This page is newly included in the candidate snapshot.');
    }
    expect(within(within(modal).getByRole('heading', { name: 'Start' }).parentElement!).queryByText('Added')).not.toBeInTheDocument();
    const override = within(modal).getByText('override').parentElement!;
    expect(within(override).getByText('2')).not.toHaveClass('line-through');
    expect(within(override).getByText('3')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Traversal Path' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Source changes' })).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledTimes(2); // Inspecting traversal neither accepts nor rescans.
  });
});
