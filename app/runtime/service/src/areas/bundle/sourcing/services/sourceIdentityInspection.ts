/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'node:path';
import type { BundleNodeConfig } from '../../../../../../../contracts/types/shared/bundle-graph/bundleNodeConfig.js';
import type { SourceMoveCandidate } from '../../../../../../../contracts/types/shared/sourcing/sourcing.js';
import type { SourceIdentityInspection } from '../../../../../../../contracts/types/areas/bundle/sourcing/sourcingProposal.js';
import { snapshotFilePath, graphNodeByKey, type SourceSnapshot } from '../../../../shared/source-snapshot/sourceSnapshots.js';
import { equivalentSnapshotPath } from '../../../../shared/source-snapshot/sourceRegistrySnapshots.js';
import { sourceFilePathToBundleNodeKey } from '../../../../shared/bundle-node/nodeKeys.js';
import { relinkSourceNode } from './sourceReview.js';

/** Eligibility is independent of heuristic matching: user choices still need captured, compatible endpoints. */
export function inspectSourceIdentities(previous: SourceSnapshot, current: SourceSnapshot, configs: BundleNodeConfig[], moves: SourceMoveCandidate[]): SourceIdentityInspection {
  const ids = new Map(configs.filter(node => node.bundleNodeKind === 'file').map(node => [snapshotFilePath(previous, node), node.bundleNodeId]));
  const configured = new Set(configs.filter(node => node.bundleNodeKind !== 'collection').map(node => snapshotFilePath(current, node)));
  const reason = (filename: string, side: 'oldPath' | 'newPath', empty: boolean) => {
    if (moves.some(move => move[side] === filename)) return 'A possible match is listed above; identity follows your choice.';
    const counterpart = side === 'oldPath' ? 'new location' : 'previous configured page';
    return empty ? `Empty content supplies no content evidence. No eligible ${counterpart} with the same filename was found.`
      : `No eligible ${counterpart} had the same filename or enough shared content. This does not establish a different identity.`;
  };
  return {
    departing: Object.keys(previous.files).filter(filename => !current.files[equivalentSnapshotPath(previous, current, filename)])
      .sort().map(filename => ({ path: filename, bundleNodeId: ids.get(filename),
        reason: ids.has(filename) ? reason(filename, 'oldPath', previous.files[filename].size === 0) : 'This page had no saved configuration or durable identity to transfer.' })),
    added: Object.keys(current.files).filter(filename => !previous.files[equivalentSnapshotPath(current, previous, filename)] && !configured.has(filename))
      .sort().map(filename => ({ path: filename, reason: reason(filename, 'newPath', current.files[filename].size === 0) })),
  };
}

export function manualSourceMove(previous: SourceSnapshot, current: SourceSnapshot, configs: BundleNodeConfig[], id: string, destination: string): SourceMoveCandidate | undefined {
  const node = configs.find(node => node.bundleNodeId === id);
  if (!node || node.bundleNodeKind !== 'file') return;
  const oldPath = snapshotFilePath(previous, node);
  if (!previous.files[oldPath] || current.files[snapshotFilePath(current, node)] || !current.files[destination]
    || previous.files[equivalentSnapshotPath(current, previous, destination)]
    || configs.some(config => config.bundleNodeId !== id && config.bundleNodeKind !== 'collection' && snapshotFilePath(current, config) === destination)) return;
  try { relinkSourceNode(node, destination, current.sources); } catch { return; }
  // Keep source file types compatible in addition to validating the captured locator.
  if (path.extname(oldPath).toLowerCase() !== path.extname(destination).toLowerCase()) return;
  return { bundleNodeId: id, oldPath, newPath: destination, confidence: 'possible', competing: false,
    similarity: { score: 0, criteria: [] }, evidence: ['Manually paired by you; no automatic match is implied.'],
    contentChanged: previous.files[oldPath].digest !== current.files[destination].digest,
    previousRoute: graphNodeByKey(previous.graph, sourceFilePathToBundleNodeKey(oldPath))?.path ?? [],
    currentRoute: graphNodeByKey(current.graph, sourceFilePathToBundleNodeKey(destination))?.path ?? [] };
}
