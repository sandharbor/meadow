/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceIdentityRecommendation } from '../../../../../../../shared_code/utils/sourceMoveResolutions.js';
import { identityChoice, identitySummaryMove, type IdentityChoice } from './groupSourceIdentities.js';
import { SourceIdentityDirectChoice } from './SourceIdentityDirectChoice.js';

/** Each compact choice operates on the files counted beside that choice. */
export function SourceIdentityChoice({ records, choices, busy, choose, direct = false }: {
  direct?: boolean;
  records: SourceIdentityRecommendation[]; choices: Record<string, string | null>; busy: boolean;
  choose: (choices: Record<string, string | null>) => void;
}) {
  const competing = records.length === 1 && records[0].moves.length > 1;
  if (competing) {
    const state = identityChoice(records[0], choices);
    return <span data-testid="source-identity-pick" data-current-choice={state} title="Open details to choose a match."
      aria-label={state === 'input' ? 'Pick a match in details' : state === 'same' ? 'Pick: match selected' : 'Different: change in details'}
      className="inline-flex items-center gap-1.5 px-2 py-1 text-sm font-medium text-neutral-700">
      {state === 'different' ? 'Different' : 'Pick'}{state === 'same' && <span aria-hidden="true">✓</span>}
    </span>;
  }
  const buckets = (['same', 'different', 'input'] satisfies IdentityChoice[])
    .map(state => ({ state, members: records.filter(record => identityChoice(record, choices) === state) }))
    .filter(bucket => bucket.members.length > 0);
  return <div className="flex flex-col items-start gap-1">{buckets.map(({ state, members }) => {
    if (direct) return <SourceIdentityDirectChoice key={buckets.length === 1 ? 'whole' : state} records={members} choices={choices} state={state} showCount={records.length > 1} busy={busy} choose={choose} />;
    const label = state === 'same' ? 'Same' : state === 'different' ? 'Different' : 'Choose';
    return <div key={state} className={`relative inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm font-medium text-neutral-700 hover:bg-blue-50 focus-within:outline focus-within:outline-2 focus-within:outline-blue-700 ${busy ? 'opacity-40' : ''}`}>
    <span aria-hidden="true">{label}</span>
    {records.length > 1 && <span aria-hidden="true" className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-xs text-neutral-700">{members.length}</span>}
    <span aria-hidden="true" className="text-xs text-neutral-400">▾</span>
    <select disabled={busy} value={state} aria-label={`Identity choice: ${label}${records.length > 1 ? `, ${members.length} ${members.length === 1 ? 'file' : 'files'}` : ''}`}
      data-testid="source-identity-choice" className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      onChange={event => {
        const value = event.target.value;
        if (value === 'input') return;
        choose(Object.fromEntries(members.map(record => [record.id, value === 'different' ? null : identitySummaryMove(record, choices).newPath])));
      }}>
      <option value="input" disabled>Choose</option>
      <option value="same">Same</option>
      <option value="different">Different</option>
    </select>
    </div>;
  })}</div>;
}
