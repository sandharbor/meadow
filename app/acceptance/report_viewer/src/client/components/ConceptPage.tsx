/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { ConceptImplementation } from '../../../../e2e/src/artifacts/conceptImplementations.js';
import type { AcceptanceConceptView, conceptImplementationNavigation, ParticipatesIn } from '../../../../../concepts/index.js';

type ConceptDetail = AcceptanceConceptView & {
  mechanics: string[]; interplay: string; related: { id: string; name: string }[]; implementations: ConceptImplementation[];
};

export default function ConceptPage() {
  const { conceptId } = useParams();
  const [parameters] = useSearchParams();
  const [concept, setConcept] = useState<ConceptDetail | null>(null);
  const [implementation, setImplementation] = useState<(ConceptImplementation & { content: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = parameters.toString();
  useEffect(() => {
    const controller = new window.AbortController();
    setConcept(null); setError(null);
    void fetch(`/api/concepts/${encodeURIComponent(conceptId ?? '')}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('Could not load this concept.'); return response.json() as Promise<ConceptDetail>; })
      .then(setConcept).catch(error => { if (!controller.signal.aborted) setError(String(error)); });
    return () => controller.abort();
  }, [conceptId]);
  useEffect(() => {
    const controller = new window.AbortController();
    setImplementation(null);
    if (selected) void fetch(`/api/concepts/${encodeURIComponent(conceptId ?? '')}/implementation?${selected}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('This implementation location is no longer available.'); return response.json() as Promise<ConceptImplementation & { content: string }>; })
      .then(setImplementation).catch(error => { if (!controller.signal.aborted) setError(String(error)); });
    return () => controller.abort();
  }, [conceptId, selected]);
  useEffect(() => { if (implementation) document.getElementById(`implementation-line-${implementation.line}`)?.scrollIntoView({ block: 'center' }); }, [implementation]);
  return <main className="h-full overflow-auto p-6 text-neutral-800">
    {error && <p role="alert">{error}</p>}
    {concept && <>
      <h1 className="text-2xl font-semibold">{concept.name}</h1>
      <p className="mt-3 max-w-4xl whitespace-pre-line">{concept.description}</p>
      <ul className="my-4 max-w-4xl list-disc space-y-2 pl-5">{concept.mechanics.map((rule, index) => <li key={index}>{rule}</li>)}</ul>
      <p className="max-w-4xl">{concept.interplay}</p>
      <section aria-label="Implemented by" className="my-6 rounded border border-neutral-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Implemented by</h2>
        <p className="mb-3 text-sm text-neutral-500">Locations are derived from inline participation declarations in the current checkout.</p>
        {concept.implementations.length ? <ul className="space-y-2">{concept.implementations.map(entry => {
          const query = new window.URLSearchParams({ file: entry.file, line: String(entry.line), role: entry.role });
          return <li key={`${entry.file}:${entry.line}:${entry.role}`}><Link className="text-brand-600 underline" to={`/concepts/${encodeURIComponent(concept.id)}?${query}`}>
            {entry.role} · {entry.symbol} · {entry.file}:{entry.line}
          </Link></li>;
        })}</ul> : <p>No implementation participants declared.</p>}
      </section>
      {implementation && <section aria-label="Implementation source" className="my-5">
        <h2 className="font-semibold">{implementation.symbol}</h2>
        <p className="mb-3 text-sm">{implementation.file}:{implementation.line} · {implementation.role}</p>
        <pre className="overflow-auto rounded border bg-white p-3 text-xs">{implementation.content.split('\n').map((line, index) => <span id={`implementation-line-${index + 1}`} key={index}
          aria-current={index + 1 === implementation.line ? 'location' : undefined} className={`block ${index + 1 === implementation.line ? 'bg-amber-100 font-semibold' : ''}`}><span className="mr-4 inline-block w-8 select-none text-right text-neutral-400">{index + 1}</span>{line || ' '}</span>)}</pre>
      </section>}
      <nav aria-label="Related concepts" className="flex flex-wrap gap-3">{concept.related.map(related => <Link className="text-brand-600 underline" key={related.id} to={`/concepts/${encodeURIComponent(related.id)}`}>{related.name}</Link>)}</nav>
    </>}
  </main>;
}

export type ConceptNavigationMeadowConceptParticipations = [
  ParticipatesIn<typeof conceptImplementationNavigation, 'render-navigation', typeof ConceptPage>,
];
