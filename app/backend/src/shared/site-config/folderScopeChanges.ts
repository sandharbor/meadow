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

import fs from 'fs';
import path from 'path';
import type { SiteNodeConfig } from '../../../../shared_code/types/siteNodeConfig.js';
import type {
  FolderScopeChangeExplanation,
  FolderScopeChangeItem,
  FolderScopeGraphSnapshot,
  FolderScopeSnapshotNode,
} from '../../../../shared_code/types/folderScopeChanges.js';

function locator(node: FolderScopeSnapshotNode): string {
  if (node.siteNodeKind === 'folder') return node.sourceGraphSubdirectory ?? '';
  if (node.siteNodeKind === 'file') {
    const directory = node.sourceGraphSubdirectory ?? '';
    const filename = `${node.siteNodeName}.${node.fileType ?? node.siteNodeKey.split('.').pop() ?? ''}`;
    return directory ? `${directory}/${filename}` : filename;
  }
  return node.siteNodeName;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function folderNameForIncoming(snapshot: FolderScopeGraphSnapshot, nodeKey: string): string {
  const edge = snapshot.edges.find(candidate => candidate.target === nodeKey
    && (candidate.siteEdgeKind === 'directoryContainment' || candidate.siteEdgeKind === 'collectionMembership'));
  return snapshot.nodes.find(node => node.siteNodeKey === edge?.source)?.siteNodeName ?? 'selected scope';
}

function configMap(configs: SiteNodeConfig[]): Map<string, SiteNodeConfig> {
  return new Map(configs.map(config => [config.siteNodeId, config]));
}

export function explainFolderScopeChanges(args: {
  previous?: FolderScopeGraphSnapshot;
  current: FolderScopeGraphSnapshot;
  previousConfigs: SiteNodeConfig[];
  currentConfigs: SiteNodeConfig[];
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
  const previousByKey = new Map(previous.nodes.map(node => [node.siteNodeKey, node]));
  const currentByKey = new Map(current.nodes.map(node => [node.siteNodeKey, node]));
  const previousById = new Map(previous.nodes.filter(node => node.siteNodeId).map(node => [node.siteNodeId!, node]));
  const currentById = new Map(current.nodes.filter(node => node.siteNodeId).map(node => [node.siteNodeId!, node]));
  const movedOldKeys = new Set<string>();
  const movedNewKeys = new Set<string>();

  for (const [siteNodeId, oldNode] of previousById) {
    const newNode = currentById.get(siteNodeId);
    if (!newNode || oldNode.siteNodeKey === newNode.siteNodeKey) continue;
    movedOldKeys.add(oldNode.siteNodeKey);
    movedNewKeys.add(newNode.siteNodeKey);
    items.push({
      category: 'move', code: 'configured-node-moved', siteNodeId,
      oldLocator: locator(oldNode), newLocator: locator(newNode),
      message: `${oldNode.siteNodeName} moved from ${locator(oldNode)} to ${locator(newNode)}; identity was preserved and no automatic match was inferred.`,
    });
  }

  for (const node of current.nodes) {
    if (previousByKey.has(node.siteNodeKey) || movedNewKeys.has(node.siteNodeKey)) continue;
    const parentName = folderNameForIncoming(current, node.siteNodeKey);
    items.push({
      category: 'addition', code: node.siteNodeId ? 'configured-node-added' : 'untracked-node-added',
      siteNodeId: node.siteNodeId, siteNodeKey: node.siteNodeKey, newLocator: locator(node),
      message: node.siteNodeId
        ? `${node.siteNodeName} was added under ${parentName}.`
        : `${node.siteNodeName} was added under ${parentName} and remains untracked.`,
    });
  }
  for (const node of previous.nodes) {
    if (currentByKey.has(node.siteNodeKey) || movedOldKeys.has(node.siteNodeKey)) continue;
    items.push({
      category: 'removal', code: node.siteNodeId ? 'configured-node-orphaned' : 'source-node-removed',
      siteNodeId: node.siteNodeId, siteNodeKey: node.siteNodeKey, oldLocator: locator(node),
      message: node.siteNodeId
        ? `${node.siteNodeName} is no longer present at ${locator(node)} and is now an orphan.`
        : `${node.siteNodeName} was removed from the scope projection.`,
    });
  }

  for (const node of current.nodes) {
    const oldNode = previousByKey.get(node.siteNodeKey);
    if (!oldNode || oldNode.effectiveFolderPolicySiteNodeId === node.effectiveFolderPolicySiteNodeId) continue;
    items.push({
      category: 'policy', code: 'effective-folder-policy-changed', siteNodeKey: node.siteNodeKey,
      message: `${node.siteNodeName} changed effective folder policy from ${oldNode.effectiveFolderPolicySiteNodeId ?? 'site defaults'} to ${node.effectiveFolderPolicySiteNodeId ?? 'site defaults'}.`,
    });
  }

  const oldConfigs = configMap(previousConfigs);
  const newConfigs = configMap(currentConfigs);
  for (const [siteNodeId, next] of newConfigs) {
    const prior = oldConfigs.get(siteNodeId);
    if (!prior || next.siteNodeKind !== 'folder' || prior.siteNodeKind !== 'folder') continue;
    if (prior.outlinksDepth !== next.outlinksDepth || prior.inlinksDepth !== next.inlinksDepth) {
      const affectedNodeCount = current.nodes.filter(node => node.effectiveFolderPolicySiteNodeId === siteNodeId).length;
      items.push({
        category: 'policy', code: 'folder-depth-changed', siteNodeId, affectedNodeCount,
        message: `${next.siteNodeName} depth policy changed for ${affectedNodeCount} seed or scoped node(s); raw graph delta ${signed(current.nodes.length - previous.nodes.length)}.`,
      });
    }
    if (prior.listType !== 'blacklist' && next.listType === 'blacklist') {
      const affectedNodeCount = current.nodes.filter(node => node.effectiveBlacklistingSiteNodeId === siteNodeId).length;
      items.push({
        category: 'blacklist', code: 'folder-blacklist-became-effective', siteNodeId, affectedNodeCount,
        message: `${next.siteNodeName} became a hard folder blacklist boundary affecting ${affectedNodeCount} raw node(s) and their semantic expansion.`,
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
    || (left.siteNodeKey ?? left.siteNodeId ?? left.message).localeCompare(right.siteNodeKey ?? right.siteNodeId ?? right.message));
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
  if (!fs.existsSync(snapshotPath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as FolderScopeGraphSnapshot;
  } catch {
    return undefined;
  }
}

export function writeFolderScopeSnapshot(snapshotPath: string, snapshot: FolderScopeGraphSnapshot): void {
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  const temporaryPath = `${snapshotPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, snapshotPath);
}
