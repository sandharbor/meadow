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
import type { FileType } from '../../../../../shared_code/types/FileType.js';
import { FILE_TYPES } from '../../../../../shared_code/types/FileType.js';
import type { Migration } from '../../../../../shared_code/types/migrations.js';
import type { SiteConfig } from '../../../../../shared_code/types/siteConfig.js';
import type { SiteNodeConfig, SiteNodeId } from '../../../../../shared_code/types/siteNodeConfig.js';
import { getDefaultConfigDirectory } from '../../../../../shared_code/utils/appConfigUtils.js';
import {
  generateSiteNodeId,
  parseSiteNodeConfig,
  siteNodeLocatorKey,
  stringifySiteNodeConfig,
  validateCanonicalSiteConfiguration,
} from '../../../../../shared_code/utils/siteNodeConfigUtils.js';
import { logger } from '../../utils/logging/backendLoggingUtils.js';

const LEGACY_COMMITTED = 'site_page_config.yaml';
const LEGACY_DRAFT = 'draft_site_page_config.yaml';
const CANONICAL_COMMITTED = 'site_node_config.yaml';
const CANONICAL_DRAFT = 'draft_site_node_config.yaml';
const SITE_CONFIG = 'site_config.yaml';
const validFileTypes = new Set<string>(FILE_TYPES);

type LegacyRecord = Record<string, unknown>;
type LegacySiteConfig = SiteConfig & {
  initialSitePageTitle?: string;
  initialSitePageDirectory?: string;
  defaultTraversalSitePageTitle?: string;
  defaultTraversalSitePageDirectory?: string;
};

export interface SiteNodeMigrationCleanup {
  siteSlug: string;
  file: string;
  record: number;
  locator: string;
  reason: 'tracked-false' | 'missing-file-type-source-not-found';
}

export interface SiteNodeMigrationReport {
  migratedSites: string[];
  cleanups: SiteNodeMigrationCleanup[];
}

export interface SiteNodeMigrationOptions {
  /** Test hook for deterministic IDs and collision recovery. */
  generateId?: (existingIds: Iterable<string>) => SiteNodeId;
  /** Test hook that simulates interruption after an atomic write. */
  afterWrite?: (filePath: string) => void;
}

function migrationError(filePath: string, record: number | null, field: string, invariant: string): Error {
  const location = record === null ? filePath : `${filePath}: record ${record + 1}`;
  return new Error(`${location} field '${field}': ${invariant}`);
}

function readYamlMapping(filePath: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = YAML.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw migrationError(filePath, null, 'yaml', `must be valid YAML (${error instanceof Error ? error.message : String(error)})`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw migrationError(filePath, null, 'document', 'must be a mapping');
  }
  return value as Record<string, unknown>;
}

function readLegacyRecords(filePath: string): LegacyRecord[] {
  const value = readYamlMapping(filePath).pages;
  if (!Array.isArray(value)) {
    throw migrationError(filePath, null, 'pages', 'must be an array');
  }
  return value.map((record, index) => {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) {
      throw migrationError(filePath, index, 'record', 'must be a mapping');
    }
    return record as LegacyRecord;
  });
}

function optionalString(record: LegacyRecord, camel: string, snake: string): string | undefined {
  const value = record[camel] ?? record[snake];
  return typeof value === 'string' ? value : undefined;
}

function nestedConfig(record: LegacyRecord): LegacyRecord {
  const value = record.config;
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as LegacyRecord
    : {};
}

function exactFileExists(root: string, subdirectory: string, filename: string): boolean {
  const segments = subdirectory.split(/[\\/]/).filter(Boolean);
  let current = path.resolve(root);
  for (const segment of segments) {
    if (!fs.existsSync(current) || !fs.readdirSync(current).includes(segment)) return false;
    current = path.join(current, segment);
  }
  if (!fs.existsSync(current) || !fs.readdirSync(current).includes(filename)) return false;
  return fs.statSync(path.join(current, filename)).isFile();
}

function legacyDisplayLocator(record: LegacyRecord): string {
  const title = typeof record.title === 'string' ? record.title : '<invalid-title>';
  const directory = optionalString(record, 'sourceGraphSubdirectory', 'source_graph_subdirectory') ?? '';
  const fileType = optionalString(record, 'fileType', 'file_type') ?? '<missing-file-type>';
  return `${directory}/${title}.${fileType}`;
}

function normalizeLegacyRecords(options: {
  filePath: string;
  siteSlug: string;
  records: LegacyRecord[];
  sourceDirectory: string;
  idsByLocator: Map<string, SiteNodeId>;
  locatorById: Map<string, string>;
  generateId: (existingIds: Iterable<string>) => SiteNodeId;
  cleanups: SiteNodeMigrationCleanup[];
}): SiteNodeConfig[] {
  const result: SiteNodeConfig[] = [];
  const locators = new Map<string, number>();

  options.records.forEach((record, index) => {
    const config = nestedConfig(record);
    const tracked = record.tracked ?? config.tracked;
    if (tracked === false) {
      options.cleanups.push({
        siteSlug: options.siteSlug,
        file: path.basename(options.filePath),
        record: index + 1,
        locator: legacyDisplayLocator(record),
        reason: 'tracked-false',
      });
      return;
    }

    const title = record.title;
    if (typeof title !== 'string' || title.trim().length === 0) {
      throw migrationError(options.filePath, index, 'title', 'must be a non-empty string');
    }
    const directoryValue = record.sourceGraphSubdirectory ?? record.source_graph_subdirectory;
    if (directoryValue !== undefined && typeof directoryValue !== 'string') {
      throw migrationError(options.filePath, index, 'sourceGraphSubdirectory', 'must be a string when present');
    }
    const sourceGraphSubdirectory = directoryValue;

    let fileTypeValue = record.fileType ?? record.file_type;
    if (fileTypeValue === undefined) {
      if (!exactFileExists(options.sourceDirectory, sourceGraphSubdirectory ?? '', `${title}.md`)) {
        options.cleanups.push({
          siteSlug: options.siteSlug,
          file: path.basename(options.filePath),
          record: index + 1,
          locator: legacyDisplayLocator(record),
          reason: 'missing-file-type-source-not-found',
        });
        return;
      }
      fileTypeValue = 'md';
    }
    if (typeof fileTypeValue !== 'string' || !validFileTypes.has(fileTypeValue)) {
      throw migrationError(options.filePath, index, 'fileType', `must be one of: ${FILE_TYPES.join(', ')}`);
    }

    const listType = record.listType ?? config.list_type;
    if (listType !== 'whitelist' && listType !== 'blacklist') {
      throw migrationError(options.filePath, index, 'listType', "must be exactly 'whitelist' or 'blacklist'");
    }
    const outlinksDepth = record.outlinksDepth ?? config.outlinks_depth;
    const inlinksDepth = record.inlinksDepth ?? config.inlinks_depth;
    for (const [field, value] of [['outlinksDepth', outlinksDepth], ['inlinksDepth', inlinksDepth]] as const) {
      if (value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value < 0)) {
        throw migrationError(options.filePath, index, field, 'must be a non-negative integer when present');
      }
    }

    const locatorNode = {
      siteNodeName: title,
      ...(sourceGraphSubdirectory !== undefined && { sourceGraphSubdirectory }),
      siteNodeKind: 'file' as const,
      fileType: fileTypeValue as FileType,
    };
    const locator = siteNodeLocatorKey(locatorNode);
    const prior = locators.get(locator);
    if (prior !== undefined) {
      throw migrationError(options.filePath, index, 'source locator', `duplicates record ${prior + 1}`);
    }
    locators.set(locator, index);

    let siteNodeId = options.idsByLocator.get(locator);
    if (!siteNodeId) {
      siteNodeId = options.generateId(options.locatorById.keys());
      const conflictingLocator = options.locatorById.get(siteNodeId);
      if (conflictingLocator !== undefined) {
        throw migrationError(options.filePath, index, 'siteNodeId', `generator returned ID already assigned to ${conflictingLocator}`);
      }
      options.idsByLocator.set(locator, siteNodeId);
      options.locatorById.set(siteNodeId, locator);
    }
    result.push({
      ...locatorNode,
      siteNodeId,
      listType,
      ...(outlinksDepth !== undefined && { outlinksDepth: outlinksDepth as number }),
      ...(inlinksDepth !== undefined && { inlinksDepth: inlinksDepth as number }),
    });
  });
  return result;
}

function registerExistingIds(
  nodes: SiteNodeConfig[],
  filePath: string,
  idsByLocator: Map<string, SiteNodeId>,
  locatorById: Map<string, string>,
): void {
  nodes.forEach((node, index) => {
    const locator = siteNodeLocatorKey(node);
    const priorId = idsByLocator.get(locator);
    if (priorId && priorId !== node.siteNodeId) {
      throw migrationError(filePath, index, 'siteNodeId', `conflicts with existing ID ${priorId} for the same logical node`);
    }
    const priorLocator = locatorById.get(node.siteNodeId);
    if (priorLocator && priorLocator !== locator) {
      throw migrationError(filePath, index, 'siteNodeId', `is already assigned to a different logical node (${priorLocator})`);
    }
    idsByLocator.set(locator, node.siteNodeId);
    locatorById.set(node.siteNodeId, locator);
  });
}

function resolveLegacyRole(options: {
  filePath: string;
  field: string;
  title: unknown;
  directory: unknown;
  nodes: SiteNodeConfig[];
}): SiteNodeConfig {
  if (typeof options.title !== 'string' || options.title.trim().length === 0) {
    throw migrationError(options.filePath, null, options.field, 'must name a configured node');
  }
  if (options.directory !== undefined && typeof options.directory !== 'string') {
    throw migrationError(options.filePath, null, `${options.field}Directory`, 'must be a string when present');
  }
  const directory = options.directory ?? '';
  const candidates = options.nodes.filter(node =>
    node.siteNodeName === options.title
    && (node.sourceGraphSubdirectory ?? '') === directory);
  const markdownCandidates = candidates.filter(node => node.fileType === 'md');
  const excalidrawCandidates = candidates.filter(node => node.fileType === 'excalidraw');
  const resolved = candidates.length === 1
    ? candidates[0]
    : markdownCandidates.length === 1
      ? markdownCandidates[0]
      : markdownCandidates.length === 0 && excalidrawCandidates.length === 1
        ? excalidrawCandidates[0]
        : undefined;
  if (!resolved) {
    const reason = candidates.length === 0 ? 'does not resolve to a configured node' : 'is ambiguous across configured nodes';
    throw migrationError(options.filePath, null, options.field, reason);
  }
  if (resolved.listType !== 'whitelist') {
    throw migrationError(options.filePath, null, options.field, 'must resolve to a whitelisted node');
  }
  return resolved;
}

function atomicWrite(filePath: string, content: string, afterWrite?: (filePath: string) => void): void {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content) return;
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    fs.writeFileSync(temporaryPath, content, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
    afterWrite?.(filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

function siteConfigYaml(siteConfig: Record<string, unknown>): string {
  return YAML.stringify(siteConfig);
}

function planAndMigrateSite(
  siteSlug: string,
  siteDir: string,
  report: SiteNodeMigrationReport,
  options: SiteNodeMigrationOptions,
): boolean {
  const confDir = path.join(siteDir, 'conf');
  const paths = {
    legacyCommitted: path.join(confDir, LEGACY_COMMITTED),
    legacyDraft: path.join(confDir, LEGACY_DRAFT),
    canonicalCommitted: path.join(confDir, CANONICAL_COMMITTED),
    canonicalDraft: path.join(confDir, CANONICAL_DRAFT),
    siteConfig: path.join(confDir, SITE_CONFIG),
  };
  const hasAnyNodeConfig = [
    paths.legacyCommitted,
    paths.legacyDraft,
    paths.canonicalCommitted,
    paths.canonicalDraft,
  ].some(candidate => fs.existsSync(candidate));
  if (!hasAnyNodeConfig) return false;
  if (!fs.existsSync(paths.siteConfig)) {
    throw migrationError(paths.siteConfig, null, 'document', 'is required when a node configuration exists');
  }

  const siteConfigRecord = readYamlMapping(paths.siteConfig);
  const siteConfig = siteConfigRecord as LegacySiteConfig;
  if (typeof siteConfig.sourceDirectory !== 'string' || siteConfig.sourceDirectory.length === 0) {
    throw migrationError(paths.siteConfig, null, 'sourceDirectory', 'must be a non-empty string');
  }

  const idsByLocator = new Map<string, SiteNodeId>();
  const locatorById = new Map<string, string>();
  let committedNodes = fs.existsSync(paths.canonicalCommitted)
    ? parseSiteNodeConfig(fs.readFileSync(paths.canonicalCommitted, 'utf8'), paths.canonicalCommitted)
    : undefined;
  let draftNodes = fs.existsSync(paths.canonicalDraft)
    ? parseSiteNodeConfig(fs.readFileSync(paths.canonicalDraft, 'utf8'), paths.canonicalDraft)
    : undefined;
  if (committedNodes) registerExistingIds(committedNodes, paths.canonicalCommitted, idsByLocator, locatorById);
  if (draftNodes) registerExistingIds(draftNodes, paths.canonicalDraft, idsByLocator, locatorById);

  const generateId = options.generateId ?? (existingIds => generateSiteNodeId(existingIds));
  if (fs.existsSync(paths.legacyCommitted)) {
    committedNodes = normalizeLegacyRecords({
      filePath: paths.legacyCommitted,
      siteSlug,
      records: readLegacyRecords(paths.legacyCommitted),
      sourceDirectory: siteConfig.sourceDirectory,
      idsByLocator,
      locatorById,
      generateId,
      cleanups: report.cleanups,
    });
  }
  if (!committedNodes) {
    throw migrationError(paths.canonicalCommitted, null, 'nodes', 'a committed node configuration is required');
  }
  if (fs.existsSync(paths.legacyDraft)) {
    draftNodes = normalizeLegacyRecords({
      filePath: paths.legacyDraft,
      siteSlug,
      records: readLegacyRecords(paths.legacyDraft),
      sourceDirectory: siteConfig.sourceDirectory,
      idsByLocator,
      locatorById,
      generateId,
      cleanups: report.cleanups,
    });
  }

  const roleNodes = committedNodes;
  let entryNode: SiteNodeConfig;
  if (typeof siteConfig.entrySiteNodeId === 'string') {
    entryNode = roleNodes.find(node => node.siteNodeId === siteConfig.entrySiteNodeId) as SiteNodeConfig;
    if (!entryNode) throw migrationError(paths.siteConfig, null, 'entrySiteNodeId', 'does not resolve to a configured node');
  } else {
    entryNode = resolveLegacyRole({
      filePath: paths.siteConfig,
      field: 'initialSitePageTitle',
      title: siteConfig.initialSitePageTitle,
      directory: siteConfig.initialSitePageDirectory,
      nodes: roleNodes,
    });
    siteConfigRecord.entrySiteNodeId = entryNode.siteNodeId;
  }

  if (typeof siteConfig.defaultTraversalSiteNodeId !== 'string') {
    if (siteConfig.defaultTraversalSitePageTitle === undefined) {
      siteConfigRecord.defaultTraversalSiteNodeId = entryNode.siteNodeId;
    } else {
      siteConfigRecord.defaultTraversalSiteNodeId = resolveLegacyRole({
        filePath: paths.siteConfig,
        field: 'defaultTraversalSitePageTitle',
        title: siteConfig.defaultTraversalSitePageTitle,
        directory: siteConfig.defaultTraversalSitePageDirectory,
        nodes: roleNodes,
      }).siteNodeId;
    }
  }

  const entryLocator = siteNodeLocatorKey(entryNode);
  const moveEntryDepths = (nodes: SiteNodeConfig[]): SiteNodeConfig[] => nodes.map(node => {
    if (siteNodeLocatorKey(node) !== entryLocator) return node;
    if (siteConfigRecord.defaultOutlinksDepth === undefined && node.outlinksDepth !== undefined) {
      siteConfigRecord.defaultOutlinksDepth = node.outlinksDepth;
    }
    if (siteConfigRecord.defaultInlinksDepth === undefined && node.inlinksDepth !== undefined) {
      siteConfigRecord.defaultInlinksDepth = node.inlinksDepth;
    }
    const withoutDepths = { ...node };
    delete withoutDepths.outlinksDepth;
    delete withoutDepths.inlinksDepth;
    return withoutDepths;
  });
  committedNodes = moveEntryDepths(committedNodes);
  if (draftNodes) draftNodes = moveEntryDepths(draftNodes);

  delete siteConfigRecord.initialSitePageTitle;
  delete siteConfigRecord.initialSitePageDirectory;
  delete siteConfigRecord.defaultTraversalSitePageTitle;
  delete siteConfigRecord.defaultTraversalSitePageDirectory;

  validateCanonicalSiteConfiguration({
    committedNodes,
    committedPath: paths.canonicalCommitted,
    ...(draftNodes && { draftNodes, draftPath: paths.canonicalDraft }),
    siteConfig: siteConfigRecord as SiteConfig,
    siteConfigPath: paths.siteConfig,
  });

  // Node files precede their site-level references. A retry sees and reuses
  // these IDs if interruption occurs before site_config.yaml is replaced.
  atomicWrite(paths.canonicalCommitted, stringifySiteNodeConfig(committedNodes), options.afterWrite);
  if (draftNodes) atomicWrite(paths.canonicalDraft, stringifySiteNodeConfig(draftNodes), options.afterWrite);
  atomicWrite(paths.siteConfig, siteConfigYaml(siteConfigRecord), options.afterWrite);

  const writtenCommitted = parseSiteNodeConfig(fs.readFileSync(paths.canonicalCommitted, 'utf8'), paths.canonicalCommitted);
  const writtenDraft = fs.existsSync(paths.canonicalDraft)
    ? parseSiteNodeConfig(fs.readFileSync(paths.canonicalDraft, 'utf8'), paths.canonicalDraft)
    : undefined;
  const writtenSiteConfig = readYamlMapping(paths.siteConfig) as SiteConfig;
  validateCanonicalSiteConfiguration({
    committedNodes: writtenCommitted,
    committedPath: paths.canonicalCommitted,
    ...(writtenDraft && { draftNodes: writtenDraft, draftPath: paths.canonicalDraft }),
    siteConfig: writtenSiteConfig,
    siteConfigPath: paths.siteConfig,
  });

  // Legacy inputs are retired only after the complete canonical site validates.
  for (const legacyPath of [paths.legacyCommitted, paths.legacyDraft]) {
    if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath);
  }
  report.migratedSites.push(siteSlug);
  return true;
}

/**
 * Convert every site in one operation. Throwing for any site leaves the
 * migration pending in the startup runner, while already-written sites are
 * safe to resume because their locator-to-ID assignments are canonical.
 */
export function migrateSiteNodeFoundation(
  configDir: string,
  options: SiteNodeMigrationOptions = {},
): SiteNodeMigrationReport {
  const report: SiteNodeMigrationReport = { migratedSites: [], cleanups: [] };
  const sitesDir = path.join(configDir, 'sites');
  if (!fs.existsSync(sitesDir)) return report;
  const sites = fs.readdirSync(sitesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
  for (const siteSlug of sites) {
    planAndMigrateSite(siteSlug, path.join(sitesDir, siteSlug), report, options);
  }
  for (const cleanup of report.cleanups) {
    logger.warn(
      `[migrations] site-node cleanup ${cleanup.siteSlug}/${cleanup.file} record ${cleanup.record} `
      + `${cleanup.locator}: ${cleanup.reason}`,
    );
  }
  return report;
}

export const migration: Migration = {
  name: 'Site node foundation',
  description: 'Replace legacy page configuration with stable file-node identities and site-level role references.',
  run: (): Promise<void> => {
    migrateSiteNodeFoundation(getDefaultConfigDirectory());
    return Promise.resolve();
  },
};
