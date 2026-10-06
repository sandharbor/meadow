/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useId } from 'react';
import type { SourceIdentityRecommendation } from '../../../../../../../shared_code/utils/sourceMoveResolutions.js';
import { identitySummaryMove, type IdentityChoice } from './groupSourceIdentities.js';

/** Single-candidate uncertain identities expose Same and Different directly. */
export function SourceIdentityDirectChoice({ records, choices, state, showCount, busy, choose }: {
  records: SourceIdentityRecommendation[]; choices: Record<string, string | null>; state: IdentityChoice;
  showCount: boolean; busy: boolean; choose: (choices: Record<string, string | null>) => void;
}) {
  const name = useId();
  const count = <span aria-hidden="true" className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-xs text-neutral-700">{records.length}</span>;
  return <fieldset disabled={busy} aria-label={`Identity choice${showCount ? ` for ${records.length} ${records.length === 1 ? 'file' : 'files'}` : ''}${state === 'input' ? ', undecided' : `, currently ${state === 'same' ? 'Same' : 'Different'}`}`}
    data-testid="source-identity-direct-choices" data-current-choice={state} className="min-w-0 space-y-1 px-2 py-1 text-sm text-neutral-700">
    {showCount && state === 'input' && <legend className="mb-1 text-xs text-neutral-500">{records.length} {records.length === 1 ? 'file' : 'files'}</legend>}
    <label className="flex cursor-pointer items-center gap-2">
      <input type="radio" name={name} data-identity-destination={identitySummaryMove(records[0], choices).newPath} checked={state === 'same'}
        onChange={() => choose(Object.fromEntries(records.map(record => [record.id, identitySummaryMove(record, choices).newPath])))} />
      Same{showCount && state === 'same' && count}
    </label>
    <label className="flex cursor-pointer items-center gap-2"><input type="radio" name={name} checked={state === 'different'}
      onChange={() => choose(Object.fromEntries(records.map(record => [record.id, null])))} />Different{showCount && state === 'different' && count}</label>
  </fieldset>;
}
