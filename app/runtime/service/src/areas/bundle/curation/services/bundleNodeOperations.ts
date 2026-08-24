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
import type {
  BundleNodeConfig,
} from '../../../../../../../shared_code/types/bundleNodeConfig.js';
import {
  CLI_OPERATION_SCHEMA_VERSION,
  type BundleNodeDetails,
  type BundleNodeLocator,
  type BundleNodeMutationOperation,
  type BundleNodeReference,
  type DescribeBundleNodeCliResult,
  type FindBundleNodeCliResult,
  type MutateBundleNodeCliResult,
} from '../../../../../../../shared_code/types/cliOperations.js';
import { Graph } from '../../../../../../../shared_code/types/graph.js';
import type { IBundleNode } from '../../../../../../../shared_code/types/IBundleNode.js';
import {
  applyNodeConfigsToNodes,
  applySensitiveFromApiData,
  generateBundleNodeId,
  nodeConfigMatchesNode,
  parseBundleNodeConfig,
} from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { canonicalPageFilename, sourceFileCandidateFilenames } from '../../../../../../../shared_code/utils/fileTypeUtils.js';
import {
  getBundleConfigPath,
  getBundlesDirectory,
} from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { FrontmatterUtils } from '../../../../shared/utils/frontmatterUtils.js';
import { loadCustomFiltersForBundle } from '../routes/customFiltersRoutes.js';
import { selectEffectivelySensitiveNodeKeys } from './graphFilterService.js';
import { persistBundleNodeConfigsAtomically } from './bundleTrackingOperations.js';
import { loadWorkingGraph, type LoadedWorkingGraph } from './workingGraphService.js';

export type BundleNodeMutation =
  | { operation: Exclude<BundleNodeMutationOperation, 'set-depths'> }
  | { operation: 'set-depths'; outlinksDepth?: number | null; inlinksDepth?: number | null };

export class BundleNodeOperationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BundleNodeOperationError';
  }
}

interface NodeContext {
  loaded: LoadedWorkingGraph;
  graph: Graph;
  node: IBundleNode;
  effectivelySensitive: Set<string>;
}

function normalizedPath(value: string): string {
  if (value.includes('\\')) {
    throw new BundleNodeOperationError("Node paths must use '/' separators", 400);
  }
  const segments = value.replace(/^\.\//, '').replace(/^\/+|\/+$/g, '').split('/');
  if (segments.some(segment => segment === '..')) {
    throw new BundleNodeOperationError("Node paths must not contain '..'", 400);
  }
  return segments.filter(segment => segment !== '' && segment !== '.').join('/');
}

function sourcePathFor(node: IBundleNode): string | null {
  if (node.bundleNodeKind === 'collection') return null;
  if (node.bundleNodeKind === 'folder') return normalizedPath(node.sourceGraphSubdirectory);
  return normalizedPath(path.posix.join(
    node.sourceGraphSubdirectory,
    canonicalPageFilename(node.bundleNodeName, node.fileType),
  ));
}

function resolveNode(nodes: IBundleNode[], locator: BundleNodeLocator): IBundleNode {
  if (locator.kind === 'id') {
    const match = nodes.find(node => node.bundleNodeId === locator.value);
    if (match) return match;
    throw new BundleNodeOperationError(
      `No working-graph node has bundleNodeId '${locator.value}'. Use --path if the node is not currently configured.`,
      404,
      { missingBundleNodeId: locator.value },
    );
  }

  const requested = normalizedPath(locator.value);
  const matches = nodes.filter(node => (
    node.bundleNodeKey === locator.value
    || normalizedPath(node.bundleNodeKey) === requested
    || sourcePathFor(node) === requested
  ));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new BundleNodeOperationError(
      `Node path '${locator.value}' is ambiguous. Use an exact bundleNodeKey or --id.`,
      409,
      { matchingNodeKeys: matches.map(node => node.bundleNodeKey).sort() },
    );
  }
  throw new BundleNodeOperationError(
    `No working-graph node matches path '${locator.value}'. Run 'meadow bundle nodes <slug> --scope all'.`,
    404,
    { missingPath: locator.value },
  );
}

async function loadContext(slug: string, locator: BundleNodeLocator): Promise<NodeContext> {
  const loaded = await loadWorkingGraph({ bundleSlug: slug });
  if (loaded.draftNodes) {
    throw new BundleNodeOperationError(
      'This bundle has pending curation changes. Save or undo them before using a CLI node operation.',
      409,
    );
  }
  applySensitiveFromApiData(loaded.nodes);
  applyNodeConfigsToNodes(loaded.nodes, loaded.committedNodes);
  const graph = new Graph();
  loaded.nodes.forEach(node => graph.addNode(node));
  loaded.edges.forEach(edge => graph.addEdge(edge));
  graph.setLinkSourceData(loaded.allInlinkSources, loaded.allOutlinkTargets);
  return {
    loaded,
    graph,
    node: resolveNode(loaded.nodes, locator),
    effectivelySensitive: selectEffectivelySensitiveNodeKeys(
      graph,
      loadCustomFiltersForBundle(slug),
    ),
  };
}

function reference(node: IBundleNode): BundleNodeReference {
  return {
    bundleNodeKey: node.bundleNodeKey,
    ...(node.bundleNodeId && { bundleNodeId: node.bundleNodeId }),
    bundleNodeName: node.bundleNodeName,
    bundleNodeKind: node.bundleNodeKind,
    depth: node.depth,
  };
}

function details(node: IBundleNode): BundleNodeDetails {
  return {
    ...reference(node),
    ...(node.sourceGraphSubdirectory !== undefined && {
      sourceGraphSubdirectory: node.sourceGraphSubdirectory,
    }),
    ...(node.fileType && { fileType: node.fileType }),
    tracked: node.tracked === true,
    blacklisted: node.blacklisted === true,
    sensitive: node.sensitive === true,
    isFrontierNode: node.isFrontierNode === true,
    remainingOutlinksDepth: node.remaining_depth,
    remainingInlinksDepth: node.remaining_inlinks_depth ?? 0,
    ...(node.conf && { config: node.conf }),
  };
}

function descendants(graph: Graph, start: IBundleNode, deeperOnly: boolean): BundleNodeReference[] {
  const adjacency = new Map<string, Array<{ key: string; structural: boolean }>>();
  for (const edge of graph.getAllEdges()) {
    const outgoing = adjacency.get(edge.source) ?? [];
    outgoing.push({ key: edge.target, structural: edge.bundleEdgeKind !== 'semanticLink' });
    adjacency.set(edge.source, outgoing);
    if (edge.isBidirectional) {
      const reverse = adjacency.get(edge.target) ?? [];
      reverse.push({ key: edge.source, structural: edge.bundleEdgeKind !== 'semanticLink' });
      adjacency.set(edge.target, reverse);
    }
  }
  const visited = new Set<string>();
  const result: BundleNodeReference[] = [];
  const stack: Array<{ key: string; depth: number }> = [{ key: start.bundleNodeKey, depth: start.depth }];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current.key)) continue;
    visited.add(current.key);
    const node = graph.getNode(current.key);
    if (!node) continue;
    result.push(reference(node));
    const next = adjacency.get(current.key) ?? [];
    for (let index = next.length - 1; index >= 0; index--) {
      const candidate = graph.getNode(next[index].key);
      if (!candidate || visited.has(candidate.bundleNodeKey)) continue;
      if (!deeperOnly || next[index].structural || candidate.depth > current.depth) {
        stack.push({ key: candidate.bundleNodeKey, depth: candidate.depth });
      }
    }
  }
  return result;
}

function describeRelated(context: NodeContext): DescribeBundleNodeCliResult['related'] {
  const pathToHere = (context.node.path ?? [])
    .map(key => context.graph.getNode(key))
    .filter((node): node is IBundleNode => Boolean(node))
    .map(reference);
  const children = context.graph.getOutgoingEdges(context.node.bundleNodeKey)
    .filter(edge => {
      const child = context.graph.getNode(edge.target);
      return Boolean(child) && (edge.bundleEdgeKind !== 'semanticLink' || child!.depth === context.node.depth + 1);
    })
    .map(edge => reference(context.graph.getNode(edge.target)!));
  return {
    pathToHere,
    children,
    allPathsFromHere: descendants(context.graph, context.node, false),
    deeperPathsFromHere: descendants(context.graph, context.node, true),
  };
}

export async function describeBundleNode(
  slug: string,
  locator: BundleNodeLocator,
): Promise<DescribeBundleNodeCliResult> {
  const context = await loadContext(slug, locator);
  return {
    schemaVersion: CLI_OPERATION_SCHEMA_VERSION,
    operation: 'bundle.node.describe',
    slug,
    locator,
    node: details(context.node),
    related: describeRelated(context),
  };
}

function protectedNodeIds(context: NodeContext): Set<string> {
  const protectedIds = new Set<string>();
  if (context.loaded.bundleConfig.entryBundleNodeId) {
    protectedIds.add(context.loaded.bundleConfig.entryBundleNodeId);
  }
  if (context.loaded.bundleConfig.defaultTraversalBundleNodeId) {
    protectedIds.add(context.loaded.bundleConfig.defaultTraversalBundleNodeId);
  }
  for (const config of context.loaded.committedNodes) {
    if (config.bundleNodeKind !== 'collection') continue;
    protectedIds.add(config.bundleNodeId);
    config.memberBundleNodeIds.forEach(id => protectedIds.add(id));
  }
  return protectedIds;
}

function ensureCanUntrack(context: NodeContext): void {
  if (context.node.bundleNodeKind === 'collection') {
    throw new BundleNodeOperationError('The bundle home cannot be untracked', 409);
  }
  if (context.node.bundleNodeId && protectedNodeIds(context).has(context.node.bundleNodeId)) {
    throw new BundleNodeOperationError('This node has a required bundle role and cannot be untracked', 409);
  }
}

function structuralDescendants(graph: Graph, startKey: string): IBundleNode[] {
  const result: IBundleNode[] = [];
  const pending = [startKey];
  const seen = new Set(pending);
  while (pending.length > 0) {
    const key = pending.shift()!;
    for (const edge of graph.getOutgoingEdges(key)) {
      if (edge.bundleEdgeKind === 'semanticLink' || seen.has(edge.target)) continue;
      seen.add(edge.target);
      const child = graph.getNode(edge.target);
      if (child) {
        result.push(child);
        pending.push(child.bundleNodeKey);
      }
    }
  }
  return result;
}

function ensureCanBlacklist(context: NodeContext): void {
  if (context.node.bundleNodeKind === 'collection') {
    throw new BundleNodeOperationError('The bundle home cannot be blacklisted', 409);
  }
  const protectedIds = protectedNodeIds(context);
  if (context.node.bundleNodeId && protectedIds.has(context.node.bundleNodeId)) {
    throw new BundleNodeOperationError('This node has a required bundle role and cannot be blacklisted', 409);
  }
  if (context.node.bundleNodeKind === 'folder' && structuralDescendants(
    context.graph,
    context.node.bundleNodeKey,
  ).some(node => node.bundleNodeId && protectedIds.has(node.bundleNodeId))) {
    throw new BundleNodeOperationError('This folder contains a required bundle node and cannot be blacklisted', 409);
  }
}

type TraversalBundleNodeConfig = Exclude<BundleNodeConfig, { bundleNodeKind: 'collection' }>;

function newConfigForNode(context: NodeContext): TraversalBundleNodeConfig {
  const node = context.node;
  if (node.bundleNodeKind === 'collection') {
    throw new BundleNodeOperationError('The bundle home cannot be configured by this operation', 409);
  }
  if (node.isFrontierNode) throw new BundleNodeOperationError('Frontier nodes cannot be tracked', 409);
  if (node.effectiveBlacklistingBundleNodeId) {
    throw new BundleNodeOperationError('Nodes below a blacklisted folder cannot be tracked', 409);
  }
  if (context.effectivelySensitive.has(node.bundleNodeKey)) {
    throw new BundleNodeOperationError('Refusing to track an effectively sensitive node', 409);
  }
  const bundleNodeId = generateBundleNodeId(
    context.loaded.committedNodes.map(config => config.bundleNodeId),
  );
  const common = {
    bundleNodeName: node.bundleNodeName,
    bundleNodeId,
    listType: 'whitelist' as const,
  };
  return node.bundleNodeKind === 'folder'
    ? {
        ...common,
        bundleNodeKind: 'folder',
        sourceGraphSubdirectory: node.sourceGraphSubdirectory,
      }
    : {
        ...common,
        bundleNodeKind: 'file',
        sourceGraphSubdirectory: node.sourceGraphSubdirectory,
        fileType: node.fileType,
      };
}

async function persist(slug: string, context: NodeContext, configs: BundleNodeConfig[], operation: string): Promise<void> {
  const sourceDirectory = context.loaded.bundleConfig.sourceDirectory;
  if (!sourceDirectory) throw new BundleNodeOperationError(`Bundle '${slug}' has no source directory`, 409);
  await persistBundleNodeConfigsAtomically({
    slug,
    sourceDirectory,
    configs,
    commitMessage: `${operation} bundle node for ${slug}`,
  });
}

function sourceMarkdownPath(context: NodeContext): string {
  const node = context.node;
  if (node.bundleNodeKind !== 'file' || node.fileType !== 'md') {
    throw new BundleNodeOperationError('Only Markdown file nodes can be marked sensitive', 409);
  }
  const sourceDirectory = context.loaded.bundleConfig.sourceDirectory;
  if (!sourceDirectory) throw new BundleNodeOperationError('Bundle has no source directory', 409);
  const candidate = sourceFileCandidateFilenames(node.bundleNodeName, node.fileType)
    .map(filename => path.join(sourceDirectory, node.sourceGraphSubdirectory, filename))
    .find(filename => fs.existsSync(filename));
  if (!candidate) throw new BundleNodeOperationError('The node source file no longer exists', 404);
  return candidate;
}

export async function mutateBundleNode(
  slug: string,
  locator: BundleNodeLocator,
  mutation: BundleNodeMutation,
): Promise<MutateBundleNodeCliResult> {
  let context = await loadContext(slug, locator);
  let configs = [...context.loaded.committedNodes];
  let changed = false;
  let resultLocator = locator;

  if (mutation.operation === 'mark-sensitive' || mutation.operation === 'mark-not-sensitive') {
    const sensitive = mutation.operation === 'mark-sensitive';
    changed = context.node.sensitive !== sensitive;
    if (changed) FrontmatterUtils.updateSensitiveProperty(sourceMarkdownPath(context), sensitive);
  } else if (mutation.operation === 'track') {
    if (!context.node.tracked) {
      const config = newConfigForNode(context);
      configs.push(config);
      resultLocator = { kind: 'id', value: config.bundleNodeId };
      changed = true;
    }
  } else if (mutation.operation === 'untrack') {
    ensureCanUntrack(context);
    if (context.node.tracked && context.node.bundleNodeId) {
      configs = configs.filter(config => config.bundleNodeId !== context.node.bundleNodeId);
      changed = true;
    }
  } else if (mutation.operation === 'blacklist') {
    ensureCanBlacklist(context);
    if (!context.node.tracked || !context.node.conf) {
      throw new BundleNodeOperationError('Track the node before blacklisting it', 409);
    }
    if (!context.node.blacklisted) {
      context.node.conf.listType = 'blacklist';
      changed = true;
    }
  } else if (mutation.operation === 'unblacklist') {
    if (context.node.blacklisted && context.node.conf) {
      context.node.conf.listType = 'whitelist';
      changed = true;
    }
  } else if (mutation.operation === 'set-depths') {
    if (context.node.bundleNodeKind === 'collection') {
      throw new BundleNodeOperationError('Depth overrides are not valid for collection nodes', 409);
    }
    if (context.node.effectiveBlacklistingBundleNodeId) {
      throw new BundleNodeOperationError('Depth overrides are not valid below a blacklisted folder', 409);
    }
    let config = context.node.conf;
    if (!config) {
      config = newConfigForNode(context);
      configs.push(config);
      resultLocator = { kind: 'id', value: config.bundleNodeId };
      changed = true;
    }
    for (const [field, value] of [
      ['outlinksDepth', mutation.outlinksDepth],
      ['inlinksDepth', mutation.inlinksDepth],
    ] as const) {
      if (value === undefined) continue;
      if (value === null) {
        if (config[field] !== undefined) changed = true;
        delete config[field];
      } else {
        if (config[field] !== value) changed = true;
        config[field] = value;
      }
    }
  }

  if (changed && mutation.operation !== 'mark-sensitive' && mutation.operation !== 'mark-not-sensitive') {
    await persist(slug, context, configs, mutation.operation);
  }
  const fallbackLocator: BundleNodeLocator = {
    kind: 'path',
    value: sourcePathFor(context.node) ?? context.node.bundleNodeKey,
  };
  context = await loadContext(slug, mutation.operation === 'untrack' ? fallbackLocator : resultLocator);
  return {
    schemaVersion: CLI_OPERATION_SCHEMA_VERSION,
    operation: `bundle.node.${mutation.operation}`,
    slug,
    locator,
    changed,
    node: details(context.node),
    nextActions: [{
      operation: 'inspect-node',
      args: [
        'bundle', 'node', 'describe', slug,
        ...(context.node.bundleNodeId
          ? ['--id', context.node.bundleNodeId]
          : ['--path', sourcePathFor(context.node) ?? context.node.bundleNodeKey]),
      ],
      displayCommand: context.node.bundleNodeId
        ? `meadow bundle node describe ${slug} --id ${context.node.bundleNodeId}`
        : `meadow bundle node describe ${slug} --path ${JSON.stringify(sourcePathFor(context.node) ?? context.node.bundleNodeKey)}`,
    }],
  };
}

export async function findBundleNode(
  slug: string,
  locator: BundleNodeLocator,
): Promise<FindBundleNodeCliResult> {
  const context = await loadContext(slug, locator);
  const node = context.node;
  const bundles: FindBundleNodeCliResult['bundles'] = [];
  for (const entry of fs.readdirSync(getBundlesDirectory(), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    try {
      const config = YAML.parse(fs.readFileSync(getBundleConfigPath(entry.name), 'utf8')) as BundleConfig;
      if (config.sourceDirectory !== context.loaded.bundleConfig.sourceDirectory) continue;
      const configPath = getBundleConfigPath(entry.name, 'bundle_node_config.yaml');
      const match = parseBundleNodeConfig(fs.readFileSync(configPath, 'utf8'), configPath)
        .find(candidate => nodeConfigMatchesNode(
          candidate,
          node.bundleNodeName,
          node.sourceGraphSubdirectory,
          node.fileType,
          node.bundleNodeKind,
          node.bundleNodeId,
        ));
      if (!match) continue;
      bundles.push({
        slug: entry.name,
        archived: Boolean(config.archivedAt),
        bundleNodeId: match.bundleNodeId,
        tracked: true,
        blacklisted: match.listType === 'blacklist',
      });
    } catch {
      // Ignore incomplete staging directories and invalid bundles here; their
      // own commands surface the validation error directly.
    }
  }
  bundles.sort((left, right) => left.slug.localeCompare(right.slug));
  return {
    schemaVersion: CLI_OPERATION_SCHEMA_VERSION,
    operation: 'bundle.node.find-in-bundles',
    slug,
    locator,
    node: reference(node),
    bundles,
  };
}
