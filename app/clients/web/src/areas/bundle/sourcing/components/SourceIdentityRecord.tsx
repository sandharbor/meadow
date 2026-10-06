/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceMoveCandidate } from '../../../../../../../contracts/types/sourcing.js';
import type { SourceIdentityRecommendation } from '../../../../../../../shared_code/utils/sourceMoveResolutions.js';
import { PathChange } from '../../../../shared/components/PathChange.js';
import { SourcePath } from './SourceReviewPresentation.js';
import { MoveSimilarity } from './MoveSimilarity.js';
import { MoveTraversal } from './MoveTraversal.js';
import { identitySummaryMove } from './groupSourceIdentities.js';

export function SourceIdentityRecord({ record, choices, busy, collapsed, choose, compare }: {
  record: SourceIdentityRecommendation; choices: Record<string, string | null>; busy: boolean; collapsed: boolean;
  choose: (choices: Record<string, string | null>) => void; compare: (move: SourceMoveCandidate) => void;
}) {
  const { id, moves, destination, confident, decided } = record;
  const selected = decided ? choices[id] : confident ? destination : undefined;
  const summary = identitySummaryMove(record, choices);
  const options = <div className="space-y-3">
    {moves.map(move => <div key={move.newPath} className="space-y-2">
      {(!collapsed || moves.length > 1) && <PathChange before={move.oldPath} after={move.newPath} />}
      <label className="flex flex-wrap items-center gap-2"><input type="radio" name={id} aria-description={confident && destination === move.newPath ? 'Recommended' : undefined}
        checked={selected === move.newPath} onClick={() => { if (selected === move.newPath) choose({ [id]: move.newPath }); }} onChange={() => choose({ [id]: move.newPath })} />Same page — <SourcePath value={move.newPath} />
        {confident && destination === move.newPath && <span aria-hidden="true" className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Recommended</span>}
      </label>
      <p className="pl-6 text-xs text-neutral-500">{move.evidence.join(' · ')}{move.contentChanged ? ' · Content also changed' : ''}</p>
      <MoveSimilarity move={move} />
      <MoveTraversal move={move} />
      {move.contentChanged && <button className="ml-6 rounded border border-neutral-300 px-3 py-2 text-xs font-semibold enabled:hover:bg-blue-50" onClick={() => compare(move)}>Compare content</button>}
    </div>)}
    <label className="flex flex-wrap items-center gap-2"><input type="radio" name={id} aria-description={confident && destination === null ? 'Recommended' : undefined}
      checked={selected === null} onClick={() => { if (selected === null) choose({ [id]: null }); }} onChange={() => choose({ [id]: null })} />Different pages — remove the old configuration at acceptance
      {confident && destination === null && <span aria-hidden="true" className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Recommended</span>}
    </label>
  </div>;
  return <fieldset disabled={busy} aria-label={summary.oldPath} className="mb-2 rounded border" data-testid={`source-move-${id}`}>
    {collapsed ? <details className="group/identity-record" data-testid="source-identity-record">
      <summary className="flex cursor-pointer items-start gap-2 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-main-500" data-testid="source-identity-record-summary">
        <span aria-hidden="true" className="mt-0.5 text-xs text-neutral-500 group-open/identity-record:rotate-90">▶</span>
        <span className="min-w-0 flex-1"><PathChange before={summary.oldPath} after={summary.newPath} />{moves.length > 1 && <span className="text-xs text-neutral-500">{moves.length} possible matches</span>}</span>
      </summary>
      <div className="border-t p-3">{options}</div>
    </details> : <div className="space-y-3 p-3">{options}</div>}
  </fieldset>;
}
