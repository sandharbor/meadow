/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useId } from 'react';
import type { SourceMoveCandidate } from '../../../../../../../contracts/types/sourcing.js';
import type { SourceIdentityRecommendation } from '../../../../../../../shared_code/utils/sourceMoveResolutions.js';
import { DirectoryChange, PathChange } from '../../../../shared/components/PathChange.js';
import { SourceIdentityRecord } from './SourceIdentityRecord.js';
import { groupSourceIdentities, type SourceIdentityGroup } from './groupSourceIdentities.js';

function RenameOverview({ group }: { group: SourceIdentityGroup }) {
  return <span className="inline-flex flex-wrap items-baseline gap-x-2 text-sm">
    {group.beforeName && group.afterName ? <PathChange before={group.beforeName} after={group.afterName} />
      : group.afterName ? <>Add <ins className="rounded bg-main-50 px-0.5 text-main-900 no-underline">{group.afterName}</ins> to filenames</>
      : <>Remove <del className="rounded bg-red-50 px-0.5 text-red-800">{group.beforeName}</del> from filenames</>}
  </span>;
}

export function SourceIdentityGroups({ records, choices, busy, choose, compare }: {
  records: SourceIdentityRecommendation[]; choices: Record<string, string | null>; busy: boolean;
  choose: (choices: Record<string, string | null>) => void; compare: (move: SourceMoveCandidate) => void;
}) {
  const prefix = useId();
  return <div className="space-y-5">{groupSourceIdentities(records, choices).map(section => <section key={section.kind} aria-labelledby={`${prefix}-${section.kind}`}>
    <h3 id={`${prefix}-${section.kind}`} className="mb-2 text-sm font-semibold text-neutral-700">{section.label}</h3>
    <div className="space-y-2">{section.groups.map(group => group.records.length === 1
      ? <SourceIdentityRecord key={group.key} record={group.records[0]} choices={choices} busy={busy} collapsed choose={choose} compare={compare} />
      : <details key={group.key} className="group/identity-group rounded border" data-testid="source-identity-group" data-identity-ids={JSON.stringify(group.records.map(record => record.id))}>
        <summary className="flex cursor-pointer items-start gap-2 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-main-500" data-testid="source-identity-group-summary">
          <span aria-hidden="true" className="mt-0.5 text-xs text-neutral-500 group-open/identity-group:rotate-90">▶</span>
          <span className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {section.kind !== 'renamed' && <DirectoryChange before={group.beforeDirectory} after={group.afterDirectory} />}
            {section.kind === 'moved-renamed' && <span className="text-xs text-neutral-500">· Names:</span>}
            {section.kind !== 'moved' && <RenameOverview group={group} />}
            <span className="text-sm text-neutral-500">— {group.records.length} files</span>
          </span>
        </summary>
        <div className="space-y-3 border-t p-3">{group.records.map(record => <SourceIdentityRecord key={record.id} record={record} choices={choices} busy={busy} collapsed={false} choose={choose} compare={compare} />)}</div>
      </details>)}</div>
  </section>)}</div>;
}
