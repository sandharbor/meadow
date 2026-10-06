/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceIdentityRecommendation } from '../../../../../../../shared_code/utils/sourceMoveResolutions.js';
import { splitPathChange } from '../../../../shared/components/PathChange.js';

export type IdentityChangeKind = 'moved-renamed' | 'moved' | 'renamed';
export type IdentityChoice = 'same' | 'different' | 'input';

export interface SourceIdentityGroup {
  key: string;
  beforeDirectory: string;
  afterDirectory: string;
  beforeName: string;
  afterName: string;
  records: SourceIdentityRecommendation[];
}

export function identitySummaryMove(record: SourceIdentityRecommendation, choices: Record<string, string | null>) {
  return record.moves.find(move => move.newPath === choices[record.id]) ?? record.moves[0];
}

export function identityGuidance(record: SourceIdentityRecommendation): IdentityChoice {
  return !record.confident ? 'input' : record.destination === null ? 'different' : 'same';
}

export function identityChoice(record: SourceIdentityRecommendation, choices: Record<string, string | null>): IdentityChoice {
  if (record.decided) return choices[record.id] === null ? 'different' : 'same';
  return identityGuidance(record);
}

/** Group shared path changes with matching guidance; individual choices do not rearrange groups. */
export function groupSourceIdentities(records: SourceIdentityRecommendation[], choices: Record<string, string | null>) {
  const sections: Array<{ kind: IdentityChangeKind; label: string; groups: SourceIdentityGroup[] }> = [
    { kind: 'moved-renamed', label: 'Changed directories and renamed', groups: [] },
    { kind: 'moved', label: 'Changed directories', groups: [] },
    { kind: 'renamed', label: 'Renamed', groups: [] },
  ];
  const groups = new Map<string, SourceIdentityGroup>();
  for (const record of records) {
    const move = identitySummaryMove(record, choices);
    const split = (value: string) => ({ directory: value.slice(0, Math.max(0, value.lastIndexOf('/'))), name: value.slice(value.lastIndexOf('/') + 1) });
    const before = split(move.oldPath), after = split(move.newPath);
    const moved = before.directory !== after.directory;
    const renamed = before.name !== after.name;
    const kind: IdentityChangeKind = moved && renamed ? 'moved-renamed' : moved ? 'moved' : 'renamed';
    const from = before.directory ? before.directory.split('/') : [];
    const to = after.directory ? after.directory.split('/') : [];
    // Keep unchanged trailing folders inside the group rather than treating each
    // nesting level as a different move.
    if (moved) while (from.length && to.length && from.at(-1) === to.at(-1)) { from.pop(); to.pop(); }
    const rename = splitPathChange(before.name, after.name);
    const beforeDirectory = from.join('/'), afterDirectory = to.join('/');
    const key = record.moves.length > 1 ? JSON.stringify(['individual', record.id])
      : JSON.stringify([kind, identityGuidance(record), ...(moved ? [beforeDirectory, afterDirectory] : []), ...(renamed ? [rename.before, rename.after] : [])]);
    let group = groups.get(key);
    if (!group) {
      group = { key, beforeDirectory, afterDirectory, beforeName: rename.before, afterName: rename.after, records: [] };
      groups.set(key, group);
      sections.find(section => section.kind === kind)!.groups.push(group);
    }
    group.records.push(record);
  }
  return sections.filter(section => section.groups.length > 0);
}
