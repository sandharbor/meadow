/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { Link } from 'react-router-dom';
import { boundaryAreaOrder } from '../boundaryAreaOrder';
import { documentUrl } from './DocumentText';

const workflowAreas = [{ id: 'bundles', name: 'Bundles' }, ...boundaryAreaOrder.map(id => {
  const name = id.slice('bundle/'.length);
  return { id, name: name[0].toUpperCase() + name.slice(1) };
})];

export default function DocumentAreas({ areas, runId, onNavigate }: {
  areas: readonly { id: string; name: string }[]; runId?: string; onNavigate?: (id: string) => void;
}) {
  const applicable = new Set(areas.map(area => area.id));
  const link = (area: { id: string; name: string }) => <Link key={area.id} data-area-id={area.id} data-applicable="true"
    className="document-area-pill rounded-full px-2 py-0.5 font-medium" title="Applies to this document"
    to={documentUrl(area.id, runId)} onClick={onNavigate ? event => { event.preventDefault(); onNavigate(area.id); } : undefined}>{area.name}</Link>;
  const pill = (area: { id: string; name: string }) => applicable.has(area.id) ? link(area)
    : <span key={area.id} data-area-id={area.id} data-applicable="false" aria-disabled="true" title="Does not apply to this document"
      className="document-area-pill rounded-full px-2 py-0.5 font-medium">{area.name}</span>;
  return <div role="group" aria-label="Document app areas" className="filter-section filter-areas mt-1 flex flex-wrap items-center gap-1.5 rounded-md px-2 py-1.5">
    <span className="mr-1 font-medium text-neutral-400">App areas: {areas.length === 0 ? 'General' : ''}</span>
    {pill(workflowAreas[0])}
    <span className="font-medium text-neutral-400">Bundle:</span>
    {workflowAreas.slice(1).map(pill)}
    {areas.filter(area => !workflowAreas.some(candidate => candidate.id === area.id)).map(link)}
  </div>;
}
