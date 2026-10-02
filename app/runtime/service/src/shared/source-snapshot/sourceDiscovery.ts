/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'node:path';
import fs from 'node:fs';
import type { BundleConfig } from '../../../../../contracts/types/bundleConfig.js';
import type { SourceSnapshot } from './sourceSnapshots.js';
import type { WorkingGraphRustOutput } from '../bundle-graph/workingGraphService.js';
import { sourceInventory } from '../../../../../shared_code/utils/sourceSnapshotFingerprint.js';
export { sourceInventory } from '../../../../../shared_code/utils/sourceSnapshotFingerprint.js';
import { sourceGraphPath, bundleSources, splitSourceGraphPath, LEGACY_SOURCE_ID } from '../../../../../shared_code/utils/bundleSourceUtils.js';

export function captureSourceAvailability(previous: SourceSnapshot, configuration: BundleConfig): NonNullable<SourceSnapshot['sourceAvailability']> {
  const sources = bundleSources(configuration);
  // Registry storage includes a synthetic namespace parent. It is not a source
  // directory and has no corresponding location whose presence can be checked.
  const directories = previous.directories.filter(filename => !previous.sources || previous.sources.some(source =>
    filename === sourceGraphPath(source.id, '') || filename.startsWith(`${sourceGraphPath(source.id, '')}/`)));
  return Object.fromEntries([...Object.keys(previous.files), ...directories].map(filename => {
    const locator = splitSourceGraphPath(filename, previous.sources);
    const source = sources.find(item => item.id === (locator.sourceId ?? LEGACY_SOURCE_ID));
    let presence: 'present' | 'missing' | 'disconnected' = 'disconnected';
    if (source && fs.existsSync(source.directory)) presence = fs.existsSync(path.join(source.directory, locator.relativePath)) ? 'present' : 'missing';
    return [filename, presence];
  }));
}

// Wider link discovery is session data, never part of a durable snapshot.
const liveLinks = new Map<string, { digest: string; graph: WorkingGraphRustOutput }>();
export function forgetLiveSourceLinks(bundleDirectory: string): void { liveLinks.delete(bundleDirectory); }
export function rememberLiveSourceLinks(bundleDirectory: string, digest: string, graph: WorkingGraphRustOutput | undefined): void {
  if (graph) liveLinks.set(bundleDirectory, { digest, graph });
  while (liveLinks.size > 8) liveLinks.delete(liveLinks.keys().next().value!);
}
export function liveSourceLinks(bundleDirectory: string, digest: string): WorkingGraphRustOutput | undefined {
  const value = liveLinks.get(bundleDirectory);
  return value?.digest === digest ? value.graph : undefined;
}

/** Discovery may inspect the library; the durable projection contains only admitted nodes. */
export function scopeSourceSnapshot(snapshot: SourceSnapshot, graph: WorkingGraphRustOutput | undefined): SourceSnapshot {
  const nodes = (graph?.nodes ?? []).filter(node => !node.isFrontierNode || node.isFrontierImageExtension);
  const keys = new Set(nodes.map(node => node.bundleNodeKey));
  const fileGraphPaths = new Set(nodes.filter(node => node.bundleNodeKind === 'file').map(node => bundleNodeKeySourceGraphPath(node.bundleNodeKey)));
  const filenames = new Set(nodes.flatMap(node => {
    if (node.bundleNodeKind !== 'file') return [];
    const key = bundleNodeKeySourceGraphPath(node.bundleNodeKey);
    if (node.sourceFile && snapshot.files[node.sourceFile.path]) return [node.sourceFile.path];
    if (snapshot.files[key]) return [key];
    if (node.fileType === 'excalidraw') return [`${key}.md`, key.replace(/\.excalidraw$/, '.md')].filter(filename => snapshot.files[filename]);
    return [];
  }));
  const files = Object.fromEntries(Object.entries(snapshot.files).filter(([filename]) => filenames.has(filename)));
  const directories = new Set(nodes.filter(node => node.bundleNodeKind === 'folder').map(node => sourceGraphPath(node.sourceId, node.sourceGraphSubdirectory ?? '')));
  for (const source of snapshot.sources ?? []) directories.add(sourceGraphPath(source.id, ''));
  for (const filename of Object.keys(files)) {
    let directory = path.posix.dirname(filename);
    while (directory !== '.') { directories.add(directory); directory = path.posix.dirname(directory); }
  }
  directories.delete('');
  const links = (map: Record<EncodedBundleNodeKey, EncodedBundleNodeKey[]>) => Object.fromEntries(Object.entries(map).filter(([key]) => keys.has(encodedBundleNodeKey(key))).map(([key, values]) => [key, values.filter(value => keys.has(value))]));
  return { ...snapshot, ...sourceInventory(files, [...directories], snapshot.sources), graph: graph ? { ...graph, nodes,
    ...(graph.sourceDiagnostics && { sourceDiagnostics: graph.sourceDiagnostics.filter(diagnostic => keys.has(serializeBundleNodeKey(fileNodeKeyFromSourceFilePath(diagnostic.path)))) }),
    allLinkResolutionMaps: Object.fromEntries(Object.entries(graph.allLinkResolutionMaps).filter(([key]) => keys.has(encodedBundleNodeKey(key))).map(([key, resolutions]) => [key, Object.fromEntries(Object.entries(resolutions).map(([link, resolution]) => [link, resolution.link_resolved_target_path && fileGraphPaths.has(resolution.link_resolved_target_path) ? resolution : { link_resolved_target_directory: '', link_resolved_target_path: null }]))])),
    ...(graph.folderScope && { folderScope: { ...graph.folderScope, skippedPaths: graph.folderScope.skippedPaths.filter(item => filenames.has(item.path)) } }),
    edges: graph.edges.filter(edge => keys.has(edge.source) && keys.has(edge.target)),
    allInlinkSources: links(graph.allInlinkSources), allOutlinkTargets: links(graph.allOutlinkTargets),
  } : undefined };
}

import { encodedBundleNodeKey, bundleNodeKeySourceGraphPath, fileNodeKeyFromSourceFilePath, serializeBundleNodeKey } from '../../../../../shared_code/utils/bundleNodeKey.js';

import type { EncodedBundleNodeKey } from '../../../../../contracts/types/bundleNodeKey.js';
