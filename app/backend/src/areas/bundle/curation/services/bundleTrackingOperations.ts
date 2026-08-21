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
import os from 'os';
import path from 'path';
import type { BundleNodeConfig, BundleNodeId } from '../../../../../../shared_code/types/bundleNodeConfig.js';
import {
  CLI_OPERATION_SCHEMA_VERSION,
  type SkippedBundleNodeResult,
  type TrackBundleNodesCliResult,
  type TrackedBundleNodeResult,
} from '../../../../../../shared_code/types/cliOperations.js';
import { Graph } from '../../../../../../shared_code/types/graph.js';
import type { IBundleNode } from '../../../../../../shared_code/types/IBundleNode.js';
import {
  applyNodeConfigsToNodes,
  applySensitiveFromApiData,
  generateBundleNodeId,
} from '../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { saveBundleNodeConfigDocument } from '../../../../../../shared_code/utils/bundleNodeConfigPersistence.js';
import { AppConfigGitUtils, GIT_AUTHORS } from '../../../../../../shared_code/utils/appConfigGitUtils.js';
import {
  getBundleConfigPath,
  getBundleDirectory,
  getBundleRawDirectory,
  getConfigDirectory,
} from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { syncTrackedSourceContent } from '../../../../shared/bundle-node/trackedSourceContentSync.js';
import { loadCustomFiltersForBundle } from '../routes/customFiltersRoutes.js';
import { selectEffectivelySensitiveNodeKeys } from './graphFilterService.js';
import { loadWorkingGraph } from './workingGraphService.js';

export type TrackBundleNodesOptions =
  | { mode: 'targeted'; nodeKeys: string[] }
  | { mode: 'all-safe' };

export class BundleTrackingOperationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BundleTrackingOperationError';
  }
}

function compareNodes(left: IBundleNode, right: IBundleNode): number {
  return left.bundleNodeKey.localeCompare(right.bundleNodeKey);
}

function trackedResult(node: IBundleNode): TrackedBundleNodeResult {
  if (!node.bundleNodeId) throw new Error(`Tracked node ${node.bundleNodeKey} has no bundleNodeId`);
  return {
    bundleNodeKey: node.bundleNodeKey,
    bundleNodeId: node.bundleNodeId,
    bundleNodeName: node.bundleNodeName,
  };
}

function skippedResult(node: IBundleNode, reason: string): SkippedBundleNodeResult {
  return {
    bundleNodeKey: node.bundleNodeKey,
    bundleNodeName: node.bundleNodeName,
    reason,
  };
}

function untrackableReason(node: IBundleNode): string | null {
  if (node.bundleNodeKind === 'collection') return 'bundle-home';
  if (node.isFrontierNode) return 'frontier';
  if (node.effectiveBlacklistingBundleNodeId) return 'below-blacklisted-folder';
  return null;
}

function configForNode(node: IBundleNode, bundleNodeId: BundleNodeId): BundleNodeConfig {
  const common = {
    bundleNodeName: node.bundleNodeName,
    bundleNodeId,
    listType: 'whitelist' as const,
  };
  if (node.bundleNodeKind === 'folder') {
    return {
      ...common,
      bundleNodeKind: 'folder',
      sourceGraphSubdirectory: node.sourceGraphSubdirectory,
    };
  }
  if (node.bundleNodeKind === 'collection') {
    throw new Error('Bundle homes cannot be tracked through generic curation');
  }
  return {
    ...common,
    bundleNodeKind: 'file',
    sourceGraphSubdirectory: node.sourceGraphSubdirectory,
    fileType: node.fileType,
  };
}

export async function persistBundleNodeConfigsAtomically(options: {
  slug: string;
  sourceDirectory: string;
  configs: BundleNodeConfig[];
  commitMessage?: string;
}): Promise<void> {
  const bundleDirectory = getBundleDirectory(options.slug);
  const configPath = getBundleConfigPath(options.slug, 'bundle_node_config.yaml');
  const rawDirectory = getBundleRawDirectory(options.slug);
  const rollbackRoot = fs.mkdtempSync(path.join(os.tmpdir(), `meadow-track-${options.slug}-`));
  const rollbackConfigPath = path.join(rollbackRoot, 'bundle_node_config.yaml');
  const rollbackRawPath = path.join(rollbackRoot, 'raw');
  const hadConfig = fs.existsSync(configPath);
  const hadRaw = fs.existsSync(rawDirectory);
  if (hadConfig) fs.copyFileSync(configPath, rollbackConfigPath);
  if (hadRaw) fs.cpSync(rawDirectory, rollbackRawPath, { recursive: true });

  try {
    saveBundleNodeConfigDocument(configPath, options.configs);
    syncTrackedSourceContent({
      bundleDirectory,
      sourceDirectory: options.sourceDirectory,
      configs: options.configs,
    });
    const git = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, getConfigDirectory());
    await git.commitDirs([
      `bundles/${options.slug}/config`,
      `bundles/${options.slug}/raw`,
    ], options.commitMessage ?? `track bundle nodes for ${options.slug}`);
  } catch (error) {
    if (hadConfig) fs.copyFileSync(rollbackConfigPath, configPath);
    else fs.rmSync(configPath, { force: true });
    fs.rmSync(rawDirectory, { recursive: true, force: true });
    if (hadRaw) fs.cpSync(rollbackRawPath, rawDirectory, { recursive: true });
    throw error;
  } finally {
    fs.rmSync(rollbackRoot, { recursive: true, force: true });
  }
}

export async function trackBundleNodes(
  slug: string,
  options: TrackBundleNodesOptions,
): Promise<TrackBundleNodesCliResult> {
  const loaded = await loadWorkingGraph({ bundleSlug: slug });
  if (loaded.draftNodes) {
    throw new BundleTrackingOperationError(
      'This bundle has pending curation changes. Save or undo them before using the CLI tracking operation.',
      409,
    );
  }
  applySensitiveFromApiData(loaded.nodes);
  applyNodeConfigsToNodes(loaded.nodes, loaded.committedNodes);
  const graph = new Graph();
  loaded.nodes.forEach(node => graph.addNode(node));
  loaded.edges.forEach(edge => graph.addEdge(edge));
  graph.setLinkSourceData(loaded.allInlinkSources, loaded.allOutlinkTargets);
  const effectivelySensitive = selectEffectivelySensitiveNodeKeys(
    graph,
    loadCustomFiltersForBundle(slug),
  );

  const orderedNodes = [...loaded.nodes].sort(compareNodes);
  let selectedNodes: IBundleNode[];
  if (options.mode === 'targeted') {
    const uniqueKeys = [...new Set(options.nodeKeys)];
    if (uniqueKeys.length === 0) {
      throw new BundleTrackingOperationError('At least one --node-key is required', 400);
    }
    const byKey = new Map<string, IBundleNode>(
      orderedNodes.map(node => [node.bundleNodeKey, node]),
    );
    const missing = uniqueKeys.filter(key => !byKey.has(key));
    if (missing.length > 0) {
      throw new BundleTrackingOperationError(
        `Unknown bundleNodeKey value(s): ${missing.join(', ')}. Run 'meadow bundle nodes ${slug} --scope all'.`,
        404,
        { missingNodeKeys: missing },
      );
    }
    selectedNodes = uniqueKeys.map(key => byKey.get(key)!).sort(compareNodes);
    const sensitive = selectedNodes.filter(node => effectivelySensitive.has(node.bundleNodeKey));
    if (sensitive.length > 0) {
      throw new BundleTrackingOperationError(
        `Refusing to track sensitive node(s): ${sensitive.map(node => node.bundleNodeName).join(', ')}. No sensitive-content override is available in this command.`,
        409,
        { sensitiveNodeKeys: sensitive.map(node => node.bundleNodeKey) },
      );
    }
    const untrackable = selectedNodes.filter(node => untrackableReason(node) !== null);
    if (untrackable.length > 0) {
      throw new BundleTrackingOperationError(
        `Cannot track the selected node(s): ${untrackable.map(node => node.bundleNodeName).join(', ')}`,
        409,
        { untrackableNodeKeys: untrackable.map(node => node.bundleNodeKey) },
      );
    }
  } else {
    selectedNodes = orderedNodes;
  }

  const newlyTrackedNodes: IBundleNode[] = [];
  const alreadyTrackedNodes: IBundleNode[] = [];
  const sensitiveSkipped: SkippedBundleNodeResult[] = [];
  const untrackableSkipped: SkippedBundleNodeResult[] = [];
  const rejected: SkippedBundleNodeResult[] = [];
  const existingIds = new Set<string>(loaded.committedNodes.map(config => config.bundleNodeId));
  const newConfigs: BundleNodeConfig[] = [];

  for (const node of selectedNodes) {
    if (node.tracked) {
      alreadyTrackedNodes.push(node);
      continue;
    }
    if (effectivelySensitive.has(node.bundleNodeKey)) {
      if (options.mode === 'all-safe') sensitiveSkipped.push(skippedResult(node, 'effectively-sensitive'));
      continue;
    }
    const reason = untrackableReason(node);
    if (reason) {
      if (options.mode === 'all-safe') untrackableSkipped.push(skippedResult(node, reason));
      continue;
    }
    if (node.blacklisted) {
      rejected.push(skippedResult(node, 'blacklisted'));
      continue;
    }
    const bundleNodeId = generateBundleNodeId(existingIds);
    existingIds.add(bundleNodeId);
    node.bundleNodeId = bundleNodeId;
    node.tracked = true;
    node.conf = configForNode(node, bundleNodeId);
    newConfigs.push(node.conf);
    newlyTrackedNodes.push(node);
  }

  if (newConfigs.length > 0) {
    const sourceDirectory = loaded.bundleConfig.sourceDirectory;
    if (!sourceDirectory) throw new Error(`Bundle '${slug}' has no source directory`);
    await persistBundleNodeConfigsAtomically({
      slug,
      sourceDirectory,
      configs: [...loaded.committedNodes, ...newConfigs],
    });
  }

  return {
    schemaVersion: CLI_OPERATION_SCHEMA_VERSION,
    operation: 'bundle.track',
    slug,
    mode: options.mode,
    changed: newConfigs.length > 0,
    newlyTracked: newlyTrackedNodes.map(trackedResult),
    alreadyTracked: alreadyTrackedNodes.map(trackedResult),
    sensitiveSkipped,
    untrackableSkipped,
    rejected,
    nextActions: [{
      operation: 'generate-bundle',
      args: ['bundle', 'generate', slug],
      displayCommand: `meadow bundle generate ${slug}`,
    }],
  };
}
