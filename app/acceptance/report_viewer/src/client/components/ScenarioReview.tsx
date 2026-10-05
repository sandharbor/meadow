/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { emptyReviews, findReview, type ReviewData } from '../../scenarioReviews.js';
export function useScenarioReviews() {
  const [data, setData] = useState<ReviewData>(emptyReviews);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/scenario-reviews');
      if (!response.ok) throw new Error('Could not load review history');
      setData(await response.json()); setError(null);
    } catch (cause) { setError(String(cause)); }
  }, []);
  useEffect(() => {
    void refresh();
    const changed = () => { void refresh(); };
    window.addEventListener('scenario-reviews-changed', changed);
    const interval = window.setInterval(changed, 5000);
    return () => { window.removeEventListener('scenario-reviews-changed', changed); window.clearInterval(interval); };
  }, [refresh]);
  const update = async (runId: string, slug: string, action: 'TOREVIEW' | 'REVIEWED' | 'NOTE', note?: string) => {
    try {
      const response = await fetch(`/api/${encodeURIComponent(runId)}/${encodeURIComponent(slug)}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, note }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not update review');
      setData(result); setError(null); window.dispatchEvent(new Event('scenario-reviews-changed'));
      return true;
    } catch (cause) { setError(String(cause)); return false; }
  };
  return { data, error, update };
}
export function ReviewActions({ runId, scenario, reviews, update, onDone }: {
  runId: string; scenario: { slug: string; testName: string; scenarioId?: string }; reviews: ReviewData;
  update: (runId: string, slug: string, action: 'TOREVIEW' | 'REVIEWED' | 'NOTE', note?: string) => Promise<boolean>; onDone?: () => void;
}) {
  const review = findReview(reviews, scenario);
  const pending = review?.status === 'TOREVIEW';
  const [draft, setNote] = useState<string>();
  const note = draft ?? review?.note ?? '';
  const [saving, setSaving] = useState(false);
  const save = async (action: 'TOREVIEW' | 'REVIEWED' | 'NOTE') => {
    setSaving(true);
    if (await update(runId, scenario.slug, action, note)) onDone?.();
    setSaving(false);
  };
  return <div className="w-64">
    <label className="block px-3 py-2 text-xs text-neutral-600">Review note
      <textarea aria-label="Review note" title="Cmd/Ctrl+Enter to save" placeholder="What should I look for?" maxLength={500} rows={2}
        value={note} onChange={event => setNote(event.target.value)}
        onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void save(review ? 'NOTE' : 'TOREVIEW'); } }}
        className="mt-1 block w-full resize-y rounded border border-neutral-200 px-2 py-1 text-neutral-800" />
    </label>
    {review && <button disabled={saving || note.trim() === (review.note ?? '')} onClick={() => void save('NOTE')}
      className="w-full cursor-pointer px-3 py-1 text-left text-xs hover:bg-neutral-50 disabled:cursor-default disabled:text-neutral-400">Save note</button>}
    <button disabled={saving} className="w-full cursor-pointer px-3 py-1 text-left text-xs hover:bg-neutral-50 disabled:text-neutral-400"
    onClick={() => void save(pending ? 'REVIEWED' : 'TOREVIEW')}>
    {pending ? 'Complete review' : 'Mark for review'}
    </button>
  </div>;
}
export function ScenarioReviewMenu(props: Parameters<typeof ReviewActions>[0]) {
  const [open, setOpen] = useState(false);
  return <div className="relative">
    <button aria-label={`Review actions for ${props.scenario.testName}`} aria-expanded={open}
      className="cursor-pointer rounded px-2 text-neutral-500 hover:bg-neutral-100" onClick={() => setOpen(!open)}>…</button>
    {open && <div className="absolute right-0 z-20 min-w-[160px] rounded border bg-white py-1 shadow">
      <ReviewActions {...props} onDone={() => setOpen(false)} />
    </div>}
  </div>;
}
export function ReviewLog({ data }: { data: ReviewData }) {
  return <section aria-label="Review log" className="mt-4 space-y-2">
    <h2 className="text-sm font-semibold">Review log</h2>
    {[...data.events].reverse().map(event => <article key={event.id} className="rounded border border-neutral-200 bg-white p-3 text-xs">
      <div className="flex flex-wrap gap-2"><time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleString()}</time>
        <strong>{event.action === 'TOREVIEW' ? 'Marked for review' : event.action === 'NOTE' ? 'Note updated' : 'Review completed'}</strong>
        <Link className="text-brand-600 underline" to={`/${event.runId}/${event.slug}`}>{event.testName}</Link></div>
      {event.note && <p className="mt-1 whitespace-pre-wrap break-words text-neutral-700">{event.note}</p>}
      <details className="mt-1 text-neutral-500"><summary className="cursor-pointer">Captured metadata</summary>
        <dl className="mt-1 space-y-1"><div>Run: {event.runId}</div><div>Scenario ID: {event.scenarioId ?? event.reviewId}</div>
          <div>Code revision: {event.codeRevision ?? 'Not captured in this recording'}{event.uncommittedCode ? ' (with local changes)' : ''}</div>
          <div>Source: {event.testFile ?? 'Not captured'}</div></dl>
      </details>
    </article>)}
    {!data.events.length && <p className="text-xs text-neutral-500">No reviews recorded yet.</p>}
  </section>;
}
