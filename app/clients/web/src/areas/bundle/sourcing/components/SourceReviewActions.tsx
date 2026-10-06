/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useId, useRef, useState } from 'react';

export function SourceReviewActions({ busy, ready, blocked, onExit, onRescan, onDiscard, onAccept }: {
  busy: boolean;
  ready: boolean;
  blocked: boolean;
  onExit: () => void;
  onRescan: () => void;
  onDiscard: () => void;
  onAccept: () => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const secondary = 'rounded border border-neutral-300 bg-white px-3 py-2 font-semibold hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 disabled:opacity-40';
  return <div className="ml-auto flex shrink-0 items-center gap-3">
    <button className={secondary} disabled={busy} onClick={onExit}>Exit review</button>
    <div ref={container} className="relative" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button ref={trigger} className={secondary} aria-label="More review actions" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        disabled={busy || !ready} onClick={() => setOpen(value => !value)} onKeyDown={event => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); }
        }}>
        <svg aria-hidden="true" width="20" height="24" viewBox="0 0 20 24" fill="currentColor"><circle cx="3" cy="12" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="17" cy="12" r="2" /></svg>
      </button>
      {open && <div ref={menu} id={menuId} role="menu" aria-label="Review actions" className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg" onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
          const current = items.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        }
      }}>
        <button role="menuitem" aria-label="Rescan sources" aria-describedby={`${menuId}-rescan`} disabled={busy || !ready}
          className="w-full rounded px-3 py-3 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none disabled:opacity-40" onClick={() => { close(); onRescan(); }}>
          <span className="block font-semibold">Rescan sources</span>
          <span id={`${menuId}-rescan`} className="mt-1 block text-sm text-neutral-600">Check the sources again and refresh this proposal</span>
        </button>
        <div role="separator" className="my-1 border-t border-neutral-200" />
        <button role="menuitem" aria-label="Discard proposal" aria-describedby={`${menuId}-discard`} disabled={busy || !ready}
          className="w-full rounded px-3 py-3 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none disabled:opacity-40" onClick={() => { close(); onDiscard(); }}>
          <span className="block font-semibold">Discard proposal</span>
          <span id={`${menuId}-discard`} className="mt-1 block text-sm text-neutral-600">Keep the bundle as it was</span>
        </button>
      </div>}
    </div>
    <button className="rounded bg-blue-700 px-3 py-2 font-semibold text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-40" disabled={busy || blocked} onClick={onAccept}>Accept changes</button>
  </div>;
}
