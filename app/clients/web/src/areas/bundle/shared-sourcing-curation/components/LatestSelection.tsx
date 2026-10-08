/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EncodedBundleNodeKey } from '../../../../../../../contracts/types/bundleNodeKey.js';

type Key = EncodedBundleNodeKey;

/**
 * Separates what the most recent selection action added from earlier selections.
 * Adding pages makes them the latest batch; replacing the selection starts fresh with no earlier group;
 * removing pages leaves the batches as they were. Bringing an already-selected page to the front, as
 * `select` does, makes it the latest batch.
 */
export function useLatestSelection(selected: Set<Key>, onChange: (keys: Set<Key>) => void) {
  const [latest, setLatest] = useState<Set<Key>>(new Set());
  const [earlierCollapsed, setEarlierCollapsed] = useState(false);
  const [flashing, setFlashing] = useState<Set<Key>>(new Set());
  const previous = useRef(selected);
  const chosen = useRef<Key | null>(null);
  const cards = useRef(new Map<Key, HTMLDivElement | null>());

  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = selected;
    if (before === selected) return;
    const added = [...selected].filter(key => !before.has(key));
    const removed = [...before].some(key => !selected.has(key));
    const first = [...selected][0];
    const pick = chosen.current ?? (!added.length && !removed && first !== [...before][0] ? first : null);
    chosen.current = null;
    const next = pick && selected.has(pick) ? new Set([pick]) : added.length && !removed ? new Set(added) : added.length ? new Set<Key>() : null;
    if (!next) {
      if (removed) setLatest(current => new Set([...current].filter(key => selected.has(key))));
      return;
    }
    setLatest(next);
    setEarlierCollapsed(false);
    const hasEarlier = [...selected].some(key => !next.has(key));
    setFlashing(hasEarlier ? next : new Set());
    if (hasEarlier) cards.current.get([...selected].find(key => next.has(key))!)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  useEffect(() => {
    if (!flashing.size) return;
    const timer = window.setTimeout(() => setFlashing(new Set()), 1200);
    return () => window.clearTimeout(timer);
  }, [flashing]);

  const isEarlier = (key: Key) => latest.size > 0 && !latest.has(key) && selected.has(key);
  const select = useCallback((key: Key) => {
    chosen.current = key;
    onChange(new Set([key, ...[...selected].filter(other => other !== key)]));
  }, [onChange, selected]);
  const cardRef = (key: Key) => (element: HTMLDivElement | null) => { cards.current.set(key, element); };

  return {
    select, isEarlier, cardRef, earlierCollapsed,
    earlierCount: [...selected].filter(isEarlier).length,
    isFlashing: (key: Key) => flashing.has(key),
    toggleEarlier: () => setEarlierCollapsed(collapsed => !collapsed),
  };
}

/** A quiet marker between the latest selection action and earlier selections. */
export function LatestSelectionDivider({ count, collapsed, onToggle }: { count: number; collapsed: boolean; onToggle: () => void }) {
  return <button type="button" onClick={onToggle} aria-expanded={!collapsed} data-testid="earlier-selection-divider"
    className="flex w-full items-center gap-1 bg-neutral-50 px-4 py-0.5 text-[11px] text-neutral-400 hover:text-neutral-600">
    <span>Earlier · {count}</span>
    <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className={collapsed ? '-rotate-90' : undefined}><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
  </button>;
}
