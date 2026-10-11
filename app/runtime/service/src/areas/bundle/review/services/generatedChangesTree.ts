/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'path';
import type {
  GeneratedChangeEntry,
  GeneratedComparisonEndpointKind,
} from '../../../../../../../contracts/types/generatedOutputIdentity.js';
import type { ResolvedGeneratedComparison } from '../../../../shared/generated-bundle-versioning/generatedOutputComparison.js';
import { buildFileTree, type FileNode } from '../../../../shared/utils/configFileExplorerUtils.js';

/** A changed file as Review presents it: one logical change per node. */
export interface GeneratedChangeNodeDetails {
  entryId: string;
  kind: GeneratedChangeEntry['kind'];
  moved: boolean;
  modified: boolean;
  before: (GeneratedChangeEntry['before'] & { endpoint: GeneratedComparisonEndpointKind; versionId: string | null }) | null;
  after: (GeneratedChangeEntry['after'] & { endpoint: GeneratedComparisonEndpointKind; versionId: string | null }) | null;
}

export interface GeneratedChangeFileNode extends FileNode {
  comparison?: GeneratedChangeNodeDetails;
  children?: GeneratedChangeFileNode[];
}

export function changeStatus(entry: GeneratedChangeEntry): string {
  if (entry.kind === 'added') return 'new';
  if (entry.kind === 'deleted') return 'deleted';
  return entry.modified ? 'modified' : 'moved';
}

/** The path a change is listed under: a move appears once, at its destination. */
export function displayedRelativePath(entry: GeneratedChangeEntry): string {
  return (entry.after ?? entry.before)!.path;
}

export function changeNodeDetails(comparison: ResolvedGeneratedComparison, entry: GeneratedChangeEntry): GeneratedChangeNodeDetails {
  return {
    entryId: entry.entryId,
    kind: entry.kind,
    moved: entry.moved,
    modified: entry.modified,
    before: entry.before && { ...entry.before, endpoint: comparison.left.kind, versionId: comparison.left.versionId },
    after: entry.after && { ...entry.after, endpoint: comparison.right.kind, versionId: comparison.right.versionId },
  };
}

function sortNodes(nodes: GeneratedChangeFileNode[]): void {
  nodes.sort((left, right) => {
    if (left.type !== right.type) return left.type === 'directory' ? -1 : 1;
    return left.name.localeCompare(right.name)
      || (left.comparison?.entryId ?? '').localeCompare(right.comparison?.entryId ?? '');
  });
  for (const node of nodes) if (node.children) sortNodes(node.children);
}

/** Changed entries arranged by displayed path under the working version root. */
export function changedEntriesTree(comparison: ResolvedGeneratedComparison, root: string): GeneratedChangeFileNode[] {
  const rootNodes: GeneratedChangeFileNode[] = [];
  const directories = new Map<string, GeneratedChangeFileNode>();
  const childrenOf = (relativeDirectory: string): GeneratedChangeFileNode[] => {
    if (!relativeDirectory) return rootNodes;
    const existing = directories.get(relativeDirectory);
    if (existing) return existing.children!;
    const parent = childrenOf(path.posix.dirname(relativeDirectory) === '.' ? '' : path.posix.dirname(relativeDirectory));
    const node: GeneratedChangeFileNode = {
      name: path.posix.basename(relativeDirectory),
      path: path.join(root, ...relativeDirectory.split('/')),
      type: 'directory',
      children: [],
      gitStatus: 'has-changes',
    };
    directories.set(relativeDirectory, node);
    parent.push(node);
    return node.children!;
  };
  for (const entry of comparison.entries) {
    const relativePath = displayedRelativePath(entry);
    const directory = path.posix.dirname(relativePath) === '.' ? '' : path.posix.dirname(relativePath);
    childrenOf(directory).push({
      name: path.posix.basename(relativePath),
      path: path.join(root, ...relativePath.split('/')),
      type: 'file',
      gitStatus: changeStatus(entry),
      comparison: changeNodeDetails(comparison, entry),
    });
  }
  sortNodes(rootNodes);
  return rootNodes;
}

/** Every working file, marked with the change that produced it. */
export function workingFilesTree(comparison: ResolvedGeneratedComparison, root: string): FileNode[] {
  const statuses = new Map<string, string>();
  for (const entry of comparison.entries) {
    if (entry.after) statuses.set(path.join(root, ...entry.after.path.split('/')), changeStatus(entry));
  }
  return buildFileTree(root, statuses);
}
