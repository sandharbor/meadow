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
  CollectionSiteNodeConfig,
  FileSiteNodeConfig,
  FolderSiteNodeConfig,
  SiteNodeConfig,
  SiteNodeConfigDocument,
  SiteNodeId,
  SiteNodeKind,
} from '../types/siteNodeConfig.js';
import type { SiteConfig } from '../types/siteConfig.js';
import type { ISiteNode } from '../types/ISiteNode.js';

export const SITE_NODE_ID_PATTERN = /^[a-z0-9]{12}$/;
const SITE_NODE_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const fileTypes = new Set<string>(FILE_TYPES);
const canonicalDocumentFields = new Set(['nodes']);
const canonicalNodeFields = new Set([
  'siteNodeName',
  'sourceGraphSubdirectory',
  'siteNodeKind',
  'fileType',
  'siteNodeId',
  'listType',
  'outlinksDepth',
  'inlinksDepth',
  'memberSiteNodeIds',
]);

export class SiteNodeConfigValidationError extends Error {
  constructor(
    readonly filePath: string,
    readonly recordIndex: number | null,
    readonly field: string,
    invariant: string,
  ) {
    const record = recordIndex === null ? '' : ` record ${recordIndex + 1}`;
    super(`${filePath}:${record} field '${field}': ${invariant}`);
    this.name = 'SiteNodeConfigValidationError';
  }
}

function fail(filePath: string, recordIndex: number | null, field: string, invariant: string): never {
  throw new SiteNodeConfigValidationError(filePath, recordIndex, field, invariant);
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
): { siteNodeName: string; siteNodeId: SiteNodeId; listType: 'blacklist' | 'whitelist' } {
  if (typeof value.siteNodeName !== 'string' || value.siteNodeName.trim().length === 0) {
    fail(filePath, index, 'siteNodeName', 'must be a non-empty string');
  }
  if (typeof value.siteNodeId !== 'string' || !SITE_NODE_ID_PATTERN.test(value.siteNodeId)) {
    fail(filePath, index, 'siteNodeId', 'must match [a-z0-9]{12}');
  }
  if (value.listType !== 'whitelist' && value.listType !== 'blacklist') {
    fail(filePath, index, 'listType', "must be exactly 'whitelist' or 'blacklist'");
  }
  return {
    siteNodeName: value.siteNodeName,
    siteNodeId: value.siteNodeId as SiteNodeId,
    listType: value.listType as 'blacklist' | 'whitelist',
  };
}

function parseNodeRecord(value: unknown, index: number, filePath: string): SiteNodeConfig {
  if (!isRecord(value)) fail(filePath, index, 'record', 'must be a mapping');
  for (const field of Object.keys(value)) {
    if (!canonicalNodeFields.has(field)) {
      fail(filePath, index, field, 'is not part of canonical node configuration');
    }
  }
  const common = parseCommonNodeFields(value, index, filePath);
  switch (value.siteNodeKind) {
    case 'file': {
      if (value.sourceGraphSubdirectory !== undefined && typeof value.sourceGraphSubdirectory !== 'string') {
        fail(filePath, index, 'sourceGraphSubdirectory', 'must be a string when present');
      }
      if (typeof value.fileType !== 'string' || !fileTypes.has(value.fileType)) {
        fail(filePath, index, 'fileType', `must be one of: ${FILE_TYPES.join(', ')}`);
      }
      if (hasOwn(value, 'memberSiteNodeIds')) {
        fail(filePath, index, 'memberSiteNodeIds', 'is only valid for collection nodes');
      }
      return {
        ...common,
        ...(value.sourceGraphSubdirectory !== undefined && {
          sourceGraphSubdirectory: value.sourceGraphSubdirectory,
        }),
        siteNodeKind: 'file',
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
      if (normalized !== '' && common.siteNodeName !== normalized.slice(normalized.lastIndexOf('/') + 1)) {
        fail(filePath, index, 'siteNodeName', 'must equal the basename of sourceGraphSubdirectory');
      }
      if (hasOwn(value, 'fileType')) fail(filePath, index, 'fileType', 'is not valid for folder nodes');
      if (hasOwn(value, 'memberSiteNodeIds')) {
        fail(filePath, index, 'memberSiteNodeIds', 'is only valid for collection nodes');
      }
      return {
        ...common,
        sourceGraphSubdirectory: normalized,
        siteNodeKind: 'folder',
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
      if (!Array.isArray(value.memberSiteNodeIds) || value.memberSiteNodeIds.length < 2) {
        fail(filePath, index, 'memberSiteNodeIds', 'must contain at least two folder-node IDs');
      }
      const memberSiteNodeIds = value.memberSiteNodeIds.map((member, memberIndex) => {
        if (typeof member !== 'string' || !SITE_NODE_ID_PATTERN.test(member)) {
          fail(filePath, index, 'memberSiteNodeIds', `member ${memberIndex + 1} must match [a-z0-9]{12}`);
        }
        return member as SiteNodeId;
      });
      if (new Set(memberSiteNodeIds).size !== memberSiteNodeIds.length) {
        fail(filePath, index, 'memberSiteNodeIds', 'must contain unique IDs');
      }
      return {
        ...common,
        siteNodeKind: 'collection',
        memberSiteNodeIds,
      };
    }
    default:
      fail(filePath, index, 'siteNodeKind', "must be exactly 'file', 'folder', or 'collection'");
  }
}

type SiteNodeLocatorInput =
  | Pick<FileSiteNodeConfig, 'siteNodeName' | 'sourceGraphSubdirectory' | 'siteNodeKind' | 'fileType'>
  | Pick<FolderSiteNodeConfig, 'sourceGraphSubdirectory' | 'siteNodeKind'>
  | Pick<CollectionSiteNodeConfig, 'siteNodeKind'>;

/** Logical configured-node identity. The file format is intentionally unchanged from Phase 1. */
export function siteNodeLocatorKey(node: SiteNodeLocatorInput): string {
  if (node.siteNodeKind === 'file') {
    return [node.siteNodeName, node.sourceGraphSubdirectory ?? '', node.siteNodeKind, node.fileType].join('\0');
  }
  if (node.siteNodeKind === 'folder') return `folder:${node.sourceGraphSubdirectory}`;
  return 'collection';
}

export function parseSiteNodeConfig(
  content: string,
  filePath = 'site_node_config.yaml',
): SiteNodeConfig[] {
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

function validateNodeSet(nodes: SiteNodeConfig[], filePath: string): void {
  const ids = new Map<string, number>();
  const locators = new Map<string, number>();
  nodes.forEach((node, index) => {
    const priorId = ids.get(node.siteNodeId);
    if (priorId !== undefined) {
      fail(filePath, index, 'siteNodeId', `duplicates record ${priorId + 1}`);
    }
    ids.set(node.siteNodeId, index);

    const locator = siteNodeLocatorKey(node);
    const priorLocator = locators.get(locator);
    if (priorLocator !== undefined) {
      fail(filePath, index, 'source locator', `duplicates record ${priorLocator + 1}`);
    }
    locators.set(locator, index);
  });

  const collections = nodes.filter((node): node is CollectionSiteNodeConfig => node.siteNodeKind === 'collection');
  if (collections.length > 1) fail(filePath, nodes.indexOf(collections[1]), 'siteNodeKind', 'only one collection is permitted');
  for (const collection of collections) {
    const collectionIndex = nodes.indexOf(collection);
    for (const memberId of collection.memberSiteNodeIds) {
      const member = nodes.find(node => node.siteNodeId === memberId);
      if (!member) fail(filePath, collectionIndex, 'memberSiteNodeIds', `does not resolve (${memberId})`);
      if (member.siteNodeKind !== 'folder' || member.listType !== 'whitelist') {
        fail(filePath, collectionIndex, 'memberSiteNodeIds', `must resolve to a whitelisted folder (${memberId})`);
      }
    }
  }
}

export function stringifySiteNodeConfig(nodes: SiteNodeConfig[]): string {
  const canonicalNodes = nodes.map((node, index) => parseNodeRecord(node, index, 'site_node_config.yaml'));
  validateNodeSet(canonicalNodes, 'site_node_config.yaml');
  const sorted = canonicalNodes.sort((a, b) =>
    a.siteNodeName.localeCompare(b.siteNodeName)
    || (a.sourceGraphSubdirectory ?? '').localeCompare(b.sourceGraphSubdirectory ?? '')
    || a.siteNodeKind.localeCompare(b.siteNodeKind)
    || (a.fileType ?? '').localeCompare(b.fileType ?? '')
    || a.siteNodeId.localeCompare(b.siteNodeId));

  const document: SiteNodeConfigDocument = {
    nodes: sorted.map(node => {
      const common = {
        siteNodeName: node.siteNodeName,
        ...(node.siteNodeKind !== 'collection' && {
          sourceGraphSubdirectory: node.sourceGraphSubdirectory,
        }),
        siteNodeKind: node.siteNodeKind,
        ...(node.siteNodeKind === 'file' && { fileType: node.fileType }),
        siteNodeId: node.siteNodeId,
        listType: node.listType,
        ...(node.siteNodeKind !== 'collection' && node.outlinksDepth !== undefined && {
          outlinksDepth: node.outlinksDepth,
        }),
        ...(node.siteNodeKind !== 'collection' && node.inlinksDepth !== undefined && {
          inlinksDepth: node.inlinksDepth,
        }),
        ...(node.siteNodeKind === 'collection' && { memberSiteNodeIds: node.memberSiteNodeIds }),
      };
      return common as SiteNodeConfig;
    }),
  };
  return YAML.stringify(document);
}

export function generateSiteNodeId(
  existingIds: Iterable<string>,
  random = Math.random,
): SiteNodeId {
  const existing = new Set(existingIds);
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    let candidate = '';
    for (let index = 0; index < 12; index += 1) {
      candidate += SITE_NODE_ID_ALPHABET[Math.floor(random() * SITE_NODE_ID_ALPHABET.length)];
    }
    if (!existing.has(candidate)) return candidate as SiteNodeId;
  }
  throw new Error('Unable to generate a unique siteNodeId after 10000 attempts');
}

export function validateCanonicalSiteConfiguration(options: {
  committedNodes: SiteNodeConfig[];
  committedPath?: string;
  draftNodes?: SiteNodeConfig[];
  draftPath?: string;
  siteConfig: SiteConfig;
  siteConfigPath?: string;
}): void {
  const committedPath = options.committedPath ?? 'site_node_config.yaml';
  const draftPath = options.draftPath ?? 'draft_site_node_config.yaml';
  const siteConfigPath = options.siteConfigPath ?? 'site_config.yaml';
  validateNodeSet(options.committedNodes, committedPath);
  validateNodeSet(options.draftNodes ?? [], draftPath);

  const committedByLocator = new Map(options.committedNodes.map(node => [siteNodeLocatorKey(node), node]));
  const locatorById = new Map(options.committedNodes.map(node => [node.siteNodeId, siteNodeLocatorKey(node)]));
  for (const [index, node] of (options.draftNodes ?? []).entries()) {
    const locator = siteNodeLocatorKey(node);
    const committed = committedByLocator.get(locator);
    if (committed && committed.siteNodeId !== node.siteNodeId) {
      fail(draftPath, index, 'siteNodeId', `must equal committed ID ${committed.siteNodeId} for the same logical node`);
    }
    const priorLocator = locatorById.get(node.siteNodeId);
    if (priorLocator !== undefined && priorLocator !== locator) {
      fail(draftPath, index, 'siteNodeId', 'is already assigned to a different committed node');
    }
    locatorById.set(node.siteNodeId, locator);
  }

  validateDepth(options.siteConfig.defaultOutlinksDepth, siteConfigPath, null, 'defaultOutlinksDepth');
  validateDepth(options.siteConfig.defaultInlinksDepth, siteConfigPath, null, 'defaultInlinksDepth');
  validateSiteNodeStrategy(options.committedNodes, options.siteConfig, siteConfigPath);
  if (options.draftNodes) {
    validateSiteNodeStrategy(options.draftNodes, options.siteConfig, siteConfigPath);
  }
}

function nodeSourceDirectory(node: SiteNodeConfig): string | undefined {
  return node.siteNodeKind === 'collection' ? undefined : (node.sourceGraphSubdirectory ?? '');
}

function nearestBlacklistedAncestor(node: SiteNodeConfig, nodes: SiteNodeConfig[]): FolderSiteNodeConfig | undefined {
  const locator = nodeSourceDirectory(node);
  if (locator === undefined) return undefined;
  return nodes
    .filter((candidate): candidate is FolderSiteNodeConfig =>
      candidate.siteNodeKind === 'folder'
      && candidate.listType === 'blacklist'
      && (candidate.sourceGraphSubdirectory === ''
        || locator === candidate.sourceGraphSubdirectory
        || locator.startsWith(`${candidate.sourceGraphSubdirectory}/`)))
    .sort((a, b) => b.sourceGraphSubdirectory.length - a.sourceGraphSubdirectory.length)[0];
}

function validateSiteNodeStrategy(nodes: SiteNodeConfig[], siteConfig: SiteConfig, siteConfigPath: string): void {
  const roles = resolveSiteNodeRoles(nodes, siteConfig, siteConfigPath);
  const collection = nodes.find((node): node is CollectionSiteNodeConfig => node.siteNodeKind === 'collection');
  if (collection && roles.entryNode.siteNodeId !== collection.siteNodeId) {
    fail(siteConfigPath, null, 'entrySiteNodeId', 'the site collection must be the entry node');
  }
  if (roles.entryNode.siteNodeKind === 'collection' && roles.entryNode !== collection) {
    fail(siteConfigPath, null, 'entrySiteNodeId', 'must reference the site collection');
  }

  const sourceRootName = siteConfig.sourceDirectory?.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  for (const [index, node] of nodes.entries()) {
    if (node.siteNodeKind === 'folder' && node.sourceGraphSubdirectory === ''
      && sourceRootName && node.siteNodeName !== sourceRootName) {
      fail(siteConfigPath, index, 'siteNodeName', `source-root folder must be named '${sourceRootName}'`);
    }
  }

  const strongNodes: SiteNodeConfig[] = [roles.entryNode, roles.defaultTraversalNode];
  if (collection) {
    strongNodes.push(...collection.memberSiteNodeIds.map(memberId =>
      nodes.find(node => node.siteNodeId === memberId)!).filter(Boolean));
  }
  for (const strongNode of strongNodes) {
    const boundary = nearestBlacklistedAncestor(strongNode, nodes);
    if (boundary) {
      fail(siteConfigPath, null, 'strong roles', `node ${strongNode.siteNodeId} lies below blacklisted folder ${boundary.siteNodeId}`);
    }
  }
}

export function resolveSiteNodeRoles(
  nodes: SiteNodeConfig[],
  siteConfig: SiteConfig,
  siteConfigPath = 'site_config.yaml',
): { entryNode: SiteNodeConfig; defaultTraversalNode: SiteNodeConfig } {
  const byId = new Map(nodes.map(node => [node.siteNodeId, node]));
  const resolve = (field: 'entrySiteNodeId' | 'defaultTraversalSiteNodeId'): SiteNodeConfig => {
    const id = siteConfig[field];
    if (typeof id !== 'string' || !SITE_NODE_ID_PATTERN.test(id)) {
      fail(siteConfigPath, null, field, 'must match [a-z0-9]{12}');
    }
    const node = byId.get(id as SiteNodeId);
    if (!node) fail(siteConfigPath, null, field, `does not resolve to a configured node (${id})`);
    if (node.listType !== 'whitelist') {
      fail(siteConfigPath, null, field, `must reference a whitelisted node (${id})`);
    }
    return node;
  };
  return {
    entryNode: resolve('entrySiteNodeId'),
    defaultTraversalNode: resolve('defaultTraversalSiteNodeId'),
  };
}

export function nodeConfigMatchesNode(
  config: SiteNodeConfig,
  siteNodeName: string,
  sourceGraphSubdirectory: string | undefined,
  fileType: FileType | undefined,
  siteNodeKind: SiteNodeKind = 'file',
  siteNodeId?: SiteNodeId,
): boolean {
  if (config.siteNodeKind !== siteNodeKind || config.siteNodeName !== siteNodeName) return false;
  if (config.siteNodeKind === 'collection') return siteNodeId === undefined || config.siteNodeId === siteNodeId;
  if ((config.sourceGraphSubdirectory ?? '') !== (sourceGraphSubdirectory ?? '')) return false;
  return config.siteNodeKind === 'folder' || config.fileType === fileType;
}

export function applySensitiveFromApiData(nodes: ISiteNode[]): ISiteNode[] {
  for (const node of nodes) {
    if (node.data && typeof node.data.is_sensitive === 'boolean') {
      node.sensitive = node.data.is_sensitive;
    }
  }
  return nodes;
}

/** Apply persisted configuration; record presence is the sole tracking signal. */
export function applyNodeConfigsToNodes(
  nodes: ISiteNode[],
  configs: SiteNodeConfig[],
): ISiteNode[] {
  for (const node of nodes) {
    node.tracked = false;
    node.blacklisted = false;
    delete node.conf;
    delete node.siteNodeId;
  }
  for (const config of configs) {
    const node = nodes.find(candidate => nodeConfigMatchesNode(
      config,
      candidate.siteNodeName,
      candidate.sourceGraphSubdirectory,
      candidate.fileType,
      candidate.siteNodeKind,
      candidate.siteNodeId,
    ));
    if (!node) continue;
    node.conf = config;
    node.siteNodeId = config.siteNodeId;
    node.tracked = true;
    node.blacklisted = config.listType === 'blacklist';
  }
  return nodes;
}

/** Build persisted records only for nodes currently registered by curation. */
export function buildNodeConfigs(nodes: ISiteNode[]): SiteNodeConfig[] {
  return nodes
    .filter(node => node.tracked === true && node.conf !== undefined)
    .map(node => {
      if (node.siteNodeKind === 'collection') {
        return {
          siteNodeName: node.siteNodeName,
          siteNodeKind: 'collection',
          siteNodeId: node.conf!.siteNodeId,
          listType: 'whitelist',
          memberSiteNodeIds: node.memberSiteNodeIds,
        } satisfies CollectionSiteNodeConfig;
      }
      const common = {
        siteNodeName: node.siteNodeName,
        sourceGraphSubdirectory: node.sourceGraphSubdirectory,
        siteNodeId: node.conf!.siteNodeId,
        listType: node.blacklisted ? 'blacklist' as const : 'whitelist' as const,
        ...(node.conf!.outlinksDepth !== undefined && { outlinksDepth: node.conf!.outlinksDepth }),
        ...(node.conf!.inlinksDepth !== undefined && { inlinksDepth: node.conf!.inlinksDepth }),
      };
      if (node.siteNodeKind === 'folder') return { ...common, siteNodeKind: 'folder' } satisfies FolderSiteNodeConfig;
      return { ...common, siteNodeKind: 'file', fileType: node.fileType } satisfies FileSiteNodeConfig;
    });
}

/** Configured whitelist nodes that are no longer reachable in the working graph. */
export function getOrphanNodeConfigs(
  configs: SiteNodeConfig[],
  nodes: ISiteNode[],
): SiteNodeConfig[] {
  return configs.filter(config => config.listType !== 'blacklist' && !nodes.some(node =>
    nodeConfigMatchesNode(
      config,
      node.siteNodeName,
      node.sourceGraphSubdirectory,
      node.fileType,
      node.siteNodeKind,
      node.siteNodeId,
    )));
}
