/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourcingPanel } from '../../src/areas/bundle/sourcing/components/SourcingPanel.js';
import { apiRequest } from '../../src/shared/utils/apiClient.js';
import type { SourcingReview } from '../../../../contracts/types/sourcing.js';

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
    const update = screen.getByRole('button', { name: 'Refresh sources' });
    await act(async () => { await vi.advanceTimersByTimeAsync(124); });
    expect(update).toBeDisabled();
    expect(within(update).getByRole('status')).toHaveTextContent('Refreshing sources');
    expect(update.querySelector('svg')).toHaveClass('motion-safe:animate-spin');
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(within(update).getByRole('status')).toHaveTextContent('No changes');
    await act(async () => { await vi.advanceTimersByTimeAsync(1999); });
    expect(update).toHaveTextContent('No changes');
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(update).toHaveTextContent('Refresh sources');
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
    expect(await screen.findByText('No changes')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

describe('refreshing pending source changes', () => {
  const pendingReview: SourcingReview = { ...review, reviewToken: 'pending',
    candidate: { ...review.accepted, id: 'b'.repeat(32) }, changes: [{ kind: 'added', path: 'New page.md' }],
  };

  it('keeps review available during a toolbar refresh and retries failures without losing the candidate', async () => {
    const refresh = deferredResponse();
    vi.mocked(apiRequest).mockResolvedValueOnce(response(pendingReview)).mockReturnValueOnce(refresh.promise)
      .mockResolvedValueOnce(response({ ...pendingReview, reviewToken: 'newer', changes: [...pendingReview.changes, { kind: 'modified', path: 'Existing.md' }] }));
    render(panel());
    const reviewButton = await screen.findByRole('button', { name: '1 source change available – Review' });
    const update = screen.getByRole('button', { name: 'Refresh sources' });
    expect(update).toHaveTextContent('');
    fireEvent.click(update);
    expect(update).toBeDisabled();
    expect(update.querySelector('svg')).toHaveClass('motion-safe:animate-spin');
    expect(reviewButton).toBeEnabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => { refresh.resolve(response({ error: 'Source folder unavailable' }, 503)); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Source folder unavailable');
    expect(reviewButton).toBeInTheDocument();
    expect(update).toBeEnabled();
    await waitFor(() => expect(update.querySelector('svg')).not.toHaveClass('motion-safe:animate-spin'));
    await act(async () => { fireEvent.click(update); });
    expect(await screen.findByRole('button', { name: '2 source changes available – Review' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(apiRequest).toHaveBeenLastCalledWith('bundles/example/sourcing/scan', expect.objectContaining({ body: JSON.stringify({ replaceCandidate: true }) }));
  });

  it('uses only the underline for automatic checks and lets a manual refresh join the running check', async () => {
    vi.useFakeTimers();
    const background = deferredResponse();
    vi.mocked(apiRequest).mockResolvedValueOnce(response(pendingReview)).mockReturnValueOnce(background.promise);
    render(panel());
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    const update = screen.getByRole('button', { name: 'Refresh sources' });
    expect(screen.getByTestId('source-background-progress')).toBeInTheDocument();
    expect(update.querySelector('svg')).not.toHaveClass('motion-safe:animate-spin');
    expect(update).toBeEnabled();
    fireEvent.click(update);
    expect(update.querySelector('svg')).toHaveClass('motion-safe:animate-spin');
    expect(update).toBeDisabled();
    expect(screen.queryByTestId('source-background-progress')).not.toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledTimes(2);
    await act(async () => { background.resolve(response(pendingReview)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(125); });
    expect(update).toBeEnabled();
    expect(update.querySelector('svg')).toHaveClass('motion-safe:animate-spin');
    expect(update.querySelector('svg')!.parentElement).toHaveClass('motion-safe:animate-[source-refresh-fade-out_125ms_ease-in_both]');
    await act(async () => { await vi.advanceTimersByTimeAsync(125); });
    expect(update.querySelector('svg')).not.toHaveClass('motion-safe:animate-spin');
    expect(update.querySelector('svg')!.parentElement).toHaveClass('motion-safe:animate-[source-refresh-fade-in_125ms_ease-out_both]');
    await act(async () => { await vi.advanceTimersByTimeAsync(125); });
    expect(update.querySelector('svg')!.parentElement).not.toHaveClass('motion-safe:animate-[source-refresh-fade-in_125ms_ease-out_both]');
  });
});
