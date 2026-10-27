/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useState } from 'react';
import type { SourceIdentityInspection as Inspection } from '../../../../../../../contracts/types/areas/bundle/sourcing/sourcingProposal.js';
import type { SourceMoveCandidate } from '../../../../../../../contracts/types/shared/sourcing/sourcing.js';
import { SourcePath } from './SourceReviewPresentation.js';
import { useSourcePathFormatter } from '../../../../shared/components/SourceNames.js';

/** Explain omissions from matching, and let the person supply correspondence without a heuristic candidate. */
export function SourceIdentityInspection({ inspection, moves, choices, busy, choose }: {
  inspection: Inspection; moves: SourceMoveCandidate[]; choices: Record<string, string | null>; busy: boolean;
  choose: (choices: Record<string, string | null>) => void;
}) {
  const [oldId, setOldId] = useState(''), [destination, setDestination] = useState('');
  const format = useSourcePathFormatter();
  const unmatchedOld = inspection.departing.filter(page => !moves.some(move => move.oldPath === page.path));
  const unmatchedNew = inspection.added.filter(page => !moves.some(move => move.newPath === page.path));
  const oldPage = inspection.departing.find(page => page.bundleNodeId === oldId);
  const destinations = inspection.added.filter(page => (!Object.entries(choices).some(([id, choice]) => id !== oldId && choice === page.path))
    && (!oldPage || page.path.split('.').at(-1) === oldPage.path.split('.').at(-1)));
  const pairable = Boolean(oldPage && destinations.some(page => page.path === destination));
  return <div className="space-y-5">
    {(unmatchedOld.length > 0 || unmatchedNew.length > 0) && <section aria-label="Unmatched pages" className="space-y-2">
      <h3 className="font-semibold text-neutral-800">Unmatched pages</h3>
      <p className="text-sm text-neutral-600">No match was suggested for these pages. They remain separate unless you pair them.</p>
      <ul className="divide-y rounded border border-neutral-200">{[...unmatchedOld.map(page => ({ ...page, kind: 'Removed' })), ...unmatchedNew.map(page => ({ ...page, kind: 'Added' }))].map(page => <li key={`${page.kind}:${page.path}`} className="space-y-1 p-3">
        <p className="text-sm"><span className="mr-2 font-medium text-neutral-500">{page.kind}</span><SourcePath value={page.path} /></p>
        <p className="text-xs text-neutral-600">{page.reason}</p>
      </li>)}</ul>
    </section>}
    {inspection.departing.some(page => page.bundleNodeId) && inspection.added.length > 0 && <section aria-label="Pair pages manually" className="space-y-3 rounded border border-neutral-200 p-3">
      <h3 className="font-semibold text-neutral-800">Pair pages manually</h3>
      <p className="text-sm text-neutral-600">Choose the old and new locations of the same page. Its tracking and settings will follow it.</p>
      <label className="block text-sm">Old page<select aria-label="Old page" disabled={busy} value={oldId} onChange={event => { setOldId(event.target.value); setDestination(''); }} className="mt-1 block w-full rounded border p-2">
        <option value="">Choose an old page</option>{inspection.departing.filter(page => page.bundleNodeId).map(page => <option key={page.path} value={page.bundleNodeId}>{format(page.path)}</option>)}
      </select></label>
      <label className="block text-sm">New page<select aria-label="New page" disabled={busy || !oldPage} value={destination} onChange={event => setDestination(event.target.value)} className="mt-1 block w-full rounded border p-2">
        <option value="">Choose a new page</option>{destinations.map(page => <option key={page.path} value={page.path}>{format(page.path)}</option>)}
      </select></label>
      <button type="button" disabled={busy || !pairable} onClick={() => choose({ [oldId]: destination })} className="rounded border border-blue-700 px-3 py-2 text-sm font-semibold text-blue-800 disabled:opacity-40">Pair as same page</button>
      {oldId && typeof choices[oldId] === 'string' && <p role="status" className="text-sm text-neutral-600">Same page: <SourcePath value={oldPage?.path ?? ''} /> → <SourcePath value={choices[oldId]!} /></p>}
    </section>}
    {!moves.length && !inspection.departing.length && !inspection.added.length && <p className="text-sm text-neutral-600">No added or removed pages need identity matching in this proposal.</p>}
  </div>;
}
