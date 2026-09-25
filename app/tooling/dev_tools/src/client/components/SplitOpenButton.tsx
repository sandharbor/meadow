/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useId, useRef, useState } from 'react';
import type { ServiceTarget } from '../../shared/types';

export interface TargetAvailability {
  available: boolean;
  reason?: string;
}

const TARGET_LABELS: Record<ServiceTarget, string> = { local: 'Local', hosted: 'Hosted Development' };

/**
 * Open a saved state. The main click always uses the default target (Local
 * wherever Local can work); the arrow offers the other target, disabled with
 * its reason when it could not work. The main click never remembers a
 * previous choice.
 */
export function SplitOpenButton({ label, defaultTarget = 'local', targets, busy, disabled, onOpen, testId }: {
  label: string;
  defaultTarget?: ServiceTarget;
  targets: Record<ServiceTarget, TargetAvailability>;
  busy?: boolean;
  disabled?: boolean;
  onOpen: (target: ServiceTarget) => void;
  testId?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const container = useRef<globalThis.HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: globalThis.MouseEvent) => { if (!container.current?.contains(event.target as globalThis.Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);
  const primaryUnavailable = !targets[defaultTarget].available;
  const others = (Object.keys(TARGET_LABELS) as ServiceTarget[]).filter(target => target !== defaultTarget);
  return <div ref={container} className="relative flex" data-testid={testId}>
    <button
      type="button"
      aria-label={`Open ${label} with ${TARGET_LABELS[defaultTarget]}`}
      title={primaryUnavailable ? targets[defaultTarget].reason : undefined}
      disabled={disabled || busy || primaryUnavailable}
      onClick={() => onOpen(defaultTarget)}
      className="flex-1 rounded-l-lg bg-info-600 px-3 py-2 text-sm font-medium text-white hover:bg-info-700 disabled:bg-neutral-300"
    >
      {busy ? 'Working...' : label}
    </button>
    <button
      type="button"
      aria-label={`More ways to open ${label}`}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      aria-controls={menuId}
      disabled={disabled || busy}
      onClick={() => setMenuOpen(open => !open)}
      className="rounded-r-lg border-l border-info-400 bg-info-600 px-2 py-2 text-xs font-medium text-white hover:bg-info-700 disabled:bg-neutral-300"
    >
      ▾ {TARGET_LABELS[defaultTarget]}
    </button>
    {menuOpen && <div id={menuId} role="menu" className="absolute right-0 top-full z-20 mt-1 w-72 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
      {[defaultTarget, ...others].map(target => <button
        key={target}
        type="button"
        role="menuitem"
        disabled={!targets[target].available}
        onClick={() => { setMenuOpen(false); onOpen(target); }}
        className="block w-full px-3 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400 disabled:hover:bg-white"
      >
        <span className="font-medium">{TARGET_LABELS[target]}</span>
        {target === defaultTarget && <span className="ml-1 text-xs text-neutral-500">(default)</span>}
        {!targets[target].available && targets[target].reason && <span className="mt-0.5 block text-xs text-neutral-500">{targets[target].reason}</span>}
      </button>)}
    </div>}
  </div>;
}
