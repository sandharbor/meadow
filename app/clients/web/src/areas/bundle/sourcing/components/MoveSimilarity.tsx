/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceMoveCandidate } from '../../../../../../../contracts/types/sourcing.js';

export function MoveSimilarity({ move }: { move: SourceMoveCandidate }) {
  return <details className="ml-6 rounded border border-neutral-200 bg-neutral-50 text-sm">
    <summary className="cursor-pointer px-3 py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">
      Similarity {Math.round(move.similarity.score * 100)}/100 · Show criteria
    </summary>
    <div className="space-y-3 border-t border-neutral-200 p-3">
      <p className="text-xs text-neutral-600">A weighted evidence score, not a probability. Each criterion shows its support and contribution to the total. Unavailable criteria contribute zero; identical contents and block overlap are not counted twice.</p>
      <dl className="space-y-3">{move.similarity.criteria.map(criterion => <div key={criterion.id} className={criterion.score === null ? 'text-neutral-400' : 'text-neutral-700'}>
        <dt className="flex flex-wrap justify-between gap-x-4 font-medium"><span>{criterion.label}</span><span>{criterion.score === null ? 'Not applicable' : `${Math.round(criterion.score * 100)}% support`} · {Number(((criterion.score ?? 0) * criterion.weight * 100).toFixed(1))} points</span></dt>
        <dd className="mt-1 text-xs">{criterion.detail}{criterion.score !== null && criterion.weight === 0 ? ' Shown for context; adds no extra points.' : ''}</dd>
      </div>)}</dl>
    </div>
  </details>;
}
