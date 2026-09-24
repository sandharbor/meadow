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
    expect(screen.queryByRole('button', { name: /Discard|Cancel source/ })).not.toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox', { name: 'Track non-sensitive added pages' });
    expect(checkbox).toHaveProperty('checked', savedPreference);
    fireEvent.click(checkbox);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accept source changes' })); });
    const [url, options] = vi.mocked(apiRequest).mock.calls.at(-1)!;
    expect(url).toBe('bundles/example/sourcing/accept');
    expect(JSON.parse(options!.body as string).trackNewPages).toBe(!savedPreference);
  });
});

describe('cancelling source settings', () => {
  it('does not offer settings cancellation for an unchanged registry with pending file edits', async () => {
    const sources = [{ id: 'notes', name: 'notes', directory: '/notes' }];
    vi.mocked(apiRequest).mockResolvedValueOnce(response({ ...review,
      candidate: { ...review.accepted, id: 'b'.repeat(32) }, changes: [{ kind: 'modified', path: 'Study.md' }],
      sourceChanges: { before: sources, after: sources, outputPathsChange: false, stale: false },
    }));
    render(<SourcingPanel bundleSlug="example" initialReview hasDraftChanges={false} onAccepted={() => {}} />);
    expect(await screen.findByRole('button', { name: 'Accept source changes' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Discard|Cancel source/ })).not.toBeInTheDocument();
  });

  it.each(['removal', 'location'])('explains cancellation of a source %s and closes after cancelling', async operation => {
    const before = [{ id: 'notes', name: 'notes', directory: '/notes' }, { id: 'reference', name: 'reference', directory: '/reference' }];
    const after = operation === 'removal' ? before.slice(0, 1) : [before[0], { ...before[1], directory: '/reference-relocated' }];
    vi.mocked(apiRequest).mockResolvedValueOnce(response({ ...review,
      candidate: { ...review.accepted, id: 'b'.repeat(32) }, changes: [{ kind: 'missing', path: 'Study.md' }],
      sourceChanges: { before, after, outputPathsChange: false, stale: false },
    })).mockResolvedValueOnce(response(review));
    render(<SourcingPanel bundleSlug="example" initialReview hasDraftChanges={false} onAccepted={() => {}} />);
    const button = await screen.findByRole('button', { name: operation === 'removal' ? 'Cancel source removal' : 'Cancel source settings changes' });
    expect(button).toHaveAccessibleDescription('Keep your current sources and included material. Your source files won’t be changed.');
    expect(screen.getByRole('button', { name: 'About cancelling source settings' })).toHaveAccessibleDescription('Keep your current sources and included material. Your source files won’t be changed.');
    await act(async () => { fireEvent.click(button); });
    expect(apiRequest).toHaveBeenLastCalledWith('bundles/example/sourcing/cancel', expect.objectContaining({ method: 'POST', body: '{}' }));
    expect(screen.queryByRole('dialog', { name: 'Source changes' })).not.toBeInTheDocument();
  });
});

describe('source traversal details', () => {
  it.each([true, false])('shows candidate route arrivals and added steps, with recorded steps available: %s', async withRouteSteps => {
    // Given Hub has a shorter independent arrival with no incoming budget.
    const paths = ['Start.md', 'Bridge.md', 'Hub.md', 'Incoming.md'];
    const routeSteps = paths.map((key, index) => ({
      bundleNodeKey: key, depth: index, remaining_depth: [3, 3, 2, 1][index],
      remaining_inlinks_depth: [1, 2, 1, 0][index],
      traversal_details: {
        link_type: index === 0 ? 'start' as const : index === 3 ? 'inlink' as const : 'outlink' as const,
        ...(index === 1 && { outlinks_depth_inherited: 2, outlinks_depth_overridden: 3,
          inlinks_depth_inherited: 0, inlinks_depth_overridden: 2 }),
      },
    }));
    const nodes: SerializableBundleNode[] = paths.map((key, index) => ({
      ...routeSteps[index],
      bundleNodeKey: key as SerializableBundleNode['bundleNodeKey'], bundleNodeKind: 'file',
      bundleNodeName: key.slice(0, -3), sourceGraphSubdirectory: '', fileType: 'md', label: key,
      path: paths.slice(0, index + 1),
      ...(index === 2 && { path: ['Start.md', key], depth: 1, remaining_inlinks_depth: 0 }),
      ...(withRouteSteps && index === 3 && { traversal_path_steps: routeSteps }),
    }));
    const pending: SourcingReview = { ...review, reviewToken: 'candidate-traversal',
      candidate: { ...review.accepted, id: 'b'.repeat(32) },
      changes: [{ kind: 'added', path: 'Bridge.md', route: paths.slice(0, 2) }, { kind: 'added', path: 'Incoming.md', route: paths }],
      traversalGraphs: {
        accepted: { snapshotId: review.accepted.id, nodes: nodes.slice(0, 1).map(node => ({ ...node, remaining_depth: 99 })), edges: [] },
        candidate: { snapshotId: 'b'.repeat(32), nodes, edges: [
          { source: 'Start.md', target: 'Bridge.md', bundleEdgeKind: 'semanticLink' },
          { source: 'Start.md', target: 'Hub.md', bundleEdgeKind: 'semanticLink' },
          { source: 'Bridge.md', target: 'Hub.md', bundleEdgeKind: 'semanticLink' },
          { source: 'Incoming.md', target: 'Hub.md', bundleEdgeKind: 'semanticLink' },
        ] },
      },
    };
    vi.mocked(apiRequest).mockResolvedValueOnce(response(pending)).mockResolvedValueOnce(response({ before: null, after: '[[Bridge]]', binary: false }));
    render(panel());
    fireEvent.click(await screen.findByRole('button', { name: '2 source changes available – Review' }));
    fireEvent.click(screen.getByLabelText('Details Incoming.md'));
    const details = await screen.findByRole('button', { name: 'Traversal details for Incoming.md' });
    expect(within(details.parentElement!).getAllByRole('img', { name: 'outlink' })[0]).toHaveTextContent('→');
    expect(within(details.parentElement!).getByRole('img', { name: 'inlink' })).toHaveTextContent('←');

    // When the candidate's details are opened, the shared modal uses that same snapshot.
    fireEvent.click(details);
    const modal = screen.getByRole('dialog', { name: 'Traversal Path' });
    expect(within(modal).getAllByText('↓ outlink')).toHaveLength(2);
    expect(within(modal).getByText('↑ inlink')).toBeInTheDocument();
    const hub = within(modal).getByRole('heading', { name: 'Hub' }).parentElement!.parentElement!;
    if (withRouteSteps) {
      expect(within(hub).getByText('depth 2')).toBeInTheDocument();
      const incomingBudget = within(hub).getByText('inlinks').parentElement!;
      expect(within(incomingBudget).getByText('remaining').parentElement).toHaveTextContent('remaining1');
      expect(within(modal).queryByText(/weren’t recorded/)).not.toBeInTheDocument();
    } else {
      expect(within(hub).getByText('Depth details weren’t recorded for this step of the path.')).toBeInTheDocument();
      expect(within(hub).queryByText('inlinks')).not.toBeInTheDocument();
      expect(within(hub).queryByText('depth 1')).not.toBeInTheDocument();
    }
    expect(within(modal).queryByText(/separately recorded route/)).not.toBeInTheDocument();
    expect(within(modal).queryByText('99')).not.toBeInTheDocument();
    // Both the earlier addition and the selected addition are marked; existing steps stay unmarked.
    for (const title of ['Bridge', 'Incoming']) {
      const header = within(modal).getByRole('heading', { name: title }).parentElement!;
      expect(within(header).getByText('Added')).toBeInTheDocument();
      expect(within(header).getByRole('button', { name: 'About added pages' })).toHaveAccessibleDescription('This page is newly included in the candidate snapshot.');
    }
    expect(within(within(modal).getByRole('heading', { name: 'Start' }).parentElement!).queryByText('Added')).not.toBeInTheDocument();
    const override = within(modal).getAllByText('override')[0].parentElement!;
    expect(within(override).getByText('2')).not.toHaveClass('line-through');
    expect(within(override).getByText('3')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Traversal Path' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Source changes' })).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledTimes(2); // Inspecting traversal neither accepts nor rescans.
  });
});
