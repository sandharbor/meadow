/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceNodeReview, SourceRemovalCause, SourceSettingChange } from '../../../../../../../contracts/types/sourcingProposal.js';
import type { EncodedBundleNodeKey } from '../../../../../../../contracts/types/bundleNodeKey.js';
import type { Graph } from '../../../../../../../contracts/types/graph.js';
import { sourceReviewAppearance, sourceRemovalReasons, sourceModificationKinds } from '../../../../shared/utils/sourceReviewAppearance.js';
import { SourceLineCounts, useSourceLineCounts } from './SourceLineCounts.js';
import { PathChange } from '../../../../shared/components/PathChange.js';
import { SourceOrphanSentence } from './SourceOrphanDiagnosis.js';
import { useEditorOperations } from '../types/editorOperations.js';
import { SourceChangePagePill } from './SourceChangePagePill.js';
import { FilePill } from '../../../../shared/components/FilePill.js';

type SelectPage = (key: EncodedBundleNodeKey) => void;

const settingLabels: Record<SourceSettingChange['setting'], string> = { blacklist: 'Blacklist', outlinksDepth: 'Outlinks depth', inlinksDepth: 'Inlinks depth', members: 'Members' };
function describeSetting(change: SourceSettingChange) {
  if (change.setting === 'blacklist') return change.after ? 'Blacklisted' : 'No longer blacklisted';
  if (change.setting === 'members') return 'Members changed';
  const value = (side: SourceSettingChange['before']) => side === undefined ? 'inherited' : String(side);
  return `${settingLabels[change.setting]} ${value(change.before)} → ${value(change.after)}`;
}

/** A file named by path: a selectable page pill when the comparison graph has that page. */
function PathPill({ path, graph, onSelect }: { path: string; graph: Graph; onSelect: SelectPage }) {
  const page = graph.getAllNodes().find(node => (node.sourceReview?.previousPath ?? node.sourceReview?.proposedPath) === path);
  return page ? <SourceChangePagePill bundleNodeKey={page.bundleNodeKey} graph={graph} onSelect={onSelect} /> : <FilePill path={path} />;
}

/** Names the upstream break, counting the route links between it and this page. */
function RemovalCause({ cause, graph, onSelect }: { cause: SourceRemovalCause; graph: Graph; onSelect: SelectPage }) {
  const pill = (key: EncodedBundleNodeKey) => <SourceChangePagePill bundleNodeKey={key} graph={graph} onSelect={onSelect} />;
  const chain = 'from' in cause ? cause.links + 1 : cause.links;
  const tail = chain > 1 ? <>, breaking the {chain}-link route to this page.</> : '.';
  const target = cause.links === 0 ? 'this page' : pill(cause.at);
  const fromModified = cause.kind === 'link-removed' && graph.getNode(cause.from)?.sourceReview?.modification?.source;
  return <p data-testid="source-removal-cause" className="leading-relaxed">Not reachable because {
    cause.kind === 'blacklisted' ? <>{pill(cause.at)} is blacklisted</>
    : cause.kind === 'source-missing' ? <>{pill(cause.at)} is missing</>
    : cause.kind === 'source-disconnected' ? <>{pill(cause.at)}’s source is disconnected</>
    : cause.kind === 'link-removed' ? <>{pill(cause.from)} {fromModified ? 'was modified and ' : ''}no longer links to {target}</>
    : cause.kind === 'traversal' ? <>traversal settings stop at {pill(cause.from)} before reaching {target}</> : null}{tail}</p>;
}

export function SourceComparisonEvidence({ evidence, graph, onCompare, onSelectPage }: { evidence: SourceNodeReview; graph: Graph; onCompare: () => void; onSelectPage: SelectPage }) {
  const route = (keys: SourceNodeReview['previousRoute']) => keys.map(key => graph.getNode(key)?.bundleNodeName ?? key).join(' → ') || 'Not included';
  const appearance = sourceReviewAppearance[evidence.kind];
  const content = useSourceLineCounts(evidence, useEditorOperations().request);
  const removed = evidence.kind === 'departing';
  const reason = sourceRemovalReasons[evidence.removalReason ?? 'unreachable'];
  const renamed = evidence.kind === 'moved';
  const added = evidence.kind === 'added';
  const showLocations = evidence.kind !== 'modified' && !renamed && !added;
  const settingsOnly = evidence.kind === 'modified' && evidence.modification?.source === false;
  const compareLabel = evidence.kind === 'frontier' || settingsOnly || (removed && !content?.hasPreviousContent) ? null
    : removed ? 'See previous content' : added ? 'See content' : renamed ? 'See file content changes' : 'See changes';
  return <section aria-label="Source review evidence" className="my-3 space-y-2 rounded border border-blue-200 bg-blue-50 p-3 text-xs">
    <div className="flex items-center gap-2 font-semibold"><span style={{ color: appearance.color }}>{appearance.label}</span>
      <span className="ml-auto flex items-center gap-2"><SourceLineCounts counts={content?.counts} removed={removed} />
        {compareLabel && <button type="button" aria-label={compareLabel} title={compareLabel} onClick={onCompare}
          className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-1.5 py-0.5 font-medium text-neutral-700 hover:border-blue-300 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">
          <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" /><circle cx="10" cy="10" r="2.5" /></svg>View
        </button>}</span></div>
    {evidence.kind === 'modified' && evidence.modification && <div data-testid="source-modification-kinds" className="space-y-0.5 text-neutral-600">
      {evidence.modification.source && <p>{sourceModificationKinds.source.label}</p>}
      {evidence.modification.settings.length > 0 && <p>{sourceModificationKinds.config.label}: {evidence.modification.settings.map(describeSetting).join(', ')}</p>}
    </div>}
    {removed ? <>
      {/* The reason heads a disclosure holding the most specific explanation: the upstream break, then the file-level diagnosis, then the reason itself. */}
      <details data-testid="source-removal-reason" className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-neutral-700">
          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className="-rotate-90 text-neutral-500 group-open:rotate-0"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          {reason.label}
        </summary>
        <div className="mt-1.5 pl-3.5">
          {evidence.removalCause ? <RemovalCause cause={evidence.removalCause} graph={graph} onSelect={onSelectPage} />
            : evidence.removalReason === 'unreachable' && evidence.orphan?.diagnosis ? <SourceOrphanSentence orphan={evidence.orphan} pill={path => <PathPill path={path} graph={graph} onSelect={onSelectPage} />} />
            : <p>{reason.description}</p>}
        </div>
      </details>
      {evidence.orphan?.removalBlockedReason && <p className="text-amber-800">{evidence.orphan.removalBlockedReason}</p>}
    </> : <>
    {evidence.kind === 'frontier' && <p>{evidence.explanation}</p>}
    {evidence.sensitivityReasons?.map(reason => <p key={reason}>{reason}</p>)}
    {renamed && evidence.previousPath && evidence.proposedPath && <PathChange compact before={evidence.previousPath} after={evidence.proposedPath} />}
    {showLocations && <dl className="space-y-1 break-words"><dt className="font-medium">Accepted location and route</dt><dd>{evidence.previousPath ?? 'Not included'}<br />{route(evidence.previousRoute)}</dd>
      <dt className="font-medium">{evidence.kind === 'frontier' ? 'Frontier location and route' : 'Proposed location and route'}</dt><dd>{evidence.proposedPath ?? 'Not included'}<br />{route(evidence.proposedRoute)}</dd></dl>}
    </>}
  </section>;
}
