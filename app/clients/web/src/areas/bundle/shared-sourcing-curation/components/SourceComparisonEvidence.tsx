/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceNodeReview } from '../../../../../../../contracts/types/sourcingProposal.js';
import type { Graph } from '../../../../../../../contracts/types/graph.js';
import { sourceReviewAppearance, sourceRemovalReasons } from '../../../../shared/utils/sourceReviewAppearance.js';
import { SourceLineCounts, useSourceLineCounts } from './SourceLineCounts.js';
import { PathChange } from '../../../../shared/components/PathChange.js';

export function SourceComparisonEvidence({ evidence, graph, onCompare }: { evidence: SourceNodeReview; graph: Graph; onCompare: () => void }) {
  const route = (keys: SourceNodeReview['previousRoute']) => keys.map(key => graph.getNode(key)?.bundleNodeName ?? key).join(' → ') || 'Not included';
  const appearance = sourceReviewAppearance[evidence.kind];
  const content = useSourceLineCounts(evidence);
  const removed = evidence.kind === 'departing';
  const reason = sourceRemovalReasons[evidence.removalReason ?? 'unreachable'];
  const renamed = evidence.kind === 'moved';
  const added = evidence.kind === 'added';
  const showLocations = evidence.kind !== 'modified' && !renamed && !added;
  return <section aria-label="Source review evidence" className="my-3 space-y-2 rounded border p-3 text-xs"
    style={{ borderColor: appearance.color, backgroundColor: appearance.background }}>
    <div className="flex flex-wrap items-center gap-2 font-semibold"><span>Change: <span style={{ color: appearance.color }}>{appearance.label}</span></span>
      <SourceLineCounts counts={content?.counts} removed={removed} /></div>
    {removed ? <>
      {content?.hasPreviousContent && <button className="font-medium underline" onClick={onCompare}>See previous content</button>}
      <details><summary className="cursor-pointer text-neutral-600">Details</summary>
        <div className="mt-2 space-y-1"><p className="font-semibold">{reason.label}</p><p>{reason.description}</p></div>
      </details>
    </> : <>
    {evidence.kind === 'frontier' && <p>{evidence.explanation}</p>}
    {evidence.sensitivityReasons?.map(reason => <p key={reason}>{reason}</p>)}
    {renamed && evidence.previousPath && evidence.proposedPath && <PathChange compact before={evidence.previousPath} after={evidence.proposedPath} />}
    {showLocations && <dl className="space-y-1 break-words"><dt className="font-medium">Accepted location and route</dt><dd>{evidence.previousPath ?? 'Not included'}<br />{route(evidence.previousRoute)}</dd>
      <dt className="font-medium">{evidence.kind === 'frontier' ? 'Frontier location and route' : 'Proposed location and route'}</dt><dd>{evidence.proposedPath ?? 'Not included'}<br />{route(evidence.proposedRoute)}</dd></dl>}
    {evidence.kind !== 'frontier' && <button className="font-medium underline" onClick={onCompare}>{added ? 'See content' : renamed ? 'See file content changes' : 'See changes'}</button>}
    </>}
  </section>;
}
