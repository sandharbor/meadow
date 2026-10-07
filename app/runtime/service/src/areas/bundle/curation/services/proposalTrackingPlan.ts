/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { ProposalConfiguration, ProposalTrackingDecision } from '../../../../../../../contracts/types/sourcingProposal.js';
import type { BundleNodeId } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import { Graph } from '../../../../../../../contracts/types/graph.js';
import { isUntrackableFrontierNode } from '../../../../../../../contracts/types/IBundleNode.js';
import { applyNodeConfigsToNodes, applySensitiveFromApiData, generateBundleNodeId } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { revalidateProposalTracking, type ProposalTrackingTarget } from '../../../../../../../shared_code/utils/proposalTracking.js';
import { serializeWorkingGraphOutput } from '../../../../shared/bundle-graph/workingGraphService.js';
import { selectEffectivelySensitiveNodeKeys } from '../../../../shared/bundle-graph/graphFilterService.js';
import { loadSourceSnapshot, snapshotGraph, sha256, SourcingError } from '../../../../shared/source-snapshot/sourceSnapshots.js';

/** Curation prepares tracking decisions without writing accepted policy or rereading live sources. */
export async function prepareProposalTracking(directory: string, snapshotId: string, configuration: ProposalConfiguration,
  decisions: Record<string, ProposalTrackingDecision>, identities: Record<string, BundleNodeId> = {}) {
  const snapshot = loadSourceSnapshot(directory, snapshotId);
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
  })), ...configuration.bundleFilters].filter(filter => filter.enabled && filter.actions.some(action => action.type === 'mark_sensitive'));
  const sensitive = selectEffectivelySensitiveNodeKeys(graph, filters);
  const sensitiveByFilter = filters.map(filter => ({ filter, keys: selectEffectivelySensitiveNodeKeys(graph, [filter]) }));
  const targets: Record<string, ProposalTrackingTarget> = {};
  const proposed = globalThis.structuredClone(decisions);
  const ids = new Set(configuration.nodes.map(node => String(node.bundleNodeId)));
  for (const node of nodes) {
    if (node.bundleNodeKind === 'collection' || node.blacklisted || node.effectiveBlacklistingBundleNodeId || isUntrackableFrontierNode(node)) continue;
    const key = node.bundleNodeKey;
    targets[key] = { bundleNodeId: identities[key] ?? node.bundleNodeId };
    if (sensitive.has(key)) {
      targets[key].sensitivityReasons = [
        ...(node.sensitive ? ['The captured source marks this page sensitive.'] : []),
        ...sensitiveByFilter.filter(item => item.keys.has(key) && !node.sensitive).map(({ filter }) => `${filter.scope === 'global' ? 'Global' : 'Bundle'} filter “${filter.name}” marks this page sensitive.`),
      ];
      const policy = node.sensitive ? 'source' : sensitiveByFilter.filter(item => item.keys.has(key)).map(({ filter }) => ({
        id: filter.id, selectors: filter.selectors, criterion: filter.selectorApplicationCriteria,
      })).sort((a, b) => a.id.localeCompare(b.id));
      targets[key].sensitivity = sha256(JSON.stringify({ policy, digest: raw.nodes.find(item => item.bundleNodeKey === key)?.sourceFile?.digest }));
    }
    if (proposed[key] && !proposed[key].bundleNodeId) {
      const id = targets[key].bundleNodeId ?? generateBundleNodeId(ids);
      ids.add(id);
      proposed[key].bundleNodeId = id;
    }
  }
  const tracking = revalidateProposalTracking(proposed, targets);
  const configs = globalThis.structuredClone(configuration.nodes);
  const required = new Set([configuration.bundle.entryBundleNodeId, configuration.bundle.defaultTraversalBundleNodeId,
    ...configs.flatMap(node => node.bundleNodeKind === 'collection' ? node.memberBundleNodeIds : [])]);
  for (const [key, decision] of Object.entries(tracking)) {
    const node = nodes.find(item => item.bundleNodeKey === key);
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
