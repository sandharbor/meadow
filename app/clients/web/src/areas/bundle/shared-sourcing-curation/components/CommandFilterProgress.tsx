/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useState } from 'react';
import type { CommandFilterExecution } from '../../../../../../../contracts/types/shared/curation/customFilters.js';
import Modal from '../../../../shared/components/Modal.js';
import { useEditorOperations } from '../types/editorOperations.js';

export default function CommandFilterProgress({ filterId, evaluations }: { filterId: string; evaluations: CommandFilterExecution[] }) {
  const { request } = useEditorOperations();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sum = (key: 'total' | 'completed' | 'cached' | 'pending' | 'running' | 'failed') => evaluations.reduce((total, item) => total + item[key], 0);
  const total = sum('total'), completed = sum('completed'), failed = sum('failed');
  const paused = evaluations.some(item => item.paused);
  const incomplete = !evaluations.length || completed < total;
  const control = async (action: 'pause' | 'resume' | 'rerun') => {
    setBusy(true); setError('');
    try {
      const response = await request(`command-filters/${encodeURIComponent(filterId)}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) { const body = await response.json() as { error?: string }; throw new Error(body.error ?? 'Unable to change command execution.'); }
      window.dispatchEvent(new Event('command-filter-change'));
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };
  return <div className="ml-6 mb-2 text-xs text-gray-600 space-y-1" data-command-filter={filterId}>
    <progress aria-label="Command filter progress" className="w-full h-1.5" max={Math.max(1, total)} value={completed} />
    <div role="status">{paused ? 'Paused · ' : ''}{completed}/{total} completed · {sum('cached')} cached · {sum('pending')} pending · {sum('running')} running · {failed} failed</div>
    {incomplete && <p>Assessment incomplete. Unresolved nodes remain visible where they may match; tracking and generation require resolved sensitivity.</p>}
    <div className="flex gap-2">
      {incomplete && <button className="underline" disabled={busy} onClick={() => void control(paused ? 'resume' : 'pause')}>{paused ? 'Resume' : 'Pause'}</button>}
      <button className="underline" disabled={busy} onClick={() => void control('rerun')}>Rerun</button>
      {failed > 0 && <button className="text-red-700 underline" onClick={() => setOpen(true)}>Errors ({failed})</button>}
    </div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Command filter errors" className="w-4/5 max-w-3xl max-h-[85vh]" manageFocus>
      <div className="space-y-4 text-sm p-4">
        <p>Fix the external program, then rerun this filter. Failed batches have no matching decision.</p>
        {evaluations.map(evaluation => <div key={evaluation.selectorKey}>
          <pre className="whitespace-pre-wrap break-all">{JSON.stringify([evaluation.executable, ...evaluation.args])}</pre>
          {evaluation.diagnostics.map((diagnostic, index) => <div key={index} className="border rounded p-3 my-2">
            <p className="font-semibold">{diagnostic.message}</p>
            <p>Exit status: {diagnostic.exitCode ?? 'unavailable'}</p>
            <p className="break-all">Affected nodes: {diagnostic.nodeIds.join(', ')}</p>
            {diagnostic.stderr && <pre className="whitespace-pre-wrap break-all">stderr: {diagnostic.stderr}</pre>}
            {diagnostic.stdout && <pre className="whitespace-pre-wrap break-all">stdout: {diagnostic.stdout}</pre>}
          </div>)}
        </div>)}
        <button disabled={busy} className="px-3 py-1 rounded bg-blue-600 text-white" onClick={() => void control('rerun')}>Rerun filter</button>
      </div>
    </Modal>
  </div>;
}
