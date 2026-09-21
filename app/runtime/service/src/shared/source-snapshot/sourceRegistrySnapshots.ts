/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import type { BundleConfig, BundleSource } from '../../../../../contracts/types/bundleConfig.js';
import type { BundleNodeConfig } from '../../../../../contracts/types/bundleNodeConfig.js';
import { LEGACY_SOURCE_ID, sourceGraphPath, splitSourceGraphPath } from '../../../../../shared_code/utils/bundleSourceUtils.js';
import type { SourceSnapshot } from './sourceSnapshots.js';
import { sourcePath, SourcingError } from './sourceSnapshots.js';

/** Historical graphs always resolve against their captured names and aliases. */
export function snapshotSourceRegistry(snapshot: SourceSnapshot, root: string): BundleSource[] | undefined {
  if (!snapshot.sources) return undefined;
  if (snapshot.transientSourceRoot && !snapshot.transientComposed) return snapshot.sources;
  return snapshot.sources.map(source => ({ ...source, directory: sourcePath(root, sourceGraphPath(source.id, '')) }));
}

export function discoveredSourcePath(snapshot: SourceSnapshot, relative: string): string {
  if (!snapshot.transientSourceRoot) throw new SourcingError('Live source material is unavailable.');
  if (!snapshot.sources || snapshot.transientComposed) return sourcePath(snapshot.transientSourceRoot, relative);
  const { sourceId, relativePath } = splitSourceGraphPath(relative, snapshot.sources);
  const source = snapshot.sources.find(source => source.id === sourceId)!;
  const filename = sourcePath(source.directory, relativePath);
  const root = fs.realpathSync(source.directory);
  const canonical = fs.realpathSync(filename);
  if (canonical !== root && !canonical.startsWith(`${root}${path.sep}`)) throw new SourcingError(`Source file left the configured boundary: ${relative}`);
  return canonical;
}

export function copyDiscoveredSources(snapshot: SourceSnapshot, destination: string): void {
  for (const directory of snapshot.directories) fs.mkdirSync(sourcePath(destination, directory), { recursive: true });
  for (const relative of Object.keys(snapshot.files)) {
    const target = sourcePath(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(discoveredSourcePath(snapshot, relative), target);
  }
}

/** Legacy snapshots retain their original storage layout after a bundle adopts sources. */
export function nodeInSnapshot(snapshot: SourceSnapshot, node: BundleNodeConfig): BundleNodeConfig {
  if (node.bundleNodeKind === 'collection') return node;
  if (snapshot.sources && !node.sourceId) return { ...node, sourceId: LEGACY_SOURCE_ID };
  if (!snapshot.sources && node.sourceId === LEGACY_SOURCE_ID) {
    const copy = { ...node };
    delete copy.sourceId;
    return copy;
  }
  return node;
}

export function nodesInSnapshot(snapshot: SourceSnapshot, nodes: BundleNodeConfig[]): BundleNodeConfig[] {
  return nodes.map(node => nodeInSnapshot(snapshot, node))
    .filter(node => snapshot.sources || !node.sourceId);
}

/** Proposal settings apply only while this snapshot is the pending candidate. */
export function sourceProposalContext(config: BundleConfig, nodes: BundleNodeConfig[], snapshot?: SourceSnapshot): { config: BundleConfig; nodes: BundleNodeConfig[] } {
  const proposal = snapshot?.sourceProposal;
  if (!proposal) return { config, nodes };
  const explicit = { ...config };
  delete explicit.sourceDirectory;
  return { config: { ...explicit, sources: proposal.sources, sourceOutputLayout: proposal.sourceOutputLayout,
    entryBundleNodeId: proposal.entryBundleNodeId, defaultTraversalBundleNodeId: proposal.defaultTraversalBundleNodeId }, nodes: proposal.nodes };
}

/** A legacy page and its first explicit registration share the same identity. */
export function snapshotPathIdentity(snapshot: SourceSnapshot, relative: string): string {
  return snapshot.sources ? relative : sourceGraphPath(LEGACY_SOURCE_ID, relative);
}

export function equivalentSnapshotPath(from: SourceSnapshot, to: SourceSnapshot, relative: string): string {
  if (Boolean(from.sources) === Boolean(to.sources)) return relative;
  if (!from.sources) return sourceGraphPath(LEGACY_SOURCE_ID, relative);
  const prefix = sourceGraphPath(LEGACY_SOURCE_ID, '') + '/';
  return relative.startsWith(prefix) ? relative.slice(prefix.length) : relative;
}
