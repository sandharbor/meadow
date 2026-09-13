/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
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
