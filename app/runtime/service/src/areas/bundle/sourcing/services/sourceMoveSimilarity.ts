/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'node:path';
import { createHash } from 'node:crypto';
import type { SourceMoveSimilarity } from '../../../../../../../contracts/types/sourcing.js';
import { sourceFilePathToBundleNodeKey } from '../../../../shared/bundle-node/nodeKeys.js';
import type { SourceSnapshot } from '../../../../shared/source-snapshot/sourceSnapshots.js';

export function sourceTextProfile(contents: string) {
  const blocks = new Map<string, number>();
  for (const block of contents.split(/\n\s*\n/)) {
    const normalized = block.replace(/\s+/g, ' ').trim();
    if (normalized.length >= 20) blocks.set(createHash('sha256').update(normalized).digest('hex'), normalized.length);
  }
  return { blocks, length: contents.trim().length };
}

export function sourceMoveSimilarity({ oldPath, newPath, exact, before, after, previous, current, folder, group }: {
  oldPath: string; newPath: string; exact: boolean;
  before?: ReturnType<typeof sourceTextProfile>; after?: ReturnType<typeof sourceTextProfile>;
  previous: SourceSnapshot; current: SourceSnapshot;
  folder?: boolean; group?: { anchors: number; overlap: number };
}): SourceMoveSimilarity {
  const criteria: SourceMoveSimilarity['criteria'] = [];
  const add = (id: SourceMoveSimilarity['criteria'][number]['id'], label: string, score: number | null, weight: number, detail: string) => criteria.push({ id, label, score, weight, detail });
  const text = before !== undefined && after !== undefined;
  const substantial = text && Math.max(before.blocks.size, after.blocks.size) > 0;
  const shared = text ? [...before.blocks].filter(([hash]) => after.blocks.has(hash)) : [];
  const size = (blocks: Map<string, number>) => [...blocks.values()].reduce((sum, length) => sum + length, 0);
  const overlap = substantial ? shared.reduce((sum, [, length]) => sum + length, 0) / Math.max(size(before.blocks), size(after.blocks)) : null;
  // Identical short text carries less information; blank text carries none.
  const contentStrength = text ? Math.min(1, Math.min(before.length, after.length) / 20) : 1;
  add('contents', 'Identical non-blank file contents', folder ? null : exact ? contentStrength : 0, !folder && exact ? 0.75 : 0,
    folder ? 'Folder comparison uses relative file paths and contents below.' : !exact ? 'File contents differ.' : contentStrength === 0 ? 'Both files contain only whitespace; this provides no identity evidence.' : contentStrength < 1 ? 'Identical, but very short text provides limited identity evidence.' : 'Identical non-blank file contents');
  add('blocks', 'Substantial blocks', !folder && text ? overlap : null, !folder && !exact && !group ? 0.75 : 0,
    folder || !text ? 'Not applicable to this source type.' : !substantial ? 'Neither file has a substantial block of at least 20 characters.' : `${shared.length} of ${before.blocks.size} substantial blocks unchanged; ${after.blocks.size} in the proposed file. Overlap is weighted by block length.`);
  const tokens = (value: string) => new Set(path.basename(value, path.extname(value)).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const a = tokens(oldPath), b = tokens(newPath);
  const sameName = path.basename(oldPath) === path.basename(newPath);
  const name = sameName ? 1 : [...a].filter(token => b.has(token)).length / Math.max(a.size, b.size, 1);
  add('filename', 'Filename', folder ? null : name, folder ? 0 : 0.15, folder ? 'Folder contents are compared instead.' : sameName ? 'Same filename' : name ? 'Shared words in the filename, excluding the extension.' : 'No filename words in common.');
  for (const [id, label, field] of [['incoming', 'Incoming links', 'allInlinkSources'], ['outgoing', 'Outgoing links', 'allOutlinkTargets']] as const) {
    const left = previous.graph?.[field][sourceFilePathToBundleNodeKey(oldPath)];
    const right = current.graph?.[field][sourceFilePathToBundleNodeKey(newPath)];
    const available = !folder && Boolean(previous.graph && current.graph && (left?.length || right?.length));
    const same = Boolean(left?.length && right?.length && [...left].sort().join('\0') === [...right].sort().join('\0'));
    add(id, label, available ? Number(same) : null, folder ? 0 : 0.05, !available ? 'No comparable links recorded.' : same ? `Same ${label.toLowerCase()}` : 'The recorded link sets differ.');
  }
  add('folderMove', 'Shared folder move', group ? 1 : null, group && !exact ? 0.1 : 0,
    group ? `Follows the folder move shared by ${group.anchors} matched pages` : 'No corroborated folder move used for this candidate.');
  add('words', 'Words after shared rename', group && !exact ? group.overlap : null, group && !exact ? 0.65 : 0,
    group && !exact ? `${Math.round(group.overlap * 100)}% word overlap after the shared rename` : 'Used for rewritten text in a corroborated folder move.');
  add('folderContents', 'Folder contents and paths', folder ? 1 : null, folder ? 1 : 0,
    folder ? 'Identical folder contents and relative file paths' : 'Not applicable to a file.');
  return { score: criteria.reduce((sum, criterion) => sum + (criterion.score ?? 0) * criterion.weight, 0), criteria };
}
