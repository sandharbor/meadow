/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceNodeReview } from '../../../../../../../contracts/types/sourcingProposal.js';
import type { Graph } from '../../../../../../../contracts/types/graph.js';

export function SourceComparisonEvidence({ evidence, graph, onCompare }: { evidence: SourceNodeReview; graph: Graph; onCompare: () => void }) {
  const route = (keys: SourceNodeReview['previousRoute']) => keys.map(key => graph.getNode(key)?.bundleNodeName ?? key).join(' → ') || 'Not included';
  return <section aria-label="Source review evidence" className="my-3 space-y-2 rounded border border-blue-200 bg-blue-50 p-3 text-xs">
    <div className="flex flex-wrap gap-2 font-semibold"><span className="capitalize">{evidence.kind === 'moved' ? 'Rename or move' : evidence.kind}</span>
      {evidence.orphanedConfiguration && <span className="rounded bg-amber-100 px-1 text-amber-900">Orphaned configuration · cleaned at acceptance</span>}</div>
    <p>{evidence.explanation}</p>
    {evidence.sensitivityReasons?.map(reason => <p key={reason}>{reason}</p>)}
    <dl className="space-y-1 break-words"><dt className="font-medium">Accepted location and route</dt><dd>{evidence.previousPath ?? 'Not included'}<br />{route(evidence.previousRoute)}</dd>
      <dt className="font-medium">{evidence.kind === 'frontier' ? 'Frontier location and route' : 'Proposed location and route'}</dt><dd>{evidence.proposedPath ?? 'Not included'}<br />{route(evidence.proposedRoute)}</dd></dl>
    {evidence.kind !== 'frontier' && <button className="font-medium underline" onClick={onCompare}>Compare captured content</button>}
  </section>;
}
