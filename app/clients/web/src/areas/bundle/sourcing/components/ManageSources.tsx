/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { StartingSelection } from '../../../../../../../contracts/types/startingSelection.js';
import { StartingSelectionsFields } from '../../../../shared/components/StartingSelectionsFields.js';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BundleSource } from '../../../../../../../contracts/types/bundleConfig.js';
import type { Graph } from '../../../../../../../contracts/types/graph.js';
import { sourceLocationLabel } from '../../../../../../../shared_code/utils/bundleSourceUtils.js';
import Modal from '../../../../shared/components/Modal.js';
import { apiRequest } from '../../../../shared/utils/apiClient.js';

interface SourceStatus { startingSelections: StartingSelection[]; sources: BundleSource[]; disconnectedIds: string[]; ignoredSourceNames: string[]; }

export function ManageSources({ bundleSlug, graph, isOpen, onClose, onOpen, onStaged, onChanged }: {
  bundleSlug: string; graph: Graph; isOpen: boolean; onClose: () => void; onOpen: () => void;
  onStaged: () => void; onChanged: () => void;
}) {
  const [status, setStatus] = useState<SourceStatus>();
  const [selections, setSelections] = useState<StartingSelection[]>([]);
  const [editingSelections, setEditingSelections] = useState(false);
  const [sources, setSources] = useState<BundleSource[]>([]);
  const [reviewReferences, setReviewReferences] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ignored, setIgnored] = useState(graph.ignoredSourceNames);
  useEffect(() => setIgnored(graph.ignoredSourceNames), [graph.ignoredSourceNames]);
  const references = useMemo(() => {
    const groups = new Map<string, Set<string>>();
    for (const diagnostic of graph.sourceDiagnostics) {
      if (diagnostic.code !== 'unregisteredSource') continue;
      const node = graph.getNode(diagnostic.path) ?? graph.getNode(`/${diagnostic.path}`);
      if (!node) continue;
      const source = graph.sources.find(source => source.id === node.sourceId);
      const relativePath = `${node.sourceGraphSubdirectory ? `${node.sourceGraphSubdirectory}/` : ''}${node.bundleNodeName}`;
      const label = source ? sourceLocationLabel(source.name, relativePath) : relativePath;
      const group = groups.get(diagnostic.requestedSource) ?? new Set<string>();
      group.add(label);
      groups.set(diagnostic.requestedSource, group);
    }
    return groups;
  }, [graph]);
  const notices = [...new Set(graph.sourceDiagnostics.filter(diagnostic => {
    const node = graph.getNode(diagnostic.path) ?? graph.getNode(`/${diagnostic.path}`);
    return diagnostic.code === 'unregisteredSource' && node && !node.isFrontierNode && !node.isFrontierImageExtension && !ignored.includes(diagnostic.requestedSource);
  }).map(diagnostic => diagnostic.requestedSource))];
  const open = isOpen || reviewReferences;
  const close = () => { if (!busy) { setReviewReferences(false); onClose(); } };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError('');
    void apiRequest(`bundles/${encodeURIComponent(bundleSlug)}/sourcing/sources`).then(async response => {
      const value = await response.json() as SourceStatus & { error?: string };
      if (!response.ok) throw new Error(value.error ?? 'Could not load sources');
      if (!cancelled) { setStatus(value); setSources(value.sources); setSelections(value.startingSelections); setEditingSelections(false); setIgnored(value.ignoredSourceNames); }
    }).catch(error => { if (!cancelled) setError(String(error)); });
    return () => { cancelled = true; };
  }, [open, bundleSlug]);

  const request = async (suffix: string, body: unknown) => {
    const response = await apiRequest(`bundles/${encodeURIComponent(bundleSlug)}/sourcing/${suffix}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? 'Source operation failed');
  };
  const stage = async () => {
    setBusy(true); setError('');
    try { await request('sources', { sources, ...(editingSelections && { startingSelections: selections }) }); setReviewReferences(false); onClose(); onStaged(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const acknowledge = async (name: string, value: boolean) => {
    setBusy(true); setError('');
    try { await request('ignore', { name, ignored: value }); setIgnored(previous => value ? [...previous, name] : previous.filter(item => item !== name)); onChanged(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const add = (name = '') => {
    setSources(previous => [...previous, { id: window.crypto.randomUUID().replace(/-/g, '').slice(0, 12), name, directory: '' }]);
    setReviewReferences(false); onOpen();
  };
  const browse = async (source: BundleSource) => {
    try {
      const result = await window.electronAPI?.showOpenDialog({ properties: ['openDirectory'], title: `Choose directory for ${source.name || 'source'}` });
      if (result && !result.canceled && result.filePaths[0]) update(source.id, 'directory', result.filePaths[0]);
    } catch (error) { setError(String(error)); }
  };
  const update = (id: string, field: 'name' | 'directory', value: string) => setSources(previous => previous.map(source => source.id === id ? { ...source, [field]: value } : source));
  const referenceNames = [...new Set([...references.keys(), ...ignored])].sort();

  return <>
    {notices.length > 0 && <div role="status" className="flex items-center justify-between gap-4 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm" data-testid="missing-source-callout">
      <span>Pages refer to sources that aren’t registered: {notices.join(', ')}.</span>
      <button className="shrink-0 rounded border border-amber-300 bg-white px-3 py-1 font-medium" onClick={() => setReviewReferences(true)}>Review sources</button>
    </div>}
    {open && createPortal(<Modal isOpen onClose={close} closeLabel="Close source management" title={reviewReferences ? 'Review sources' : 'Manage sources'} className="w-full max-w-3xl" footer={<div className="flex justify-end gap-3">
      <button disabled={busy} className="rounded border px-4 py-2" onClick={close}>Close</button>
      {!reviewReferences && <button disabled={busy || !sources.length} className="rounded bg-btn-confirm-normal px-4 py-2 text-btn-confirm-text disabled:opacity-50" onClick={() => void stage()}>{busy ? 'Discovering sources…' : 'Review source changes'}</button>}
    </div>}>
      <div className="space-y-5 text-sm text-neutral-700">
        <p>Sources belong to this bundle. Adding a source lets existing links reach it; starting selections stay the same.</p>
        {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
        {!reviewReferences && <>
          {sources.map(source => <fieldset key={source.id} disabled={busy} className="space-y-3 rounded border border-neutral-200 p-4" data-testid={`source-${source.id}`}>
            <div className="flex items-center justify-between gap-3"><label className="flex-1">Source name<input aria-label={`Source name ${source.name || 'new'}`} className="mt-1 block w-full rounded border px-3 py-2" value={source.name} onChange={event => update(source.id, 'name', event.target.value)} /></label>
              <button className="mt-5 text-red-700 underline" onClick={() => setSources(previous => previous.filter(item => item.id !== source.id))}>Remove source</button></div>
            <label className="block">Directory<input aria-label={`Directory for ${source.name || 'new source'}`} className="mt-1 block w-full rounded border px-3 py-2" placeholder="/path/to/source" value={source.directory} onChange={event => update(source.id, 'directory', event.target.value)} /></label>
            {window.electronAPI && <button className="text-main-700 underline" onClick={() => void browse(source)}>Choose directory…</button>}
            {status?.disconnectedIds.includes(source.id) && <p role="status" className="text-amber-800">Disconnected. Captured pages remain available. Reconnect this directory or choose its new location.</p>}
            {source.aliases?.length ? <p className="text-xs text-neutral-500">Aliases: {source.aliases.join(', ')}</p> : null}
          </fieldset>)}
          <button disabled={busy} className="rounded border px-3 py-2" onClick={() => add()}>Add source</button>
          {editingSelections ? <StartingSelectionsFields sources={sources} selections={selections} onChange={setSelections} disabled={busy} /> : <button disabled={busy} className="ml-3 rounded border px-3 py-2" onClick={() => setEditingSelections(true)}>Edit starting selections</button>}
          <p className="text-xs text-neutral-500">Renaming keeps the old name as an alias. Source files are untouched. Changes take effect after you accept the candidate snapshot.</p>
        </>}
        {referenceNames.length > 0 && <section aria-label="Source references" className="space-y-3">
          <h3 className="font-semibold">Source references</h3>
          {referenceNames.map(name => <div key={name} className="rounded border p-3" data-testid={`source-reference-${name}`}>
            <div className="flex flex-wrap items-center gap-3"><strong>{name}</strong>{ignored.includes(name) && <span className="text-xs text-neutral-500">Ignored for this bundle</span>}
              {!sources.some(source => source.name === name || source.aliases?.includes(name)) && <button disabled={busy} className="ml-auto text-main-700 underline" onClick={() => add(name)}>Add source</button>}
              <button disabled={busy} className="text-main-700 underline" onClick={() => void acknowledge(name, !ignored.includes(name))}>{ignored.includes(name) ? 'Reconsider' : 'Ignore for this bundle'}</button></div>
            <p className="mt-2 text-xs text-neutral-500">{[...(references.get(name) ?? [])].join(' · ') || 'Future references to this name are suppressed.'}</p>
          </div>)}
        </section>}
      </div>
    </Modal>, document.body)}
  </>;
}
