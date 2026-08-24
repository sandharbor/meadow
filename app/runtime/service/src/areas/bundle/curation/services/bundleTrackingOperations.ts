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
import type { BundleNodeConfig, BundleNodeId, FileBundleNodeConfig } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import {
  CLI_MUTATION_BEHAVIORS,
  CLI_OPERATION_SCHEMA_VERSION,
  type SkippedBundleNodeResult,
  type TrackBundleNodesCliResult,
  type TrackedBundleNodeResult,
} from '../../../../../../../contracts/types/cliOperations.js';
import { Graph } from '../../../../../../../contracts/types/graph.js';
import type { IBundleNode } from '../../../../../../../contracts/types/IBundleNode.js';
import {
  applyNodeConfigsToNodes,
  applySensitiveFromApiData,
  generateBundleNodeId,
  nodeConfigMatchesNode,
  parseBundleNodeConfig,
} from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { saveBundleNodeConfigDocument } from '../../../../../../../shared_code/utils/bundleNodeConfigPersistence.js';
import { AppConfigGitUtils, GIT_AUTHORS } from '../../../../../../../shared_code/utils/appConfigGitUtils.js';
import { BundleConfigPaths } from '../../../../../../../shared_code/paths/bundleConfigPaths.js';
import { canonicalPageFilename } from '../../../../../../../shared_code/utils/fileTypeUtils.js';
import {
  getBundleConfigPath,
  getBundleDirectory,
  getBundleRawDirectory,
  getConfigDirectory,
} from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { copySourceFileToTrackedSnapshot } from '../../../../shared/bundle-node/trackedSourceContentSync.js';
import {
  applyTrackingEvidenceFromSnapshot,
  sourceFilePathForConfig,
} from '../../../../shared/bundle-node/trackingEvidence.js';
import { loadCustomFiltersForBundle } from '../../../../shared/custom-filters/customFilterLoader.js';
import { selectEffectivelySensitiveNodeKeys } from '../../../../shared/bundle-graph/graphFilterService.js';
import { loadWorkingGraph } from '../../../../shared/bundle-graph/workingGraphService.js';

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
  if (!node.conf) throw new Error(`Tracked node ${node.bundleNodeKey} has no configuration`);
  return {
    bundleNodeKey: node.bundleNodeKey,
    bundleNodeId: node.bundleNodeId,
    bundleNodeName: node.bundleNodeName,
    config: node.conf,
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
  effectivelySensitiveByNodeId?: ReadonlyMap<string, boolean>;
  trackedAt?: string;
  topologyChanged?: boolean;
}): Promise<void> {
  const bundleDirectory = getBundleDirectory(options.slug);
  const configPath = getBundleConfigPath(options.slug, 'bundle_node_config.yaml');
  const rawDirectory = getBundleRawDirectory(options.slug);
  const snapshotDirectory = BundleConfigPaths.getTrackedPageContentDir(bundleDirectory);
  const rollbackRoot = fs.mkdtempSync(path.join(os.tmpdir(), `meadow-track-${options.slug}-`));
  const rollbackConfigPath = path.join(rollbackRoot, 'bundle_node_config.yaml');
  const hadConfig = fs.existsSync(configPath);
  if (hadConfig) fs.copyFileSync(configPath, rollbackConfigPath);
  const previousConfigs = hadConfig
    ? parseBundleNodeConfig(fs.readFileSync(configPath, 'utf8'), configPath)
    : [];

  const snapshotPathFor = (config: FileBundleNodeConfig): string => path.join(
    snapshotDirectory,
    config.sourceGraphSubdirectory ?? '',
    canonicalPageFilename(config.bundleNodeName, config.fileType),
  );
  const previousFiles = new Map(previousConfigs
    .filter((config): config is FileBundleNodeConfig => config.bundleNodeKind === 'file')
    .map(config => [config.bundleNodeId, config]));
  const nextFiles = new Map(options.configs
    .filter((config): config is FileBundleNodeConfig => config.bundleNodeKind === 'file')
    .map(config => [config.bundleNodeId, config]));
  const snapshotActions = new Map<string, string | null>();
  for (const [bundleNodeId, previous] of previousFiles) {
    const next = nextFiles.get(bundleNodeId);
    const previousPath = snapshotPathFor(previous);
    if (!next || snapshotPathFor(next) !== previousPath) snapshotActions.set(previousPath, null);
  }
  for (const [bundleNodeId, next] of nextFiles) {
    const previous = previousFiles.get(bundleNodeId);
    const nextPath = snapshotPathFor(next);
    if (
      !previous
      || snapshotPathFor(previous) !== nextPath
      || options.effectivelySensitiveByNodeId?.has(bundleNodeId)
    ) {
      snapshotActions.set(nextPath, sourceFilePathForConfig(options.sourceDirectory, next));
    }
  }

  const folderScopeSnapshotPath = path.join(rawDirectory, 'folder_scope_snapshot.json');
  if (options.topologyChanged !== false && fs.existsSync(folderScopeSnapshotPath)) {
    // The graph rebuild below rewrites this snapshot, so include it in rollback.
    snapshotActions.set(folderScopeSnapshotPath, folderScopeSnapshotPath);
  }
  const rollbackFiles = new Map<string, string | null>();
  let rollbackFileIndex = 0;
  for (const targetPath of snapshotActions.keys()) {
    if (!fs.existsSync(targetPath)) {
      rollbackFiles.set(targetPath, null);
      continue;
    }
    const rollbackPath = path.join(rollbackRoot, `snapshot-${rollbackFileIndex}`);
    rollbackFileIndex += 1;
    fs.copyFileSync(targetPath, rollbackPath);
    rollbackFiles.set(targetPath, rollbackPath);
  }

  try {
    fs.mkdirSync(snapshotDirectory, { recursive: true });
    for (const config of options.configs) {
      if (config.bundleNodeKind !== 'folder') continue;
      const sourceFolder = path.join(
        options.sourceDirectory,
        ...config.sourceGraphSubdirectory.split('/'),
      );
      if (!fs.existsSync(sourceFolder) || !fs.statSync(sourceFolder).isDirectory()) {
        throw new Error(`Tracked source folder no longer exists: ${config.sourceGraphSubdirectory}`);
      }
      fs.mkdirSync(path.join(snapshotDirectory, ...config.sourceGraphSubdirectory.split('/')), {
        recursive: true,
      });
    }
    for (const [targetPath, sourcePath] of snapshotActions) {
      if (targetPath === folderScopeSnapshotPath) continue;
      if (sourcePath === null) {
        fs.rmSync(targetPath, { force: true });
        continue;
      }
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      copySourceFileToTrackedSnapshot(sourcePath, targetPath);
    }
    applyTrackingEvidenceFromSnapshot({
      bundleDirectory,
      configs: options.configs.filter(
        (config): config is FileBundleNodeConfig => config.bundleNodeKind === 'file',
      ),
      effectivelySensitiveByNodeId: options.effectivelySensitiveByNodeId ?? new Map(),
      trackedAt: options.trackedAt ?? new Date().toISOString(),
    });
    saveBundleNodeConfigDocument(configPath, options.configs);
    if (options.topologyChanged !== false && fs.existsSync(folderScopeSnapshotPath)) {
      await loadWorkingGraph({ bundleSlug: options.slug });
    }
    const git = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, getConfigDirectory());
    const filesToCommit = [
      `bundles/${options.slug}/config/bundle_node_config.yaml`,
      ...[...snapshotActions.keys()].map(targetPath => path.relative(
        getConfigDirectory(),
        targetPath,
      )),
    ];
    await git.commitFiles(filesToCommit, options.commitMessage ?? `track bundle nodes for ${options.slug}`);
  } catch (error) {
    if (hadConfig) fs.copyFileSync(rollbackConfigPath, configPath);
    else fs.rmSync(configPath, { force: true });
    for (const [targetPath, rollbackPath] of rollbackFiles) {
      fs.rmSync(targetPath, { force: true });
      if (rollbackPath) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(rollbackPath, targetPath);
      }
    }
    throw error;
  } finally {
    fs.rmSync(rollbackRoot, { recursive: true, force: true });
  }
}

export async function trackingEvidenceDecisionsForNewFiles(
  slug: string,
  candidate: BundleNodeConfig[],
  committed: BundleNodeConfig[],
): Promise<Map<string, boolean>> {
  const newFileConfigs = candidate.filter(
    (config): config is FileBundleNodeConfig => config.bundleNodeKind === 'file'
      && !committed.some(existing => existing.bundleNodeId === config.bundleNodeId),
  );
  if (newFileConfigs.length === 0) return new Map();

  const loaded = await loadWorkingGraph({ bundleSlug: slug });
  applySensitiveFromApiData(loaded.nodes);
  applyNodeConfigsToNodes(loaded.nodes, candidate);
  const graph = new Graph();
  loaded.nodes.forEach(node => graph.addNode(node));
  loaded.edges.forEach(edge => graph.addEdge(edge));
  graph.setLinkSourceData(loaded.allInlinkSources, loaded.allOutlinkTargets);
  const effectivelySensitive = selectEffectivelySensitiveNodeKeys(
    graph,
    loadCustomFiltersForBundle(slug),
  );

  const decisions = new Map<string, boolean>();
  for (const config of newFileConfigs) {
    const node = loaded.nodes.find(candidateNode => nodeConfigMatchesNode(
      config,
      candidateNode.bundleNodeName,
      candidateNode.sourceGraphSubdirectory,
      candidateNode.fileType,
      candidateNode.bundleNodeKind,
      candidateNode.bundleNodeId,
    ));
    if (!node) throw new Error(`New tracked file is unavailable in the working graph: ${config.bundleNodeName}`);
    decisions.set(config.bundleNodeId, effectivelySensitive.has(node.bundleNodeKey));
  }
  return decisions;
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
  const evidenceDecisions = new Map<string, boolean>();

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
    if (node.conf.bundleNodeKind === 'file') evidenceDecisions.set(bundleNodeId, false);
    newlyTrackedNodes.push(node);
  }

  if (newConfigs.length > 0) {
    const sourceDirectory = loaded.bundleConfig.sourceDirectory;
    if (!sourceDirectory) throw new Error(`Bundle '${slug}' has no source directory`);
    await persistBundleNodeConfigsAtomically({
      slug,
      sourceDirectory,
      configs: [...loaded.committedNodes, ...newConfigs],
      effectivelySensitiveByNodeId: evidenceDecisions,
      topologyChanged: false,
    });
  }

  return {
    schemaVersion: CLI_OPERATION_SCHEMA_VERSION,
    operation: 'bundle.track',
    slug,
    mode: options.mode,
    changed: newConfigs.length > 0,
    mutationBehavior: CLI_MUTATION_BEHAVIORS.trackBundleNodes,
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
