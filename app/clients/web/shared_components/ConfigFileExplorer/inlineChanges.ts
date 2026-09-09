/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { cleanupSemantic, type Diff } from '@sanity/diff-match-patch';

export interface InlineDiffPart { text: string; changed: boolean; }
interface LinePair { diffs: Diff[]; similarity: number; }
export interface InlineDiffBudget { remaining: number; }

function appendDiff(diffs: Diff[], type: Diff[0], text: string) {
  if (!text) return;
  const previous = diffs.at(-1);
  if (previous?.[0] === type) previous[1] += text;
  else diffs.push([type, text]);
}

function segments(diffs: Diff[], excluded: -1 | 1): InlineDiffPart[] {
  const result: InlineDiffPart[] = [];
  for (const [type, text] of diffs) {
    if (type === excluded) continue;
    const changed = type !== 0;
    const previous = result.at(-1);
    if (previous?.changed === changed) previous.text += text;
    else result.push({ text, changed });
  }
  return result;
}

function compareLine(before: string, after: string, budget: InlineDiffBudget): LinePair | null {
  // Optional detail must not stall the view on minified files or large replacements.
  if (before === after || before.length > 20_000 || after.length > 20_000) return null;
  budget.remaining -= before.length + after.length;
  if (budget.remaining < 0) return null;
  const left = Array.from(before);
  const right = Array.from(after);
  const length = Math.max(left.length, right.length);
  if (!length || Math.abs(left.length - right.length) * 10 >= length * 3) return null;

  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix++;
  let suffix = 0;
  while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - suffix - 1] === right[right.length - suffix - 1]) suffix++;
  const m = left.length - prefix - suffix;
  const n = right.length - prefix - suffix;
  const cells = (m + 1) * (n + 1);
  if (cells > budget.remaining) return null;
  budget.remaining -= cells;
  const width = n + 1;
  const lcs = new Uint32Array(cells);
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i * width + j] = left[prefix + i] === right[prefix + j]
        ? 1 + lcs[(i + 1) * width + j + 1]
        : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const common = prefix + suffix + lcs[0];
  // A replacement counts once: highlight only when fewer than 30% of characters differ.
  if ((length - common) * 10 >= length * 3) return null;
  const diffs: Diff[] = [];
  appendDiff(diffs, 0, left.slice(0, prefix).join(''));
  let i = 0; let j = 0;
  while (i < m && j < n) {
    if (left[prefix + i] === right[prefix + j]) {
      appendDiff(diffs, 0, left[prefix + i++]); j++;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) appendDiff(diffs, -1, left[prefix + i++]);
    else appendDiff(diffs, 1, right[prefix + j++]);
  }
  appendDiff(diffs, -1, left.slice(prefix + i, prefix + m).join(''));
  appendDiff(diffs, 1, right.slice(prefix + j, prefix + n).join(''));
  appendDiff(diffs, 0, left.slice(left.length - suffix).join(''));
  return { diffs, similarity: common / length };
}

/** Match similar replacements in order, allowing unmatched inserted or deleted lines. */
export function matchInlineChanges(before: string[], after: string[], budget: InlineDiffBudget) {
  const matches: Array<{ before: InlineDiffPart[]; after: InlineDiffPart[]; beforeIndex: number; afterIndex: number; similarity: number }> = [];
  if (!before.length || !after.length || before.length * after.length > 2_000 || budget.remaining <= 0) return matches;
  const pairs = before.map(left => after.map(right => compareLine(left, right, budget)));
  const width = after.length + 1;
  const scores = new Float64Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      scores[i * width + j] = Math.max(
        scores[(i + 1) * width + j], scores[i * width + j + 1],
        pairs[i][j] ? pairs[i][j]!.similarity + scores[(i + 1) * width + j + 1] : 0,
      );
    }
  }
  let i = 0; let j = 0;
  while (i < before.length && j < after.length) {
    const pair = pairs[i][j];
    if (pair && scores[i * width + j] === pair.similarity + scores[(i + 1) * width + j + 1]) {
      // Clean up only selected pairs. The 30% rule uses actual edits; display
      // spans may absorb incidental matches to make replacements readable.
      const readable = cleanupSemantic(pair.diffs);
      matches.push({ before: segments(readable, 1), after: segments(readable, -1), similarity: pair.similarity, beforeIndex: i++, afterIndex: j++ });
    } else if (scores[(i + 1) * width + j] >= scores[i * width + j + 1]) i++;
    else j++;
  }
  return matches;
}
