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

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import YAML from 'yaml';
import type { BundleConfig } from '../../../../../shared_code/types/bundleConfig.js';
import type { FolderBundleNodeConfig, BundleNodeConfig, BundleNodeId } from '../../../../../shared_code/types/bundleNodeConfig.js';
import {
  parseBundleNodeConfig,
  stringifyBundleNodeConfig,
  validateCanonicalBundleConfiguration,
} from '../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { runWorkingGraphRaw } from '../utils/workingGraphUtils.js';
import {
  canonicalFolderBundleSourceDirectory,
  FOLDER_BUNDLE_HIGH_IMPACT_RAW_NODES,
  FOLDER_BUNDLE_HIGH_IMPACT_SEED_FILES,
  FOLDER_BUNDLE_MAX_RAW_NODES,
  FOLDER_BUNDLE_MAX_TYPED_EDGES,
  folderName,
  normalizeSelectedFolder,
  updateFingerprintWithFolderSource,
} from './folderBundleSource.js';

export interface MissingSelectedFolder {
  bundleNodeId: BundleNodeId;
  bundleNodeName: string;
  sourceGraphSubdirectory: string;
  role: 'entry' | 'collectionMember';
  reason: 'missing' | 'notDirectory' | 'symlinkOrEscape';
}

export interface FolderBundleRepairStatus {
  folderDerived: boolean;
  repairRequired: boolean;
  missingSelectedFolders: MissingSelectedFolder[];
}

interface LoadedFolderBundle {
  sourceRoot: string;
  bundleConfig: BundleConfig;
  nodes: BundleNodeConfig[];
  selectedFolderIds: BundleNodeId[];
  entryFolderId?: BundleNodeId;
  nodeConfigPath: string;
  bundleConfigPath: string;
  originalNodeConfig: string;
}

type FolderGraphOutput = {
  nodes: Array<{ is_sensitive?: boolean }>;
  folderScope?: {
    supportedSeedFileCount: number;
    skippedCounts: Record<string, number>;
    skippedPaths: Array<{ path: string; reason: string }>;
    skippedPathCount: number;
    predictedRawNodeCount: number;
    predictedTypedEdgeCount: number;
  };
};

export interface SelectedFolderRelinkPreflight {
  fingerprint: string;
  bundleNodeId: BundleNodeId;
  oldLocator: string;
  oldName: string;
  newLocator: string;
  newName: string;
  preservedBundleNodeId: BundleNodeId;
  collectionMemberIndex?: number;
  remainingMissingSelectedFolders: MissingSelectedFolder[];
  prediction?: {
    supportedSeedFileCount: number;
    predictedRawNodeCount: number;
    predictedTypedEdgeCount: number;
    sensitiveNodeCount: number;
    skippedCounts: Record<string, number>;
    skippedPaths: Array<{ path: string; reason: string }>;
    skippedPathCount: number;
    highImpactWarning: boolean;
  };
}

type RunWorkingGraph = typeof runWorkingGraphRaw;

function loadFolderBundle(bundleDirectory: string): LoadedFolderBundle {
  const nodeConfigPath = path.join(bundleDirectory, 'config', 'bundle_node_config.yaml');
  const bundleConfigPath = path.join(bundleDirectory, 'config', 'bundle_config.yaml');
  const originalNodeConfig = fs.readFileSync(nodeConfigPath, 'utf8');
  const nodes = parseBundleNodeConfig(originalNodeConfig, nodeConfigPath);
  const bundleConfig = YAML.parse(fs.readFileSync(bundleConfigPath, 'utf8')) as BundleConfig;
  const entry = nodes.find(node => node.bundleNodeId === bundleConfig.entryBundleNodeId);
  if (!entry || entry.bundleNodeKind === 'file') {
    return {
      sourceRoot: bundleConfig.sourceDirectory ?? '', bundleConfig, nodes, selectedFolderIds: [],
      nodeConfigPath, bundleConfigPath, originalNodeConfig,
    };
  }
  const selectedFolderIds = entry.bundleNodeKind === 'folder'
    ? [entry.bundleNodeId]
    : [...entry.memberBundleNodeIds];
  return {
    sourceRoot: canonicalFolderBundleSourceDirectory(bundleConfig.sourceDirectory ?? ''),
    bundleConfig,
    nodes,
    selectedFolderIds,
    ...(entry.bundleNodeKind === 'folder' && { entryFolderId: entry.bundleNodeId }),
    nodeConfigPath,
    bundleConfigPath,
    originalNodeConfig,
  };
}

function folderBackingReason(sourceRoot: string, locator: string): MissingSelectedFolder['reason'] | null {
  const absolute = locator ? path.join(sourceRoot, ...locator.split('/')) : sourceRoot;
  if (!fs.existsSync(absolute)) return 'missing';
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) return 'symlinkOrEscape';
  if (!stat.isDirectory()) return 'notDirectory';
  try {
    const real = fs.realpathSync(absolute);
    const relative = path.relative(sourceRoot, real);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return 'symlinkOrEscape';
    if (real !== absolute) return 'symlinkOrEscape';
  } catch {
    return 'missing';
  }
  return null;
}

function repairStatusForLoaded(loaded: LoadedFolderBundle): FolderBundleRepairStatus {
  if (loaded.selectedFolderIds.length === 0) {
    return { folderDerived: false, repairRequired: false, missingSelectedFolders: [] };
  }
  const missingSelectedFolders = loaded.selectedFolderIds.flatMap(bundleNodeId => {
    const node = loaded.nodes.find(candidate => candidate.bundleNodeId === bundleNodeId);
    if (!node || node.bundleNodeKind !== 'folder') return [];
    const reason = folderBackingReason(loaded.sourceRoot, node.sourceGraphSubdirectory);
    if (!reason) return [];
    return [{
      bundleNodeId,
      bundleNodeName: node.bundleNodeName,
      sourceGraphSubdirectory: node.sourceGraphSubdirectory,
      role: loaded.entryFolderId === bundleNodeId ? 'entry' as const : 'collectionMember' as const,
      reason,
    }];
  });
  return { folderDerived: true, repairRequired: missingSelectedFolders.length > 0, missingSelectedFolders };
}

export function getFolderBundleRepairStatus(bundleDirectory: string): FolderBundleRepairStatus {
  return repairStatusForLoaded(loadFolderBundle(bundleDirectory));
}

function candidateNodes(loaded: LoadedFolderBundle, bundleNodeId: BundleNodeId, selectedFolder: string): {
  nodes: BundleNodeConfig[];
  oldNode: FolderBundleNodeConfig;
  newNode: FolderBundleNodeConfig;
} {
  const status = repairStatusForLoaded(loaded);
  if (!status.missingSelectedFolders.some(folder => folder.bundleNodeId === bundleNodeId)) {
    throw new Error('Only a missing entry or collection-member folder can be relinked');
  }
  const oldNode = loaded.nodes.find(node => node.bundleNodeId === bundleNodeId);
  if (!oldNode || oldNode.bundleNodeKind !== 'folder') throw new Error(`Selected folder ${bundleNodeId} is not configured`);
  const newLocator = normalizeSelectedFolder(loaded.sourceRoot, selectedFolder);
  if (loaded.nodes.some(node => node.bundleNodeKind === 'folder'
    && node.bundleNodeId !== bundleNodeId
    && node.sourceGraphSubdirectory === newLocator)) {
    throw new Error(`Folder ${newLocator || path.basename(loaded.sourceRoot)} is already represented by another configured node`);
  }
  const newNode: FolderBundleNodeConfig = {
    ...oldNode,
    bundleNodeName: folderName(loaded.sourceRoot, newLocator),
    sourceGraphSubdirectory: newLocator,
  };
  const nodes = loaded.nodes.map(node => node.bundleNodeId === bundleNodeId ? newNode : node);
  validateCanonicalBundleConfiguration({
    committedNodes: nodes,
    committedPath: loaded.nodeConfigPath,
    bundleConfig: loaded.bundleConfig,
    bundleConfigPath: loaded.bundleConfigPath,
  });
  return { nodes, oldNode, newNode };
}

function repairFingerprint(loaded: LoadedFolderBundle, nodes: BundleNodeConfig[]): string {
  const hash = crypto.createHash('sha256');
  hash.update(loaded.originalNodeConfig);
  hash.update(fs.readFileSync(loaded.bundleConfigPath));
  hash.update(stringifyBundleNodeConfig(nodes));
  const selectedLocators = loaded.selectedFolderIds.map(id => {
    const node = nodes.find(candidate => candidate.bundleNodeId === id);
    if (!node || node.bundleNodeKind !== 'folder') throw new Error(`Selected folder ${id} is invalid`);
    return node.sourceGraphSubdirectory;
  }).filter(locator => folderBackingReason(loaded.sourceRoot, locator) === null);
  updateFingerprintWithFolderSource(hash, loaded.sourceRoot, selectedLocators);
  return hash.digest('hex');
}

async function predictGraph(
  loaded: LoadedFolderBundle,
  nodes: BundleNodeConfig[],
  runWorkingGraph: RunWorkingGraph,
): Promise<SelectedFolderRelinkPreflight['prediction']> {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-folder-relink-'));
  const configPath = path.join(temporaryDirectory, 'bundle_node_config.yaml');
  try {
    fs.writeFileSync(configPath, stringifyBundleNodeConfig(nodes), 'utf8');
    const raw = await runWorkingGraph({
      graphRoot: loaded.sourceRoot,
      bundleNodeConfigPath: configPath,
      entryBundleNodeId: loaded.bundleConfig.entryBundleNodeId!,
      defaultTraversalBundleNodeId: loaded.bundleConfig.defaultTraversalBundleNodeId!,
      defaultOutlinksDepth: loaded.bundleConfig.defaultOutlinksDepth,
      defaultInlinksDepth: loaded.bundleConfig.defaultInlinksDepth,
      frontierDepth: 0,
      allowImagesToExtendToFrontier: loaded.bundleConfig.allowImagesToExtendToFrontier ?? true,
      allowLowerDepths: false,
    });
    const output = JSON.parse(raw) as FolderGraphOutput;
    if (!output.folderScope) throw new Error('Folder graph builder did not return a scope report');
    const report = output.folderScope;
    if (report.predictedRawNodeCount >= FOLDER_BUNDLE_MAX_RAW_NODES
      || report.predictedTypedEdgeCount >= FOLDER_BUNDLE_MAX_TYPED_EDGES) {
      throw new Error(`Relinked folder bundle is too large (${report.predictedRawNodeCount} raw nodes, ${report.predictedTypedEdgeCount} typed edges)`);
    }
    return {
      supportedSeedFileCount: report.supportedSeedFileCount,
      predictedRawNodeCount: report.predictedRawNodeCount,
      predictedTypedEdgeCount: report.predictedTypedEdgeCount,
      sensitiveNodeCount: output.nodes.filter(node => node.is_sensitive).length,
      skippedCounts: report.skippedCounts,
      skippedPaths: report.skippedPaths,
      skippedPathCount: report.skippedPathCount,
      highImpactWarning: report.supportedSeedFileCount >= FOLDER_BUNDLE_HIGH_IMPACT_SEED_FILES
        || report.predictedRawNodeCount >= FOLDER_BUNDLE_HIGH_IMPACT_RAW_NODES,
    };
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function preflightSelectedFolderRelink(
  bundleDirectory: string,
  bundleNodeId: BundleNodeId,
  selectedFolder: string,
  runWorkingGraph: RunWorkingGraph = runWorkingGraphRaw,
): Promise<SelectedFolderRelinkPreflight> {
  const loaded = loadFolderBundle(bundleDirectory);
  const { nodes, oldNode, newNode } = candidateNodes(loaded, bundleNodeId, selectedFolder);
  const remainingMissingSelectedFolders = repairStatusForLoaded({ ...loaded, nodes }).missingSelectedFolders;
  const collection = loaded.nodes.find(node => node.bundleNodeKind === 'collection');
  return {
    fingerprint: repairFingerprint(loaded, nodes),
    bundleNodeId,
    oldLocator: oldNode.sourceGraphSubdirectory,
    oldName: oldNode.bundleNodeName,
    newLocator: newNode.sourceGraphSubdirectory,
    newName: newNode.bundleNodeName,
    preservedBundleNodeId: bundleNodeId,
    ...(collection?.bundleNodeKind === 'collection' && {
      collectionMemberIndex: collection.memberBundleNodeIds.indexOf(bundleNodeId),
    }),
    remainingMissingSelectedFolders,
    ...(remainingMissingSelectedFolders.length === 0 && { prediction: await predictGraph(loaded, nodes, runWorkingGraph) }),
  };
}

export async function verifySelectedFolderRelink(
  bundleDirectory: string,
  bundleNodeId: BundleNodeId,
  selectedFolder: string,
  fingerprint: string,
  runWorkingGraph: RunWorkingGraph = runWorkingGraphRaw,
): Promise<{ preflight: SelectedFolderRelinkPreflight; serializedNodes: string; nodes: BundleNodeConfig[] }> {
  const preflight = await preflightSelectedFolderRelink(bundleDirectory, bundleNodeId, selectedFolder, runWorkingGraph);
  if (preflight.fingerprint !== fingerprint) throw new Error('Selected-folder relink preflight is stale; review it again');
  const loaded = loadFolderBundle(bundleDirectory);
  const { nodes } = candidateNodes(loaded, bundleNodeId, selectedFolder);
  return { preflight, serializedNodes: stringifyBundleNodeConfig(nodes), nodes };
}
