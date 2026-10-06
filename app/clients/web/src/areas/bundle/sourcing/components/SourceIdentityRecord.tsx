/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useId } from 'react';
import type { SourceMoveCandidate } from '../../../../../../../contracts/types/sourcing.js';
import type { SourceIdentityRecommendation } from '../../../../../../../shared_code/utils/sourceMoveResolutions.js';
import { PathChange } from '../../../../shared/components/PathChange.js';
import { useSourcePathFormatter } from '../../../../shared/components/SourceNames.js';
import { MoveSimilarity } from './MoveSimilarity.js';
import { MoveTraversal } from './MoveTraversal.js';
import { identitySummaryMove } from './groupSourceIdentities.js';

export function SourceIdentityRecord({ record, choices, busy, collapsed, choose, compare, pairedChoices = false }: {
  pairedChoices?: boolean;
  record: SourceIdentityRecommendation; choices: Record<string, string | null>; busy: boolean; collapsed: boolean;
  choose: (choices: Record<string, string | null>) => void; compare: (move: SourceMoveCandidate) => void;
}) {
  const { id, moves, destination, confident, decided } = record;
  const differentHelpId = useId();
  const format = useSourcePathFormatter();
  const selected = decided ? choices[id] : confident ? destination : undefined;
  const summary = identitySummaryMove(record, choices);
  const options = <div className="space-y-3">
    {moves.map(move => <div key={move.newPath} role="group" aria-label={`Match with ${format(move.newPath)}`} data-identity-destination={move.newPath} className="space-y-2">
      {(!collapsed || moves.length > 1) && <PathChange before={move.oldPath} after={move.newPath} />}
      <label className="flex flex-wrap items-center gap-2"><input type="radio" name={id} aria-description={confident && destination === move.newPath ? 'Recommended' : undefined}
        checked={selected === move.newPath} onClick={() => { if (selected === move.newPath) choose({ [id]: move.newPath }); }} onChange={() => choose({ [id]: move.newPath })} />{moves.length > 1 ? 'Pick' : 'Same'}
        {confident && destination === move.newPath && <span aria-hidden="true" className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Recommended</span>}
      </label>
      <p className="pl-6 text-xs text-neutral-500">{move.evidence.join(' · ')}{move.contentChanged ? ' · Content also changed' : ''}</p>
      <MoveSimilarity move={move} />
      <MoveTraversal move={move} />
      {move.contentChanged && <button className="ml-6 rounded border border-neutral-300 px-3 py-2 text-xs font-semibold enabled:hover:bg-blue-50" onClick={() => compare(move)}>Compare content</button>}
    </div>)}
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex flex-wrap items-center gap-2"><input type="radio" name={id} aria-describedby={differentHelpId} aria-description={confident && destination === null ? 'Recommended' : undefined}
        checked={selected === null} onClick={() => { if (selected === null) choose({ [id]: null }); }} onChange={() => choose({ [id]: null })} />Different
        {confident && destination === null && <span aria-hidden="true" className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Recommended</span>}
      </label>
      <span className="group relative inline-flex">
        <button type="button" aria-label="About different pages" aria-describedby={differentHelpId} className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-neutral-400 text-[10px] text-neutral-500">?</button>
        <span id={differentHelpId} role="tooltip" className="pointer-events-none invisible fixed z-[9999] ml-2 w-64 max-w-[calc(100vw-3rem)] rounded border border-neutral-200 bg-white p-3 text-xs font-normal text-neutral-700 opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
          Treat these as separate pages. The old page’s saved configuration is removed when you accept the source changes.
        </span>
      </span>
    </div>
  </div>;
  return <fieldset disabled={busy} aria-label={summary.oldPath} className={`${collapsed ? '' : 'mb-2'} rounded border`} data-testid={`source-move-${id}`}>
    {collapsed ? <details className="group/identity-record" data-testid="source-identity-record">
      <summary className={`flex cursor-pointer gap-2 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-main-500 ${pairedChoices ? 'min-h-[3.25rem] items-center' : 'items-start'}`} data-testid="source-identity-record-summary">
        <span aria-hidden="true" className="mt-0.5 text-xs text-neutral-500 group-open/identity-record:rotate-90">▶</span>
        <span className="min-w-0 flex-1"><PathChange before={summary.oldPath} after={summary.newPath} />{moves.length > 1 && <span className="text-xs text-neutral-500">{moves.length} possible matches</span>}</span>
      </summary>
      <div className="border-t p-3">{options}</div>
    </details> : <div className="space-y-3 p-3">{options}</div>}
  </fieldset>;
}
