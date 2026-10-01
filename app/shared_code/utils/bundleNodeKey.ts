/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleNodeConfig, BundleNodeId } from '../../contracts/types/bundleNodeConfig.js';
import type { BundleNodeKey, EncodedBundleNodeKey, SourceId, SourceRelativePath } from '../../contracts/types/bundleNodeKey.js';
import { normalizeSourceRelativePath, sourceGraphPath, validateSourceId } from './bundleSourceUtils.js';

const SOURCE_PREFIX = '_mw_sources/';

function sourceIdentity(value?: string): SourceId | undefined {
  if (value === undefined) return undefined;
  validateSourceId(value);
  return value as SourceId;
}

function relativePath(value: string, allowEmpty: boolean, sourceId?: string): SourceRelativePath {
  const normalized = normalizeSourceRelativePath(value);
  if (normalized !== value || (!allowEmpty && !value) || /^[a-zA-Z]:\//.test(value) || (!sourceId && value.startsWith(SOURCE_PREFIX))) {
    throw new Error('A node key requires a normalized source-relative path.');
  }
  return value as SourceRelativePath;
}

export function createFileNodeKey(path: string, sourceId?: string): Extract<BundleNodeKey, { kind: 'file' }> {
  return Object.freeze({ kind: 'file', path: relativePath(path, false, sourceId), ...(sourceId !== undefined && { sourceId: sourceIdentity(sourceId) }) });
}

export function createFolderNodeKey(path: string, sourceId?: string): Extract<BundleNodeKey, { kind: 'folder' }> {
  return Object.freeze({ kind: 'folder', path: relativePath(path, true, sourceId), ...(sourceId !== undefined && { sourceId: sourceIdentity(sourceId) }) });
}

export function createCollectionNodeKey(bundleNodeId: BundleNodeId): Extract<BundleNodeKey, { kind: 'collection' }> {
  if (!/^[a-z0-9]{12}$/.test(bundleNodeId)) throw new Error('A collection key requires a valid bundle node identity.');
  return Object.freeze({ kind: 'collection', bundleNodeId });
}

/** Grammar: file:<graph-path>, folder:<graph-path>, collection:<12-character-id>. */
export function serializeBundleNodeKey(key: BundleNodeKey): EncodedBundleNodeKey {
  if (key.kind === 'collection') return `collection:${createCollectionNodeKey(key.bundleNodeId).bundleNodeId}` as EncodedBundleNodeKey;
  const path = relativePath(key.path, key.kind === 'folder', key.sourceId);
  const sourceId = sourceIdentity(key.sourceId);
  if (!sourceId && path.startsWith(SOURCE_PREFIX)) throw new Error('The _mw_sources namespace is reserved for source identities.');
  return `${key.kind}:${sourceGraphPath(sourceId, path)}` as EncodedBundleNodeKey;
}

export function parseBundleNodeKey(value: string): BundleNodeKey {
  const colon = value.indexOf(':');
  const kind = value.slice(0, colon);
  const locator = value.slice(colon + 1);
  if (kind === 'collection') return createCollectionNodeKey(locator as BundleNodeId);
  if (kind !== 'file' && kind !== 'folder') throw new Error(`Invalid bundle node key: ${value}`);
  let path = locator;
  let sourceId: string | undefined;
  if (path.startsWith(SOURCE_PREFIX)) {
    const parts = path.slice(SOURCE_PREFIX.length).split('/');
    sourceId = parts.shift();
    path = parts.join('/');
  }
  const key = kind === 'file' ? createFileNodeKey(path, sourceId) : createFolderNodeKey(path, sourceId);
  if (serializeBundleNodeKey(key) !== value) throw new Error(`Noncanonical bundle node key: ${value}`);
  return key;
}

/** Parse untrusted text once, retaining a primitive suitable for Map and Set. */
export function encodedBundleNodeKey(value: string): EncodedBundleNodeKey {
  return serializeBundleNodeKey(parseBundleNodeKey(value));
}

export function bundleNodeKeysEqual(left: BundleNodeKey, right: BundleNodeKey): boolean {
  return serializeBundleNodeKey(left) === serializeBundleNodeKey(right);
}

/** A path in the graph's source namespace is input to construction, never already a key. */
export function fileNodeKeyFromSourceGraphPath(path: string): BundleNodeKey {
  if (!path.startsWith(SOURCE_PREFIX)) return createFileNodeKey(path);
  const [sourceId, ...parts] = path.slice(SOURCE_PREFIX.length).split('/');
  return createFileNodeKey(parts.join('/'), sourceId);
}

/** Stored source filenames map to the graph's canonical file format. */
export function fileNodeKeyFromSourceFilePath(path: string): BundleNodeKey {
  return fileNodeKeyFromSourceGraphPath(path.replace(/\.excalidraw\.md$/, '.excalidraw'));
}

/** Retrieve a graph-relative locator explicitly; a collection has no source path. */
export function bundleNodeKeySourceGraphPath(key: BundleNodeKey | EncodedBundleNodeKey): string {
  const value = typeof key === 'string' ? parseBundleNodeKey(key) : key;
  if (value.kind === 'collection') throw new Error('A collection node has no source path.');
  return sourceGraphPath(value.sourceId, value.path);
}

export function bundleNodeKeyFromConfig(config: BundleNodeConfig): BundleNodeKey {
  if (config.bundleNodeKind === 'collection') return createCollectionNodeKey(config.bundleNodeId);
  if (config.bundleNodeKind === 'folder') return createFolderNodeKey(config.sourceGraphSubdirectory, config.sourceId);
  const filename = `${config.bundleNodeName}.${config.fileType}`;
  return createFileNodeKey(config.sourceGraphSubdirectory ? `${config.sourceGraphSubdirectory}/${filename}` : filename, config.sourceId);
}

import type { bundleNodeKey, ParticipatesIn } from '../../concepts/index.js';
export type BundleNodeKeyCodecMeadowConceptParticipations = [
  ParticipatesIn<typeof bundleNodeKey, 'construct', typeof createFileNodeKey>,
  ParticipatesIn<typeof bundleNodeKey, 'construct', typeof createFolderNodeKey>,
  ParticipatesIn<typeof bundleNodeKey, 'construct', typeof createCollectionNodeKey>,
  ParticipatesIn<typeof bundleNodeKey, 'parse', typeof parseBundleNodeKey>,
  ParticipatesIn<typeof bundleNodeKey, 'render', typeof serializeBundleNodeKey>,
];
