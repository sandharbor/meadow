/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useId } from 'react';
import type { SourceMoveCandidate } from '../../../../../../../contracts/types/sourcing.js';
import { sourceIdentityRecommendations } from '../../../../../../../shared_code/utils/sourceMoveResolutions.js';
import { ModalTab } from '../../../../shared/components/ModalTab.js';
import { SourceIdentityGroups } from './SourceIdentityGroups.js';

export type IdentityTab = 'confident' | 'input';

export function SourceIdentityReview({ moves, choices, busy, tab, onTabChange, choose, compare }: {
  moves: SourceMoveCandidate[]; choices: Record<string, string | null>; busy: boolean;
  tab: IdentityTab; onTabChange: (value: IdentityTab) => void;
  choose: (choices: Record<string, string | null>) => void; compare: (move: SourceMoveCandidate) => void;
}) {
  const prefix = useId();
  const records = sourceIdentityRecommendations(moves, choices);
  const confident = records.filter(record => record.confident);
  const needsInput = records.filter(record => !record.confident);
  const pending = confident.filter(record => !record.decided);
  const tabs = [{ value: 'confident', label: 'Confident suggestions', records: confident }, { value: 'input', label: 'Needs your input', records: needsInput }] as const;
  return <div className="flex min-h-0 flex-1 flex-col">
    <div role="tablist" aria-label="Source identity review" className="mb-4 flex shrink-0 space-x-4 border-b border-neutral-200">
      {tabs.map((item, index) => <ModalTab key={item.value} selected={tab === item.value} count={item.records.length} role="tab" id={`${prefix}-${item.value}`} aria-label={item.label} aria-selected={tab === item.value}
        aria-controls={`${prefix}-${item.value}-panel`} tabIndex={tab === item.value ? 0 : -1}
        onClick={() => onTabChange(item.value)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          onTabChange(tabs[next].value);
          document.getElementById(`${prefix}-${tabs[next].value}`)?.focus();
        }}>{item.label}</ModalTab>)}
    </div>
    {tabs.map(visible => <div key={visible.value} role="tabpanel" hidden={tab !== visible.value} id={`${prefix}-${visible.value}-panel`} aria-labelledby={`${prefix}-${visible.value}`} className="min-h-0 flex-1 overflow-y-auto -mx-1 px-1">
      {visible.value === 'confident' && confident.length > 0 && <div className="mb-4 flex justify-end">
        <button disabled={busy || pending.length === 0} className="rounded border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-semibold text-white enabled:hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-40"
          onClick={() => choose(Object.fromEntries(pending.map(record => [record.id, record.destination ?? null])))}>Accept all suggestions</button>
      </div>}
      {visible.records.length === 0 && <p className="py-4 text-sm text-neutral-500">{visible.value === 'confident' ? 'No confident suggestions. Review the records in Needs your input.' : 'No records need an individual decision.'}</p>}
      <SourceIdentityGroups records={visible.records} choices={choices} busy={busy} choose={choose} compare={compare} />
    </div>)}
  </div>;
}
