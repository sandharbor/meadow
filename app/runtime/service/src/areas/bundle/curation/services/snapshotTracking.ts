/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'node:path';
import { runSerializedBundleNodeMutation } from '../../../../shared/bundle-node/bundleNodeMutationQueue.js';
import type { SnapshotTrackingRequest, SnapshotTrackingOutcome, TrackingSensitivity } from '../../../../../../../contracts/types/curationTracking.js';
import { Graph } from '../../../../../../../contracts/types/graph.js';
import { applyNodeConfigsToNodes, applySensitiveFromApiData } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { serializeWorkingGraphOutput } from '../../../../shared/bundle-graph/workingGraphService.js';
import { selectEffectivelySensitiveNodeKeys } from '../../../../shared/bundle-graph/graphFilterService.js';
import { loadCustomFiltersForBundle } from '../../../../shared/custom-filters/customFilterLoader.js';
import { loadSourceNodeConfigs, loadSourceSnapshot, loadSourcingState, snapshotGraph } from '../../../../shared/source-snapshot/sourceSnapshots.js';
import { trackBundleNodes } from './bundleTrackingOperations.js';

/** Assess the complete captured graph, including nodes needed by graph-based filter selectors. */
export async function snapshotTrackingSensitivity(directory: string, snapshotId: string, nodeKeys: string[]): Promise<Record<string, TrackingSensitivity>> {
  if (!nodeKeys.length) return {};
  const configs = loadSourceNodeConfigs(directory);
  const output = serializeWorkingGraphOutput(await snapshotGraph(directory, loadSourceSnapshot(directory, snapshotId), configs, 0));
  // Serialized graph data is cached; curation flags belong to this assessment only.
  const nodes = output.nodes.map(node => ({ ...node }));
  applySensitiveFromApiData(nodes);
  applyNodeConfigsToNodes(nodes, configs);
  const graph = new Graph();
  nodes.forEach(node => graph.addNode(node));
  output.edges.forEach(edge => graph.addEdge(edge));
  graph.setLinkSourceData(output.allInlinkSources, output.allOutlinkTargets);
  const sensitive = selectEffectivelySensitiveNodeKeys(graph, loadCustomFiltersForBundle(path.basename(directory)));
  return Object.fromEntries(nodeKeys.filter(key => sensitive.has(key))
    .map(key => [key, graph.getNode(key)?.sensitive ? 'source' : 'filter']));
}

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
