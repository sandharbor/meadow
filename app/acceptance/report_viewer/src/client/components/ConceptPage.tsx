/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import DocumentText, { documentUrl } from './DocumentText';
import DocumentScenarios from './DocumentScenarios';
import DocumentAreas from './DocumentAreas';
import type { DocumentSection, DocumentBacklink, DocumentKind, DocumentText as Text } from '../../../../../concepts/index.js';
import type { BoundaryEntry } from '../../server/boundaryMap';
import { highlightTypeScriptLines } from './highlightTypeScript';
import type { ConceptImplementation } from '../../../../e2e/src/artifacts/conceptImplementations.js';
import type { AcceptanceConceptView, conceptImplementationNavigation, ParticipatesIn } from '../../../../../concepts/index.js';

type ConceptDetail = AcceptanceConceptView & {
  code?: BoundaryEntry; documentKind: DocumentKind; descriptionText: Text; sections: DocumentSection[]; areas: { id: string; name: string }[];
  backlinks: DocumentBacklink[]; provenance: string; capturedAt?: string; related: { id: string; name: string }[]; implementations: ConceptImplementation[];
};

export function ConceptDetails({ conceptId, selected = '', onNavigate, showTitle = true, runId, onDocumentKind }: {
  conceptId: string; selected?: string; onNavigate?: (id: string, implementation?: string) => void; showTitle?: boolean; runId?: string; onDocumentKind?: (kind: DocumentKind) => void;
}) {
  const [concept, setConcept] = useState<ConceptDetail | null>(null);
  const [implementation, setImplementation] = useState<(ConceptImplementation & { content: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const controller = new window.AbortController();
    setConcept(null); setError(null);
    void fetch(`/api/concepts/${encodeURIComponent(conceptId ?? '')}${runId ? `?run=${encodeURIComponent(runId)}` : ''}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('Could not load this concept.'); return response.json() as Promise<ConceptDetail>; })
      .then(value => { setConcept(value); onDocumentKind?.(value.documentKind); }).catch(error => { if (!controller.signal.aborted) setError(String(error)); });
    return () => controller.abort();
  }, [conceptId, runId, onDocumentKind]);
  useEffect(() => {
    const controller = new window.AbortController();
    setImplementation(null); setError(null);
    if (selected) void fetch(`/api/concepts/${encodeURIComponent(conceptId ?? '')}/implementation?${selected}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('This implementation location is no longer available.'); return response.json() as Promise<ConceptImplementation & { content: string }>; })
      .then(setImplementation).catch(error => { if (!controller.signal.aborted) setError(String(error)); });
    return () => controller.abort();
  }, [conceptId, selected]);
  useEffect(() => {
    if (!implementation || !sourceRef.current) return;
    const line = sourceRef.current.querySelector('[aria-current="location"]') as HTMLElement | null;
    if (line) sourceRef.current.scrollTop = line.offsetTop - sourceRef.current.clientHeight / 2;
    sourceRef.current.parentElement?.scrollIntoView({ block: 'nearest' });
  }, [implementation]);
  const conceptLink = (id: string, label: string, implementation = '') => <Link className="text-brand-600 underline" to={documentUrl(id, runId, implementation)}
    onClick={onNavigate ? event => { event.preventDefault(); onNavigate(id, implementation); } : undefined}>{label}</Link>;
  return <div className="text-sm text-neutral-800">
    {error && <p role="alert">{error}</p>}
    {!concept && !error && <p role="status">Loading concept…</p>}
    {concept && <>
      {showTitle && <h1 className="text-2xl font-semibold">{concept.name}</h1>}
      <div className="mt-2 text-xs text-neutral-500" aria-label="Document metadata">
        <span>{concept.documentKind === 'concept' ? (concept.kind ?? 'concept').replaceAll('-', ' ') : concept.documentKind.replaceAll('-', ' ')}</span>
        <DocumentAreas areas={concept.kind === 'app-area' ? [{ id: concept.id, name: concept.name }] : concept.areas} runId={runId} onNavigate={onNavigate} />
      </div>
      {concept.provenance === 'current-fallback' && <p className="mt-2 text-xs text-amber-700">Current documentation · this older run has no captured document catalog.</p>}
      {concept.provenance === 'current-code' && <p className="mt-2 text-xs text-amber-700">Current checkout code · refreshed independently of this run’s captured documentation.</p>}
      {concept.provenance === 'captured' && <p className="mt-2 text-xs text-neutral-500">Documentation captured with this run.</p>}
      <p className="mt-3 max-w-4xl whitespace-pre-line"><DocumentText text={concept.descriptionText} runId={runId} onNavigate={onNavigate} /></p>
      {concept.sections.map(section => <section key={section.id} aria-label={section.heading} className="my-4 max-w-4xl">
        <h2 className="mb-2 font-semibold">{section.heading}</h2>
        {section.blocks.map((block, index) => block.kind === 'paragraph'
          ? <p key={index} className="whitespace-pre-line"><DocumentText text={block.text} runId={runId} onNavigate={onNavigate} /></p>
          : <ul key={index} className="list-disc space-y-2 pl-5">{block.items.map((item, itemIndex) => <li key={itemIndex}><DocumentText text={item} runId={runId} onNavigate={onNavigate} /></li>)}</ul>)}
      </section>)}
      {concept.code && <>
        <section aria-label="Declaration" className="my-4"><h2 className="mb-2 font-semibold">Declaration</h2>
          <pre className="max-h-80 overflow-auto rounded border bg-neutral-50 p-3 text-xs">{highlightTypeScriptLines(concept.code.declaration, concept.code.file).map((html, index) => <span key={index} className="block" dangerouslySetInnerHTML={{ __html: html || ' ' }} />)}</pre>
        </section>
        <section aria-label="Code consumers" className="my-4"><h2 className="mb-2 font-semibold">Current consumers ({concept.code.consumers.length})</h2>
          <p className="mb-2 text-xs text-neutral-500">Shared dependencies include indirect references through other shared declarations. Runtime values are declarations, not a trace of persisted data reads and writes.</p>
          {concept.code.consumers.length ? <ul className="space-y-1 text-xs">{concept.code.consumers.map(use => <li key={`${use.file}:${use.line}`}>{use.area} · {use.file}:{use.line}</li>)}</ul> : <p className="text-xs">No current consumers found; the public API remains available to its named caller.</p>}
        </section>
      </>}
      {runId && !concept.code && <DocumentScenarios runId={runId} documentId={concept.id} />}
      {concept.backlinks.length > 0 && <section aria-label="Referenced by" className="my-4 border-t pt-3">
        <h2 className="font-semibold">Referenced by</h2>
        <ul className="space-y-3">{concept.backlinks.map((link, index) => <li key={index}>
          {conceptLink(link.documentId, link.documentName)} <span className="text-xs text-neutral-500">· {link.heading}</span>
          <blockquote className="mt-1 border-l-2 pl-3 text-neutral-600"><DocumentText text={link.text} runId={runId} onNavigate={onNavigate} /></blockquote>
        </li>)}</ul>
      </section>}
      {concept.implementations.length ? <section aria-label="Implemented by" className="my-4 rounded border border-neutral-200 bg-white p-3">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">Implemented by <span className="text-xs font-normal text-neutral-500">Current code</span>
          <span tabIndex={0} aria-label="About implementation locations" title="Locations are derived from inline participation declarations in the current checkout."
            className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-neutral-400 text-xs font-normal text-neutral-500">?</span>
        </h2>
        <ul className="space-y-2">{concept.implementations.map(entry => {
          const query = new window.URLSearchParams({ file: entry.file, line: String(entry.line), role: entry.role });
          return <li className="break-words" key={`${entry.file}:${entry.line}:${entry.role}`}>{conceptLink(concept.id, `${entry.role} · ${entry.symbol} · ${entry.file}:${entry.line}`, query.toString())}</li>;
        })}</ul>
      </section> : !concept.code && <p className="my-3 text-xs text-neutral-500">No implementation declared.</p>}
      {implementation && <section aria-label="Implementation source" className="my-5">
        <h2 className="font-semibold">{implementation.symbol}</h2>
        <p className="mb-3 text-sm">{implementation.file}:{implementation.line} · {implementation.role}</p>
        <pre ref={sourceRef} className="relative max-h-96 overflow-auto rounded border bg-white p-3 text-xs">{highlightTypeScriptLines(implementation.content, implementation.file).map((lineHtml, index) => <span id={`implementation-line-${index + 1}`} key={index}
          aria-current={index + 1 === implementation.line ? 'location' : undefined} className={`block ${index + 1 === implementation.line ? 'bg-amber-100 font-semibold' : ''}`}><span className="mr-4 inline-block w-8 select-none text-right text-neutral-400">{index + 1}</span><span dangerouslySetInnerHTML={{ __html: lineHtml || ' ' }} /></span>)}</pre>
      </section>}
      <nav aria-label="Related concepts" className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t pt-4">{concept.related.map(related => <span key={related.id}>{conceptLink(related.id, related.name)}</span>)}</nav>
    </>}
  </div>;
}

export default function ConceptPage() {
  const { conceptId } = useParams();
  const [parameters] = useSearchParams();
  return <main className="h-full overflow-auto p-6"><ConceptDetails conceptId={conceptId ?? ''} runId={parameters.get('run') ?? undefined} selected={new window.URLSearchParams([...parameters].filter(([key]) => key !== 'run')).toString()} /></main>;
}

export type ConceptNavigationMeadowConceptParticipations = [
  ParticipatesIn<typeof conceptImplementationNavigation, 'render-navigation', typeof ConceptPage>,
];
