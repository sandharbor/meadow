/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceProposalReview, ProposalConfiguration } from '../../../../../../../contracts/types/sourcingProposal.js';
import type { CustomFilterConfig } from '../../../../../../../contracts/types/customFilters.js';
import { sameProposalValue } from '../../../../../../../shared_code/utils/proposalConfigurationMerge.js';
import { bundleNodeKeySourceGraphPath } from '../../../../../../../shared_code/utils/bundleNodeKey.js';
import type { EncodedBundleNodeKey } from '../../../../../../../contracts/types/bundleNodeKey.js';

type Entry = { key: string; name: string; setting: string; before: string; after: string; tracking?: boolean };
export const proposalSettingLabels: Record<string, string> = {
  name: 'Name', note: 'Description', enabled: 'Enabled', scope: 'Applies to', selectors: 'Matching rules',
  actions: 'Actions', selectorApplicationCriteria: 'Combine rules', listType: 'Tracking', deletedDefaultFilterIds: 'Removed default filters',
  outlinksDepth: 'Outlink depth', inlinksDepth: 'Inlink depth', defaultOutlinksDepth: 'Default outlink depth',
  defaultInlinksDepth: 'Default inlink depth',
  entryBundleNodeId: 'Starting entry', defaultTraversalBundleNodeId: 'Traversal entry',
  sourceDirectory: 'Source directory', sources: 'Connected sources', disabledGlobalFilters: 'Disabled global filters',
  bundleNodeName: 'Name', sourceGraphSubdirectory: 'Location', sourceId: 'Source', memberBundleNodeIds: 'Members',
};
const ignored = new Set(['trackNewPages', 'bundleGuid', 'bundleNodeId', 'bundleNodeKind', 'fileType', 'trackingEvidence',
  'bundleCreatedAt', 'bundleUpdatedAt', 'bundleLastPublishedAt', 'generatedBundleVersions']);

function display(value: unknown): string {
  if (value === undefined || value === null) return 'Default';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (Array.isArray(value)) return value.length ? value.map(display).join('; ') : 'None';
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${proposalSettingLabels[key] ?? key}: ${display(item)}`).join(' · ');
  return String(value) || 'None';
}
function filterDescription(filter: CustomFilterConfig | undefined): string {
  if (!filter) return 'Not defined';
  const selectors = filter.selectors.map(selector => `${selector.field} ${selector.matchType === 'regex' ? 'matches' : 'contains'} “${selector.value}”${selector.caseSensitive ? ' (case sensitive)' : ''}`);
  const actions = filter.actions.map(action => action.type === 'mark_sensitive' ? 'Mark sensitive' : action.type === 'fade' ? 'Fade' : `Highlight ${action.color ?? ''}${action.isDashed ? ' (dashed)' : ''}`);
  return `${filter.name} · ${filter.scope === 'global' ? 'All bundles' : 'This bundle'} · ${filter.enabled ? 'Enabled' : 'Disabled'} · ${selectors.join(filter.selectorApplicationCriteria === 'intersection' ? ' AND ' : ' OR ')} · ${actions.join(', ')}${filter.note ? ` · ${filter.note}` : ''}`;
}

/** Describe only staged intent; independent saved edits are merged separately. */
export function proposalSettingsEntries(review: SourceProposalReview): Entry[] {
  const { original, proposed } = review.proposal;
  const entries: Entry[] = [];
  const compare = (name: string, key: string, before: object, after: object) => {
    const old = before as Record<string, unknown>, next = after as Record<string, unknown>;
    for (const field of new Set([...Object.keys(old), ...Object.keys(next)])) {
      if (ignored.has(field) || field === 'listType' || sameProposalValue(old[field], next[field])) continue;
      entries.push({ key: `${key}:${field}`, name, setting: proposalSettingLabels[field] ?? field.replace(/([A-Z])/g, ' $1'), before: display(old[field]), after: display(next[field]) });
    }
  };
  compare('Bundle', 'bundle', original.bundle, proposed.bundle);
  const tracking = (value?: ProposalConfiguration['nodes'][number]) => value?.listType === 'blacklist' ? 'Blacklisted' : value ? 'Tracked' : 'Untracked';
  const decisionIds = new Set(Object.values(review.proposal.tracking).map(decision => decision.bundleNodeId));
  for (const id of new Set([...original.nodes, ...proposed.nodes].map(node => node.bundleNodeId))) {
    const before = original.nodes.find(node => node.bundleNodeId === id), after = proposed.nodes.find(node => node.bundleNodeId === id);
    const name = (after ?? before)!.bundleNodeName;
    if (before && after) compare(name, id, before, after);
    // Explicit decisions get their own row below.
    if (!decisionIds.has(id) && tracking(before) !== tracking(after)) entries.push({ key: `${id}:tracking`, name, setting: 'Tracking', before: tracking(before), after: tracking(after), tracking: true });
  }
  for (const [key, decision] of Object.entries(review.proposal.tracking)) {
    const before = original.nodes.find(node => node.bundleNodeId === decision.bundleNodeId);
    const name = proposed.nodes.find(node => node.bundleNodeId === decision.bundleNodeId)?.bundleNodeName ?? before?.bundleNodeName ?? bundleNodeKeySourceGraphPath(key as EncodedBundleNodeKey);
    entries.push({ key: `tracking:${key}`, name, setting: 'Tracking choice',
      before: tracking(before), after: `${decision.track ? 'Tracked' : 'Untracked'}${decision.needsConfirmation ? ' · Confirmation required' : ''}${decision.invalidated ? ' · Page no longer included' : ''}`, tracking: true });
  }
  const beforeFilters = [...original.bundleFilters, ...original.globalFilters], afterFilters = [...proposed.bundleFilters, ...proposed.globalFilters];
  for (const id of new Set([...beforeFilters, ...afterFilters].map(filter => filter.id))) {
    const before = beforeFilters.find(filter => filter.id === id), after = afterFilters.find(filter => filter.id === id);
    if (filterDescription(before) === filterDescription(after)) continue;
    entries.push({ key: `filter:${id}`, name: (after ?? before)!.name, setting: 'Filter definition', before: filterDescription(before), after: filterDescription(after) });
  }
  if (!sameProposalValue(original.deletedDefaultFilterIds, proposed.deletedDefaultFilterIds)) entries.push({ key: 'defaults', name: 'Default filters', setting: 'Removed definitions', before: display(original.deletedDefaultFilterIds), after: display(proposed.deletedDefaultFilterIds) });
  return entries;
}

export type ProposalSettingsEntry = Entry;

/** Before and after values for staged settings or tracking choices. */
export function ProposalEntriesTable({ entries, label }: { entries: Entry[]; label: string }) {
  return <table aria-label={label} className="w-full table-fixed text-left text-xs">
    <thead className="text-neutral-500"><tr><th className="w-1/3 px-2 py-1.5 font-medium">{label}</th><th className="px-2 py-1.5 font-medium">Before this proposal</th><th className="px-2 py-1.5 font-medium">Proposed</th></tr></thead>
    <tbody>{entries.map(entry => <tr key={entry.key} className="border-t border-neutral-100 align-top">
      <th className="px-2 py-1.5 font-normal"><strong className="block [overflow-wrap:anywhere]">{entry.name}</strong><span className="text-neutral-500">{entry.setting}</span></th>
      <td className="break-words px-2 py-1.5 text-neutral-600">{entry.before}</td><td className="break-words px-2 py-1.5">{entry.after}</td>
    </tr>)}</tbody>
  </table>;
}
