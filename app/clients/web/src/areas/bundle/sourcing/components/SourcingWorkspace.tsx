/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SnapshotTrackingOutcome } from '../../../../../../../contracts/types/curationTracking.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SourcingComponentEditor, useSourcingStateFilters } from '../../shared-sourcing-curation/exported.js';
import { Graph, type IEdge, type IBundleNode } from '../../../../../../../contracts/types/graph.js';
import type { SourceProposalReview, ProposalConfiguration } from '../../../../../../../contracts/types/sourcingProposal.js';
import type { EncodedBundleNodeKey } from '../../../../../../../contracts/types/bundleNodeKey.js';
import { buildNodeConfigs } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { SourceNamesProvider } from '../../../../shared/components/SourceNames.js';
import { useEventually, usePlaceSelection } from '../../../../shared/places/placeContext.js';
import { proposalRequest, proposalEditorOperations, ProposalRequestError } from './proposalClient.js';
import { sourceChangeFilters } from './sourceChangeFilters.js';
import { ProposalDialogs, type ProposalDialog } from './ProposalDialogs.js';
import { SourceRegistryChanges } from './SourceRegistryChanges.js';
import { ProposalSettingsSummary } from './ProposalSettingsSummary.js';
import { SourceReviewActions } from './SourceReviewActions.js';
import type { IdentityTab } from './SourceIdentityReview.js';

type PendingEdit = ProposalConfiguration | { trackingChange: Record<string, unknown> };

type Comparison = SourceProposalReview & { frontierUnavailable?: string; graph: { nodes: IBundleNode[]; edges: IEdge[]; sources: Graph['sources']; allInlinkSources: Record<string, EncodedBundleNodeKey[]>; allOutlinkTargets: Record<string, EncodedBundleNodeKey[]> } };

export function SourcingWorkspace({ bundleSlug, onClose, onAccepted, requestedParameters, onPlaceChange }: { bundleSlug: string; onClose: () => void; onAccepted: (result: { trackingOutcome?: SnapshotTrackingOutcome }) => void; requestedParameters: Readonly<Record<string, string>>; onPlaceChange: (parameters: Readonly<Record<string, string>>) => void }) {
  const [review, setReview] = useState<SourceProposalReview | null>(null);
  const reviewRef = useRef(review);
  const frontierDepthRef = useRef(0);
  const comparisonRequest = useRef(0);
  const [frontierUnavailable, setFrontierUnavailable] = useState<string | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const graphRef = useRef(graph);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingPreference, setPendingPreference] = useState<boolean | null>(null);
  const [mutating, setBusy] = useState(false);
  const [loadingCount, setLoadingCount] = useState(0);
  const busy = mutating || loadingCount > 0;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const [dialog, setDialog] = useState<ProposalDialog>(null);
  const [identityComparison, setIdentityComparison] = useState<string | undefined>();
  const [identityTab, setIdentityTab] = useState<IdentityTab>('confident');
  const [pendingConfiguration, setPendingConfiguration] = useState<PendingEdit | null>(() => {
    const stored = sessionStorage.getItem(`sourceProposalPendingEdit:${bundleSlug}`);
    return stored ? JSON.parse(stored) as PendingEdit : null;
  });
  useEffect(() => {
    if (pendingConfiguration) sessionStorage.setItem(`sourceProposalPendingEdit:${bundleSlug}`, JSON.stringify(pendingConfiguration));
    else sessionStorage.removeItem(`sourceProposalPendingEdit:${bundleSlug}`);
  }, [bundleSlug, pendingConfiguration]);
  const [selected, setSelected] = useState<Set<EncodedBundleNodeKey>>(new Set());
  const [collapsed, setCollapsed] = useState(true);
  const waitForGraph = useEventually(graph);
  const reportSelection = usePlaceSelection(async references => {
    await waitForGraph(value => value !== null);
    const nodes = graphRef.current?.getAllNodes() ?? [];
    const resolved = references.flatMap(reference => {
      const node = nodes.find(item => 'id' in reference ? item.bundleNodeId === reference.id : item.bundleNodeKey === reference.key);
      return node ? [{ reference, key: node.bundleNodeKey }] : [];
    });
    setSelected(new Set(resolved.map(item => item.key)));
    return { selected: resolved.map(item => item.reference), missing: references.length - resolved.length };
  }, 'sourcing');
  useEffect(() => { reportSelection([...selected].map(key => {
    const node = graph?.getNode(key);
    return node?.bundleNodeId ? { id: node.bundleNodeId } : { key };
  })); }, [graph, selected, reportSelection]);
  const receive = useCallback(async (value: SourceProposalReview) => {
    const requestId = ++comparisonRequest.current;
    if (value.proposal.revision < (reviewRef.current?.proposal.revision ?? 0)) return;
    reviewRef.current = value; setReview(value);
    if (value.unresolvedIdentities.length) { setDialog('identities'); setGraph(null); return; }
    if (value.missingRequiredEntries.length) { setGraph(null); return; }
    const compared = await proposalRequest<Comparison>(bundleSlug, `graph?frontierDepth=${frontierDepthRef.current}`);
    if (requestId !== comparisonRequest.current || compared.proposal.revision < (reviewRef.current?.proposal.revision ?? 0)) return;
    setFrontierUnavailable(compared.frontierUnavailable ?? null);
    reviewRef.current = compared; setReview(compared);
    const result = new Graph();
    result.sources = compared.graph.sources;
    compared.graph.nodes.forEach(node => result.addNode(node));
    compared.graph.edges.forEach(edge => result.addEdge(edge));
    result.setLinkSourceData(compared.graph.allInlinkSources, compared.graph.allOutlinkTargets);
    graphRef.current = result; setGraph(result);
  }, [bundleSlug]);
  const reload = useCallback(async () => {
    setLoadingCount(count => count + 1);
    try { await receive(await proposalRequest<SourceProposalReview>(bundleSlug)); }
    catch (err) { setError(String(err)); }
    finally { setLoadingCount(count => count - 1); }
  }, [bundleSlug, receive]);
  useEffect(() => {
    let active = true;
    let checking = false;
    const timer = window.setInterval(() => {
      if (checking || busyRef.current || document.hidden || !reviewRef.current) return;
      checking = true;
      void proposalRequest<SourceProposalReview>(bundleSlug, 'check', {}).then(value => {
        if (!active || busyRef.current || value.proposal.revision < (reviewRef.current?.proposal.revision ?? 0)) return;
        // Discovery may update availability and revalidate decisions, but the
        // comparison graph continues to use the same immutable capture.
        reviewRef.current = value; setReview(value);
      }).catch(err => { if (active) setError(err instanceof Error ? err.message : String(err)); })
        .finally(() => { checking = false; });
    }, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [bundleSlug]);
  const mutate = useCallback(async (operation: string, body: Record<string, unknown>) => {
    setBusy(true); setError(null);
    try {
      const result = await proposalRequest<SourceProposalReview>(bundleSlug, operation, { ...body, revision: reviewRef.current?.proposal.revision });
      await receive(result);
      return result;
    } catch (err) {
      if (operation === 'tracking' && err instanceof ProposalRequestError && err.code === 'source-refresh-consent') {
        setPendingConfiguration({ trackingChange: body }); setDialog('refresh');
        return reviewRef.current!;
      }
      setError(err instanceof Error ? err.message : String(err)); throw err;
    }
    finally { setBusy(false); }
  }, [bundleSlug, receive]);
  const configure = useCallback(async (configuration: ProposalConfiguration, incorporateNewerSources = false) => {
    try { await mutate('configuration', { configuration, incorporateNewerSources }); setPendingConfiguration(null); }
    catch (err) {
      if (err instanceof ProposalRequestError && err.code === 'source-refresh-consent') {
        await receive(await proposalRequest<SourceProposalReview>(bundleSlug));
        setPendingConfiguration(configuration); setDialog('refresh'); setError(null);
      }
      else throw err;
    }
  }, [bundleSlug, mutate, receive]);
  const operations = useMemo(() => proposalEditorOperations({ bundleSlug, current: () => {
    if (!reviewRef.current) throw new Error('The proposal is still loading.');
    return reviewRef.current;
  }, graph: () => graphRef.current, mutate, configure, report: setNotice }), [bundleSlug, mutate, configure]);
  const [filters, setFilters, reloadFilters] = useSourcingStateFilters(bundleSlug, operations.request, 'sourcing', { ready: Boolean(review), additionalFilters: sourceChangeFilters });
  const frontierFilter = filters.find(filter => filter.id === 'frontier-filter');
  const frontierDepth = frontierFilter?.enabled ? frontierFilter.thresholdValue ?? 1 : 0;
  frontierDepthRef.current = frontierDepth;
  useEffect(() => { void reload(); }, [reload, frontierDepth]);
  useEffect(() => { setIdentityComparison(requestedParameters.identityComparison); setIdentityTab(requestedParameters.identityTab === 'input' ? 'input' : 'confident'); setDialog((requestedParameters.review as ProposalDialog) ?? (reviewRef.current?.unresolvedIdentities.length ? 'identities' : sessionStorage.getItem(`sourceProposalPendingEdit:${bundleSlug}`) ? 'refresh' : null)); }, [requestedParameters, bundleSlug]);
  useEffect(() => { onPlaceChange(dialog ? { review: dialog, ...(dialog === 'identities' ? { identityTab } : {}), ...(identityComparison ? { identityComparison } : {}) } : {}); }, [dialog, identityComparison, identityTab, onPlaceChange]);
  const persistNodes = useCallback(async () => {
    if (!graphRef.current) return;
    await operations.request('bundle-config', { method: 'POST', body: JSON.stringify({ configs: buildNodeConfigs(graphRef.current.getAllNodes()) }) });
  }, [operations]);
  const finish = async (discard: boolean) => {
    setBusy(true); setError(null);
    try {
      const result = await proposalRequest<{ trackingOutcome?: SnapshotTrackingOutcome }>(bundleSlug, discard ? 'discard' : 'accept', { revision: reviewRef.current?.proposal.revision, reviewToken: reviewRef.current?.reviewToken });
      onAccepted(result); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };
  const sensitiveCount = Object.values(review?.proposal.tracking ?? {}).filter(decision => decision.needsConfirmation || decision.invalidated).length;
  const blocked = Boolean(!review || review.unresolvedIdentities.length || review.conflicts.length || review.missingRequiredEntries.length || sensitiveCount);
  return <SourceNamesProvider sources={graph?.sources ?? review?.configuration.bundle.sources ?? []}><section aria-label="Sourcing workspace" data-testid="sourcing-workspace" data-orphan-count={review?.orphans.length} className="fixed inset-x-0 bottom-0 top-[28px] z-40 flex flex-col bg-white text-neutral-800">
    <header className="flex items-center gap-3 border-b bg-blue-50 px-5 py-3">
      <h1 className="font-semibold">Sourcing · {bundleSlug}</h1><span className="text-xs text-neutral-600">Changes are saved in this proposal until you accept.</span>
      <SourceReviewActions busy={busy} ready={Boolean(review)} blocked={blocked} onExit={onClose}
        onRescan={() => void mutate('refresh', {}).catch(() => {})} onDiscard={() => void finish(true)} onAccept={() => void finish(false)} />
    </header>
    <div className="flex flex-wrap items-center gap-4 border-b px-5 py-2 text-sm">
      {review?.proposal.newerSourcesAvailable && <span role="status">Newer sources available. Acceptance keeps the current capture.</span>}
      {Boolean(review?.moves.length) && <button onClick={() => setDialog('identities')}>Review identities</button>}
      {Boolean(review?.orphans.length) && <button onClick={() => setDialog('cleanup')}>Configuration cleanup · {review?.orphans.length}</button>}
      {Boolean(review?.conflicts.length) && <button className="text-amber-800 underline" onClick={() => setDialog('conflicts')}>Resolve {review?.conflicts.length} configuration conflicts</button>}
      {sensitiveCount > 0 && <button className="text-amber-800 underline" onClick={() => setDialog('sensitivity')}>Review {sensitiveCount} tracking choices</button>}
      {review && <label className="flex items-center gap-2"><input type="checkbox" disabled={busy} checked={pendingPreference ?? (review.configuration.bundle.trackNewPages !== false)} onChange={event => {
        const trackNewPages = event.target.checked;
        setPendingPreference(trackNewPages);
        void configure({ ...review.proposal.proposed, bundle: { ...review.proposal.proposed.bundle, trackNewPages } }).catch(() => {}).finally(() => setPendingPreference(null));
      }} />Track non-sensitive added pages</label>}
      {review && <ProposalSettingsSummary review={review} bundleSlug={bundleSlug} />}
      <span className="text-xs text-neutral-500">View filters affect presentation. Accept applies the entire proposal.</span>
    </div>
    {review && <SourceRegistryChanges changes={{ before: review.proposal.original.bundle.sources ?? [], after: review.proposal.proposed.bundle.sources ?? [], stale: false, outputPathsChange: review.proposal.original.bundle.sourceOutputLayout !== review.proposal.proposed.bundle.sourceOutputLayout }} />}
    {frontierUnavailable && <p role="status" className="bg-amber-50 px-5 py-2">{frontierUnavailable}</p>}
    {error && <p role="alert" className="bg-red-50 px-5 py-2 text-red-800">{error}</p>}
    {notice && <p role="status" className="bg-amber-50 px-5 py-2">{notice}<button className="ml-4 underline" onClick={() => setNotice(null)}>Dismiss</button></p>}
    {Boolean(review?.missingRequiredEntries.length) && <div role="alert" className="p-5">Repair missing required entries before accepting: {review?.missingRequiredEntries.join(', ')}. Return to source settings or restore the source, then update this proposal.</div>}
    <fieldset disabled={busy} aria-busy={busy} className="flex min-h-0 flex-1 flex-col">{graph && review ? <SourcingComponentEditor operations={operations} graph={graph} bundleSlug={bundleSlug}
      entryBundleNodeId={review.configuration.bundle.entryBundleNodeId} filters={filters} onFiltersChange={setFilters} onReloadCustomFilters={() => { reloadFilters(); void reload(); }}
      graphUpdateTrigger={review.proposal.revision} onConfigChange={() => void persistNodes().catch(() => {})} onAutoSave={persistNodes}
      isSelectionPanelCollapsed={collapsed} onSelectionPanelCollapseChange={setCollapsed} selectedNodeKeys={selected} onSelectedNodeKeysChange={setSelected}
      onPreviewPage={() => setNotice('Select Details to compare the captured source content.')} hasDraftChanges={false} onRefresh={() => void reload()} onRefreshNodeConfigs={() => void reload()}
      untrackedNodeCount={graph.getAllNodes().filter(node => !node.tracked).length} bundleNodeConfigs={review.configuration.nodes}
      protectedBundleNodeIds={new Set([review.configuration.bundle.entryBundleNodeId, review.configuration.bundle.defaultTraversalBundleNodeId].filter((id): id is NonNullable<typeof id> => Boolean(id)))}
    /> : !review && <p className="p-5">Loading source proposal…</p>}</fieldset>
    {review && <ProposalDialogs identityTab={identityTab} onIdentityTabChange={setIdentityTab} identityComparison={identityComparison} onIdentityComparison={setIdentityComparison} request={operations.request} dialog={dialog} review={review} busy={busy} close={() => { setDialog(null); setPendingConfiguration(null); }} later={onClose}
      mutate={(operation, body) => mutate(operation, body).catch(() => {})} refresh={() => { if (pendingConfiguration) void ('trackingChange' in pendingConfiguration ? mutate('tracking', { ...pendingConfiguration.trackingChange, incorporateNewerSources: true }) : configure(pendingConfiguration, true)).then(() => { setPendingConfiguration(null); setDialog(null); }).catch(() => {}); }} />}
  </section></SourceNamesProvider>;
}

import type { ParticipatesIn, sourceReviewWorkspace } from '../../../../../../../concepts/index.js';
export type SourcingWorkspaceMeadowConceptParticipations = [
  ParticipatesIn<typeof sourceReviewWorkspace, 'render-workspace', typeof SourcingWorkspace>,
];
