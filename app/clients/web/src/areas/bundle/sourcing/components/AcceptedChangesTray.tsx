/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Graph } from '../../../../../../../contracts/types/graph.js';
import type { IBundleNode } from '../../../../../../../contracts/types/IBundleNode.js';
import type { EncodedBundleNodeKey } from '../../../../../../../contracts/types/bundleNodeKey.js';
import type { SourceProposalReview, SourceNodeReview } from '../../../../../../../contracts/types/sourcingProposal.js';
import { readEditorView, writeEditorView } from '../../../../shared/utils/editorViewStorage.js';
import { sourceReviewAppearance } from '../../../../shared/utils/sourceReviewAppearance.js';
import { proposalSettingsEntries, ProposalEntriesTable, TrackingChangesTable } from './ProposalSettingsSummary.js';
import type { ProposalDialog } from './ProposalDialogs.js';
import type { SourceOrphanExplanation } from '../../../../../../../contracts/types/sourcing.js';
import { SourcingComponentContentComparison, SourcingComponentOrphanDiagnosis, useSourcingStateLineCounts, type SourcingTypeEditorOperations } from '../../shared-sourcing-curation/exported.js';
import { SourcePath } from './SourceReviewPresentation.js';
import { bundleNodeKeySourceGraphPath } from '../../../../../../../shared_code/utils/bundleNodeKey.js';

type Detail = 'pages' | 'configuration' | 'settings' | 'tracking';
const detailTitles: Record<Detail, string> = { pages: 'Page changes', configuration: 'Configuration removals', settings: 'Setting changes', tracking: 'Tracking changes' };
/** The caret's base width; its height reaches to just below Accept changes. */
const caretWidth = 22, caretGap = 4;
type Item = { id: string; label: string; blocker?: boolean } & ({ detail: Detail } | { dialog: Exclude<ProposalDialog, null> });

const pageKinds = ['added', 'moved', 'modified', 'departing'] as const satisfies readonly SourceNodeReview['kind'][];
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Everything Accept changes would apply, grouped as the tray presents it. */
export function acceptedChanges(review: SourceProposalReview, graph: Graph | null, sensitiveCount: number) {
  const entries = proposalSettingsEntries(review);
  const settings = entries.filter(entry => !entry.tracking), tracking = entries.filter(entry => entry.tracking);
  const pages = (graph?.getAllNodes() ?? []).filter(node => pageKinds.some(kind => node.sourceReview?.kind === kind));
  // Removing a tracked page drops its saved configuration, which untracks it.
  const removals = pages.filter(page => page.sourceReview?.orphanedConfiguration && !page.sourceReview.orphan?.removalBlockedReason)
    .map(page => ({ key: page.bundleNodeKey, name: page.bundleNodeName }));
  // Track added pages: the safe additions it tracks while on, and the sensitive ones it never tracks.
  const named = (key: string) => ({ key: key as EncodedBundleNodeKey, name: graph?.getNode(key as EncodedBundleNodeKey)?.bundleNodeName ?? bundleNodeKeySourceGraphPath(key as EncodedBundleNodeKey) });
  const { enabled, eligible, sensitiveSkipped } = review.additionTracking;
  const additions = { enabled, available: eligible.length + sensitiveSkipped.length > 0,
    automatic: enabled ? eligible.map(named) : [], sensitiveSkipped: enabled ? sensitiveSkipped.map(named) : [] };
  const trackingCount = tracking.length + removals.length + additions.automatic.length;
  // Configuration that was already unreachable has no comparison node, so it is listed separately.
  const unlisted = graph ? review.orphans.filter(orphan => !pages.some(page => page.sourceReview?.orphan?.bundleNodeId === orphan.bundleNodeId)) : [];
  // Identity decisions come first: they are made before the graph opens.
  const items: Item[] = [
    ...review.moves.length ? [{ id: 'identities', label: plural(review.moves.length, 'identity decision', 'identity decisions'), dialog: 'identities' as const }] : [],
    ...pages.length ? [{ id: 'pages', label: plural(pages.length, 'page change', 'page changes'), detail: 'pages' as const }] : [],
    ...unlisted.length ? [{ id: 'configuration', label: plural(unlisted.length, 'configuration removal', 'configuration removals'), detail: 'configuration' as const }] : [],
    ...settings.length ? [{ id: 'settings', label: plural(settings.length, 'setting change', 'setting changes'), detail: 'settings' as const }] : [],
    // Skipped sensitive additions are listed in Tracking changes, so its chip stays available for them.
    ...trackingCount || additions.sensitiveSkipped.length ? [{ id: 'tracking', label: plural(trackingCount, 'tracking change', 'tracking changes'), detail: 'tracking' as const }] : [],
    ...review.conflicts.length ? [{ id: 'conflicts', label: `Resolve ${plural(review.conflicts.length, 'conflict', 'conflicts')}`, dialog: 'conflicts' as const, blocker: true }] : [],
    ...sensitiveCount ? [{ id: 'sensitivity', label: `Confirm ${plural(sensitiveCount, 'tracking choice', 'tracking choices')}`, dialog: 'sensitivity' as const, blocker: true }] : [],
  ];
  return { items, pages, unlisted, settings, tracking, removals, additions };
}

/** What Accept changes applies, attached to the Accept button so each staged change can be inspected. */
export function AcceptedChangesTray({ changes, graph, bundleSlug, acceptButton, request, busy = false, onTrackAdditions, onDialog, onSelectPage }: {
  changes: ReturnType<typeof acceptedChanges>;
  graph: Graph | null;
  bundleSlug: string;
  acceptButton: RefObject<HTMLButtonElement>;
  request: SourcingTypeEditorOperations['request'];
  busy?: boolean;
  onTrackAdditions: (enabled: boolean) => void;
  onDialog: (dialog: Exclude<ProposalDialog, null>) => void;
  onSelectPage: (key: EncodedBundleNodeKey) => void;
}) {
  const [open, setOpen] = useState<Detail | null>(() => readEditorView<Detail | null>(bundleSlug, 'sourcing', 'acceptedChangesDetail', null));
  const show = useCallback((detail: Detail | null) => { setOpen(detail); writeEditorView(bundleSlug, 'sourcing', 'acceptedChangesDetail', detail); }, [bundleSlug]);
  const { items, pages, unlisted, settings, tracking, removals, additions } = changes;
  const selectEntryPage = (page: { bundleNodeId?: string; bundleNodeKey?: EncodedBundleNodeKey }) => {
    const key = graph?.getAllNodes().find(node => page.bundleNodeId && node.bundleNodeId === page.bundleNodeId)?.bundleNodeKey ?? page.bundleNodeKey;
    if (key && graph?.getNode(key)) { show(null); onSelectPage(key); }
  };
  const visible = open && items.some(item => 'detail' in item && item.detail === open) ? open : null;
  // Comparing a page keeps Page changes open underneath, so the next page is one click away.
  const [compared, setCompared] = useState<IBundleNode | null>(null);

  const row = useRef<HTMLDivElement>(null);
  const tray = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState<{ right: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const button = acceptButton.current?.getBoundingClientRect(), bubble = tray.current?.getBoundingClientRect();
      setCaret(button && bubble ? {
        // Offsets are measured inside the bubble's 1px border.
        right: Math.max(12, bubble.right - 1 - (button.left + button.width / 2) - caretWidth / 2),
        height: Math.max(8, bubble.top - button.bottom - caretGap),
      } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const element of [acceptButton.current, tray.current]) if (element) observer.observe(element);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [acceptButton, items.length]);
  useEffect(() => {
    if (!visible) return;
    const outside = (event: PointerEvent) => { if (!row.current?.contains(event.target as Node)) show(null); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [visible, show]);

  const close = () => { const chip = row.current?.querySelector<HTMLButtonElement>(`[data-change-item="${visible}"]`); show(null); chip?.focus(); };
  return <div ref={row} className="relative flex justify-end border-b px-5 pb-1.5 pt-1" onKeyDown={event => { if (event.key === 'Escape' && visible && !compared) { event.stopPropagation(); close(); } }}>
    <div ref={tray} role="region" aria-label="Changes to accept" data-testid="accepted-changes"
      className="relative flex max-w-full flex-wrap items-center justify-end gap-x-2 gap-y-1.5 rounded-lg border border-blue-700 bg-blue-50 px-1.5 py-1.5 text-sm shadow-sm">
      {caret !== null && <svg aria-hidden="true" data-testid="accepted-changes-caret" width={caretWidth} height={caret.height + 1} viewBox={`0 0 ${caretWidth} ${caret.height + 1}`}
        className="absolute z-10 overflow-visible text-blue-700" style={{ right: caret.right, top: -(caret.height + 1) }}>
        {/* The fill extends over the tray's top border so the caret and bubble read as one shape. */}
        <path d={`M0 ${caret.height + 1} L${caretWidth / 2} 0.5 L${caretWidth} ${caret.height + 1} Z`} className="fill-blue-50" />
        <path d={`M0.5 ${caret.height} L${caretWidth / 2} 0.5 L${caretWidth - 0.5} ${caret.height}`} fill="none" stroke="currentColor" strokeLinejoin="round" />
      </svg>}
      {!items.length && <span className="px-1 py-0.5 text-xs font-medium text-blue-900/60">No changes yet</span>}
      {items.map(item => {
        const expanded = 'detail' in item ? visible === item.detail : undefined;
        return <button key={item.id} type="button" data-change-item={item.id} aria-expanded={expanded} aria-haspopup={'dialog' in item ? 'dialog' : undefined}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-700 ${item.blocker
            ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
            : expanded ? 'border-blue-700 bg-blue-700 text-white' : 'border-blue-200 bg-white text-blue-900 hover:border-blue-300 hover:bg-blue-100'}`}
          onClick={() => 'dialog' in item ? (show(null), onDialog(item.dialog)) : show(expanded ? null : item.detail)}>
          {item.blocker && <span aria-hidden="true">⚠</span>}
          {item.id === 'pages' && <PageKindDots pages={pages} inverted={Boolean(expanded)} />}
          {item.label}
          {'detail' in item && <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className={expanded ? 'rotate-180' : undefined}><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>}
        </button>;
      })}
      {(additions.available || additions.enabled) && <span data-testid="track-additions" className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white px-2.5 py-0.5 font-medium text-blue-900">
        <label className="inline-flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" className="h-3.5 w-3.5 rounded border-blue-300 text-blue-700 focus:ring-blue-700" checked={additions.enabled} disabled={busy}
            onChange={event => onTrackAdditions(event.target.checked)} />
          Track added pages
        </label>
        {additions.sensitiveSkipped.length > 0 && <button type="button" data-testid="track-additions-sensitive" title="Show the sensitive pages that stay untracked"
          className="text-amber-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700" onClick={() => show('tracking')}>
          · {additions.sensitiveSkipped.length} sensitive skipped</button>}
      </span>}
    </div>
    {visible && <section aria-label={detailTitles[visible]}
      className="absolute right-5 top-full z-50 mt-1 max-h-[60vh] w-[min(38rem,calc(100vw-2.5rem))] overflow-auto rounded-lg border border-neutral-200 bg-white text-sm shadow-xl">
      <header className="sticky top-0 flex items-center gap-3 border-b border-neutral-100 bg-white px-4 py-2.5">
        <h2 className="font-semibold">{detailTitles[visible]}</h2>
        <button type="button" aria-label="Close" className="ml-auto rounded px-1.5 text-lg leading-none text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800" onClick={close}>×</button>
      </header>
      <div className="p-3">
        {visible === 'pages' && <PageChanges pages={pages} request={request} onCompare={setCompared} onSelect={key => { show(null); onSelectPage(key); }} />}
        {visible === 'configuration' && <Explained text="These pages were already unreachable before this proposal, so they are not in the graph. Accepting removes their saved configuration. The source files are untouched."><ConfigurationRemovals orphans={unlisted} /></Explained>}
        {visible === 'settings' && <Explained text="Global filter definitions apply to all bundles in both sourcing and curation."><ProposalEntriesTable label="Setting" entries={settings} onSelectPage={selectEntryPage} /></Explained>}
        {visible === 'tracking' && <TrackingChangesTable entries={tracking} removals={removals} automatic={additions.automatic} sensitiveSkipped={additions.sensitiveSkipped} onSelectPage={selectEntryPage} />}
      </div>
    </section>}
    {compared?.sourceReview && <SourcingComponentContentComparison evidence={compared.sourceReview} request={request} onClose={() => setCompared(null)} />}
  </div>;
}

function Explained({ text, children }: { text: string; children: ReactNode }) {
  return <><p className="mb-2 px-2 text-xs text-neutral-500">{text}</p>{children}</>;
}

function ConfigurationRemovals({ orphans }: { orphans: SourceOrphanExplanation[] }) {
  // The full path identifies each page on its own; the folder reads muted and the file name stands out.
  return <ul className="divide-y divide-neutral-100">{[...orphans].sort((a, b) => a.path.localeCompare(b.path)).map(orphan => <li key={orphan.bundleNodeId}>
    <details data-testid="accepted-configuration-removal" className="group px-2 py-1.5 text-xs">
      <summary className="flex cursor-pointer list-none items-baseline gap-2 rounded hover:bg-neutral-50" aria-label={`Details ${orphan.title}`}>
        <span aria-hidden="true" className="text-neutral-400 group-open:rotate-90">›</span>
        <span className="min-w-0"><SourcePath value={orphan.path} /></span>
      </summary>
      <div className="ml-4 mt-2"><SourcingComponentOrphanDiagnosis orphan={orphan} /></div>
    </details>
  </li>)}</ul>;
}

function PageKindDots({ pages, inverted }: { pages: IBundleNode[]; inverted: boolean }) {
  return <span aria-hidden="true" className="inline-flex gap-0.5">{pageKinds.filter(kind => pages.some(page => page.sourceReview?.kind === kind)).map(kind =>
    <span key={kind} className={`h-2 w-2 rounded-full ${inverted ? 'ring-1 ring-white' : ''}`} style={{ backgroundColor: sourceReviewAppearance[kind].color }} />)}</span>;
}

function PageChanges({ pages, request, onCompare, onSelect }: { pages: IBundleNode[]; request: SourcingTypeEditorOperations['request']; onCompare: (page: IBundleNode) => void; onSelect: (key: EncodedBundleNodeKey) => void }) {
  return <div className="space-y-3">{pageKinds.map(kind => {
    const matching = pages.filter(page => page.sourceReview?.kind === kind).sort((a, b) => a.bundleNodeName.localeCompare(b.bundleNodeName));
    if (!matching.length) return null;
    const appearance = sourceReviewAppearance[kind];
    return <section key={kind} aria-label={appearance.label}>
      <h3 className="mb-1 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wide" style={{ color: appearance.color }}>
        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: appearance.color }} />{appearance.label}<span className="font-normal text-neutral-500">{matching.length}</span>
      </h3>
      <PageChangeRows pages={matching} request={request} onCompare={onCompare} onSelect={onSelect} />
    </section>;
  })}</div>;
}

/** A section's rows share columns; a count column appears only when some row in the section has a nonzero value. */
function PageChangeRows({ pages, request, onCompare, onSelect }: { pages: IBundleNode[]; request: SourcingTypeEditorOperations['request']; onCompare: (page: IBundleNode) => void; onSelect: (key: EncodedBundleNodeKey) => void }) {
  const counts = pages.map(page => page.sourceReview?.lineCounts);
  // Each count column is as wide as its widest value, so short counts sit close to the page name.
  const width = (side: 'added' | 'removed') => counts.some(count => (count?.[side] ?? 0) > 0)
    ? `${Math.max(...counts.map(count => String(count?.[side] ?? 0).length)) + 1}ch` : null;
  const columns = { added: width('added'), removed: width('removed') };
  return <ul>{pages.map(page => <PageChangeRow key={page.bundleNodeKey} page={page} request={request} columns={columns} onCompare={onCompare} onSelect={onSelect} />)}</ul>;
}

/** One row of the Page changes table: View, added lines, removed lines, then the page. */
function PageChangeRow({ page, request, columns, onCompare, onSelect }: { page: IBundleNode; request: SourcingTypeEditorOperations['request']; columns: { added: string | null; removed: string | null }; onCompare: (page: IBundleNode) => void; onSelect: (key: EncodedBundleNodeKey) => void }) {
  const review = page.sourceReview!;
  const content = useSourcingStateLineCounts(review, request);
  const removed = review.kind === 'departing';
  const counts = content?.counts;
  const canCompare = removed ? content?.hasPreviousContent : review.modification?.source !== false;
  return <li className="flex items-center gap-1.5 rounded px-2 hover:bg-blue-50">
    <span className="w-6 shrink-0">{canCompare && <button type="button" aria-label={`View ${page.bundleNodeName}`} title="View changes" onClick={() => onCompare(page)}
      className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-blue-100 hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">
      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" /><circle cx="10" cy="10" r="2.5" /></svg>
    </button>}</span>
    {columns.added && <span data-testid="accepted-page-added-lines" style={{ width: columns.added }} className={`shrink-0 text-right text-xs font-medium tabular-nums text-success-600 ${counts?.added === 0 ? 'opacity-20' : ''}`}>{counts && !removed ? `+${counts.added}` : ''}</span>}
    {columns.removed && <span data-testid="accepted-page-removed-lines" style={{ width: columns.removed }} className={`shrink-0 text-right text-xs font-medium tabular-nums text-danger-600 ${counts?.removed === 0 ? 'opacity-20' : ''}`}>{counts ? `-${counts.removed}` : ''}</span>}
    <button type="button" data-testid="accepted-page-change" data-bundle-node-key={page.bundleNodeKey} className="flex min-w-0 flex-1 items-baseline gap-2 py-1 pl-1 text-left focus-visible:bg-blue-50 focus-visible:outline-none" onClick={() => onSelect(page.bundleNodeKey)}>
      <span className="min-w-0 flex-1 truncate">{page.bundleNodeName}
        {/* Names omit the extension; anything other than a Markdown page shows it. */}
        {page.bundleNodeKind === 'file' && page.fileType && page.fileType !== 'md' && <span className="text-neutral-400">.{page.fileType}</span>}</span>
    </button>
  </li>;
}

import type { ParticipatesIn, proposalConfigurationDraft } from '../../../../../../../concepts/index.js';
export type AcceptedChangesTrayMeadowConceptParticipations = [
  ParticipatesIn<typeof proposalConfigurationDraft, 'summarize-draft', typeof AcceptedChangesTray>,
];
