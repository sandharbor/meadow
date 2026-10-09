/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';

const pointerWidth = 16, pointerHeight = 9, gutter = 16;

/**
 * A panel that opens under one of the bar's chips, with a pointer up to that chip. It renders at the top of the
 * workspace so it stays above the editor and the bar while still below dialogs the panel itself opens. A modal
 * panel dims everything except the bar, and only its own controls dismiss it; otherwise `onDismiss` runs on a
 * click outside the panel and its chip, or on Escape.
 */
export function ChipPanel({ anchor, label, role = 'region', modal = false, appearDelay = 0, onDismiss, panelRef, className = '', children }: {
  /** Selector for the chip the panel belongs to. */
  anchor: string;
  label: string;
  role?: 'region' | 'dialog';
  modal?: boolean;
  /** Wait before appearing, such as for the chip to finish fading in. */
  appearDelay?: number;
  onDismiss?: () => void;
  panelRef?: Ref<HTMLElement>;
  className?: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number; pointer: number } | null>(null);
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      const chip = document.querySelector(anchor)?.getBoundingClientRect();
      // The chip may still be fading in; wait until it has a size.
      if (!chip?.width || !panel.current) { frame = window.requestAnimationFrame(measure); return; }
      const width = panel.current.offsetWidth, center = chip.left + chip.width / 2;
      const left = Math.max(gutter, Math.min(center - width / 2, window.innerWidth - width - gutter));
      setPlace({ left, top: chip.bottom + pointerHeight + 1, pointer: Math.max(gutter, Math.min(center - left, width - gutter)) });
    };
    const timer = window.setTimeout(measure, appearDelay);
    window.addEventListener('resize', measure);
    return () => { window.clearTimeout(timer); window.cancelAnimationFrame(frame); window.removeEventListener('resize', measure); };
  }, [anchor, appearDelay]);
  useEffect(() => {
    if (modal || !onDismiss) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (panel.current?.contains(target) || target.closest?.(`${anchor}, [role="dialog"]`)) return;
      onDismiss();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) onDismiss(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [anchor, modal, onDismiss]);
  const host = document.querySelector('[data-testid="sourcing-workspace"]') ?? document.body;
  const setRef = (element: HTMLElement | null) => {
    panel.current = element;
    if (typeof panelRef === 'function') panelRef(element);
    else if (panelRef) (panelRef as { current: HTMLElement | null }).current = element;
  };
  return createPortal(<>
    {modal && <div aria-hidden="true" data-testid="chip-panel-backdrop" className="source-chip-panel fixed inset-0 z-30 bg-neutral-900/30" />}
    <section ref={setRef} role={role === 'dialog' ? 'dialog' : undefined} aria-modal={modal || undefined} aria-label={label} data-chip-panel={anchor}
      style={{ left: place?.left ?? 0, top: place?.top ?? 0, visibility: place ? 'visible' : 'hidden' }}
      className={`${place ? "source-chip-panel" : ""} fixed z-[45] flex flex-col rounded-lg border border-neutral-200 bg-white text-sm shadow-xl ${className}`}>
      {place && <svg aria-hidden="true" width={pointerWidth} height={pointerHeight + 1} viewBox={`0 0 ${pointerWidth} ${pointerHeight + 1}`}
        className="absolute text-neutral-200" style={{ left: place.pointer - pointerWidth / 2, top: -pointerHeight }}>
        {/* The fill covers the panel's top border so the pointer reads as part of the panel. */}
        <path d={`M0 ${pointerHeight + 1} L${pointerWidth / 2} 0.5 L${pointerWidth} ${pointerHeight + 1} Z`} className="fill-white" />
        <path d={`M0.5 ${pointerHeight} L${pointerWidth / 2} 0.5 L${pointerWidth - 0.5} ${pointerHeight}`} fill="none" stroke="currentColor" strokeLinejoin="round" />
      </svg>}
      {children}
    </section>
  </>, host);
}
