/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import type { BundleNodeConfig } from '../../../../../contracts/types/bundleNodeConfig.js';
import type {
  FolderScopeChangeExplanation,
  FolderScopeChangeItem,
  FolderScopeGraphSnapshot,
  FolderScopeSnapshotNode,
} from '../../../../../contracts/types/folderScopeChanges.js';
import {
  isPlainObject,
  jsonDocumentCodec,
  readDurableDocument,
  requireValidDocument,
  writeDurableDocument,
} from '../../../../../shared_code/utils/durableDocument.js';

function validateFolderScopeSnapshot(value: unknown) {
  if (!isPlainObject(value)) return { valid: false as const, diagnostic: '$ must be an object' };
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    return { valid: false as const, diagnostic: '$.nodes and $.edges must be arrays' };
  }
  const nodes = value.nodes as unknown[];
  const edges = value.edges as unknown[];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!isPlainObject(node)
      || typeof node.bundleNodeKey !== 'string'
      || typeof node.bundleNodeName !== 'string'
      || !['file', 'folder', 'collection'].includes(String(node.bundleNodeKind))) {
      return { valid: false as const, diagnostic: `$.nodes[${index}] is invalid` };
    }
  }
  for (let index = 0; index < edges.length; index += 1) {
    const edge = edges[index];
    if (!isPlainObject(edge)
      || typeof edge.source !== 'string'
      || typeof edge.target !== 'string'
      || !['semanticLink', 'directoryContainment', 'collectionMembership'].includes(String(edge.bundleEdgeKind))) {
      return { valid: false as const, diagnostic: `$.edges[${index}] is invalid` };
    }
  }
  if (value.folderScope !== undefined) {
    const scope = value.folderScope;
    if (!isPlainObject(scope)
      || !isPlainObject(scope.skippedCounts)
      || !Array.isArray(scope.skippedPaths)
      || !Object.values(scope.skippedCounts).every(count => Number.isInteger(count) && Number(count) >= 0)
      || !scope.skippedPaths.every(item => isPlainObject(item)
        && typeof item.path === 'string'
        && typeof item.reason === 'string')
      || !['skippedPathCount', 'supportedSeedFileCount', 'predictedRawNodeCount', 'predictedTypedEdgeCount']
        .every(field => Number.isInteger(scope[field]) && Number(scope[field]) >= 0)) {
      return { valid: false as const, diagnostic: '$.folderScope is invalid' };
    }
  }
  return { valid: true as const, value: value as unknown as FolderScopeGraphSnapshot };
}

const folderScopeSnapshotCodec = jsonDocumentCodec<FolderScopeGraphSnapshot>(validateFolderScopeSnapshot);

function locator(node: FolderScopeSnapshotNode): string {
  if (node.bundleNodeKind === 'folder') return node.sourceGraphSubdirectory ?? '';
  if (node.bundleNodeKind === 'file') {
    const directory = node.sourceGraphSubdirectory ?? '';
    const filename = `${node.bundleNodeName}.${node.fileType ?? node.bundleNodeKey.split('.').pop() ?? ''}`;
    return directory ? `${directory}/${filename}` : filename;
  }
  return node.bundleNodeName;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function folderNameForIncoming(snapshot: FolderScopeGraphSnapshot, nodeKey: string): string {
  const edge = snapshot.edges.find(candidate => candidate.target === nodeKey
    && (candidate.bundleEdgeKind === 'directoryContainment' || candidate.bundleEdgeKind === 'collectionMembership'));
  return snapshot.nodes.find(node => node.bundleNodeKey === edge?.source)?.bundleNodeName ?? 'selected scope';
}

function configMap(configs: BundleNodeConfig[]): Map<string, BundleNodeConfig> {
  return new Map(configs.map(config => [config.bundleNodeId, config]));
}

export function explainFolderScopeChanges(args: {
  previous?: FolderScopeGraphSnapshot;
  current: FolderScopeGraphSnapshot;
  previousConfigs: BundleNodeConfig[];
  currentConfigs: BundleNodeConfig[];
  basis: FolderScopeChangeExplanation['basis'];
}): FolderScopeChangeExplanation {
  const { previous, current, previousConfigs, currentConfigs, basis } = args;
  if (!previous) {
    return {
      basis: 'initial', items: [], rawNodeDelta: 0, typedEdgeDelta: 0, seedDelta: 0,
      skippedCounts: current.folderScope?.skippedCounts ?? {},
    };
  }
  const items: FolderScopeChangeItem[] = [];
  const previousByKey = new Map(previous.nodes.map(node => [node.bundleNodeKey, node]));
  const currentByKey = new Map(current.nodes.map(node => [node.bundleNodeKey, node]));
  const previousById = new Map(previous.nodes.filter(node => node.bundleNodeId).map(node => [node.bundleNodeId!, node]));
  const currentById = new Map(current.nodes.filter(node => node.bundleNodeId).map(node => [node.bundleNodeId!, node]));
  const movedOldKeys = new Set<string>();
  const movedNewKeys = new Set<string>();

  for (const [bundleNodeId, oldNode] of previousById) {
    const newNode = currentById.get(bundleNodeId);
    if (!newNode || oldNode.bundleNodeKey === newNode.bundleNodeKey) continue;
    movedOldKeys.add(oldNode.bundleNodeKey);
    movedNewKeys.add(newNode.bundleNodeKey);
    items.push({
      category: 'move', code: 'configured-node-moved', bundleNodeId,
      oldLocator: locator(oldNode), newLocator: locator(newNode),
      message: `${oldNode.bundleNodeName} moved from ${locator(oldNode)} to ${locator(newNode)}; identity was preserved and no automatic match was inferred.`,
    });
  }

  for (const node of current.nodes) {
    if (previousByKey.has(node.bundleNodeKey) || movedNewKeys.has(node.bundleNodeKey)) continue;
    const parentName = folderNameForIncoming(current, node.bundleNodeKey);
    items.push({
      category: 'addition', code: node.bundleNodeId ? 'configured-node-added' : 'untracked-node-added',
      bundleNodeId: node.bundleNodeId, bundleNodeKey: node.bundleNodeKey, newLocator: locator(node),
      message: node.bundleNodeId
        ? `${node.bundleNodeName} was added under ${parentName}.`
        : `${node.bundleNodeName} was added under ${parentName} and remains untracked.`,
    });
  }
  for (const node of previous.nodes) {
    if (currentByKey.has(node.bundleNodeKey) || movedOldKeys.has(node.bundleNodeKey)) continue;
    items.push({
      category: 'removal', code: node.bundleNodeId ? 'configured-node-orphaned' : 'source-node-removed',
      bundleNodeId: node.bundleNodeId, bundleNodeKey: node.bundleNodeKey, oldLocator: locator(node),
      message: node.bundleNodeId
        ? `${node.bundleNodeName} is no longer present at ${locator(node)} and is now an orphan.`
        : `${node.bundleNodeName} was removed from the scope projection.`,
    });
  }

  for (const node of current.nodes) {
    const oldNode = previousByKey.get(node.bundleNodeKey);
    if (!oldNode || oldNode.effectiveFolderPolicyBundleNodeId === node.effectiveFolderPolicyBundleNodeId) continue;
    items.push({
      category: 'policy', code: 'effective-folder-policy-changed', bundleNodeKey: node.bundleNodeKey,
      message: `${node.bundleNodeName} changed effective folder policy from ${oldNode.effectiveFolderPolicyBundleNodeId ?? 'bundle defaults'} to ${node.effectiveFolderPolicyBundleNodeId ?? 'bundle defaults'}.`,
    });
  }

  const oldConfigs = configMap(previousConfigs);
  const newConfigs = configMap(currentConfigs);
  for (const [bundleNodeId, next] of newConfigs) {
    const prior = oldConfigs.get(bundleNodeId);
    if (!prior || next.bundleNodeKind !== 'folder' || prior.bundleNodeKind !== 'folder') continue;
    if (prior.outlinksDepth !== next.outlinksDepth || prior.inlinksDepth !== next.inlinksDepth) {
      const affectedNodeCount = current.nodes.filter(node => node.effectiveFolderPolicyBundleNodeId === bundleNodeId).length;
      items.push({
        category: 'policy', code: 'folder-depth-changed', bundleNodeId, affectedNodeCount,
        message: `${next.bundleNodeName} depth policy changed for ${affectedNodeCount} seed or scoped node(s); raw graph delta ${signed(current.nodes.length - previous.nodes.length)}.`,
      });
    }
    if (prior.listType !== 'blacklist' && next.listType === 'blacklist') {
      const affectedNodeCount = current.nodes.filter(node => node.effectiveBlacklistingBundleNodeId === bundleNodeId).length;
      items.push({
        category: 'blacklist', code: 'folder-blacklist-became-effective', bundleNodeId, affectedNodeCount,
        message: `${next.bundleNodeName} became a hard folder blacklist boundary affecting ${affectedNodeCount} raw node(s) and their semantic expansion.`,
      });
    }
  }

  const skippedReasons = new Set([
    ...Object.keys(previous.folderScope?.skippedCounts ?? {}),
    ...Object.keys(current.folderScope?.skippedCounts ?? {}),
  ]);
  for (const reason of [...skippedReasons].sort()) {
    const before = previous.folderScope?.skippedCounts[reason] ?? 0;
    const after = current.folderScope?.skippedCounts[reason] ?? 0;
    if (before === after) continue;
    items.push({
      category: 'skipped', code: `skipped-${reason}`, affectedNodeCount: after - before,
      message: `Skipped ${reason} paths changed from ${before} to ${after} (${signed(after - before)}).`,
    });
  }

  const categoryRank = { move: 0, addition: 1, removal: 2, policy: 3, blacklist: 4, skipped: 5 } as const;
  items.sort((left, right) => categoryRank[left.category] - categoryRank[right.category]
    || (left.bundleNodeKey ?? left.bundleNodeId ?? left.message).localeCompare(right.bundleNodeKey ?? right.bundleNodeId ?? right.message));
  return {
    basis,
    items,
    rawNodeDelta: current.nodes.length - previous.nodes.length,
    typedEdgeDelta: current.edges.length - previous.edges.length,
    seedDelta: (current.folderScope?.supportedSeedFileCount ?? 0) - (previous.folderScope?.supportedSeedFileCount ?? 0),
    skippedCounts: current.folderScope?.skippedCounts ?? {},
  };
}

export function loadFolderScopeSnapshot(snapshotPath: string): FolderScopeGraphSnapshot | undefined {
  const result = readDurableDocument(snapshotPath, folderScopeSnapshotCodec);
  if (result.status === 'missing') return undefined;
  return requireValidDocument(result, () => {
    throw new Error('Folder-scope snapshot disappeared');
  });
}

export function writeFolderScopeSnapshot(snapshotPath: string, snapshot: FolderScopeGraphSnapshot): void {
  writeDurableDocument({ path: snapshotPath, value: snapshot, codec: folderScopeSnapshotCodec });
}
