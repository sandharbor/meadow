/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useId } from 'react';
import type { SourceOrphanExplanation } from '../../../../../../../contracts/types/sourcing.js';

import { FilePill, FileRoute } from './SourceFileRoute.js';
import { SourceChangeCount, SourcePath } from './SourceReviewPresentation.js';

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

export function OrphanReview({ orphans, hasCandidate, keeps = [], onKeepChange }: {
  orphans: SourceOrphanExplanation[];
  hasCandidate: boolean;
  keeps?: string[];
  onKeepChange?: (id: string, keep: boolean) => void;
}) {
  const helpId = useId();
  return <section className="text-sm" data-testid="source-orphans">
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <h3 className="font-semibold">Orphaned configuration<SourceChangeCount count={orphans.length} /></h3>
      <span className="group relative inline-flex">
        <button type="button" aria-label="About orphaned configuration" aria-describedby={helpId} className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-neutral-400 text-[10px] text-neutral-500">?</button>
        <span id={helpId} role="tooltip" className="pointer-events-none invisible fixed z-[9999] ml-2 w-80 max-w-[calc(100vw-3rem)] space-y-2 rounded border border-neutral-200 bg-white p-3 text-xs font-normal text-neutral-700 opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
          <span className="block">These pages have saved configuration but are no longer reachable in the {hasCandidate ? 'proposed' : 'accepted'} working graph.</span>
          <span className="block">Accepting the source changes removes their configuration. The source files are untouched.</span>
          <span className="block">If this is unexpected, choose Later, review the affected links or traversal depth, then check sources again.</span>
        </span>
      </span>
    </div>
    <div className="divide-y divide-neutral-100" data-testid="orphans-view">
      {orphans.map(orphan => {
        return <details key={orphan.bundleNodeId} data-testid={`orphan-row-${orphan.title}`} className="py-3 text-xs text-neutral-500">
          <summary className="ml-3 cursor-pointer rounded hover:bg-neutral-50 [list-style-position:outside]" aria-label={`Details ${orphan.path}`}>
            <SourcePath value={orphan.path} />
          </summary>
          <div className="ml-3 mt-3 space-y-2">
            <p className="font-medium text-neutral-700">Why is this orphaned?</p>
            <p className="leading-relaxed [overflow-wrap:anywhere]"><Explanation orphan={orphan} /></p>
            {orphan.previousPath.length > 0 && <details><summary className="cursor-pointer hover:text-neutral-800">Previous route</summary><FileRoute paths={orphan.previousPath} /></details>}
            {!orphan.removalBlockedReason && onKeepChange && <label className="flex items-center gap-2"><input type="checkbox" checked={keeps.includes(orphan.bundleNodeId)} onChange={event => onKeepChange(orphan.bundleNodeId, event.target.checked)} />Keep in config</label>}
            {orphan.removalBlockedReason && <p>{orphan.removalBlockedReason}</p>}
          </div>
        </details>;
      })}
    </div>
  </section>;
}
