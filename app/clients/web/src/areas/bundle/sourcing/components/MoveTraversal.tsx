/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceMoveCandidate } from '../../../../../../../contracts/types/sourcing.js';
import { FileRoute } from './SourceFileRoute.js';

function leadingRoute(route: string[], target: string): string[] {
  const last = route[route.length - 1];
  return last === target || last === `folder:${target}` ? route.slice(0, -1) : route;
}

/** The moved endpoint is already explained by the location diff above. */
export function MoveTraversal({ move }: { move: SourceMoveCandidate }) {
  const before = leadingRoute(move.previousRoute, move.oldPath);
  const after = leadingRoute(move.currentRoute, move.newPath);
  const same = move.previousRoute.length > 0 && move.currentRoute.length > 0
    && before.length === after.length && before.every((path, index) => path === after[index]);
  return <details className="pl-5"><summary className="cursor-pointer hover:text-neutral-800">Traversal details</summary>
    {same ? <div className="mt-2" aria-label="Traversal route">
      {after.length ? <><p>Reached through</p><FileRoute paths={after} /></> : <p>Traversal starts at this page.</p>}
    </div> : <dl className="mt-2 space-y-2">
      <div><dt>Before</dt><dd>{move.previousRoute.length ? (before.length ? <FileRoute paths={before} /> : 'Traversal started at this page.') : 'No previously reachable route recorded.'}</dd></div>
      <div><dt>After</dt><dd>{move.currentRoute.length ? (after.length ? <FileRoute paths={after} /> : 'Traversal starts at this page.') : 'Not reached by the current traversal.'}</dd></div>
    </dl>}
  </details>;
}
