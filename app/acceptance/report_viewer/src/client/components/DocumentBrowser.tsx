/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { useState, type ReactNode } from 'react';
import type { DocumentSection, DocumentText } from '../../../../../concepts/documents';
import { renderConceptText } from '../../../../../concepts/types';

export interface BrowseDocument {
  semanticTitle?: DocumentText;
  id: string; name: string; description: string; documentKind?: string; kind?: string;
  appAreaIds?: readonly string[]; aliases?: readonly string[]; sections?: readonly DocumentSection[];
  subAreas?: readonly { areaId: string; order: number }[];
}
export default function DocumentBrowser({ documents, areas, pressures, openDocument }: {
  documents: BrowseDocument[]; areas: { id: string; name: string }[]; pressures: ReactNode;
  openDocument: (doc: { id: string; name: string }) => void;
}) {
  const [tab, setTab] = useState('areas');
  const [search, setSearch] = useState('');
  const query = search.trim().toLocaleLowerCase();
  const matching = documents.filter(doc => [doc.name, doc.description, ...(doc.semanticTitle ? [renderConceptText(doc.semanticTitle)] : []), ...(doc.aliases ?? []),
    ...(doc.sections ?? []).flatMap(section => [section.heading, ...section.blocks.flatMap(block => block.kind === 'paragraph' ? [renderConceptText(block.text)] : block.items.map(text => renderConceptText(text)))])]
    .join(' ').toLocaleLowerCase().includes(query));
  const item = (doc: BrowseDocument, areaId?: string) => <span key={doc.id} className="text-xs"><button className="text-brand-600 underline" onClick={() => openDocument(doc)}>{doc.name}</button>
    {doc.subAreas?.some(entry => entry.areaId === areaId) && <span className="ml-1 text-neutral-500">(workflow sub-area)</span>}</span>;
  return <details className="mb-3 rounded border border-neutral-200 px-3 py-2 text-sm">
    <summary className="cursor-pointer font-medium">Browse docs</summary>
    <div className="my-3 flex flex-wrap items-center gap-3">
      <div role="tablist" aria-label="Documentation sections" className="flex gap-1">{[['areas', 'App areas'], ['pressures', 'Design pressures'], ['all', 'All documents']].map(([id, name]) => <button key={id} role="tab" aria-selected={tab === id} className="rounded px-2 py-1 text-xs aria-selected:bg-brand-100 aria-selected:text-brand-700" onClick={() => setTab(id)}>{name}</button>)}</div>
      <input aria-label="Search documents" type="search" placeholder="Search documents…" className="rounded border px-2 py-1 text-xs" value={search} onChange={event => setSearch(event.target.value)} />
    </div>
    <div role="tabpanel" aria-label={query ? 'Document search results' : tab === 'areas' ? 'App areas' : tab === 'pressures' ? 'Design pressures' : 'All documents'}>
      {query ? <><p className="mb-2 text-xs text-neutral-500">{matching.length} matching documents</p><div className="flex flex-wrap gap-x-4 gap-y-2">{matching.map(doc => item(doc))}</div></>
        : tab === 'pressures' ? pressures
        : tab === 'all' ? <div className="flex flex-wrap gap-x-4 gap-y-2">{matching.map(doc => item(doc))}</div>
        : [...areas, { id: '', name: 'General and cross-cutting' }].map(area => <section key={area.id} className="mt-3" aria-label={`${area.name} documents`}>
          <h3 className="font-medium">{area.id ? <button className="text-brand-600 underline" onClick={() => openDocument(area)}>{area.name}</button> : area.name}</h3>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">{matching.filter(doc => doc.kind !== 'app-area' && (area.id ? doc.appAreaIds?.includes(area.id) : !doc.appAreaIds?.length || doc.appAreaIds.length > 1)).map(doc => item(doc, area.id))}</div>
        </section>)}
    </div>
  </details>;
}
