/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { ProposalConfiguration, ProposalTrackingDecision } from '../../../../../../../contracts/types/shared/sourcing/sourcingProposal.js';
import type { BundleNodeId } from '../../../../../../../contracts/types/shared/bundle-graph/bundleNodeConfig.js';
import { Graph } from '../../../../../../../contracts/types/shared/bundle-graph/graph.js';
import { isUntrackableFrontierNode } from '../../../../../../../contracts/types/shared/bundle-graph/IBundleNode.js';
import { applyNodeConfigsToNodes, applySensitiveFromApiData, generateBundleNodeId } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { revalidateProposalTracking, type ProposalTrackingTarget } from '../../../../../../../shared_code/utils/proposalTracking.js';
import { serializeWorkingGraphOutput } from '../../../../shared/bundle-graph/workingGraphService.js';
import { selectEffectivelySensitiveNodeKeys } from '../../../../shared/bundle-graph/graphFilterService.js';
import { graphNodeByKey, loadSourceSnapshotManifest, snapshotGraph, sha256, SourcingError } from '../../../../shared/source-snapshot/sourceSnapshots.js';

import { describeSensitivityCause } from '../../../../shared/bundle-boundary-review/bundleBoundaryReviewService.js';
import { loadTrackingRecords } from '../../../../shared/bundle-node/trackingRecords.js';

/** Curation prepares tracking decisions without writing accepted policy or rereading live sources. */
export async function prepareProposalTracking(directory: string, snapshotId: string, configuration: ProposalConfiguration,
  decisions: Record<string, ProposalTrackingDecision>, identities: Record<string, BundleNodeId> = {}) {
  const epoch = commandFilterConfigurationEpoch(directory);
  const records = loadTrackingRecords(directory);
  const snapshot = loadSourceSnapshotManifest(directory, snapshotId);
  const raw = await snapshotGraph(directory, snapshot, configuration.nodes, 0, false, configuration.bundle);
  const output = serializeWorkingGraphOutput(raw);
  const nodes = output.nodes.map(node => ({ ...node }));
  applySensitiveFromApiData(nodes);
  applyNodeConfigsToNodes(nodes, configuration.nodes);
  const graph = new Graph();
  nodes.forEach(node => graph.addNode(node));
  output.edges.forEach(edge => graph.addEdge(edge));
  graph.setLinkSourceData(output.allInlinkSources, output.allOutlinkTargets);
  const filters = [...configuration.globalFilters.map(filter => ({ ...filter,
    enabled: filter.enabled && !configuration.bundle.disabledGlobalFilters?.includes(filter.id),
  })), ...configuration.bundleFilters];
  reconcileCommandFilters(directory, configuration.bundle, nodes, filters, 'proposal-candidate', epoch);
  const sensitivityFilters = filters.filter(filter => filter.enabled && filter.actions.some(action => action.type === 'mark_sensitive'));
  const sensitive = selectEffectivelySensitiveNodeKeys(graph, filters, true);
  const sensitiveByFilter = sensitivityFilters.map(filter => ({ filter, keys: selectEffectivelySensitiveNodeKeys(graph, [filter], true) }));
  const unresolved = new Set(sensitivityFilters.flatMap(filter => [...evaluateCustomFilter(graph, filter.selectors, filter.selectorApplicationCriteria, filter.id)].filter(([, answer]) => answer === undefined).map(([key]) => key)));
  const targets: Record<string, ProposalTrackingTarget> = {};
  const proposed = globalThis.structuredClone(decisions);
  const ids = new Set(configuration.nodes.map(node => String(node.bundleNodeId)));
  const configsById = new Map(configuration.nodes.map(node => [node.bundleNodeId, node]));
  const requiredIds = new Set([configuration.bundle.entryBundleNodeId, configuration.bundle.defaultTraversalBundleNodeId,
    ...configuration.nodes.flatMap(item => item.bundleNodeKind === 'collection' ? item.memberBundleNodeIds : [])]);
  for (const node of nodes) {
    if (node.blacklisted || node.effectiveBlacklistingBundleNodeId || isUntrackableFrontierNode(node)) continue;
    const key = node.bundleNodeKey;
    const id = identities[key] ?? node.bundleNodeId;
    const config = id ? configsById.get(id) : undefined;
    targets[key] = { bundleNodeId: id,
      ...(node.bundleNodeKind === 'collection' || (id && requiredIds.has(id)) ? { untrackableReason: 'This node is required by the bundle.' } : {}) };
    if (unresolved.has(key)) {
      targets[key].assessmentIncomplete = 'Command filter sensitivity assessment is incomplete. Inspect the filter progress and diagnostics before tracking.';
    }
    if (sensitive.has(key)) {
      targets[key].sensitivityReasons = [
        ...(node.sensitive ? ['The captured source marks this node sensitive.'] : []),
        ...sensitiveByFilter.filter(item => item.keys.has(key)).map(({ filter }) => describeSensitivityCause(filter, id ? records[id]?.sensitivityCause : undefined)),
      ];
      const policy = node.sensitive ? 'source' : sensitiveByFilter.filter(item => item.keys.has(key)).map(({ filter }) => ({
        id: filter.id, selectors: filter.selectors, criterion: filter.selectorApplicationCriteria,
      })).sort((a, b) => a.id.localeCompare(b.id));
      const recorded = id ? records[id]?.sensitivity?.effectivelySensitive ?? records[id]?.evidence?.effectivelySensitive
        ?? (config?.bundleNodeKind === 'file' ? config.trackingEvidence?.effectivelySensitive : undefined) : undefined;
      targets[key].sensitivityChanged = config?.listType === 'whitelist' && recorded !== true;
      if (targets[key].sensitivityChanged && !proposed[key]) proposed[key] = { track: true, origin: 'explicit', bundleNodeId: id, sensitivityChange: true };
      targets[key].sensitivity = sha256(JSON.stringify({ policy, digest: graphNodeByKey(raw, key)?.sourceFile?.digest }));
    }
    if (!unresolved.has(key) && !sensitive.has(key) && proposed[key]?.sensitivityChange && proposed[key].track && !proposed[key].confirmedSensitivity) delete proposed[key];
    if (proposed[key] && !proposed[key].bundleNodeId) {
      const id = targets[key].bundleNodeId ?? generateBundleNodeId(ids);
      ids.add(id);
      proposed[key].bundleNodeId = id;
    }
  }
  // Inclusion reminders no longer apply to excluded material. Its boundary effects and
  // configuration cleanup remain visible through the ordinary source review.
  for (const [key, decision] of Object.entries(proposed)) {
    if (decision.sensitivityChange && decision.track && !targets[key]) delete proposed[key];
  }
  const tracking = revalidateProposalTracking(proposed, targets);
  const configs = globalThis.structuredClone(configuration.nodes);
  const required = new Set([configuration.bundle.entryBundleNodeId, configuration.bundle.defaultTraversalBundleNodeId,
    ...configs.flatMap(node => node.bundleNodeKind === 'collection' ? node.memberBundleNodeIds : [])]);
  const nodesByKey = new Map<string, (typeof nodes)[number]>();
  for (const node of nodes) if (!nodesByKey.has(node.bundleNodeKey)) nodesByKey.set(node.bundleNodeKey, node);
  for (const [key, decision] of Object.entries(tracking)) {
    const node = nodesByKey.get(key);
    if (!node || decision.invalidated) continue;
    const index = configs.findIndex(config => config.bundleNodeId === decision.bundleNodeId);
    if (!decision.track) {
      if (index >= 0 && required.has(configs[index].bundleNodeId)) throw new SourcingError('Required bundle entries cannot be untracked.');
      if (index >= 0) configs.splice(index, 1);
    } else if (index < 0 && decision.bundleNodeId && node.bundleNodeKind !== 'collection') {
      const common = { bundleNodeId: decision.bundleNodeId, bundleNodeName: node.bundleNodeName, listType: 'whitelist' as const,
        ...(node.sourceId && { sourceId: node.sourceId }), sourceGraphSubdirectory: node.sourceGraphSubdirectory ?? '' };
      configs.push(node.bundleNodeKind === 'folder' ? { ...common, bundleNodeKind: 'folder' }
        : { ...common, bundleNodeKind: 'file', fileType: node.fileType });
    }
  }
  return { tracking, nodes: configs, targets };
}

import { commandFilterConfigurationEpoch, reconcileCommandFilters } from '../../../../shared/custom-filters/commandFilterEvaluation.js';
import { evaluateCustomFilter } from '../../../../../../../shared_code/utils/filterSelectors.js';
