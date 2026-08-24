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
import YAML from 'yaml';
import type { BundleConfig } from '../../../../../../../shared_code/types/bundleConfig.js';
import type { BundleNodeConfig } from '../../../../../../../shared_code/types/bundleNodeConfig.js';
import type { BundleNodeTraversalDetails } from '../../../../../../../shared_code/types/bundleNodeGraph.js';
import type { FileType } from '../../../../../../../shared_code/types/FileType.js';
import type { FolderScopeGraphSnapshot } from '../../../../../../../shared_code/types/folderScopeChanges.js';
import type { IBundleNode } from '../../../../../../../shared_code/types/IBundleNode.js';
import {
  parseBundleNodeConfig,
  validateCanonicalBundleConfiguration,
} from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { loadAppConfig } from '../../../../../../../shared_code/utils/appConfigUtils.js';
import {
  getBundleConfigPath,
  getBundleDirectory,
  getBundleRawDirectory,
  getConfigDirectory,
} from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { getFolderBundleRepairStatus } from '../../../../shared/bundle-config/folderBundleRepair.js';
import {
  explainFolderScopeChanges,
  loadFolderScopeSnapshot,
  writeFolderScopeSnapshot,
} from '../../../../shared/bundle-config/folderScopeChanges.js';
import { runWorkingGraphRaw } from '../../../../shared/utils/workingGraphUtils.js';

interface RustLinkResolvedInfo {
  link_resolved_target_directory: string;
  link_resolved_target_path: string | null;
}

interface RustNode {
  bundleNodeKey: string;
  bundleNodeId?: string;
  bundleNodeKind: 'file' | 'folder' | 'collection';
  bundleNodeName: string;
  sourceGraphSubdirectory?: string;
  fileType?: FileType;
  memberBundleNodeIds?: string[];
  effectiveBlacklistingBundleNodeId?: string;
  effectiveFolderPolicyBundleNodeId?: string;
  depth: number;
  remaining_depth: number;
  remaining_inlinks_depth: number;
  path: string[];
  traversal_details?: BundleNodeTraversalDetails;
  traversal_states?: Array<{ remaining_outlinks_depth: number; remaining_inlinks_depth: number }>;
  isFrontierNode?: boolean;
  isFrontierImageExtension?: boolean;
  is_sensitive: boolean;
  source_page_outlink_count?: number;
  source_page_inlink_count?: number;
}

interface RustEdge {
  source: string;
  target: string;
  bundleEdgeKind: 'semanticLink' | 'directoryContainment' | 'collectionMembership';
  isBidirectional: boolean;
}

interface RustOutput {
  nodes: RustNode[];
  edges: (RustEdge & { link_original_text: string })[];
  allLinkResolutionMaps: Record<string, Record<string, RustLinkResolvedInfo>>;
  allInlinkSources: Record<string, string[]>;
  allOutlinkTargets: Record<string, string[]>;
  folderScope?: FolderScopeGraphSnapshot['folderScope'];
}

export interface LoadedWorkingGraph {
  bundleConfig: BundleConfig;
  committedNodes: BundleNodeConfig[];
  draftNodes?: BundleNodeConfig[];
  nodes: IBundleNode[];
  edges: Array<{
    source: string;
    target: string;
    bundleEdgeKind: RustEdge['bundleEdgeKind'];
    isBidirectional: boolean;
    data: { fromDepth: number; toDepth: number };
  }>;
  allInlinkSources: Record<string, string[]>;
  allOutlinkTargets: Record<string, string[]>;
  folderScope?: FolderScopeGraphSnapshot['folderScope'];
  changeExplanations?: ReturnType<typeof explainFolderScopeChanges>;
}

export class WorkingGraphOperationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'WorkingGraphOperationError';
  }
}

function snapshotFor(output: RustOutput): FolderScopeGraphSnapshot {
  return {
    nodes: output.nodes.map(node => ({
      bundleNodeKey: node.bundleNodeKey,
      ...(node.bundleNodeId && { bundleNodeId: node.bundleNodeId }),
      bundleNodeKind: node.bundleNodeKind,
      bundleNodeName: node.bundleNodeName,
      ...(node.sourceGraphSubdirectory !== undefined && { sourceGraphSubdirectory: node.sourceGraphSubdirectory }),
      ...(node.fileType && { fileType: node.fileType }),
      ...(node.effectiveBlacklistingBundleNodeId && { effectiveBlacklistingBundleNodeId: node.effectiveBlacklistingBundleNodeId }),
      ...(node.effectiveFolderPolicyBundleNodeId && { effectiveFolderPolicyBundleNodeId: node.effectiveFolderPolicyBundleNodeId }),
      remaining_depth: node.remaining_depth,
      remaining_inlinks_depth: node.remaining_inlinks_depth,
    })),
    edges: output.edges.map(edge => ({
      source: edge.source,
      target: edge.target,
      bundleEdgeKind: edge.bundleEdgeKind,
    })),
    ...(output.folderScope && { folderScope: output.folderScope }),
  };
}

function serializeNodes(output: RustOutput): IBundleNode[] {
  const linkResolutionMaps = output.allLinkResolutionMaps || {};
  return output.nodes.map(node => {
    const common = {
      bundleNodeKey: node.bundleNodeKey as IBundleNode['bundleNodeKey'],
      ...(node.bundleNodeId && { bundleNodeId: node.bundleNodeId as IBundleNode['bundleNodeId'] }),
      label: node.bundleNodeName,
      bundleNodeName: node.bundleNodeName,
      depth: node.depth,
      remaining_depth: node.remaining_depth,
      remaining_inlinks_depth: node.remaining_inlinks_depth,
      path: node.path,
      traversal_details: node.traversal_details,
      traversal_states: node.traversal_states,
      ...(node.effectiveBlacklistingBundleNodeId && {
        effectiveBlacklistingBundleNodeId: node.effectiveBlacklistingBundleNodeId as IBundleNode['bundleNodeId'],
      }),
      ...(node.effectiveFolderPolicyBundleNodeId && {
        effectiveFolderPolicyBundleNodeId: node.effectiveFolderPolicyBundleNodeId as IBundleNode['bundleNodeId'],
      }),
      linkResolutionMap: linkResolutionMaps[node.bundleNodeKey],
      isFrontierNode: node.isFrontierNode,
      isFrontierImageExtension: node.isFrontierImageExtension,
      source_page_outlink_count: node.source_page_outlink_count,
      source_page_inlink_count: node.source_page_inlink_count,
      data: {
        bundleNodeName: node.bundleNodeName,
        sourceGraphSubdirectory: node.sourceGraphSubdirectory,
        fileType: node.fileType,
        is_sensitive: node.is_sensitive,
      },
      getIdent: () => node.bundleNodeKey,
    };
    if (node.bundleNodeKind === 'collection') {
      return {
        ...common,
        bundleNodeKind: 'collection',
        memberBundleNodeIds: (node.memberBundleNodeIds ?? []) as NonNullable<IBundleNode['bundleNodeId']>[],
      };
    }
    if (node.bundleNodeKind === 'folder') {
      return {
        ...common,
        bundleNodeKind: 'folder',
        sourceGraphSubdirectory: node.sourceGraphSubdirectory ?? '',
      };
    }
    if (!node.fileType) throw new Error(`File node ${node.bundleNodeKey} has no fileType`);
    return {
      ...common,
      bundleNodeKind: 'file',
      sourceGraphSubdirectory: node.sourceGraphSubdirectory ?? '',
      fileType: node.fileType,
    };
  });
}

function serializeEdges(output: RustOutput): LoadedWorkingGraph['edges'] {
  const nodeDepthMap = new Map(output.nodes.map(node => [node.bundleNodeKey, node.depth]));
  const edgeMap = new Map<string, RustEdge>();
  for (const edge of output.edges) {
    const forwardKey = `${edge.bundleEdgeKind}:${edge.source}->${edge.target}`;
    const reverseKey = `${edge.bundleEdgeKind}:${edge.target}->${edge.source}`;
    if (edge.bundleEdgeKind === 'semanticLink' && edgeMap.has(reverseKey)) {
      const existing = edgeMap.get(reverseKey)!;
      existing.isBidirectional = true;
    } else if (edgeMap.has(forwardKey)) {
      const existing = edgeMap.get(forwardKey)!;
      existing.isBidirectional = existing.isBidirectional || edge.isBidirectional;
    } else {
      edgeMap.set(forwardKey, { ...edge });
    }
  }
  return [...edgeMap.values()]
    .map(edge => ({
      source: edge.source,
      target: edge.target,
      bundleEdgeKind: edge.bundleEdgeKind,
      isBidirectional: edge.isBidirectional ?? false,
      data: {
        fromDepth: nodeDepthMap.get(edge.source) ?? 0,
        toDepth: nodeDepthMap.get(edge.target) ?? 0,
      },
    }))
    .sort((left, right) => (
      `${left.source}->${left.target}`.localeCompare(`${right.source}->${right.target}`)
    ));
}

export async function loadWorkingGraph(options: {
  bundleSlug: string;
  frontierDepth?: number;
}): Promise<LoadedWorkingGraph> {
  const { bundleSlug } = options;
  const frontierDepth = options.frontierDepth ?? 0;
  if (!Number.isInteger(frontierDepth) || frontierDepth < 0) {
    throw new WorkingGraphOperationError('frontierDepth must be a non-negative integer', 400);
  }

  const configPath = getBundleConfigPath(bundleSlug);
  if (!fs.existsSync(configPath)) {
    throw new WorkingGraphOperationError(`Bundle '${bundleSlug}' not found`, 404);
  }
  let bundleConfig: BundleConfig;
  try {
    bundleConfig = YAML.parse(fs.readFileSync(configPath, 'utf8')) as BundleConfig;
  } catch (error) {
    throw new Error(`Failed to load bundle configuration for ${bundleSlug}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const notesDir = typeof bundleConfig.sourceDirectory === 'string' ? bundleConfig.sourceDirectory : '';
  if (!notesDir) {
    throw new WorkingGraphOperationError(`Bundle '${bundleSlug}' has no source directory`, 409);
  }

  const repairStatus = getFolderBundleRepairStatus(getBundleDirectory(bundleSlug));
  if (repairStatus.repairRequired) {
    throw new WorkingGraphOperationError('Selected folder repair required', 409, {
      repairRequired: true,
      missingSelectedFolders: repairStatus.missingSelectedFolders,
    });
  }

  const draftPath = getBundleConfigPath(bundleSlug, 'draft_bundle_node_config.yaml');
  const mainPath = getBundleConfigPath(bundleSlug, 'bundle_node_config.yaml');
  if (!fs.existsSync(mainPath)) {
    throw new WorkingGraphOperationError(`bundle_node_config.yaml not found for ${bundleSlug}`, 409);
  }
  const committedNodes = parseBundleNodeConfig(fs.readFileSync(mainPath, 'utf8'), mainPath);
  const draftNodes = fs.existsSync(draftPath)
    ? parseBundleNodeConfig(fs.readFileSync(draftPath, 'utf8'), draftPath)
    : undefined;
  validateCanonicalBundleConfiguration({
    committedNodes,
    committedPath: mainPath,
    ...(draftNodes && { draftNodes, draftPath }),
    bundleConfig,
    bundleConfigPath: configPath,
  });

  const appConfig = loadAppConfig(getConfigDirectory());
  const allowImagesToExtendToFrontier = bundleConfig.allowImagesToExtendToFrontier
    ?? appConfig.allowImagesToExtendToFrontier
    ?? true;
  const runGraph = async (configFile: string): Promise<RustOutput> => {
    const raw = await runWorkingGraphRaw({
      graphRoot: notesDir,
      bundleNodeConfigPath: configFile,
      entryBundleNodeId: bundleConfig.entryBundleNodeId!,
      defaultTraversalBundleNodeId: bundleConfig.defaultTraversalBundleNodeId!,
      defaultOutlinksDepth: bundleConfig.defaultOutlinksDepth,
      defaultInlinksDepth: bundleConfig.defaultInlinksDepth,
      frontierDepth,
      allowImagesToExtendToFrontier,
      allowLowerDepths: false,
    });
    return JSON.parse(raw) as RustOutput;
  };

  let output: RustOutput;
  try {
    output = await runGraph(draftNodes ? draftPath : mainPath);
  } catch (error) {
    throw new Error(`Failed to build the working graph for ${bundleSlug}: ${error instanceof Error ? error.message : String(error)}`);
  }

  let changeExplanations: ReturnType<typeof explainFolderScopeChanges> | undefined;
  if (output.folderScope) {
    const currentSnapshot = snapshotFor(output);
    const snapshotPath = path.join(getBundleRawDirectory(bundleSlug), 'folder_scope_snapshot.json');
    if (draftNodes) {
      const committedSnapshot = snapshotFor(await runGraph(mainPath));
      changeExplanations = explainFolderScopeChanges({
        previous: committedSnapshot,
        current: currentSnapshot,
        previousConfigs: committedNodes,
        currentConfigs: draftNodes,
        basis: 'committedDraft',
      });
      writeFolderScopeSnapshot(snapshotPath, committedSnapshot);
    } else {
      const previous = loadFolderScopeSnapshot(snapshotPath);
      changeExplanations = explainFolderScopeChanges({
        previous,
        current: currentSnapshot,
        previousConfigs: committedNodes,
        currentConfigs: committedNodes,
        basis: previous ? 'priorRebuild' : 'initial',
      });
      writeFolderScopeSnapshot(snapshotPath, currentSnapshot);
    }
  }

  return {
    bundleConfig,
    committedNodes,
    ...(draftNodes && { draftNodes }),
    nodes: serializeNodes(output),
    edges: serializeEdges(output),
    allInlinkSources: output.allInlinkSources || {},
    allOutlinkTargets: output.allOutlinkTargets || {},
    ...(output.folderScope && { folderScope: output.folderScope }),
    ...(changeExplanations && { changeExplanations }),
  };
}
