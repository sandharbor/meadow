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

import YAML from 'yaml';
import { FILE_TYPES, type FileType } from '../types/FileType.js';
import type {
  CollectionBundleNodeConfig,
  FileBundleNodeConfig,
  FolderBundleNodeConfig,
  BundleNodeConfig,
  BundleNodeConfigDocument,
  BundleNodeId,
  BundleNodeKind,
} from '../types/bundleNodeConfig.js';
import type { BundleConfig } from '../types/bundleConfig.js';
import type { IBundleNode } from '../types/IBundleNode.js';

export const BUNDLE_NODE_ID_PATTERN = /^[a-z0-9]{12}$/;
const BUNDLE_NODE_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const fileTypes = new Set<string>(FILE_TYPES);
const canonicalDocumentFields = new Set(['nodes']);
const canonicalNodeFields = new Set([
  'bundleNodeName',
  'sourceGraphSubdirectory',
  'bundleNodeKind',
  'fileType',
  'bundleNodeId',
  'listType',
  'outlinksDepth',
  'inlinksDepth',
  'memberBundleNodeIds',
]);

export class BundleNodeConfigValidationError extends Error {
  constructor(
    readonly filePath: string,
    readonly recordIndex: number | null,
    readonly field: string,
    invariant: string,
  ) {
    const record = recordIndex === null ? '' : ` record ${recordIndex + 1}`;
    super(`${filePath}:${record} field '${field}': ${invariant}`);
    this.name = 'BundleNodeConfigValidationError';
  }
}

function fail(filePath: string, recordIndex: number | null, field: string, invariant: string): never {
  throw new BundleNodeConfigValidationError(filePath, recordIndex, field, invariant);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateDepth(value: unknown, filePath: string, recordIndex: number | null, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    fail(filePath, recordIndex, field, 'must be a non-negative integer when present');
  }
  return value;
}

function hasOwn(value: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

/** Canonical source-root-relative folder locator. The empty string denotes the source root. */
export function normalizeFolderSourceGraphSubdirectory(value: string): string {
  if (value.includes('\\')) throw new Error("must use '/' separators");
  if (value.startsWith('/') || /^[A-Za-z]:\//.test(value)) throw new Error('must be relative');
  const segments: string[] = [];
  for (const segment of value.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') throw new Error("must not contain '..'");
    segments.push(segment);
  }
  return segments.join('/');
}

function parseCommonNodeFields(
  value: Record<string, unknown>,
  index: number,
  filePath: string,
): { bundleNodeName: string; bundleNodeId: BundleNodeId; listType: 'blacklist' | 'whitelist' } {
  if (typeof value.bundleNodeName !== 'string' || value.bundleNodeName.trim().length === 0) {
    fail(filePath, index, 'bundleNodeName', 'must be a non-empty string');
  }
  if (typeof value.bundleNodeId !== 'string' || !BUNDLE_NODE_ID_PATTERN.test(value.bundleNodeId)) {
    fail(filePath, index, 'bundleNodeId', 'must match [a-z0-9]{12}');
  }
  if (value.listType !== 'whitelist' && value.listType !== 'blacklist') {
    fail(filePath, index, 'listType', "must be exactly 'whitelist' or 'blacklist'");
  }
  return {
    bundleNodeName: value.bundleNodeName,
    bundleNodeId: value.bundleNodeId as BundleNodeId,
    listType: value.listType as 'blacklist' | 'whitelist',
  };
}

function parseNodeRecord(value: unknown, index: number, filePath: string): BundleNodeConfig {
  if (!isRecord(value)) fail(filePath, index, 'record', 'must be a mapping');
  for (const field of Object.keys(value)) {
    if (!canonicalNodeFields.has(field)) {
      fail(filePath, index, field, 'is not part of canonical node configuration');
    }
  }
  const common = parseCommonNodeFields(value, index, filePath);
  switch (value.bundleNodeKind) {
    case 'file': {
      if (value.sourceGraphSubdirectory !== undefined && typeof value.sourceGraphSubdirectory !== 'string') {
        fail(filePath, index, 'sourceGraphSubdirectory', 'must be a string when present');
      }
      if (typeof value.fileType !== 'string' || !fileTypes.has(value.fileType)) {
        fail(filePath, index, 'fileType', `must be one of: ${FILE_TYPES.join(', ')}`);
      }
      if (hasOwn(value, 'memberBundleNodeIds')) {
        fail(filePath, index, 'memberBundleNodeIds', 'is only valid for collection nodes');
      }
      return {
        ...common,
        ...(value.sourceGraphSubdirectory !== undefined && {
          sourceGraphSubdirectory: value.sourceGraphSubdirectory,
        }),
        bundleNodeKind: 'file',
        fileType: value.fileType as FileType,
        ...(value.outlinksDepth !== undefined && {
          outlinksDepth: validateDepth(value.outlinksDepth, filePath, index, 'outlinksDepth'),
        }),
        ...(value.inlinksDepth !== undefined && {
          inlinksDepth: validateDepth(value.inlinksDepth, filePath, index, 'inlinksDepth'),
        }),
      };
    }
    case 'folder': {
      if (typeof value.sourceGraphSubdirectory !== 'string') {
        fail(filePath, index, 'sourceGraphSubdirectory', 'is required and must be a string');
      }
      let normalized: string;
      try {
        normalized = normalizeFolderSourceGraphSubdirectory(value.sourceGraphSubdirectory);
      } catch (error) {
        fail(filePath, index, 'sourceGraphSubdirectory', error instanceof Error ? error.message : String(error));
      }
      if (normalized !== value.sourceGraphSubdirectory) {
        fail(filePath, index, 'sourceGraphSubdirectory', `must be normalized as '${normalized}'`);
      }
      if (normalized !== '' && common.bundleNodeName !== normalized.slice(normalized.lastIndexOf('/') + 1)) {
        fail(filePath, index, 'bundleNodeName', 'must equal the basename of sourceGraphSubdirectory');
      }
      if (hasOwn(value, 'fileType')) fail(filePath, index, 'fileType', 'is not valid for folder nodes');
      if (hasOwn(value, 'memberBundleNodeIds')) {
        fail(filePath, index, 'memberBundleNodeIds', 'is only valid for collection nodes');
      }
      return {
        ...common,
        sourceGraphSubdirectory: normalized,
        bundleNodeKind: 'folder',
        ...(value.outlinksDepth !== undefined && {
          outlinksDepth: validateDepth(value.outlinksDepth, filePath, index, 'outlinksDepth'),
        }),
        ...(value.inlinksDepth !== undefined && {
          inlinksDepth: validateDepth(value.inlinksDepth, filePath, index, 'inlinksDepth'),
        }),
      };
    }
    case 'collection': {
      if (hasOwn(value, 'sourceGraphSubdirectory')) {
        fail(filePath, index, 'sourceGraphSubdirectory', 'is not valid for collection nodes');
      }
      if (hasOwn(value, 'fileType')) fail(filePath, index, 'fileType', 'is not valid for collection nodes');
      if (hasOwn(value, 'outlinksDepth') || hasOwn(value, 'inlinksDepth')) {
        fail(filePath, index, 'outlinksDepth', 'depth overrides are not valid for collection nodes');
      }
      if (common.listType !== 'whitelist') {
        fail(filePath, index, 'listType', 'collection nodes must be whitelisted');
      }
      if (!Array.isArray(value.memberBundleNodeIds) || value.memberBundleNodeIds.length < 2) {
        fail(filePath, index, 'memberBundleNodeIds', 'must contain at least two folder-node IDs');
      }
      const memberBundleNodeIds = value.memberBundleNodeIds.map((member, memberIndex) => {
        if (typeof member !== 'string' || !BUNDLE_NODE_ID_PATTERN.test(member)) {
          fail(filePath, index, 'memberBundleNodeIds', `member ${memberIndex + 1} must match [a-z0-9]{12}`);
        }
        return member as BundleNodeId;
      });
      if (new Set(memberBundleNodeIds).size !== memberBundleNodeIds.length) {
        fail(filePath, index, 'memberBundleNodeIds', 'must contain unique IDs');
      }
      return {
        ...common,
        bundleNodeKind: 'collection',
        memberBundleNodeIds,
      };
    }
    default:
      fail(filePath, index, 'bundleNodeKind', "must be exactly 'file', 'folder', or 'collection'");
  }
}

type BundleNodeLocatorInput =
  | Pick<FileBundleNodeConfig, 'bundleNodeName' | 'sourceGraphSubdirectory' | 'bundleNodeKind' | 'fileType'>
  | Pick<FolderBundleNodeConfig, 'sourceGraphSubdirectory' | 'bundleNodeKind'>
  | Pick<CollectionBundleNodeConfig, 'bundleNodeKind'>;

/** Logical configured-node identity. The file format is intentionally unchanged from Phase 1. */
export function bundleNodeLocatorKey(node: BundleNodeLocatorInput): string {
  if (node.bundleNodeKind === 'file') {
    return [node.bundleNodeName, node.sourceGraphSubdirectory ?? '', node.bundleNodeKind, node.fileType].join('\0');
  }
  if (node.bundleNodeKind === 'folder') return `folder:${node.sourceGraphSubdirectory}`;
  return 'collection';
}

export function parseBundleNodeConfig(
  content: string,
  filePath = 'bundle_node_config.yaml',
): BundleNodeConfig[] {
  let parsed: unknown;
  try {
    parsed = YAML.parse(content);
  } catch (error) {
    fail(filePath, null, 'yaml', `must be valid YAML (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!isRecord(parsed)) fail(filePath, null, 'document', 'must be a mapping with a nodes array');
  for (const field of Object.keys(parsed)) {
    if (!canonicalDocumentFields.has(field)) {
      fail(filePath, null, field, 'is not part of the canonical node configuration document');
    }
  }
  if (!Array.isArray(parsed.nodes)) fail(filePath, null, 'nodes', 'must be an array');

  const nodes = parsed.nodes.map((value, index) => parseNodeRecord(value, index, filePath));

  validateNodeSet(nodes, filePath);
  return nodes;
}

function validateNodeSet(nodes: BundleNodeConfig[], filePath: string): void {
  const ids = new Map<string, number>();
  const locators = new Map<string, number>();
  nodes.forEach((node, index) => {
    const priorId = ids.get(node.bundleNodeId);
    if (priorId !== undefined) {
      fail(filePath, index, 'bundleNodeId', `duplicates record ${priorId + 1}`);
    }
    ids.set(node.bundleNodeId, index);

    const locator = bundleNodeLocatorKey(node);
    const priorLocator = locators.get(locator);
    if (priorLocator !== undefined) {
      fail(filePath, index, 'source locator', `duplicates record ${priorLocator + 1}`);
    }
    locators.set(locator, index);
  });

  const collections = nodes.filter((node): node is CollectionBundleNodeConfig => node.bundleNodeKind === 'collection');
  if (collections.length > 1) fail(filePath, nodes.indexOf(collections[1]), 'bundleNodeKind', 'only one collection is permitted');
  for (const collection of collections) {
    const collectionIndex = nodes.indexOf(collection);
    for (const memberId of collection.memberBundleNodeIds) {
      const member = nodes.find(node => node.bundleNodeId === memberId);
      if (!member) fail(filePath, collectionIndex, 'memberBundleNodeIds', `does not resolve (${memberId})`);
      if (member.bundleNodeKind !== 'folder' || member.listType !== 'whitelist') {
        fail(filePath, collectionIndex, 'memberBundleNodeIds', `must resolve to a whitelisted folder (${memberId})`);
      }
    }
  }
}

export function stringifyBundleNodeConfig(nodes: BundleNodeConfig[]): string {
  const canonicalNodes = nodes.map((node, index) => parseNodeRecord(node, index, 'bundle_node_config.yaml'));
  validateNodeSet(canonicalNodes, 'bundle_node_config.yaml');
  const sorted = canonicalNodes.sort((a, b) =>
    a.bundleNodeName.localeCompare(b.bundleNodeName)
    || (a.sourceGraphSubdirectory ?? '').localeCompare(b.sourceGraphSubdirectory ?? '')
    || a.bundleNodeKind.localeCompare(b.bundleNodeKind)
    || (a.fileType ?? '').localeCompare(b.fileType ?? '')
    || a.bundleNodeId.localeCompare(b.bundleNodeId));

  const document: BundleNodeConfigDocument = {
    nodes: sorted.map(node => {
      const common = {
        bundleNodeName: node.bundleNodeName,
        ...(node.bundleNodeKind !== 'collection' && {
          sourceGraphSubdirectory: node.sourceGraphSubdirectory,
        }),
        bundleNodeKind: node.bundleNodeKind,
        ...(node.bundleNodeKind === 'file' && { fileType: node.fileType }),
        bundleNodeId: node.bundleNodeId,
        listType: node.listType,
        ...(node.bundleNodeKind !== 'collection' && node.outlinksDepth !== undefined && {
          outlinksDepth: node.outlinksDepth,
        }),
        ...(node.bundleNodeKind !== 'collection' && node.inlinksDepth !== undefined && {
          inlinksDepth: node.inlinksDepth,
        }),
        ...(node.bundleNodeKind === 'collection' && { memberBundleNodeIds: node.memberBundleNodeIds }),
      };
      return common as BundleNodeConfig;
    }),
  };
  return YAML.stringify(document);
}

export function generateBundleNodeId(
  existingIds: Iterable<string>,
  random = Math.random,
): BundleNodeId {
  const existing = new Set(existingIds);
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    let candidate = '';
    for (let index = 0; index < 12; index += 1) {
      candidate += BUNDLE_NODE_ID_ALPHABET[Math.floor(random() * BUNDLE_NODE_ID_ALPHABET.length)];
    }
    if (!existing.has(candidate)) return candidate as BundleNodeId;
  }
  throw new Error('Unable to generate a unique bundleNodeId after 10000 attempts');
}

export function validateCanonicalBundleConfiguration(options: {
  committedNodes: BundleNodeConfig[];
  committedPath?: string;
  draftNodes?: BundleNodeConfig[];
  draftPath?: string;
  bundleConfig: BundleConfig;
  bundleConfigPath?: string;
}): void {
  const committedPath = options.committedPath ?? 'bundle_node_config.yaml';
  const draftPath = options.draftPath ?? 'draft_bundle_node_config.yaml';
  const bundleConfigPath = options.bundleConfigPath ?? 'bundle_config.yaml';
  validateNodeSet(options.committedNodes, committedPath);
  validateNodeSet(options.draftNodes ?? [], draftPath);

  const committedByLocator = new Map(options.committedNodes.map(node => [bundleNodeLocatorKey(node), node]));
  const locatorById = new Map(options.committedNodes.map(node => [node.bundleNodeId, bundleNodeLocatorKey(node)]));
  for (const [index, node] of (options.draftNodes ?? []).entries()) {
    const locator = bundleNodeLocatorKey(node);
    const committed = committedByLocator.get(locator);
    if (committed && committed.bundleNodeId !== node.bundleNodeId) {
      fail(draftPath, index, 'bundleNodeId', `must equal committed ID ${committed.bundleNodeId} for the same logical node`);
    }
    const priorLocator = locatorById.get(node.bundleNodeId);
    if (priorLocator !== undefined && priorLocator !== locator) {
      fail(draftPath, index, 'bundleNodeId', 'is already assigned to a different committed node');
    }
    locatorById.set(node.bundleNodeId, locator);
  }

  validateDepth(options.bundleConfig.defaultOutlinksDepth, bundleConfigPath, null, 'defaultOutlinksDepth');
  validateDepth(options.bundleConfig.defaultInlinksDepth, bundleConfigPath, null, 'defaultInlinksDepth');
  validateBundleNodeStrategy(options.committedNodes, options.bundleConfig, bundleConfigPath);
  if (options.draftNodes) {
    validateBundleNodeStrategy(options.draftNodes, options.bundleConfig, bundleConfigPath);
  }
}

function nodeSourceDirectory(node: BundleNodeConfig): string | undefined {
  return node.bundleNodeKind === 'collection' ? undefined : (node.sourceGraphSubdirectory ?? '');
}

function nearestBlacklistedAncestor(node: BundleNodeConfig, nodes: BundleNodeConfig[]): FolderBundleNodeConfig | undefined {
  const locator = nodeSourceDirectory(node);
  if (locator === undefined) return undefined;
  return nodes
    .filter((candidate): candidate is FolderBundleNodeConfig =>
      candidate.bundleNodeKind === 'folder'
      && candidate.listType === 'blacklist'
      && (candidate.sourceGraphSubdirectory === ''
        || locator === candidate.sourceGraphSubdirectory
        || locator.startsWith(`${candidate.sourceGraphSubdirectory}/`)))
    .sort((a, b) => b.sourceGraphSubdirectory.length - a.sourceGraphSubdirectory.length)[0];
}

function validateBundleNodeStrategy(nodes: BundleNodeConfig[], bundleConfig: BundleConfig, bundleConfigPath: string): void {
  const roles = resolveBundleNodeRoles(nodes, bundleConfig, bundleConfigPath);
  const collection = nodes.find((node): node is CollectionBundleNodeConfig => node.bundleNodeKind === 'collection');
  if (collection && roles.entryNode.bundleNodeId !== collection.bundleNodeId) {
    fail(bundleConfigPath, null, 'entryBundleNodeId', 'the bundle collection must be the entry node');
  }
  if (roles.entryNode.bundleNodeKind === 'collection' && roles.entryNode !== collection) {
    fail(bundleConfigPath, null, 'entryBundleNodeId', 'must reference the bundle collection');
  }

  const sourceRootName = bundleConfig.sourceDirectory?.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  for (const [index, node] of nodes.entries()) {
    if (node.bundleNodeKind === 'folder' && node.sourceGraphSubdirectory === ''
      && sourceRootName && node.bundleNodeName !== sourceRootName) {
      fail(bundleConfigPath, index, 'bundleNodeName', `source-root folder must be named '${sourceRootName}'`);
    }
  }

  const strongNodes: BundleNodeConfig[] = [roles.entryNode, roles.defaultTraversalNode];
  if (collection) {
    strongNodes.push(...collection.memberBundleNodeIds.map(memberId =>
      nodes.find(node => node.bundleNodeId === memberId)!).filter(Boolean));
  }
  for (const strongNode of strongNodes) {
    const boundary = nearestBlacklistedAncestor(strongNode, nodes);
    if (boundary) {
      fail(bundleConfigPath, null, 'strong roles', `node ${strongNode.bundleNodeId} lies below blacklisted folder ${boundary.bundleNodeId}`);
    }
  }
}

export function resolveBundleNodeRoles(
  nodes: BundleNodeConfig[],
  bundleConfig: BundleConfig,
  bundleConfigPath = 'bundle_config.yaml',
): { entryNode: BundleNodeConfig; defaultTraversalNode: BundleNodeConfig } {
  const byId = new Map(nodes.map(node => [node.bundleNodeId, node]));
  const resolve = (field: 'entryBundleNodeId' | 'defaultTraversalBundleNodeId'): BundleNodeConfig => {
    const id = bundleConfig[field];
    if (typeof id !== 'string' || !BUNDLE_NODE_ID_PATTERN.test(id)) {
      fail(bundleConfigPath, null, field, 'must match [a-z0-9]{12}');
    }
    const node = byId.get(id as BundleNodeId);
    if (!node) fail(bundleConfigPath, null, field, `does not resolve to a configured node (${id})`);
    if (node.listType !== 'whitelist') {
      fail(bundleConfigPath, null, field, `must reference a whitelisted node (${id})`);
    }
    return node;
  };
  return {
    entryNode: resolve('entryBundleNodeId'),
    defaultTraversalNode: resolve('defaultTraversalBundleNodeId'),
  };
}

export function nodeConfigMatchesNode(
  config: BundleNodeConfig,
  bundleNodeName: string,
  sourceGraphSubdirectory: string | undefined,
  fileType: FileType | undefined,
  bundleNodeKind: BundleNodeKind = 'file',
  bundleNodeId?: BundleNodeId,
): boolean {
  if (config.bundleNodeKind !== bundleNodeKind || config.bundleNodeName !== bundleNodeName) return false;
  if (config.bundleNodeKind === 'collection') return bundleNodeId === undefined || config.bundleNodeId === bundleNodeId;
  if ((config.sourceGraphSubdirectory ?? '') !== (sourceGraphSubdirectory ?? '')) return false;
  return config.bundleNodeKind === 'folder' || config.fileType === fileType;
}

export function applySensitiveFromApiData(nodes: IBundleNode[]): IBundleNode[] {
  for (const node of nodes) {
    if (node.data && typeof node.data.is_sensitive === 'boolean') {
      node.sensitive = node.data.is_sensitive;
    }
  }
  return nodes;
}

/** Apply persisted configuration; record presence is the sole tracking signal. */
export function applyNodeConfigsToNodes(
  nodes: IBundleNode[],
  configs: BundleNodeConfig[],
): IBundleNode[] {
  for (const node of nodes) {
    node.tracked = false;
    node.blacklisted = false;
    delete node.conf;
    delete node.bundleNodeId;
  }
  for (const config of configs) {
    const node = nodes.find(candidate => nodeConfigMatchesNode(
      config,
      candidate.bundleNodeName,
      candidate.sourceGraphSubdirectory,
      candidate.fileType,
      candidate.bundleNodeKind,
      candidate.bundleNodeId,
    ));
    if (!node) continue;
    node.conf = config;
    node.bundleNodeId = config.bundleNodeId;
    node.tracked = true;
    node.blacklisted = config.listType === 'blacklist';
  }
  return nodes;
}

/** Build persisted records only for nodes currently registered by curation. */
export function buildNodeConfigs(nodes: IBundleNode[]): BundleNodeConfig[] {
  return nodes
    .filter(node => node.tracked === true && node.conf !== undefined)
    .map(node => {
      if (node.bundleNodeKind === 'collection') {
        return {
          bundleNodeName: node.bundleNodeName,
          bundleNodeKind: 'collection',
          bundleNodeId: node.conf!.bundleNodeId,
          listType: 'whitelist',
          memberBundleNodeIds: node.memberBundleNodeIds,
        } satisfies CollectionBundleNodeConfig;
      }
      const common = {
        bundleNodeName: node.bundleNodeName,
        sourceGraphSubdirectory: node.sourceGraphSubdirectory,
        bundleNodeId: node.conf!.bundleNodeId,
        listType: node.blacklisted ? 'blacklist' as const : 'whitelist' as const,
        ...(node.conf!.outlinksDepth !== undefined && { outlinksDepth: node.conf!.outlinksDepth }),
        ...(node.conf!.inlinksDepth !== undefined && { inlinksDepth: node.conf!.inlinksDepth }),
      };
      if (node.bundleNodeKind === 'folder') return { ...common, bundleNodeKind: 'folder' } satisfies FolderBundleNodeConfig;
      return { ...common, bundleNodeKind: 'file', fileType: node.fileType } satisfies FileBundleNodeConfig;
    });
}

/** Configured whitelist nodes that are no longer reachable in the working graph. */
export function getOrphanNodeConfigs(
  configs: BundleNodeConfig[],
  nodes: IBundleNode[],
): BundleNodeConfig[] {
  return configs.filter(config => config.listType !== 'blacklist' && !nodes.some(node =>
    nodeConfigMatchesNode(
      config,
      node.bundleNodeName,
      node.sourceGraphSubdirectory,
      node.fileType,
      node.bundleNodeKind,
      node.bundleNodeId,
    )));
}
