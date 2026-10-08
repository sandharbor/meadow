/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

export function contentLines(content: string): string[] { return content === '' ? [] : content.split('\n'); }

/** Counts the same line changes shown in the content comparison, without inline highlights. */
export function lineChangeCounts(before: string | null, after: string | null): { added: number; removed: number } {
  if (before === after) return { added: 0, removed: 0 };
  const oldLines = contentLines(before ?? '');
  const newLines = contentLines(after ?? '');
  const unchanged = computeLCS(oldLines, newLines).length;
  return { added: newLines.length - unchanged, removed: oldLines.length - unchanged };
}

interface LCSMatch {
  oldIndex: number;
  newIndex: number;
}

// Compute longest common subsequence
export function computeLCS(oldLines: string[], newLines: string[]): LCSMatch[] {
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines[oldLines.length - suffix - 1] === newLines[newLines.length - suffix - 1]) suffix += 1;
  if (prefix || suffix) {
    return [
      ...Array.from({ length: prefix }, (_, index) => ({ oldIndex: index, newIndex: index })),
      ...computeLCS(oldLines.slice(prefix, oldLines.length - suffix), newLines.slice(prefix, newLines.length - suffix)).map(match => ({ oldIndex: match.oldIndex + prefix, newIndex: match.newIndex + prefix })),
      ...Array.from({ length: suffix }, (_, index) => ({ oldIndex: oldLines.length - suffix + index, newIndex: newLines.length - suffix + index })),
    ];
  }
  // A large replacement remains an accurate deletion/addition without allocating an unbounded table.
  if (oldLines.length * newLines.length > 4_000_000) return [];
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find LCS
  const matches: LCSMatch[] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      matches.unshift({ oldIndex: i - 1, newIndex: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return matches;
}
