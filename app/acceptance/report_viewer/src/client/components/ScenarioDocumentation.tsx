/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useRef, useState } from 'react';
import type { ScenarioSection } from '../../../../../concepts/acceptance.js';
import type { ScenarioDocumentation as Walkthrough } from '../../scenarioDocumentation.ts';
import { ScenarioText } from './ScenarioText.tsx';
import { CheckpointOpenControl } from './CheckpointOpenControl.tsx';

const DEFAULT_OPTIONS = { sections: true, steps: false, checkpoints: true, screenshots: true, video: true, metadata: true };
export type DocumentationOptions = typeof DEFAULT_OPTIONS;
const OPTION_LABELS: Record<keyof DocumentationOptions, string> = {
  sections: 'Sections', steps: 'Steps', checkpoints: 'Checkpoints', screenshots: 'Screenshots', video: 'Video', metadata: 'Related links',
};
const STORAGE_KEY = 'e2e-report-viewer.docs-options';

export function useDocumentationOptions() {
  const [options, setOptions] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
      return Object.fromEntries(Object.entries(DEFAULT_OPTIONS).map(([key, value]) => [key,
        typeof saved?.[key] === 'boolean' ? saved[key] : value])) as DocumentationOptions;
    } catch { return DEFAULT_OPTIONS; }
  });
  const change = (key: keyof DocumentationOptions, checked: boolean) => {
    const next = { ...options, [key]: checked };
    setOptions(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { /* The view remains usable without storage. */ }
  };
  return { options, change };
}

export function DocumentationControls({ options, change }: ReturnType<typeof useDocumentationOptions>) {
  return <fieldset className="mb-4 flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-neutral-200 bg-white px-4 pb-3 pt-2">
    <legend className="px-1 text-xs font-semibold text-neutral-500">Show in Docs</legend>
    {(Object.keys(OPTION_LABELS) as (keyof DocumentationOptions)[]).map(key => <label key={key} className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-700">
      <input type="checkbox" checked={options[key]} onChange={event => change(key, event.target.checked)} />{OPTION_LABELS[key]}
    </label>)}
  </fieldset>;
}

/** Load nearby walkthroughs as the reader scrolls, including on large saved runs. */
export function ScenarioDocumentation({ runId, scenario, sections, options, documentNames }: {
  runId: string; scenario: string; sections?: ScenarioSection[]; options: DocumentationOptions; documentNames: Record<string, string>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState(false);
  const [walkthrough, setWalkthrough] = useState<Walkthrough | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const needsWalkthrough = options.sections || options.steps || options.checkpoints || options.screenshots;
  useEffect(() => {
    const observer = new window.IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setNearby(true); observer.disconnect(); }
    }, { rootMargin: '600px' });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!nearby || !needsWalkthrough) return;
    const controller = new window.AbortController();
    setError('');
    fetch(`/api/${encodeURIComponent(runId)}/${encodeURIComponent(scenario)}/documentation`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 404 ? 'No walkthrough captured in this run.' : 'Could not load the walkthrough.');
        return response.json() as Promise<Walkthrough>;
      }).then(setWalkthrough).catch(error => { if (!controller.signal.aborted) setError(String(error.message ?? error)); });
    return () => controller.abort();
  }, [runId, scenario, nearby, needsWalkthrough, attempt]);

  const events = walkthrough?.events ?? (sections ?? []).map(section => ({ kind: 'section' as const, section }));
  let sectionNumber = 0;
  let stepNumber = 0;
  return <div ref={container} aria-label="Scenario walkthrough" className="mt-4 space-y-3 [overflow-wrap:anywhere]">
    {needsWalkthrough && !walkthrough && !error && <p className="text-xs text-neutral-400" role="status">Loading walkthrough…</p>}
    {needsWalkthrough && error && <p className="text-xs text-neutral-500" role="status">{error} <button className="text-brand-600 underline" onClick={() => setAttempt(value => value + 1)}>Retry</button></p>}
    {needsWalkthrough && walkthrough?.events.length === 0 && <p className="text-xs italic text-neutral-400">No walkthrough captured in this run.</p>}
    {events.map((event, index) => {
      if (event.kind === 'section') {
        const label = event.section.type === 'setup' ? 'Setup' : `Section ${++sectionNumber}`;
        stepNumber = 0;
        return options.sections && <div key={index} className="border-t border-neutral-100 pt-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{label}</div>
          <h3 className="whitespace-pre-line font-medium leading-relaxed text-neutral-800"><ScenarioText text="" linkedText={event.section.text} runId={runId} /></h3>
        </div>;
      }
      if (event.kind === 'step') return options.steps && <div key={index} className="flex gap-2 text-xs text-neutral-500" aria-label="Recorded step">
        <span className="shrink-0 tabular-nums">{++stepNumber}.</span>
        <span className={`min-w-0 whitespace-pre-wrap font-mono ${event.status === 'failed' ? 'text-red-700' : ''}`}>{event.text}</span>
      </div>;
      if (event.kind === 'checkpoint') return options.checkpoints && <div key={index} className="rounded border border-amber-100 bg-amber-50/50 px-3 py-2" aria-label={`Checkpoint ${event.index}`}>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Checkpoint {event.index}</div>
        <p className="mb-2 text-xs leading-relaxed text-neutral-700">{event.message}</p>
        <CheckpointOpenControl runId={runId} scenario={scenario} index={event.index} />
      </div>;
      if (event.kind === 'screenshot') {
        const name = documentNames[event.docId] ?? event.docId;
        const url = `/api/${encodeURIComponent(runId)}/${encodeURIComponent(scenario)}/keyframe-file/${encodeURIComponent(event.filename)}`;
        return options.screenshots && <figure key={index} className="max-w-xs">
          <a href={url} target="_blank" rel="noreferrer" aria-label={`Enlarge screenshot: ${name}`}>
            <img src={url} loading="lazy" alt={name} className="h-auto w-full rounded border border-neutral-200 hover:border-brand-400" />
          </a>
          <figcaption className="mt-1 text-xs text-neutral-500"><ScenarioText text={name} linkedText={{ segments: [{ kind: 'concept-link', conceptId: event.docId, label: name }] }} runId={runId} /></figcaption>
        </figure>;
      }
      return null;
    })}
  </div>;
}
