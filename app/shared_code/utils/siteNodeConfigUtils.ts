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
  SiteNodeConfig,
  SiteNodeConfigDocument,
  SiteNodeId,
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

function parseNodeRecord(value: unknown, index: number, filePath: string): SiteNodeConfig {
  if (!isRecord(value)) fail(filePath, index, 'record', 'must be a mapping');
  for (const field of Object.keys(value)) {
    if (!canonicalNodeFields.has(field)) {
      fail(filePath, index, field, 'is not part of canonical node configuration');
    }
  }
  if (typeof value.siteNodeName !== 'string' || value.siteNodeName.trim().length === 0) {
    fail(filePath, index, 'siteNodeName', 'must be a non-empty string');
  }
  if (value.sourceGraphSubdirectory !== undefined && typeof value.sourceGraphSubdirectory !== 'string') {
    fail(filePath, index, 'sourceGraphSubdirectory', 'must be a string when present');
  }
  if (value.siteNodeKind !== 'file') {
    fail(filePath, index, 'siteNodeKind', "must be exactly 'file' in Phase 1");
  }
  if (typeof value.fileType !== 'string' || !fileTypes.has(value.fileType)) {
    fail(filePath, index, 'fileType', `must be one of: ${FILE_TYPES.join(', ')}`);
  }
  if (typeof value.siteNodeId !== 'string' || !SITE_NODE_ID_PATTERN.test(value.siteNodeId)) {
    fail(filePath, index, 'siteNodeId', 'must match [a-z0-9]{12}');
  }
  if (value.listType !== 'whitelist' && value.listType !== 'blacklist') {
    fail(filePath, index, 'listType', "must be exactly 'whitelist' or 'blacklist'");
  }

  return {
    siteNodeName: value.siteNodeName,
    ...(value.sourceGraphSubdirectory !== undefined && {
      sourceGraphSubdirectory: value.sourceGraphSubdirectory,
    }),
    siteNodeKind: 'file',
    fileType: value.fileType as FileType,
    siteNodeId: value.siteNodeId as SiteNodeId,
    listType: value.listType,
    ...(value.outlinksDepth !== undefined && {
      outlinksDepth: validateDepth(value.outlinksDepth, filePath, index, 'outlinksDepth'),
    }),
    ...(value.inlinksDepth !== undefined && {
      inlinksDepth: validateDepth(value.inlinksDepth, filePath, index, 'inlinksDepth'),
    }),
  };
}

export function siteNodeLocatorKey(node: Pick<SiteNodeConfig, 'siteNodeName' | 'sourceGraphSubdirectory' | 'siteNodeKind' | 'fileType'>): string {
  return [
    node.siteNodeName,
    node.sourceGraphSubdirectory ?? '',
    node.siteNodeKind,
    node.fileType,
  ].join('\0');
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
}

export function stringifySiteNodeConfig(nodes: SiteNodeConfig[]): string {
  const canonicalNodes = nodes.map((node, index) => parseNodeRecord(node, index, 'site_node_config.yaml'));
  validateNodeSet(canonicalNodes, 'site_node_config.yaml');
  const sorted = canonicalNodes.sort((a, b) =>
    a.siteNodeName.localeCompare(b.siteNodeName)
    || (a.sourceGraphSubdirectory ?? '').localeCompare(b.sourceGraphSubdirectory ?? '')
    || a.siteNodeKind.localeCompare(b.siteNodeKind)
    || a.fileType.localeCompare(b.fileType)
    || a.siteNodeId.localeCompare(b.siteNodeId));

  const document: SiteNodeConfigDocument = {
    nodes: sorted.map(node => ({
      siteNodeName: node.siteNodeName,
      ...(node.sourceGraphSubdirectory !== undefined && {
        sourceGraphSubdirectory: node.sourceGraphSubdirectory,
      }),
      siteNodeKind: node.siteNodeKind,
      fileType: node.fileType,
      siteNodeId: node.siteNodeId,
      listType: node.listType,
      ...(node.outlinksDepth !== undefined && { outlinksDepth: node.outlinksDepth }),
      ...(node.inlinksDepth !== undefined && { inlinksDepth: node.inlinksDepth }),
    })),
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
  resolveSiteNodeRoles(options.committedNodes, options.siteConfig, siteConfigPath);
  if (options.draftNodes) {
    resolveSiteNodeRoles(options.draftNodes, options.siteConfig, siteConfigPath);
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
  fileType: FileType,
): boolean {
  return config.siteNodeName === siteNodeName
    && (config.sourceGraphSubdirectory ?? '') === (sourceGraphSubdirectory ?? '')
    && config.siteNodeKind === 'file'
    && config.fileType === fileType;
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
    .map(node => ({
      siteNodeName: node.siteNodeName,
      ...(node.sourceGraphSubdirectory !== undefined && {
        sourceGraphSubdirectory: node.sourceGraphSubdirectory,
      }),
      siteNodeKind: 'file',
      fileType: node.fileType,
      siteNodeId: node.conf!.siteNodeId,
      listType: node.blacklisted ? 'blacklist' : 'whitelist',
      ...(node.conf!.outlinksDepth !== undefined && { outlinksDepth: node.conf!.outlinksDepth }),
      ...(node.conf!.inlinksDepth !== undefined && { inlinksDepth: node.conf!.inlinksDepth }),
    }));
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
    )));
}
