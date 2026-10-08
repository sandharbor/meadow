/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceProposalReview, ProposalConfiguration } from '../../../../../../../contracts/types/sourcingProposal.js';
import type { CustomFilterConfig } from '../../../../../../../contracts/types/customFilters.js';
import { sameProposalValue } from '../../../../../../../shared_code/utils/proposalConfigurationMerge.js';
import { bundleNodeKeySourceGraphPath } from '../../../../../../../shared_code/utils/bundleNodeKey.js';
import { useState, type ReactNode } from 'react';
import type { EncodedBundleNodeKey } from '../../../../../../../contracts/types/bundleNodeKey.js';
import { TrackingStatePills, type TrackingState } from '../../../../shared/components/TrackingStatePills.js';

/** `page` identifies the page a row describes, so the row can select it. */
type Entry = { key: string; name: string; setting: string; before: string; after: string; tracking?: { before: TrackingState; after: TrackingState; notes: string[] }; page?: { bundleNodeId?: string; bundleNodeKey?: EncodedBundleNodeKey } };
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
  const compare = (name: string, key: string, before: object, after: object, page?: Entry['page']) => {
    const old = before as Record<string, unknown>, next = after as Record<string, unknown>;
    for (const field of new Set([...Object.keys(old), ...Object.keys(next)])) {
      if (ignored.has(field) || field === 'listType' || sameProposalValue(old[field], next[field])) continue;
      entries.push({ key: `${key}:${field}`, name, ...(page && { page }), setting: proposalSettingLabels[field] ?? field.replace(/([A-Z])/g, ' $1'), before: display(old[field]), after: display(next[field]) });
    }
  };
  compare('Bundle', 'bundle', original.bundle, proposed.bundle);
  const state = (value?: ProposalConfiguration['nodes'][number]): TrackingState => value?.listType === 'blacklist' ? 'blacklisted' : value ? 'tracked' : 'untracked';
  const label = (value: TrackingState) => ({ tracked: 'Tracked', untracked: 'Untracked', blacklisted: 'Blacklisted' })[value];
  const decisionIds = new Set(Object.values(review.proposal.tracking).map(decision => decision.bundleNodeId));
  for (const id of new Set([...original.nodes, ...proposed.nodes].map(node => node.bundleNodeId))) {
    const before = original.nodes.find(node => node.bundleNodeId === id), after = proposed.nodes.find(node => node.bundleNodeId === id);
    const name = (after ?? before)!.bundleNodeName;
    if (before && after) compare(name, id, before, after, { bundleNodeId: id });
    // Explicit decisions get their own row below.
    if (!decisionIds.has(id) && state(before) !== state(after)) entries.push({ key: `${id}:tracking`, name, page: { bundleNodeId: id }, setting: 'Tracking change',
      before: label(state(before)), after: label(state(after)), tracking: { before: state(before), after: state(after), notes: [] } });
  }
  for (const [key, decision] of Object.entries(review.proposal.tracking)) {
    // Track added pages lists its own decisions separately.
    if (decision.origin === 'additions') continue;
    const before = original.nodes.find(node => node.bundleNodeId === decision.bundleNodeId);
    const name = proposed.nodes.find(node => node.bundleNodeId === decision.bundleNodeId)?.bundleNodeName ?? before?.bundleNodeName ?? bundleNodeKeySourceGraphPath(key as EncodedBundleNodeKey);
    const after: TrackingState = decision.track ? 'tracked' : 'untracked';
    const notes = [...decision.needsConfirmation ? ['Confirmation required'] : [], ...decision.invalidated ? ['Page no longer included'] : []];
    entries.push({ key: `tracking:${key}`, name, page: { bundleNodeId: decision.bundleNodeId, bundleNodeKey: key as EncodedBundleNodeKey }, setting: 'Tracking change',
      before: label(state(before)), after: [label(after), ...notes].join(' · '), tracking: { before: state(before), after, notes } });
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

type SelectEntryPage = (page: NonNullable<Entry['page']>) => void;

/** Before and after values for staged settings. A row about a page selects that page. */
export function ProposalEntriesTable({ entries, label, onSelectPage }: { entries: Entry[]; label: string; onSelectPage?: SelectEntryPage }) {
  return <table aria-label={label} className="w-full table-fixed text-left text-xs">
    <thead className="text-neutral-500"><tr><th className="w-1/3 px-2 py-1.5 font-medium">{label}</th><th className="px-2 py-1.5 font-medium">Before this proposal</th><th className="px-2 py-1.5 font-medium">Proposed</th></tr></thead>
    <tbody>{entries.map(entry => {
      const select = entry.page && onSelectPage ? () => onSelectPage(entry.page!) : undefined;
      return <tr key={entry.key} onClick={select} title={select && `Select "${entry.name}"`} className={`border-t border-neutral-100 align-top ${select ? 'cursor-pointer hover:bg-blue-50' : ''}`}>
      <th className="px-2 py-1.5 font-normal">{select
        ? <button type="button" data-testid="proposal-entry-page" onClick={event => { event.stopPropagation(); select(); }}
          className="block text-left font-semibold [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">{entry.name}</button>
        : <strong className="block [overflow-wrap:anywhere]">{entry.name}</strong>}<span className="text-neutral-500">{entry.setting}</span></th>
      <td className="break-words px-2 py-1.5 text-neutral-600">{entry.before}</td><td className="break-words px-2 py-1.5">{entry.after}</td>
    </tr>;
    })}</tbody>
  </table>;
}

/** A page named in a tracking group that has no staged decision of its own. */
export type TrackingPage = { key: EncodedBundleNodeKey; name: string };

const byName = (pages: TrackingPage[]) => [...pages].sort((a, b) => a.name.localeCompare(b.name));
const trackingColumns = 'grid grid-cols-[minmax(0,1fr)_9rem_0.75rem_10rem] items-center gap-x-2';

/** One page's tracking before and proposed, as a whole-row button that selects the page. */
function TrackingRow({ name, testId, before, after, onSelect }: { name: string; testId: string; before: ReactNode; after: ReactNode; onSelect?: () => void }) {
  return <button type="button" role="row" data-testid={testId} disabled={!onSelect} onClick={onSelect} title={`Select "${name}"`}
    className={`${trackingColumns} w-full rounded border-t border-neutral-100 px-2 py-1.5 text-left enabled:hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700`}>
    <span role="cell" className="font-semibold [overflow-wrap:anywhere]">{name}</span>
    <span role="cell" className="opacity-50">{before}</span>
    <span aria-hidden="true" className="text-neutral-400">→</span>
    <span role="cell" className="flex flex-wrap items-center gap-1">{after}</span>
  </button>;
}

/** A group of pages behind a quiet toggle, listed in name order. */
function TrackingGroup({ label, testId, pages, open, onToggle, children }: { label: string; testId: string; pages: TrackingPage[]; open: boolean; onToggle?: () => void; children: (page: TrackingPage) => ReactNode }) {
  if (!pages.length) return null;
  return <>
    {onToggle && <button type="button" aria-expanded={open} data-testid={testId} onClick={onToggle}
      className="flex w-full items-center gap-1 border-t border-neutral-100 px-2 py-1.5 text-neutral-500 hover:text-neutral-800">
      {label}
      <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className={open ? undefined : '-rotate-90'}><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
    </button>}
    {open && byName(pages).map(children)}
  </>;
}

/**
 * Tracking changes as whole-row buttons: the page, its earlier state faded, an arrow, and the proposed state.
 * Changes made in this review come first. Sensitive additions that Track added pages skips follow, then the
 * pages it tracks and the removals that untrack pages, each behind a small toggle unless it is the only group.
 */
export function TrackingChangesTable({ entries, removals, automatic = [], sensitiveSkipped = [], onSelectPage }: {
  entries: Entry[]; removals: TrackingPage[]; automatic?: TrackingPage[]; sensitiveSkipped?: TrackingPage[]; onSelectPage: SelectEntryPage;
}) {
  const [shown, setShown] = useState<{ automatic: boolean; removals: boolean }>({ automatic: false, removals: false });
  const groups = [entries.length, sensitiveSkipped.length, automatic.length, removals.length].filter(Boolean).length;
  const toggle = (group: 'automatic' | 'removals') => groups > 1 ? () => setShown(current => ({ ...current, [group]: !current[group] })) : undefined;
  const select = (page: TrackingPage) => () => onSelectPage({ bundleNodeKey: page.key });
  return <div role="table" aria-label="Tracking changes" className="text-xs">
    <div role="row" className={`${trackingColumns} px-2 py-1.5 font-medium text-neutral-500`}>
      <span role="columnheader">Page</span><span role="columnheader">Before</span><span aria-hidden="true" /><span role="columnheader">Proposed</span>
    </div>
    {entries.map(entry => entry.tracking && <TrackingRow key={entry.key} testId="tracking-change" name={entry.name} onSelect={entry.page && (() => onSelectPage(entry.page!))}
      before={<TrackingStatePills state={entry.tracking.before} />}
      after={<><TrackingStatePills state={entry.tracking.after} />{entry.tracking.notes.map(note => <span key={note} className="text-amber-800">{note}</span>)}</>} />)}
    {sensitiveSkipped.length > 0 && <p data-testid="tracking-sensitive-skipped-heading" className="border-t border-neutral-100 px-2 pb-0.5 pt-2 font-medium text-amber-800">Sensitive · not tracked automatically</p>}
    {byName(sensitiveSkipped).map(page => <TrackingRow key={page.key} testId="tracking-sensitive-skipped" name={page.name} onSelect={select(page)}
      before={<TrackingStatePills state="untracked" />} after={<><TrackingStatePills state="untracked" /><span className="inline-block rounded-full bg-danger-100 px-2 py-0.5 text-danger-800">Sensitive</span></>} />)}
    <TrackingGroup label={`Tracked automatically · ${automatic.length}`} testId="tracking-automatic-toggle" pages={automatic} open={shown.automatic || groups === 1} onToggle={toggle('automatic')}>
      {page => <TrackingRow key={page.key} testId="tracking-automatic" name={page.name} onSelect={select(page)} before={<TrackingStatePills state="untracked" />} after={<TrackingStatePills state="tracked" />} />}</TrackingGroup>
    <TrackingGroup label={`and ${removals.length} ${removals.length === 1 ? 'removal' : 'removals'}`} testId="tracking-removals-toggle" pages={removals} open={shown.removals || groups === 1} onToggle={toggle('removals')}>
      {page => <TrackingRow key={page.key} testId="tracking-removal" name={page.name} onSelect={select(page)} before={<TrackingStatePills state="tracked" />} after={<TrackingStatePills state="untracked" removed />} />}</TrackingGroup>
  </div>;
}
