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
import type { SiteConfig } from '../../../../shared_code/types/siteConfig.js';
import type { FolderSiteNodeConfig, SiteNodeConfig, SiteNodeId } from '../../../../shared_code/types/siteNodeConfig.js';
import {
  parseSiteNodeConfig,
  stringifySiteNodeConfig,
  validateCanonicalSiteConfiguration,
} from '../../../../shared_code/utils/siteNodeConfigUtils.js';
import { runWorkingGraphRaw } from '../utils/workingGraphUtils.js';
import {
  canonicalFolderSiteSourceDirectory,
  FOLDER_SITE_HIGH_IMPACT_RAW_NODES,
  FOLDER_SITE_HIGH_IMPACT_SEED_FILES,
  FOLDER_SITE_MAX_RAW_NODES,
  FOLDER_SITE_MAX_TYPED_EDGES,
  folderName,
  normalizeSelectedFolder,
  updateFingerprintWithFolderSource,
} from './folderSiteSource.js';

export interface MissingSelectedFolder {
  siteNodeId: SiteNodeId;
  siteNodeName: string;
  sourceGraphSubdirectory: string;
  role: 'entry' | 'collectionMember';
  reason: 'missing' | 'notDirectory' | 'symlinkOrEscape';
}

export interface FolderSiteRepairStatus {
  folderDerived: boolean;
  repairRequired: boolean;
  missingSelectedFolders: MissingSelectedFolder[];
}

interface LoadedFolderSite {
  sourceRoot: string;
  siteConfig: SiteConfig;
  nodes: SiteNodeConfig[];
  selectedFolderIds: SiteNodeId[];
  entryFolderId?: SiteNodeId;
  nodeConfigPath: string;
  siteConfigPath: string;
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
  siteNodeId: SiteNodeId;
  oldLocator: string;
  oldName: string;
  newLocator: string;
  newName: string;
  preservedSiteNodeId: SiteNodeId;
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

function loadFolderSite(siteDirectory: string): LoadedFolderSite {
  const nodeConfigPath = path.join(siteDirectory, 'conf', 'site_node_config.yaml');
  const siteConfigPath = path.join(siteDirectory, 'conf', 'site_config.yaml');
  const originalNodeConfig = fs.readFileSync(nodeConfigPath, 'utf8');
  const nodes = parseSiteNodeConfig(originalNodeConfig, nodeConfigPath);
  const siteConfig = YAML.parse(fs.readFileSync(siteConfigPath, 'utf8')) as SiteConfig;
  const entry = nodes.find(node => node.siteNodeId === siteConfig.entrySiteNodeId);
  if (!entry || entry.siteNodeKind === 'file') {
    return {
      sourceRoot: siteConfig.sourceDirectory ?? '', siteConfig, nodes, selectedFolderIds: [],
      nodeConfigPath, siteConfigPath, originalNodeConfig,
    };
  }
  const selectedFolderIds = entry.siteNodeKind === 'folder'
    ? [entry.siteNodeId]
    : [...entry.memberSiteNodeIds];
  return {
    sourceRoot: canonicalFolderSiteSourceDirectory(siteConfig.sourceDirectory ?? ''),
    siteConfig,
    nodes,
    selectedFolderIds,
    ...(entry.siteNodeKind === 'folder' && { entryFolderId: entry.siteNodeId }),
    nodeConfigPath,
    siteConfigPath,
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

function repairStatusForLoaded(loaded: LoadedFolderSite): FolderSiteRepairStatus {
  if (loaded.selectedFolderIds.length === 0) {
    return { folderDerived: false, repairRequired: false, missingSelectedFolders: [] };
  }
  const missingSelectedFolders = loaded.selectedFolderIds.flatMap(siteNodeId => {
    const node = loaded.nodes.find(candidate => candidate.siteNodeId === siteNodeId);
    if (!node || node.siteNodeKind !== 'folder') return [];
    const reason = folderBackingReason(loaded.sourceRoot, node.sourceGraphSubdirectory);
    if (!reason) return [];
    return [{
      siteNodeId,
      siteNodeName: node.siteNodeName,
      sourceGraphSubdirectory: node.sourceGraphSubdirectory,
      role: loaded.entryFolderId === siteNodeId ? 'entry' as const : 'collectionMember' as const,
      reason,
    }];
  });
  return { folderDerived: true, repairRequired: missingSelectedFolders.length > 0, missingSelectedFolders };
}

export function getFolderSiteRepairStatus(siteDirectory: string): FolderSiteRepairStatus {
  return repairStatusForLoaded(loadFolderSite(siteDirectory));
}

function candidateNodes(loaded: LoadedFolderSite, siteNodeId: SiteNodeId, selectedFolder: string): {
  nodes: SiteNodeConfig[];
  oldNode: FolderSiteNodeConfig;
  newNode: FolderSiteNodeConfig;
} {
  const status = repairStatusForLoaded(loaded);
  if (!status.missingSelectedFolders.some(folder => folder.siteNodeId === siteNodeId)) {
    throw new Error('Only a missing entry or collection-member folder can be relinked');
  }
  const oldNode = loaded.nodes.find(node => node.siteNodeId === siteNodeId);
  if (!oldNode || oldNode.siteNodeKind !== 'folder') throw new Error(`Selected folder ${siteNodeId} is not configured`);
  const newLocator = normalizeSelectedFolder(loaded.sourceRoot, selectedFolder);
  if (loaded.nodes.some(node => node.siteNodeKind === 'folder'
    && node.siteNodeId !== siteNodeId
    && node.sourceGraphSubdirectory === newLocator)) {
    throw new Error(`Folder ${newLocator || path.basename(loaded.sourceRoot)} is already represented by another configured node`);
  }
  const newNode: FolderSiteNodeConfig = {
    ...oldNode,
    siteNodeName: folderName(loaded.sourceRoot, newLocator),
    sourceGraphSubdirectory: newLocator,
  };
  const nodes = loaded.nodes.map(node => node.siteNodeId === siteNodeId ? newNode : node);
  validateCanonicalSiteConfiguration({
    committedNodes: nodes,
    committedPath: loaded.nodeConfigPath,
    siteConfig: loaded.siteConfig,
    siteConfigPath: loaded.siteConfigPath,
  });
  return { nodes, oldNode, newNode };
}

function repairFingerprint(loaded: LoadedFolderSite, nodes: SiteNodeConfig[]): string {
  const hash = crypto.createHash('sha256');
  hash.update(loaded.originalNodeConfig);
  hash.update(fs.readFileSync(loaded.siteConfigPath));
  hash.update(stringifySiteNodeConfig(nodes));
  const selectedLocators = loaded.selectedFolderIds.map(id => {
    const node = nodes.find(candidate => candidate.siteNodeId === id);
    if (!node || node.siteNodeKind !== 'folder') throw new Error(`Selected folder ${id} is invalid`);
    return node.sourceGraphSubdirectory;
  }).filter(locator => folderBackingReason(loaded.sourceRoot, locator) === null);
  updateFingerprintWithFolderSource(hash, loaded.sourceRoot, selectedLocators);
  return hash.digest('hex');
}

async function predictGraph(
  loaded: LoadedFolderSite,
  nodes: SiteNodeConfig[],
  runWorkingGraph: RunWorkingGraph,
): Promise<SelectedFolderRelinkPreflight['prediction']> {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-folder-relink-'));
  const configPath = path.join(temporaryDirectory, 'site_node_config.yaml');
  try {
    fs.writeFileSync(configPath, stringifySiteNodeConfig(nodes), 'utf8');
    const raw = await runWorkingGraph({
      graphRoot: loaded.sourceRoot,
      siteNodeConfigPath: configPath,
      entrySiteNodeId: loaded.siteConfig.entrySiteNodeId!,
      defaultTraversalSiteNodeId: loaded.siteConfig.defaultTraversalSiteNodeId!,
      defaultOutlinksDepth: loaded.siteConfig.defaultOutlinksDepth,
      defaultInlinksDepth: loaded.siteConfig.defaultInlinksDepth,
      frontierDepth: 0,
      allowImagesToExtendToFrontier: loaded.siteConfig.allowImagesToExtendToFrontier ?? true,
      allowLowerDepths: false,
    });
    const output = JSON.parse(raw) as FolderGraphOutput;
    if (!output.folderScope) throw new Error('Folder graph builder did not return a scope report');
    const report = output.folderScope;
    if (report.predictedRawNodeCount >= FOLDER_SITE_MAX_RAW_NODES
      || report.predictedTypedEdgeCount >= FOLDER_SITE_MAX_TYPED_EDGES) {
      throw new Error(`Relinked folder site is too large (${report.predictedRawNodeCount} raw nodes, ${report.predictedTypedEdgeCount} typed edges)`);
    }
    return {
      supportedSeedFileCount: report.supportedSeedFileCount,
      predictedRawNodeCount: report.predictedRawNodeCount,
      predictedTypedEdgeCount: report.predictedTypedEdgeCount,
      sensitiveNodeCount: output.nodes.filter(node => node.is_sensitive).length,
      skippedCounts: report.skippedCounts,
      skippedPaths: report.skippedPaths,
      skippedPathCount: report.skippedPathCount,
      highImpactWarning: report.supportedSeedFileCount >= FOLDER_SITE_HIGH_IMPACT_SEED_FILES
        || report.predictedRawNodeCount >= FOLDER_SITE_HIGH_IMPACT_RAW_NODES,
    };
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function preflightSelectedFolderRelink(
  siteDirectory: string,
  siteNodeId: SiteNodeId,
  selectedFolder: string,
  runWorkingGraph: RunWorkingGraph = runWorkingGraphRaw,
): Promise<SelectedFolderRelinkPreflight> {
  const loaded = loadFolderSite(siteDirectory);
  const { nodes, oldNode, newNode } = candidateNodes(loaded, siteNodeId, selectedFolder);
  const remainingMissingSelectedFolders = repairStatusForLoaded({ ...loaded, nodes }).missingSelectedFolders;
  const collection = loaded.nodes.find(node => node.siteNodeKind === 'collection');
  return {
    fingerprint: repairFingerprint(loaded, nodes),
    siteNodeId,
    oldLocator: oldNode.sourceGraphSubdirectory,
    oldName: oldNode.siteNodeName,
    newLocator: newNode.sourceGraphSubdirectory,
    newName: newNode.siteNodeName,
    preservedSiteNodeId: siteNodeId,
    ...(collection?.siteNodeKind === 'collection' && {
      collectionMemberIndex: collection.memberSiteNodeIds.indexOf(siteNodeId),
    }),
    remainingMissingSelectedFolders,
    ...(remainingMissingSelectedFolders.length === 0 && { prediction: await predictGraph(loaded, nodes, runWorkingGraph) }),
  };
}

export async function verifySelectedFolderRelink(
  siteDirectory: string,
  siteNodeId: SiteNodeId,
  selectedFolder: string,
  fingerprint: string,
  runWorkingGraph: RunWorkingGraph = runWorkingGraphRaw,
): Promise<{ preflight: SelectedFolderRelinkPreflight; serializedNodes: string }> {
  const preflight = await preflightSelectedFolderRelink(siteDirectory, siteNodeId, selectedFolder, runWorkingGraph);
  if (preflight.fingerprint !== fingerprint) throw new Error('Selected-folder relink preflight is stale; review it again');
  const loaded = loadFolderSite(siteDirectory);
  const { nodes } = candidateNodes(loaded, siteNodeId, selectedFolder);
  return { preflight, serializedNodes: stringifySiteNodeConfig(nodes) };
}
