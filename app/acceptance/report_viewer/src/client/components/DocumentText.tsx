/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import type { DocumentText as Text } from '../../../../../concepts/documents.js';

export function documentUrl(id: string, runId?: string, implementation?: string): string {
  const query = new window.URLSearchParams(implementation);
  if (runId) query.set('run', runId);
  return `/concepts/${encodeURIComponent(id)}${query.size ? `?${query}` : ''}`;
}

export default function DocumentText({ text, runId, onNavigate }: {
  text: Text; runId?: string; onNavigate?: (id: string) => void;
}) {
  return <>{text.segments.map((segment, index) => segment.kind === 'text'
    ? <Fragment key={index}>{segment.text}</Fragment>
    : <Link key={index} className="text-brand-600 underline" to={documentUrl(segment.conceptId, runId)}
      onClick={onNavigate ? event => { event.preventDefault(); onNavigate(segment.conceptId); } : undefined}>{segment.label}</Link>)}</>;
}
