/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourcingReview } from '../../../../../../../contracts/types/sourcing.js';
import { PathChange } from '../../../../shared/components/PathChange.js';

export function SourceOutputPathsNotice() {
  return <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">Generated page paths will change. For a published bundle, we recommend creating a new generated version, publishing a connected revision, and retaining the prior publication. Readers can use Open the newer version to reach the same pages at their new paths. You can keep working without publishing.</p>;
}

export function sourceRegistryEdits(changes: NonNullable<SourcingReview['sourceChanges']>) {
  return [...changes.after.map(after => ({ before: changes.before.find(source => source.id === after.id), after })),
    ...changes.before.filter(before => !changes.after.some(source => source.id === before.id)).map(before => ({ before, after: undefined }))]
    .filter(({ before, after }) => !before || !after || before.name !== after.name || before.directory !== after.directory
      || JSON.stringify(before.aliases ?? []) !== JSON.stringify(after.aliases ?? []));
}

export function SourceRegistryChanges({ changes }: { changes: NonNullable<SourcingReview['sourceChanges']> }) {
  const rows = sourceRegistryEdits(changes);
  if (!rows.length && !changes.stale && !changes.outputPathsChange) return null;
  return <section aria-label="Source registry changes" className="space-y-3 rounded border border-neutral-200 p-3 text-sm">
    {rows.map(({ before, after }) => <div key={(after ?? before)!.id} className="space-y-1" data-testid={`source-registry-change-${(after ?? before)!.id}`}>
      {!before ? <p><span className="rounded bg-main-50 px-1.5 text-main-900">Added source</span> <strong>{after!.name}</strong></p>
        : !after ? <p><span className="rounded bg-red-50 px-1.5 text-red-800">Removed source</span> <strong>{before.name}</strong></p>
          : <>
            <p className="font-medium">{after.name}</p>
            {before.name !== after.name && <div><span className="text-xs text-neutral-500">Name changed</span><PathChange before={before.name} after={after.name} /></div>}
            {before.directory !== after.directory && <div><span className="text-xs text-neutral-500">Location changed</span><PathChange before={before.directory} after={after.directory} /></div>}
            {JSON.stringify(before.aliases ?? []) !== JSON.stringify(after.aliases ?? []) && <p className="text-xs text-neutral-500">Aliases: {before.aliases?.join(', ') || 'none'} → {after.aliases?.join(', ') || 'none'}</p>}
          </>}
    </div>)}
    {changes.stale && <p role="alert" className="text-amber-800">Bundle settings changed. Choose Check again before accepting this proposal.</p>}
    {changes.outputPathsChange && <SourceOutputPathsNotice />}
  </section>;
}
