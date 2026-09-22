/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleConfig, BundleSource } from '../../contracts/types/bundleConfig.js';
import type { BundleNodeConfig } from '../../contracts/types/bundleNodeConfig.js';

export const LEGACY_SOURCE_ID = 'source000001';
const SOURCE_PATH_PREFIX = '_mw_sources/';
const SOURCE_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const SOURCE_ID_PATTERN = /^[a-z0-9]{12}$/;

/** Human-readable source location, distinct from a filesystem or published path. */
export function sourceLocationLabel(sourceName: string, relativePath = ''): string {
  return `${sourceName}://${relativePath}`;
}

export function validateSourceName(name: string): void {
  if (!SOURCE_NAME_PATTERN.test(name)) throw new Error('Source names must start with a lowercase letter and contain only lowercase letters, numbers, hyphens, or underscores (up to 64 characters).');
}

export function validateSourceId(id: string): void {
  if (!SOURCE_ID_PATTERN.test(id)) throw new Error('Source identity must contain exactly 12 lowercase letters or numbers.');
}

/** Read a registry without changing a legacy bundle's saved configuration. */
export function bundleSources(config: BundleConfig): BundleSource[] {
  if (config.sources !== undefined) {
    if (config.sourceDirectory !== undefined) throw new Error('A bundle must use either sources or sourceDirectory.');
    validateBundleSources(config.sources);
    return config.sources;
  }
  return config.sourceDirectory ? [{ id: LEGACY_SOURCE_ID, name: 'source', directory: config.sourceDirectory }] : [];
}

export function validateBundleSources(sources: BundleSource[]): void {
  if (!Array.isArray(sources) || sources.length === 0) throw new Error('Configure at least one source.');
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const source of sources) {
    validateSourceId(source.id);
    if (ids.has(source.id)) throw new Error(`Duplicate source identity: ${source.id}`);
    ids.add(source.id);
    if (typeof source.directory !== 'string' || !source.directory.trim()) throw new Error(`Choose a directory for source ${source.name}.`);
    if (source.aliases !== undefined && (!Array.isArray(source.aliases) || source.aliases.some(alias => typeof alias !== 'string'))) throw new Error('Source aliases must be a list of names.');
    for (const name of [source.name, ...(source.aliases ?? [])]) {
      if (typeof name !== 'string') throw new Error('A source name is required.');
      validateSourceName(name);
      if (names.has(name)) throw new Error(`Source name or alias is already registered: ${name}`);
      names.add(name);
    }
  }
}

export function normalizeSourceRelativePath(value: string): string {
  if (value.startsWith('/') || value.includes('\\') || value.includes('\0') || value.split('/').includes('..')) throw new Error('A source path must remain inside its source directory.');
  return value.split('/').filter(part => part && part !== '.').join('/');
}

/** Stable graph/storage namespace; published routes use the canonical name instead. */
export function sourceGraphPath(sourceId: string | undefined, relativePath: string): string {
  const relative = normalizeSourceRelativePath(relativePath);
  if (!sourceId) return relative;
  validateSourceId(sourceId);
  return `${SOURCE_PATH_PREFIX}${sourceId}${relative ? `/${relative}` : ''}`;
}

export function splitSourceGraphPath(graphPath: string, sources?: readonly BundleSource[]): { sourceId?: string; relativePath: string } {
  const normalized = normalizeSourceRelativePath(graphPath.replace(/^\//, ''));
  if (!sources) return { relativePath: normalized };
  if (!normalized.startsWith(SOURCE_PATH_PREFIX)) throw new Error('A source registry requires a qualified graph path.');
  const [sourceId, ...parts] = normalized.slice(SOURCE_PATH_PREFIX.length).split('/');
  validateSourceId(sourceId);
  if (!sources.some(source => source.id === sourceId)) throw new Error('Graph path refers to an unregistered source identity.');
  return { sourceId, relativePath: parts.join('/') };
}

export function sourceForNode(config: BundleConfig, node: Pick<BundleNodeConfig, 'sourceId'>): BundleSource | undefined {
  const sources = bundleSources(config);
  return sources.find(source => source.id === (node.sourceId ?? LEGACY_SOURCE_ID));
}

/** Registering a second source preserves every existing page identity and setting. */
export function assignLegacySourceIdentity(nodes: BundleNodeConfig[]): BundleNodeConfig[] {
  return nodes.map(node => node.bundleNodeKind === 'collection' || node.sourceId ? node : { ...node, sourceId: LEGACY_SOURCE_ID });
}

export function sourceOutputDirectory(config: BundleConfig, sourceId: string | undefined, relativeDirectory: string): string {
  const directory = normalizeSourceRelativePath(relativeDirectory);
  if (!config.sourceOutputLayout) return directory;
  const source = sourceForNode(config, { sourceId });
  if (!source) throw new Error('The output source is no longer configured.');
  return `sources/${source.name}${directory ? `/${directory}` : ''}`;
}
