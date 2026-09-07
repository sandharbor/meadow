/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useCallback, useEffect, useState } from 'react';
import type { SourceChangeStatus } from '../../../../../shared_code/shared_dev/sourceChangesTypes.js';

export function SourceChangesControl({ fixtureName, active }: { fixtureName: string; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [changes, setChanges] = useState<SourceChangeStatus[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const endpoint = `/api/config/fixtures/${encodeURIComponent(fixtureName)}/source-changes`;

  const load = useCallback(async () => {
    const response = await fetch(endpoint);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load source changes');
    setChanges(result.changes);
  }, [endpoint]);
  useEffect(() => {
    if (open) void load().catch(err => setError(err instanceof Error ? err.message : String(err)));
  }, [open, active, load]);

  const apply = async (change: SourceChangeStatus) => {
    setBusy(change.id); setError(null); setApplied(null);
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(change.id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceGraph: change.sourceGraph }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not apply source change');
      setApplied(`${change.label} applied. Meadow can now discover the source change.`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(null); }
  };

  return <div className="mt-3 border-t border-info-200 pt-3">
    <button className="w-full rounded border border-info-300 bg-white px-3 py-2 text-sm font-medium text-info-800 hover:bg-info-50" onClick={() => setOpen(value => !value)} aria-expanded={open}>Source changes {open ? '▴' : '▾'}</button>
    {open && <div className="mt-3 space-y-3" data-testid="source-changes-control">
      <p className="text-xs text-neutral-600">Apply changes while Meadow is running. Restart this fixture to restore its source and bundle state.</p>
      {!active && <p className="text-sm">Start this fixture to apply changes.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {applied && <p role="status" className="text-sm text-green-800">{applied}</p>}
      {changes.map(change => <article data-testid={`source-change-${change.id}`} key={`${change.sourceGraph}:${change.id}`} className="rounded border border-neutral-200 bg-white p-3">
        <div className="flex items-start gap-2"><h3 className="flex-1 text-sm font-semibold">{change.label}</h3>
          <button className="rounded bg-info-600 px-3 py-1 text-xs font-medium text-white disabled:bg-neutral-200 disabled:text-neutral-600" disabled={!active || busy !== null || change.state !== 'available'} onClick={() => void apply(change)}>{busy === change.id ? 'Applying…' : change.state === 'applied' ? 'Applied' : 'Apply'}</button>
        </div>
        <p className="mt-1 text-xs text-neutral-600">{change.description}</p>
        {change.reason && <p className="mt-2 text-xs text-amber-800">{change.reason}</p>}
        <details className="mt-2 text-xs"><summary className="cursor-pointer text-neutral-600">Files & operations</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(change.operations, null, 2)}</pre></details>
      </article>)}
    </div>}
  </div>;
}
