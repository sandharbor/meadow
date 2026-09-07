/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceOrphanExplanation } from '../../../../../../../contracts/types/sourcing.js';

export function OrphanReview({ orphans, removals, onRemovalsChange, disabled, hasCandidate }: {
  orphans: SourceOrphanExplanation[];
  removals: Set<string>;
  onRemovalsChange: (next: Set<string>) => void;
  disabled: boolean;
  hasCandidate: boolean;
}) {
  const removable = orphans.filter(orphan => !orphan.removalBlockedReason);
  const allSelected = removable.length > 0 && removable.every(orphan => removals.has(orphan.bundleNodeId));
  return <details open={!hasCandidate} className="text-sm" data-testid="source-orphans">
    <summary className="cursor-pointer font-semibold">Orphaned pages ({orphans.length})</summary>
    <div className="mt-3" data-testid="orphans-view">
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <p className="min-w-0 flex-1 text-xs text-neutral-500">These entries are no longer reachable in the {hasCandidate ? 'candidate' : 'accepted'} working graph. Remove them from the configuration, or keep them for later. Source files are kept.</p>
        <button disabled={disabled || !removable.length} data-testid="remove-all-orphans" className="shrink-0 text-xs text-danger-700 hover:underline disabled:opacity-50" onClick={() => onRemovalsChange(allSelected ? new Set() : new Set(removable.map(orphan => orphan.bundleNodeId)))}>{allSelected ? 'Undo all removals' : 'Remove all from config'}</button>
      </div>
      <div className="divide-y divide-neutral-100 rounded border border-neutral-200">
        {orphans.map(orphan => {
          const selected = removals.has(orphan.bundleNodeId);
          return <div key={orphan.bundleNodeId} data-testid={`orphan-row-${orphan.title}`} className="flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className={`[overflow-wrap:anywhere] ${selected ? 'text-neutral-500 line-through' : ''}`}>{orphan.title}<span className="ml-2 text-xs text-neutral-400">{orphan.fileType}</span></p>
              <p className="mt-0.5 text-xs text-neutral-500 [overflow-wrap:anywhere]">{orphan.directory || '(root)'}</p>
              {selected && <p className="mt-1 text-xs text-danger-700">Will be removed when you apply this review.</p>}
              <details className="mt-1 text-xs text-neutral-500"><summary className="cursor-pointer hover:text-neutral-800">Why is this orphaned?</summary><p className="mt-2 [overflow-wrap:anywhere]">{orphan.reason}</p>{orphan.previousPath.length > 0 && <p className="mt-1 [overflow-wrap:anywhere]">Previously reached through: {orphan.previousPath.join(' → ')}</p>}</details>
              {orphan.removalBlockedReason && <p className="mt-2 text-xs text-neutral-500">{orphan.removalBlockedReason}</p>}
            </div>
            <button disabled={disabled || Boolean(orphan.removalBlockedReason)} data-testid={`remove-orphan-${orphan.title}`} className="shrink-0 text-xs text-danger-700 hover:underline disabled:opacity-50" onClick={() => {
              const next = new Set(removals);
              if (selected) next.delete(orphan.bundleNodeId); else next.add(orphan.bundleNodeId);
              onRemovalsChange(next);
            }}>{selected ? 'Undo removal' : 'Remove from config'}</button>
          </div>;
        })}
      </div>
    </div>
  </details>;
}
