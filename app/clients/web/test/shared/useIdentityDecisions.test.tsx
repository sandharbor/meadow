/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useIdentityDecisions } from '../../src/areas/bundle/sourcing/components/useIdentityDecisions.js';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('identity decision saves', () => {
  it('shows choices immediately and serializes rapid edits using the latest save callback', async () => {
    const first = deferred(), second = deferred();
    const save = vi.fn(() => first.promise), nextSave = vi.fn(() => second.promise);
    const report = vi.fn();
    const { result, rerender } = renderHook(({ confirmed, persist }) => useIdentityDecisions(confirmed, persist, report), {
      initialProps: { confirmed: {} as Record<string, string | null>, persist: save },
    });
    act(() => result.current.choose({ a: null }));
    expect(result.current.choices).toEqual({ a: null });
    expect(result.current.saving).toBe(true);
    act(() => { result.current.choose({ b: null }); result.current.choose({ a: 'a-new.md' }); });
    expect(result.current.choices).toEqual({ a: 'a-new.md', b: null });
    expect(save).toHaveBeenCalledTimes(1);
    rerender({ confirmed: { a: null }, persist: nextSave });
    await act(async () => first.resolve());
    expect(nextSave).toHaveBeenCalledExactlyOnceWith({ a: 'a-new.md', b: null });
    expect(result.current.choices).toEqual({ a: 'a-new.md', b: null });
    rerender({ confirmed: { a: 'a-new.md', b: null }, persist: nextSave });
    await act(async () => second.resolve());
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(result.current.choices).toEqual({ a: 'a-new.md', b: null });
    expect(report).not.toHaveBeenCalled();
  });

  it('rolls a failed write back to confirmed choices and reports the failure', async () => {
    const pending = deferred(), report = vi.fn();
    const { result } = renderHook(() => useIdentityDecisions({ a: 'a-new.md' }, () => pending.promise, report));
    act(() => result.current.choose({ a: null }));
    expect(result.current.choices.a).toBeNull();
    const error = new Error('The proposal changed.');
    await act(async () => pending.reject(error));
    expect(result.current.choices.a).toBe('a-new.md');
    expect(result.current.saving).toBe(false);
    expect(report).toHaveBeenCalledExactlyOnceWith(error);
  });

  it('keeps a newer decision queued when an earlier write fails', async () => {
    const first = deferred(), second = deferred();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ confirmed }) => useIdentityDecisions(confirmed, save, vi.fn()), {
      initialProps: { confirmed: {} as Record<string, string | null> },
    });
    act(() => result.current.choose({ a: null }));
    act(() => result.current.choose({ a: 'a-new.md' }));
    await act(async () => first.reject(new Error('Temporary failure.')));
    expect(save).toHaveBeenLastCalledWith({ a: 'a-new.md' });
    expect(result.current.choices.a).toBe('a-new.md');
    rerender({ confirmed: { a: 'a-new.md' } });
    await act(async () => second.resolve());
    expect(result.current.saving).toBe(false);
    expect(result.current.choices.a).toBe('a-new.md');
  });
});
