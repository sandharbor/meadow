/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'node:path';
import type { SourceSnapshot, SnapshotFile } from './sourceSnapshots.js';
import type { WorkingGraphRustOutput } from '../bundle-graph/workingGraphService.js';
import { sha256 } from './sourceSnapshots.js';

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

export function sourceInventory(files: Record<string, SnapshotFile>, directories: string[]) {
  const sortedFiles = Object.fromEntries(Object.keys(files).sort().map(filename => [filename, { digest: files[filename].digest, size: files[filename].size }]));
  const sortedDirectories = [...new Set(directories)].sort();
  return { files: sortedFiles, directories: sortedDirectories, fileCount: Object.keys(sortedFiles).length, digest: sha256(JSON.stringify({ files: sortedFiles, directories: sortedDirectories })) };
}

/** Discovery may inspect the library; the durable projection contains only admitted nodes. */
export function scopeSourceSnapshot(snapshot: SourceSnapshot, graph: WorkingGraphRustOutput | undefined): SourceSnapshot {
  const nodes = (graph?.nodes ?? []).filter(node => !node.isFrontierNode || node.isFrontierImageExtension);
  const keys = new Set(nodes.map(node => node.bundleNodeKey));
  const filenames = new Set(nodes.flatMap(node => {
    const key = node.bundleNodeKey;
    if (node.sourceFile && snapshot.files[node.sourceFile.path]) return [node.sourceFile.path];
    if (snapshot.files[key]) return [key];
    if (node.fileType === 'excalidraw') return [`${key}.md`, key.replace(/\.excalidraw$/, '.md')].filter(filename => snapshot.files[filename]);
    return [];
  }));
  const files = Object.fromEntries(Object.entries(snapshot.files).filter(([filename]) => filenames.has(filename)));
  const directories = new Set(nodes.filter(node => node.bundleNodeKind === 'folder').map(node => node.sourceGraphSubdirectory ?? node.bundleNodeKey));
  for (const filename of Object.keys(files)) {
    let directory = path.posix.dirname(filename);
    while (directory !== '.') { directories.add(directory); directory = path.posix.dirname(directory); }
  }
  directories.delete('');
  const links = (map: Record<string, string[]>) => Object.fromEntries(Object.entries(map).filter(([key]) => keys.has(key)).map(([key, values]) => [key, values.filter(value => keys.has(value))]));
  return { ...snapshot, ...sourceInventory(files, [...directories]), graph: graph ? { ...graph, nodes,
    allLinkResolutionMaps: Object.fromEntries(Object.entries(graph.allLinkResolutionMaps).filter(([key]) => keys.has(key.replace(/^\/+/, ''))).map(([key, resolutions]) => [key, Object.fromEntries(Object.entries(resolutions).map(([link, resolution]) => [link, resolution.link_resolved_target_path && keys.has(resolution.link_resolved_target_path.replace(/^\/+/, '')) ? resolution : { link_resolved_target_directory: '', link_resolved_target_path: null }]))])),
    ...(graph.folderScope && { folderScope: { ...graph.folderScope, skippedPaths: graph.folderScope.skippedPaths.filter(item => keys.has(item.path)) } }),
    edges: graph.edges.filter(edge => keys.has(edge.source) && keys.has(edge.target)),
    allInlinkSources: links(graph.allInlinkSources), allOutlinkTargets: links(graph.allOutlinkTargets),
  } : undefined };
}
