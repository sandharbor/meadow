/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'node:path';
import type { filterSensitivity, ParticipatesIn } from '../../../../../../../concepts/index.js';
import { sourceProposalContext } from '../../../../shared/source-snapshot/sourceRegistrySnapshots.js';
import { runSerializedBundleNodeMutation } from '../../../../shared/bundle-node/bundleNodeMutationQueue.js';
import type { SnapshotTrackingOutcome, TrackingSensitivity } from '../../../../../../../contracts/types/shared/curation/curationTracking.js';
import type { SnapshotTrackingRequest } from '../../../../../../../contracts/types/areas/bundle/shared-sourcing-curation/snapshotTracking.js';
import { Graph } from '../../../../../../../contracts/types/shared/bundle-graph/graph.js';
import { applyNodeConfigsToNodes, applySensitiveFromApiData } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { serializeWorkingGraphOutput } from '../../../../shared/bundle-graph/workingGraphService.js';
import { selectEffectivelySensitiveNodeKeys } from '../../../../shared/bundle-graph/graphFilterService.js';
import { loadCustomFiltersForBundle } from '../../../../shared/custom-filters/customFilterLoader.js';
import { loadSourceBundleConfig, loadSourceNodeConfigs, loadSourceSnapshot, loadSourcingState, snapshotGraph } from '../../../../shared/source-snapshot/sourceSnapshots.js';
import { trackBundleNodes } from './bundleTrackingOperations.js';

/** Assess the complete captured graph, including nodes needed by graph-based filter selectors. */
export async function snapshotTrackingSensitivity(directory: string, snapshotId: string, nodeKeys: EncodedBundleNodeKey[]): Promise<Record<string, TrackingSensitivity>> {
  if (!nodeKeys.length) return {};
  const epoch = commandFilterConfigurationEpoch(directory);
  const snapshot = loadSourceSnapshot(directory, snapshotId);
  const context = sourceProposalContext(loadSourceBundleConfig(directory), loadSourceNodeConfigs(directory), loadSourcingState(directory)?.candidateId === snapshotId ? snapshot : undefined);
  const configs = context.nodes;
  const output = serializeWorkingGraphOutput(await snapshotGraph(directory, snapshot, configs, 0, false, context.config));
  // Serialized graph data is cached; curation flags belong to this assessment only.
  const nodes = output.nodes.map(node => ({ ...node }));
  applySensitiveFromApiData(nodes);
  applyNodeConfigsToNodes(nodes, configs);
  const graph = new Graph();
  nodes.forEach(node => graph.addNode(node));
  output.edges.forEach(edge => graph.addEdge(edge));
  graph.setLinkSourceData(output.allInlinkSources, output.allOutlinkTargets);
  const filters = loadCustomFiltersForBundle(path.basename(directory));
  reconcileCommandFilters(directory, context.config, nodes, filters, 'snapshot-assessment', epoch);
  const sensitive = selectEffectivelySensitiveNodeKeys(graph, filters, true);
  const unresolved = new Set(filters.filter(filter => filter.enabled && filter.actions.some(action => action.type === 'mark_sensitive')).flatMap(filter => [...evaluateCustomFilter(graph, filter.selectors, filter.selectorApplicationCriteria, filter.id)].filter(([, answer]) => answer === undefined).map(([key]) => key)));
  return Object.fromEntries(nodeKeys.filter(key => sensitive.has(key) || unresolved.has(key))
    .map(key => [key, sensitive.has(key) ? graph.getNode(key)?.sensitive ? 'source' : 'filter' : 'incomplete']));
}

export type SnapshotSensitivityMeadowConceptParticipations = [
  ParticipatesIn<typeof filterSensitivity, "assess-source-sensitivity", typeof snapshotTrackingSensitivity>,
];

/** Own the mutation lock and revalidate the handoff against the accepted snapshot inside it. */
export async function trackSnapshotAdditions(directory: string, request: SnapshotTrackingRequest): Promise<SnapshotTrackingOutcome> {
  return runSerializedBundleNodeMutation(path.basename(directory), async () => {
    if (loadSourcingState(directory)?.acceptedId !== request.snapshotId) {
      throw new Error('The accepted source snapshot changed before tracking. Review these pages in curation.');
    }
    const result = await trackBundleNodes(path.basename(directory), { mode: 'safe-targeted', nodeKeys: request.nodeKeys });
    return {
      snapshotId: request.snapshotId,
      trackedNodeKeys: [...result.newlyTracked, ...result.alreadyTracked].map(node => node.bundleNodeKey),
      sensitiveSkipped: result.sensitiveSkipped,
      otherSkipped: [...result.untrackableSkipped, ...result.rejected],
    };
  });
}

import type { EncodedBundleNodeKey } from '../../../../../../../contracts/types/shared/bundle-graph/bundleNodeKey.js';

import { commandFilterConfigurationEpoch, reconcileCommandFilters } from '../../../../shared/custom-filters/commandFilterEvaluation.js';

import { evaluateCustomFilter } from '../../../../../../../shared_code/utils/filterSelectors.js';
