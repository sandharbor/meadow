/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useId } from 'react';
import type { SourceMoveCandidate } from '../../../../../../../contracts/types/sourcing.js';
import type { SourceIdentityRecommendation } from '../../../../../../../shared_code/utils/sourceMoveResolutions.js';
import { DirectoryChange, PathChange } from '../../../../shared/components/PathChange.js';
import { SourceIdentityRecord } from './SourceIdentityRecord.js';
import { SourceIdentityChoice } from './SourceIdentityChoice.js';
import { groupSourceIdentities, type SourceIdentityGroup } from './groupSourceIdentities.js';

function RenameOverview({ group }: { group: SourceIdentityGroup }) {
  return <span className="inline-flex flex-wrap items-baseline gap-x-2 text-sm">
    {group.beforeName && group.afterName ? <PathChange before={group.beforeName} after={group.afterName} />
      : group.afterName ? <>Add <ins className="rounded bg-main-50 px-0.5 text-main-900 no-underline">{group.afterName}</ins> to filenames</>
      : <>Remove <del className="rounded bg-red-50 px-0.5 text-red-800">{group.beforeName}</del> from filenames</>}
  </span>;
}

export function SourceIdentityGroups({ records, choices, busy, choose, compare, directChoices }: {
  directChoices: boolean;
  records: SourceIdentityRecommendation[]; choices: Record<string, string | null>; busy: boolean;
  choose: (choices: Record<string, string | null>) => void; compare: (move: SourceMoveCandidate) => void;
}) {
  const prefix = useId();
  return <div className="space-y-5">{groupSourceIdentities(records, choices).map(section => <section key={section.kind} aria-labelledby={`${prefix}-${section.kind}`}>
    <h3 id={`${prefix}-${section.kind}`} className="mb-2 text-sm font-semibold text-neutral-700">{section.label}</h3>
    <table aria-labelledby={`${prefix}-${section.kind}`} className="w-full border-separate border-spacing-x-0 border-spacing-y-2">
      <thead className={directChoices ? undefined : 'sr-only'}><tr>
        <th scope="col" className="px-2 text-left text-xs font-medium text-neutral-500">{directChoices ? 'Choose' : 'Choice'}</th>
        <th scope="col"><span className="sr-only">File change and details</span></th>
      </tr></thead>
      <tbody>{section.groups.map(group => {
        const pairedChoices = directChoices && group.records.length === 1 && group.records[0].moves.length === 1;
        return <tr key={group.key} data-testid="source-identity-row">
        <td className={`w-px whitespace-nowrap pr-3 align-top ${pairedChoices ? '' : 'pt-2'}`}><SourceIdentityChoice records={group.records} choices={choices} busy={busy} choose={choose} direct={directChoices} /></td>
        <td className="w-full align-top">{group.records.length === 1
      ? <SourceIdentityRecord record={group.records[0]} choices={choices} busy={busy} collapsed pairedChoices={pairedChoices} choose={choose} compare={compare} />
      : <details className="group/identity-group rounded border" data-testid="source-identity-group" data-identity-ids={JSON.stringify(group.records.map(record => record.id))}>
        <summary className="flex cursor-pointer items-start gap-2 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-main-500" data-testid="source-identity-group-summary">
          <span aria-hidden="true" className="mt-0.5 text-xs text-neutral-500 group-open/identity-group:rotate-90">▶</span>
          <span className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {section.kind !== 'renamed' && <DirectoryChange before={group.beforeDirectory} after={group.afterDirectory} />}
            {section.kind === 'moved-renamed' && <span className="text-xs text-neutral-500">· Names:</span>}
            {section.kind !== 'moved' && <RenameOverview group={group} />}
          </span>
        </summary>
        <div className="space-y-3 border-t p-3">{group.records.map(record => <SourceIdentityRecord key={record.id} record={record} choices={choices} busy={busy} collapsed={false} choose={choose} compare={compare} />)}</div>
      </details>}</td>
      </tr>;
      })}</tbody>
    </table>
  </section>)}</div>;
}
