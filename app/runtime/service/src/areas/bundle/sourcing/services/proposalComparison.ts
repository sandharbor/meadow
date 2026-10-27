/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { IBundleNode } from '../../../../../../../contracts/types/shared/bundle-graph/IBundleNode.js';
import type { SourceNodeReview, SourceRemovalCause, SourceSettingChange } from '../../../../../../../contracts/types/shared/sourcing/sourcingProposal.js';
import type { BundleNodeConfig } from '../../../../../../../contracts/types/shared/bundle-graph/bundleNodeConfig.js';
import { applyNodeConfigsToNodes, applySensitiveFromApiData } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { bundleNodeKeySourceGraphPath } from '../../../../../../../shared_code/utils/bundleNodeKey.js';
import { serializeWorkingGraphOutput } from '../../../../shared/bundle-graph/workingGraphService.js';
import { availableSnapshotGraph, discoverSourceSnapshot, graphNodeByKey, loadSourceSnapshot, snapshotGraph, SourcingError } from '../../../../shared/source-snapshot/sourceSnapshots.js';
import { loadProposalConfiguration } from './proposalStore.js';
import { reviewSourceProposal } from './proposalReview.js';
import { liveSourceLinks } from '../../../../shared/source-snapshot/sourceDiscovery.js';
import { snapshotLineCountsBatch } from './sourceReview.js';

/**
 * Saved settings that shape the graph. Gaining or losing a record is tracking, which is reviewed
 * separately, so only blacklisting is compared when either side has no record.
 */
function settingChanges(before: BundleNodeConfig | undefined, after: BundleNodeConfig | undefined): SourceSettingChange[] {
  const changes: SourceSettingChange[] = [];
  const blacklisted = (config?: BundleNodeConfig) => config?.listType === 'blacklist';
  if (blacklisted(before) !== blacklisted(after)) changes.push({ setting: 'blacklist', before: blacklisted(before), after: blacklisted(after) });
  if (!before || !after) return changes;
  for (const setting of ['outlinksDepth', 'inlinksDepth'] as const) {
    const old = before[setting], next = after[setting];
    if (old !== next) changes.push({ setting, ...(old !== undefined && { before: old }), ...(next !== undefined && { after: next }) });
  }
  const members = (config: BundleNodeConfig) => config.bundleNodeKind === 'collection' ? [...config.memberBundleNodeIds].sort() : [];
  if (members(before).join() !== members(after).join()) changes.push({ setting: 'members', before: members(before), after: members(after) });
  return changes;
}

/**
 * Walk the accepted route from the root and report the first page that departs. A departing page that is
 * blacklisted, missing, or disconnected is the cause itself; otherwise the page before it no longer reaches it,
 * either because the link is gone or because traversal settings stop short of it.
 */
function removalCause(node: IBundleNode, byKey: Map<string, IBundleNode>, outlinks: Record<string, string[]>, inlinks: Record<string, string[]>, remap: (key: IBundleNode['bundleNodeKey']) => IBundleNode['bundleNodeKey']): SourceRemovalCause | undefined {
  const route = (node.sourceReview?.previousRoute ?? []).map(remap);
  if (route[route.length - 1] !== node.bundleNodeKey) route.push(node.bundleNodeKey);
  for (let index = 0; index < route.length; index += 1) {
    const at = route[index], review = byKey.get(at)?.sourceReview;
    if (review?.kind !== 'departing') continue;
    const links = route.length - 1 - index;
    if (review.removalReason && review.removalReason !== 'unreachable') return { kind: review.removalReason, at, links };
    if (index === 0) return undefined;
    const from = route[index - 1];
    const linked = outlinks[from]?.includes(at) || inlinks[from]?.includes(at);
    return { kind: linked ? 'traversal' : 'link-removed', from, at, links };
  }
  return undefined;
}

/** Candidate material plus departing accepted nodes and their original connections. */
export async function sourceProposalComparison(directory: string, frontierDepth = 0) {
  if (!Number.isSafeInteger(frontierDepth) || frontierDepth < 0) throw new SourcingError('Frontier depth must be a non-negative integer.', 400);
  const epoch = commandFilterConfigurationEpoch(directory);
  const review = await reviewSourceProposal(directory);
  if (review.unresolvedIdentities.length) throw new SourcingError('Resolve page identities before entering the comparison graph.', 409, 'source-identity-required');
  if (review.missingRequiredEntries.length) throw new SourcingError('Repair the missing required entries before entering the graph.', 409, 'source-repair-required');
  const saved = loadProposalConfiguration(directory);
  const accepted = loadSourceSnapshot(directory, review.accepted.id);
  const candidate = loadSourceSnapshot(directory, review.candidate.id);
  const beforeRaw = await availableSnapshotGraph(directory, accepted, 0, { config: saved.bundle, nodes: saved.nodes });
  const afterRaw = await snapshotGraph(directory, candidate, review.configuration.nodes, 0, false, review.configuration.bundle);
  const before = beforeRaw ? serializeWorkingGraphOutput(beforeRaw) : { nodes: [], edges: [], allInlinkSources: {}, allOutlinkTargets: {} };
  const after = serializeWorkingGraphOutput(afterRaw);
  const nodes: IBundleNode[] = after.nodes.map(node => ({ ...node }));
  applySensitiveFromApiData(nodes);
  applyNodeConfigsToNodes(nodes, review.configuration.nodes);
  const commandFilters = reconcileCommandFilters(directory, review.configuration.bundle, nodes, [
    ...review.configuration.globalFilters.map(filter => ({ ...filter, enabled: filter.enabled && !review.configuration.bundle.disabledGlobalFilters?.includes(filter.id) })),
    ...review.configuration.bundleFilters,
  ], 'proposal-candidate', epoch);
  const oldNodes = before.nodes.map(node => ({ ...node }));
  applySensitiveFromApiData(oldNodes);
  applyNodeConfigsToNodes(oldNodes, saved.nodes);
  // Each lookup keeps the first match, as a search in node order would.
  const firstBy = <T, K>(items: T[], key: (item: T) => K | undefined) => {
    const index = new Map<K, T>();
    for (const item of items) { const value = key(item); if (value !== undefined && !index.has(value)) index.set(value, item); }
    return index;
  };
  const nodesById = firstBy(nodes, node => node.bundleNodeId);
  const nodesByKey = firstBy(nodes, node => node.bundleNodeKey);
  const correspondence = new Map(oldNodes.map(old => {
    const choice = old.bundleNodeId && review.proposal.identities[old.bundleNodeId];
    const destination = review.moves.some(move => move.bundleNodeId === old.bundleNodeId && move.newPath === choice) ? choice : undefined;
    const match = (old.bundleNodeId ? nodesById.get(old.bundleNodeId) : undefined)
      ?? nodes.find(node => destination && node.bundleNodeKind === old.bundleNodeKind && node.bundleNodeKind !== 'collection'
        && (graphNodeByKey(afterRaw, node.bundleNodeKey)?.sourceFile?.path ?? bundleNodeKeySourceGraphPath(node.bundleNodeKey)) === destination)
      ?? nodesByKey.get(old.bundleNodeKey);
    return [old.bundleNodeKey, match?.bundleNodeKey ?? old.bundleNodeKey];
  }));
  const previousByKey = new Map(oldNodes.map(node => [correspondence.get(node.bundleNodeKey)!, node]));
  const newKeys = new Set(nodes.map(node => node.bundleNodeKey));
  for (const old of oldNodes) if (!newKeys.has(correspondence.get(old.bundleNodeKey)!)) nodes.push(old);
  const blacklistControls = firstBy(review.configuration.nodes.filter(config => config.listType === 'blacklist'), config => config.bundleNodeId);
  const orphansById = firstBy(review.orphans, orphan => orphan.bundleNodeId);
  const lineCountRequests: Array<{ review: NonNullable<IBundleNode['sourceReview']>; beforePath: string; afterPath: string; departing: boolean }> = [];
  for (const node of nodes) {
    const previous = previousByKey.get(node.bundleNodeKey);
    const departing = !newKeys.has(node.bundleNodeKey);
    const proposedControl = node.bundleNodeId ? blacklistControls.get(node.bundleNodeId) : undefined;
    if (departing && proposedControl) applyNodeConfigsToNodes([node], [proposedControl]);
    const oldRaw = previous && graphNodeByKey(beforeRaw, previous.bundleNodeKey);
    const newRaw = graphNodeByKey(afterRaw, node.bundleNodeKey);
    const previousPath = previous && previous.bundleNodeKind !== 'collection' ? oldRaw?.sourceFile?.path ?? bundleNodeKeySourceGraphPath(previous.bundleNodeKey) : undefined;
    const proposedPath = departing || node.bundleNodeKind === 'collection' ? undefined : newRaw?.sourceFile?.path ?? bundleNodeKeySourceGraphPath(node.bundleNodeKey);
    const changedIdentity = previous && previousPath !== proposedPath && !departing;
    const modified = previousPath && proposedPath && accepted.files[previousPath] && candidate.files[proposedPath]
      && accepted.files[previousPath].digest !== candidate.files[proposedPath].digest;
    const presence = previousPath ? candidate.sourceAvailability?.[previousPath] : undefined;
    const removalReason = !departing ? undefined : presence === 'missing' ? 'source-missing'
      : presence === 'disconnected' ? 'source-disconnected' : proposedControl ? 'blacklisted' : 'unreachable';
    const settings = previous && !departing ? settingChanges(previous.conf, node.conf) : [];
    const sensitivityChanged = Boolean(review.trackingTargets[node.bundleNodeKey]?.sensitivityChanged);
    const kind: SourceNodeReview['kind'] = departing ? 'departing' : changedIdentity ? 'moved' : !previous ? 'added' : modified || settings.length || sensitivityChanged ? 'modified' : 'unchanged';
    const explanation = kind === 'added' ? 'Newly included in the proposed material.'
      : kind === 'modified' ? (sensitivityChanged ? 'This tracked node is now sensitive. Review its inclusion.' : modified ? 'Content differs between the accepted and proposed captures.' : 'Saved settings differ between the accepted and proposed configuration.')
      : kind === 'moved' ? 'The confirmed rename or move preserves this page’s identity and configuration.'
      : removalReason === 'source-missing' ? 'The source was missing when this proposal was captured.'
      : removalReason === 'source-disconnected' ? 'Its source is no longer connected to this proposed scope. Its files are untouched.'
      : proposedControl ? 'Excluded by the proposed blacklist. Remove the blacklist to restore its captured route.' : kind === 'departing' ? 'No longer reachable through the proposed links and traversal settings.' : 'Unchanged source material.';
    const orphan = node.bundleNodeId ? orphansById.get(node.bundleNodeId) : undefined;
    // Counted here so lists of changes show their line counts without a request per page.
    const comparedPath = previousPath ?? proposedPath;
    // Read together after the loop; the placeholders keep each review's field order.
    const counted = kind !== 'unchanged' && comparedPath ? { beforePath: comparedPath, afterPath: proposedPath ?? comparedPath, departing } : undefined;
    node.sourceReview = { kind, removalReason, orphanedConfiguration: departing && Boolean(previous?.conf) && !proposedControl && previous?.conf?.listType !== 'blacklist',
      ...(orphan && { orphan }), explanation: [explanation, orphan?.reason].filter(Boolean).join(' '), previousPath, proposedPath, previousRoute: previous?.path ?? [], proposedRoute: departing ? [] : node.path ?? [],
      ...((kind === 'modified' || kind === 'moved') && { modification: { source: Boolean(modified), settings, sensitivity: sensitivityChanged } }),
      ...(counted && { lineCounts: null, hasPreviousContent: false }),
      sensitivityReasons: review.trackingTargets[node.bundleNodeKey]?.sensitivityReasons,
      beforeSnapshotId: accepted.id, afterSnapshotId: candidate.id };
    if (counted) lineCountRequests.push({ review: node.sourceReview, ...counted });
  }
  snapshotLineCountsBatch(directory, accepted, candidate, lineCountRequests).forEach((counts, index) => {
    lineCountRequests[index].review.lineCounts = counts.lineCounts;
    lineCountRequests[index].review.hasPreviousContent = counts.hasPreviousContent;
  });
  const remap = (key: IBundleNode['bundleNodeKey']) => correspondence.get(key) ?? key;
  const byKey = new Map(nodes.map(node => [node.bundleNodeKey, node]));
  for (const node of nodes) if (node.sourceReview?.removalReason === 'unreachable') {
    const cause = removalCause(node, byKey, after.allOutlinkTargets, after.allInlinkSources, remap);
    if (cause) node.sourceReview.removalCause = cause;
  }
  const edges = new Map(after.edges.map(edge => [`${edge.bundleEdgeKind}:${edge.source}:${edge.target}`, edge]));
  for (const old of before.edges) {
    const edge = { ...old, source: remap(old.source), target: remap(old.target) };
    const id = `${edge.bundleEdgeKind}:${edge.source}:${edge.target}`;
    if (!edges.has(id)) edges.set(id, edge);
  }
  let frontierUnavailable: string | undefined;
  let inlinks = after.allInlinkSources;
  let outlinks = after.allOutlinkTargets;
  if (frontierDepth > 0) {
    try {
      // One discovery produces both the admitted digests and frontier routes. Never combine
      // new core links with old reviewed bytes: an explicit source update is required first.
      const discovery = await discoverSourceSnapshot(directory, false, { config: review.configuration.bundle, nodes: review.configuration.nodes, frontierDepth });
      if (discovery.digest !== candidate.digest) frontierUnavailable = 'Update sources to explore the frontier of the newer material. Your reviewed capture has been kept.';
      else {
        const wider = liveSourceLinks(directory, discovery.digest);
        if (wider) {
          const serialized = serializeWorkingGraphOutput(wider);
          inlinks = serialized.allInlinkSources;
          outlinks = serialized.allOutlinkTargets;
          const comparedKeys = new Set(nodes.map(node => node.bundleNodeKey));
          const frontier = serialized.nodes.filter(node => node.isFrontierNode && !node.isFrontierImageExtension && !comparedKeys.has(node.bundleNodeKey));
          for (const node of frontier) {
            node.sourceReview = { kind: 'frontier', orphanedConfiguration: false,
              explanation: 'Live frontier beyond the proposed scope. Increase traversal depth to capture and include this page.',
              previousRoute: [], proposedRoute: node.path ?? [], proposedPath: bundleNodeKeySourceGraphPath(node.bundleNodeKey),
              beforeSnapshotId: accepted.id, afterSnapshotId: candidate.id };
            nodes.push(node); comparedKeys.add(node.bundleNodeKey);
          }
          for (const edge of serialized.edges) if (comparedKeys.has(edge.source) && comparedKeys.has(edge.target)) {
            const id = `${edge.bundleEdgeKind}:${edge.source}:${edge.target}`;
            if (!edges.has(id)) edges.set(id, edge);
          }
        }
      }
    } catch (error) {
      frontierUnavailable = error instanceof Error ? `The frontier is unavailable: ${error.message}` : 'The frontier is unavailable. Your reviewed capture has been kept.';
    }
  }
  const links = (old: Record<string, IBundleNode['bundleNodeKey'][]>, current: Record<string, IBundleNode['bundleNodeKey'][]>) => {
    const result = { ...current };
    for (const [key, values] of Object.entries(old)) {
      const mapped = remap(key as IBundleNode['bundleNodeKey']);
      result[mapped] = [...new Set([...(result[mapped] ?? []), ...values.map(remap)])];
    }
    return result;
  };

  return { ...review, ...(frontierUnavailable && { frontierUnavailable }), graph: { commandFilters, nodes, edges: [...edges.values()], sources: candidate.sources ?? [],
    allInlinkSources: links(before.allInlinkSources, inlinks), allOutlinkTargets: links(before.allOutlinkTargets, outlinks) } };
}

import type { ParticipatesIn, sourceReviewWorkspace } from '../../../../../../../concepts/index.js';
export type ProposalComparisonMeadowConceptParticipations = [
  ParticipatesIn<typeof sourceReviewWorkspace, 'compare-captures', typeof sourceProposalComparison>,
];

import { commandFilterConfigurationEpoch, reconcileCommandFilters } from '../../../../shared/custom-filters/commandFilterEvaluation.js';
