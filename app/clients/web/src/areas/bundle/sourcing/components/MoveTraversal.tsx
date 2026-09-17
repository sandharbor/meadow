/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceMoveCandidate } from '../../../../../../../contracts/types/sourcing.js';
import { FileRoute } from './SourceFileRoute.js';
import type { Graph } from '../../../../../../../contracts/types/graph.js';
import { traversalLinkType } from '../../../../shared/utils/traversalLinkType.js';

function leadingRoute(route: string[], target: string): string[] {
  const last = route[route.length - 1];
  return last === target || last === `folder:${target}` ? route.slice(0, -1) : route;
}

/** The moved endpoint is already explained by the location diff above. */
export function MoveTraversal({ move, graphs, onDetails }: { move: SourceMoveCandidate; graphs?: { accepted?: Graph; candidate?: Graph }; onDetails?: (side: 'accepted' | 'candidate', key: string) => void }) {
  const before = leadingRoute(move.previousRoute, move.oldPath);
  const after = leadingRoute(move.currentRoute, move.newPath);
  const same = move.previousRoute.length > 0 && move.currentRoute.length > 0
    && before.length === after.length && before.every((path, index) => path === after[index]
      && (!graphs?.accepted || !graphs.candidate || traversalLinkType(graphs.accepted, before[index - 1], path) === traversalLinkType(graphs.candidate, after[index - 1], path)));
  const details = (side: 'accepted' | 'candidate') => {
    const key = (side === 'accepted' ? move.previousRoute : move.currentRoute).at(-1);
    return key && graphs?.[side]?.getNode(key)?.path?.length && onDetails
      ? <button type="button" className="ml-2 text-main-700 underline" onClick={() => onDetails(side, key)}>{side === 'accepted' ? 'Accepted source details' : 'Candidate source details'}</button> : null;
  };
  return <details className="pl-5"><summary className="cursor-pointer hover:text-neutral-800">Traversal details</summary>
    {same ? <div className="mt-2" aria-label="Traversal route">
      {after.length ? <><p>Reached through</p><FileRoute paths={after} graph={graphs?.candidate} /></> : <p>Traversal starts at this page.</p>}
      {details('accepted')}{details('candidate')}
    </div> : <dl className="mt-2 space-y-2">
      <div><dt>Before{details('accepted')}</dt><dd>{move.previousRoute.length ? (before.length ? <FileRoute paths={before} graph={graphs?.accepted} /> : 'Traversal started at this page.') : 'No previously reachable route recorded.'}</dd></div>
      <div><dt>After{details('candidate')}</dt><dd>{move.currentRoute.length ? (after.length ? <FileRoute paths={after} graph={graphs?.candidate} /> : 'Traversal starts at this page.') : 'Not reached by the current traversal.'}</dd></div>
    </dl>}
  </details>;
}
