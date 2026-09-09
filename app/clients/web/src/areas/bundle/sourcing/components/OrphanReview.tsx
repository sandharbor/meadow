/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceOrphanExplanation } from '../../../../../../../contracts/types/sourcing.js';

function FilePill({ path }: { path: string }) {
  return <span title={path} data-testid="source-file-pill" className="inline-flex max-w-full items-baseline gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 align-middle text-neutral-700">
    <span aria-hidden="true" className="shrink-0 text-neutral-400">▤</span><span className="[overflow-wrap:anywhere]">{path.split('/').pop()}</span>
  </span>;
}

function Explanation({ orphan }: { orphan: SourceOrphanExplanation }) {
  const diagnosis = orphan.diagnosis;
  if (diagnosis?.kind === 'missing-file') return <>
    {diagnosis.from ? <><FilePill path={diagnosis.from} /> links to <FilePill path={diagnosis.to} />, but that file does not exist in the filesystem.</>
      : <><FilePill path={diagnosis.to} /> does not exist in the filesystem.</>}
  </>;
  if (diagnosis?.kind === 'removed-link') return <><FilePill path={diagnosis.from} /> no longer links to <FilePill path={diagnosis.to} />.</>;
  if (diagnosis?.kind === 'outside-graph') return <><FilePill path={diagnosis.to} /> exists in the filesystem, but is not reachable in this snapshot’s working graph.</>;
  return <>{orphan.reason}</>;
}

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
    <summary className="cursor-pointer font-semibold">Orphaned configuration ({orphans.length})</summary>
    <div className="mt-3" data-testid="orphans-view">
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <p className="min-w-0 flex-1 text-xs text-neutral-500">These entries are no longer reachable in the {hasCandidate ? 'candidate' : 'accepted'} working graph. Accepting this update removes them from the configuration. Source files are kept.</p>
        <button disabled={disabled || !removable.length} data-testid="remove-all-orphans" className="shrink-0 text-xs text-neutral-500 hover:underline disabled:opacity-50" onClick={() => onRemovalsChange(allSelected ? new Set() : new Set(removable.map(orphan => orphan.bundleNodeId)))}>{allSelected ? 'Keep all in config' : 'Remove all from config'}</button>
      </div>
      <div className="divide-y divide-neutral-100 rounded border border-neutral-200">
        {orphans.map(orphan => {
          const selected = removals.has(orphan.bundleNodeId);
          return <div key={orphan.bundleNodeId} data-testid={`orphan-row-${orphan.title}`} className="flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="[overflow-wrap:anywhere]">{orphan.title}<span className="ml-2 text-xs text-neutral-400">{orphan.fileType}</span></p>
              <p className="mt-0.5 text-xs text-neutral-500 [overflow-wrap:anywhere]">{orphan.directory || '(root)'}</p>
              {!selected && !orphan.removalBlockedReason && <p className="mt-1 text-xs text-neutral-500">Will stay in configuration.</p>}
              <details className="mt-1 text-xs text-neutral-500"><summary className="cursor-pointer hover:text-neutral-800">Why is this orphaned?</summary><p className="mt-2 leading-relaxed [overflow-wrap:anywhere]"><Explanation orphan={orphan} /></p>{orphan.previousPath.length > 0 && <details className="mt-2"><summary className="cursor-pointer hover:text-neutral-800">Previous route</summary><div className="mt-2 flex flex-wrap items-center gap-1">{orphan.previousPath.map((path, index) => <span key={`${index}:${path}`} className="contents">{index > 0 && <span aria-hidden="true">→</span>}<FilePill path={path} /></span>)}</div></details>}</details>
              {orphan.removalBlockedReason && <p className="mt-2 text-xs text-neutral-500">{orphan.removalBlockedReason}</p>}
            </div>
            <button disabled={disabled || Boolean(orphan.removalBlockedReason)} data-testid={`remove-orphan-${orphan.title}`} className="shrink-0 text-xs text-neutral-500 hover:underline disabled:opacity-50" onClick={() => {
              const next = new Set(removals);
              if (selected) next.delete(orphan.bundleNodeId); else next.add(orphan.bundleNodeId);
              onRemovalsChange(next);
            }}>{selected ? 'Keep in config' : 'Remove from config'}</button>
          </div>;
        })}
      </div>
    </div>
  </details>;
}
