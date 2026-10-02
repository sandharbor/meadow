/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { IBundleNode } from '../../../../../../../contracts/types/IBundleNode.js';
import type { SourceNodeReview } from '../../../../../../../contracts/types/sourcingProposal.js';
import { applyNodeConfigsToNodes, applySensitiveFromApiData } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { bundleNodeKeySourceGraphPath } from '../../../../../../../shared_code/utils/bundleNodeKey.js';
import { serializeWorkingGraphOutput } from '../../../../shared/bundle-graph/workingGraphService.js';
import { availableSnapshotGraph, discoverSourceSnapshot, loadSourceSnapshot, snapshotGraph, SourcingError } from '../../../../shared/source-snapshot/sourceSnapshots.js';
import { loadProposalConfiguration } from './proposalStore.js';
import { reviewSourceProposal } from './proposalReview.js';
import { liveSourceLinks } from '../../../../shared/source-snapshot/sourceDiscovery.js';

/** Candidate material plus departing accepted nodes and their original connections. */
export async function sourceProposalComparison(directory: string, frontierDepth = 0) {
  if (!Number.isSafeInteger(frontierDepth) || frontierDepth < 0) throw new SourcingError('Frontier depth must be a non-negative integer.', 400);
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
  const oldNodes = before.nodes.map(node => ({ ...node }));
  applySensitiveFromApiData(oldNodes);
  applyNodeConfigsToNodes(oldNodes, saved.nodes);
  const correspondence = new Map(oldNodes.map(old => {
    const destination = old.bundleNodeId && review.proposal.identities[old.bundleNodeId];
    const match = nodes.find(node => old.bundleNodeId && node.bundleNodeId === old.bundleNodeId)
      ?? nodes.find(node => destination && node.bundleNodeKind === old.bundleNodeKind && node.bundleNodeKind !== 'collection'
        && (afterRaw.nodes.find(raw => raw.bundleNodeKey === node.bundleNodeKey)?.sourceFile?.path ?? bundleNodeKeySourceGraphPath(node.bundleNodeKey)) === destination)
      ?? nodes.find(node => node.bundleNodeKey === old.bundleNodeKey);
    return [old.bundleNodeKey, match?.bundleNodeKey ?? old.bundleNodeKey];
  }));
  const previousByKey = new Map(oldNodes.map(node => [correspondence.get(node.bundleNodeKey)!, node]));
  const newKeys = new Set(nodes.map(node => node.bundleNodeKey));
  for (const old of oldNodes) if (!newKeys.has(correspondence.get(old.bundleNodeKey)!)) nodes.push(old);
  for (const node of nodes) {
    const previous = previousByKey.get(node.bundleNodeKey);
    const departing = !newKeys.has(node.bundleNodeKey);
    const proposedControl = review.configuration.nodes.find(config => config.bundleNodeId === node.bundleNodeId && config.listType === 'blacklist');
    if (departing && proposedControl) applyNodeConfigsToNodes([node], [proposedControl]);
    const oldRaw = previous && beforeRaw?.nodes.find(item => item.bundleNodeKey === previous.bundleNodeKey);
    const newRaw = afterRaw.nodes.find(item => item.bundleNodeKey === node.bundleNodeKey);
    const previousPath = previous && previous.bundleNodeKind !== 'collection' ? oldRaw?.sourceFile?.path ?? bundleNodeKeySourceGraphPath(previous.bundleNodeKey) : undefined;
    const proposedPath = departing || node.bundleNodeKind === 'collection' ? undefined : newRaw?.sourceFile?.path ?? bundleNodeKeySourceGraphPath(node.bundleNodeKey);
    const changedIdentity = previous && previousPath !== proposedPath && !departing;
    const modified = previousPath && proposedPath && accepted.files[previousPath] && candidate.files[proposedPath]
      && accepted.files[previousPath].digest !== candidate.files[proposedPath].digest;
    const presence = previousPath ? candidate.sourceAvailability?.[previousPath] : undefined;
    const removalReason = !departing ? undefined : presence === 'missing' ? 'source-missing'
      : presence === 'disconnected' ? 'source-disconnected' : 'unreachable';
    const kind: SourceNodeReview['kind'] = departing ? 'departing' : changedIdentity ? 'moved' : !previous ? 'added' : modified ? 'modified' : 'unchanged';
    const explanation = kind === 'added' ? 'Newly included in the proposed material.'
      : kind === 'modified' ? 'Content differs between the accepted and proposed captures.'
      : kind === 'moved' ? 'The confirmed rename or move preserves this page’s identity and configuration.'
      : removalReason === 'source-missing' ? 'The source was missing when this proposal was captured.'
      : removalReason === 'source-disconnected' ? 'Its source is no longer connected to this proposed scope. Its files are untouched.'
      : proposedControl ? 'Excluded by the proposed blacklist. Remove the blacklist to restore its captured route.' : kind === 'departing' ? 'No longer reachable through the proposed links and traversal settings.' : 'Unchanged source material.';
    node.sourceReview = { kind, removalReason, orphanedConfiguration: departing && Boolean(previous?.conf) && !proposedControl && previous?.conf?.listType !== 'blacklist',
      explanation: [explanation, review.orphans.find(orphan => orphan.bundleNodeId === node.bundleNodeId)?.reason].filter(Boolean).join(' '), previousPath, proposedPath, previousRoute: previous?.path ?? [], proposedRoute: departing ? [] : node.path ?? [],
      sensitivityReasons: review.trackingTargets[node.bundleNodeKey]?.sensitivityReasons,
      beforeSnapshotId: accepted.id, afterSnapshotId: candidate.id };
  }
  const remap = (key: IBundleNode['bundleNodeKey']) => correspondence.get(key) ?? key;
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
  return { ...review, ...(frontierUnavailable && { frontierUnavailable }), graph: { nodes, edges: [...edges.values()], sources: candidate.sources ?? [],
    allInlinkSources: links(before.allInlinkSources, inlinks), allOutlinkTargets: links(before.allOutlinkTargets, outlinks) } };
}

import type { ParticipatesIn, sourceReviewWorkspace } from '../../../../../../../concepts/index.js';
export type ProposalComparisonMeadowConceptParticipations = [
  ParticipatesIn<typeof sourceReviewWorkspace, 'compare-captures', typeof sourceProposalComparison>,
];
