/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import type { areaBoundaryMap, ParticipatesIn } from '../../../../../concepts/index.js';
import { useState } from 'react';
import type { BoundaryMap as MapData, BoundaryEntry } from '../../server/boundaryMap';
import { boundaryAreaOrder, compareBoundaryAreas } from '../boundaryAreaOrder';

const areas = boundaryAreaOrder.map(id => {
  const name = id.slice('bundle/'.length);
  return { id, name: name[0].toUpperCase() + name.slice(1) };
});
const groups = [{ id: 'api', name: 'Public APIs' }, { id: 'type', name: 'Shared types' },
  { id: 'documents', name: 'Shared data and artifacts' }, { id: 'data', name: 'Shared runtime values' }, { id: 'shared', name: 'Shared capabilities' }];
type DataDocument = { id: string; name: string; kind?: string; appAreaIds?: readonly string[]; description: string };
export default function BoundaryMap({ documents, openDocument }: { documents: DataDocument[]; openDocument: (document: { id: string; name: string }) => void }) {
  const [map, setMap] = useState<MapData | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const load = () => {
    setLoading(true); setError('');
    void fetch('/api/boundaries').then(async response => { if (!response.ok) throw new Error('Could not read area boundaries.'); return response.json() as Promise<MapData>; })
      .then(setMap).catch(error => setError(String(error))).finally(() => setLoading(false));
  };
  const dataEntries: BoundaryEntry[] = documents.filter(doc => ['entity', 'artifact', 'state'].includes(doc.kind ?? '') && (doc.appAreaIds?.filter(id => areas.some(area => area.id === id)).length ?? 0) > 1)
    .map(doc => ({ ...doc, category: 'data', areaIds: [...(doc.appAreaIds ?? [])], participants: [...(doc.appAreaIds ?? [])], file: '', line: 0, declaration: '', explanation: doc.description, consumers: [] }));
  const query = search.trim().toLocaleLowerCase();
  const matching = (entry: BoundaryEntry) => [entry.name, entry.file, entry.explanation, ...entry.participants].join(' ').toLocaleLowerCase().includes(query);
  return <details className="mb-3 rounded border border-neutral-200 px-3 py-2 text-sm" onToggle={event => { if (event.currentTarget.open && !map && !loading) load(); }}>
    <summary className="cursor-pointer font-medium">Area boundaries</summary>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <input aria-label="Search area boundaries" type="search" placeholder="Find an API, type, or data…" className="rounded border px-2 py-1 text-xs" value={search} onChange={event => setSearch(event.target.value)} />
      <span className="text-xs text-neutral-500">Current checkout · {map?.scannedFiles ?? '…'} source files</span>
      <button className="text-xs text-brand-600 underline disabled:opacity-50" disabled={loading} onClick={load}>Refresh boundaries</button>
    </div>
    <p className="my-2 text-xs text-neutral-500">API lanes identify the providing area and permitted caller. Shared code lanes show resolved use, including shared declaration dependencies. Dots mark participating areas; gaps are not participants. Bundles and App Shell appear in item labels.</p>
    {loading && <p role="status">Reading code boundaries…</p>}{error && <p role="alert">{error}</p>}
    {map && <div className="overflow-x-auto" role="region" aria-label="Area boundary swim lanes">
      <div className="min-w-[760px]">
        <div className="sticky top-0 grid grid-cols-5 border-b bg-neutral-50 text-center text-xs font-semibold">{areas.map(area => <div key={area.id} className="border-l px-2 py-2">{area.name}</div>)}</div>
        {groups.map(group => {
          const entries = (group.id === 'documents' ? dataEntries : map.entries.filter(entry => entry.category === group.id)).filter(matching).sort(compareBoundaryAreas);
          return <details key={group.id} open={!!query || group.id === 'documents'} className="mt-2" aria-label={group.name}>
            <summary className="cursor-pointer py-1 text-xs font-semibold">{group.name} ({entries.length})</summary>
            {!entries.length && <p className="py-2 text-xs text-neutral-500">No matching cross-area entries.</p>}
            {entries.map(entry => {
              const indexes = areas.map((area, index) => entry.areaIds.includes(area.id) ? index : -1).filter(index => index >= 0);
              if (!indexes.length) return null;
              const start = Math.min(...indexes), end = Math.max(...indexes);
              const outside = entry.participants.filter(id => !areas.some(area => area.id === id) && id !== 'bundle/shared-sourcing-curation');
              return <div key={entry.id} className="relative grid grid-cols-5 border-b border-neutral-100 py-1" data-boundary-id={entry.id}>
                {areas.map(area => <div key={area.id} className="pointer-events-none absolute inset-y-0 border-l border-neutral-100" style={{ left: `${areas.indexOf(area) * 20}%` }} />)}
                <button style={{ gridColumn: `${start + 1} / ${end + 2}` }} onClick={() => openDocument(entry)} title={`${entry.name}\n${entry.file}\n${entry.participants.join(', ')}`}
                  className={`relative mx-1 rounded border px-2 py-1 text-left text-xs hover:brightness-95 ${group.id === 'api' ? 'border-blue-200 bg-blue-50' : group.id === 'type' ? 'border-violet-200 bg-violet-50' : 'border-emerald-200 bg-emerald-50'}`}>
                  <span className="block break-all font-medium">{entry.name}</span>
                  <span className="block truncate text-[10px] text-neutral-500">{entry.file || 'Documented data'}{outside.length ? ` · ${outside.join(', ')}` : ''}</span>
                  <span className="mt-1 grid" style={{ gridTemplateColumns: `repeat(${end - start + 1}, minmax(0, 1fr))` }} aria-label={`Areas: ${entry.areaIds.join(', ')}`}>
                    {areas.slice(start, end + 1).map(area => <span key={area.id} className="text-center" aria-hidden="true">{entry.areaIds.includes(area.id) ? '●' : '·'}</span>)}
                  </span>
                </button>
              </div>;
            })}
          </details>;
        })}
      </div>
    </div>}
  </details>;
}

export type BoundaryMapViewMeadowConceptParticipations = [
  ParticipatesIn<typeof areaBoundaryMap, 'render-map', typeof BoundaryMap>,
];
