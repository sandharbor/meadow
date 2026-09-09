/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import type { BundleNodeConfig } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import type { SourceMoveCandidate } from '../../../../../../../contracts/types/sourcing.js';
import { snapshotFilePath, snapshotSourceRoot, sourcePath, type SourceSnapshot } from '../../../../shared/source-snapshot/sourceSnapshots.js';

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

function directoryMove(move: SourceMoveCandidate): { from: string; to: string } | undefined {
  const from = path.posix.dirname(move.oldPath).split('/');
  const to = path.posix.dirname(move.newPath).split('/');
  while (from.length && to.length && from.at(-1) === to.at(-1)) { from.pop(); to.pop(); }
  if (!from.length || !to.length || from.includes('.') || to.includes('.')) return;
  return { from: from.join('/'), to: to.join('/') };
}

function renamedWord(move: SourceMoveCandidate): { from: string; to: string } | undefined {
  const from = words(path.posix.basename(move.oldPath));
  const to = words(path.posix.basename(move.newPath));
  while (from.length && to.length && from[0] === to[0]) { from.shift(); to.shift(); }
  while (from.length && to.length && from.at(-1) === to.at(-1)) { from.pop(); to.pop(); }
  if (from.length === 1 && to.length === 1 && from[0].length >= 3 && to[0].length >= 3) return { from: from[0], to: to[0] };
}

function wordOverlap(before: string, after: string, renames: Map<string, string>): number {
  const counts = (text: string, normalize: boolean) => {
    const result = new Map<string, number>();
    for (let word of words(text)) {
      if (normalize) word = renames.get(word) ?? (word.endsWith('s') && renames.has(word.slice(0, -1)) ? `${renames.get(word.slice(0, -1))}s` : word);
      result.set(word, (result.get(word) ?? 0) + 1);
    }
    return result;
  };
  const left = counts(before, true);
  const right = counts(after, false);
  const size = (value: Map<string, number>) => [...value.values()].reduce((sum, count) => sum + count, 0);
  const denominator = Math.max(size(left), size(right));
  return denominator ? [...left].reduce((sum, [word, count]) => sum + Math.min(count, right.get(word) ?? 0), 0) / denominator : 0;
}

/** Extend a corroborated directory move to related pages whose links were rewritten. */
export function findGroupedSourceMoves(bundleDirectory: string, previous: SourceSnapshot, current: SourceSnapshot, configs: BundleNodeConfig[], matches: SourceMoveCandidate[]): SourceMoveCandidate[] {
  const groups = new Map<string, { from: string; to: string; anchors: SourceMoveCandidate[] }>();
  for (const match of matches) {
    if (match.confidence !== 'strong' || match.competing) continue;
    const directory = directoryMove(match);
    if (!directory || Object.keys(current.files).some(filename => filename.startsWith(`${directory.from}/`))) continue;
    const key = `${directory.from}\0${directory.to}`;
    const group = groups.get(key) ?? { ...directory, anchors: [] };
    group.anchors.push(match);
    groups.set(key, group);
  }
  const alreadyMatched = new Set(matches.map(match => match.bundleNodeId));
  const configuredPaths = new Set(configs.map(config => snapshotFilePath(current, config)));
  const result: SourceMoveCandidate[] = [];
  for (const group of groups.values()) {
    if (new Set(group.anchors.map(anchor => anchor.bundleNodeId)).size < 2) continue;
    // A filename substitution also needs independent support; one unusual name
    // must not become a rewrite rule for every other file in the directory.
    const substitutions = new Map<string, Map<string, number>>();
    for (const anchor of group.anchors) {
      const rename = renamedWord(anchor);
      if (!rename) continue;
      const targets = substitutions.get(rename.from) ?? new Map<string, number>();
      targets.set(rename.to, (targets.get(rename.to) ?? 0) + 1);
      substitutions.set(rename.from, targets);
    }
    const renames = new Map([...substitutions].flatMap(([from, targets]) => targets.size === 1 && [...targets.values()][0] >= 2 ? [[from, [...targets.keys()][0]] as const] : []));
    for (const config of configs) {
      if (config.bundleNodeKind !== 'file' || alreadyMatched.has(config.bundleNodeId)) continue;
      const oldPath = snapshotFilePath(previous, config);
      if (!oldPath.startsWith(`${group.from}/`) || !previous.files[oldPath] || current.files[snapshotFilePath(current, config)]) continue;
      const suffix = oldPath.slice(group.from.length + 1).replace(/[\p{L}\p{N}]+/gu, word => renames.get(word.toLowerCase()) ?? word);
      const newPath = `${group.to}/${suffix}`;
      if (!current.files[newPath] || configuredPaths.has(newPath)) continue;
      const exact = previous.files[oldPath].digest === current.files[newPath].digest;
      if (!exact && !/\.(md|html|txt)$/i.test(oldPath)) continue;
      const similarity = exact ? 1 : wordOverlap(
        fs.readFileSync(sourcePath(snapshotSourceRoot(bundleDirectory, previous.id, previous), oldPath), 'utf8'),
        fs.readFileSync(sourcePath(snapshotSourceRoot(bundleDirectory, current.id, current), newPath), 'utf8'), renames,
      );
      if (similarity < 0.9) continue;
      result.push({ bundleNodeId: config.bundleNodeId, oldPath, newPath, confidence: 'possible', competing: false,
        evidence: [`Follows the folder move shared by ${group.anchors.length} matched pages`, exact ? 'Identical file contents' : `${Math.round(similarity * 100)}% word overlap after the shared rename`],
        previousRoute: previous.graph?.nodes.find(node => node.bundleNodeKey === oldPath)?.path ?? [],
        currentRoute: current.graph?.nodes.find(node => node.bundleNodeKey === newPath)?.path ?? [],
      });
    }
  }
  const unique = [...new Map(result.map(move => [`${move.bundleNodeId}\0${move.newPath}`, move])).values()];
  for (const move of unique) {
    if (unique.some(other => other.bundleNodeId === move.bundleNodeId && other.newPath !== move.newPath)) move.competing = true;
  }
  return unique;
}
