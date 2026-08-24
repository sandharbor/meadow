/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React, { useMemo, useState } from 'react';
import { HtmlVisualDiffer } from './HtmlVisualDiffer';

interface DiffViewProps {
  originalContent: string | null;
  currentContent: string;
  isNewFile: boolean;
  /** Optional file path - used to resolve relative URLs in styled HTML diff */
  filePath?: string;
}

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed' | 'header';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

// A chunk is either a group of changes or a group of unchanged lines
interface DiffChunk {
  id: number;
  type: 'changes' | 'unchanged';
  lines: DiffLine[];
}

// How many context lines to show around changes
const CONTEXT_LINES = 3;
// Minimum hidden lines to show collapse (if fewer, just show all)
const MIN_COLLAPSE_LINES = 4;

// Simple diff algorithm - computes line-by-line differences
function computeDiff(original: string, current: string): DiffLine[] {
  const originalLines = original.split('\n');
  const currentLines = current.split('\n');
  const diffLines: DiffLine[] = [];

  // Use LCS-based diff algorithm for better results
  const lcs = computeLCS(originalLines, currentLines);
  
  let oldIdx = 0;
  let newIdx = 0;
  let oldLineNum = 1;
  let newLineNum = 1;

  for (const match of lcs) {
    // Add removed lines (in original but not in current before this match)
    while (oldIdx < match.oldIndex) {
      diffLines.push({
        type: 'removed',
        content: originalLines[oldIdx],
        oldLineNum: oldLineNum++,
      });
      oldIdx++;
    }

    // Add added lines (in current but not in original before this match)
    while (newIdx < match.newIndex) {
      diffLines.push({
        type: 'added',
        content: currentLines[newIdx],
        newLineNum: newLineNum++,
      });
      newIdx++;
    }

    // Add unchanged line
    diffLines.push({
      type: 'unchanged',
      content: originalLines[oldIdx],
      oldLineNum: oldLineNum++,
      newLineNum: newLineNum++,
    });
    oldIdx++;
    newIdx++;
  }

  // Add remaining removed lines
  while (oldIdx < originalLines.length) {
    diffLines.push({
      type: 'removed',
      content: originalLines[oldIdx],
      oldLineNum: oldLineNum++,
    });
    oldIdx++;
  }

  // Add remaining added lines
  while (newIdx < currentLines.length) {
    diffLines.push({
      type: 'added',
      content: currentLines[newIdx],
      newLineNum: newLineNum++,
    });
    newIdx++;
  }

  return diffLines;
}

interface LCSMatch {
  oldIndex: number;
  newIndex: number;
}

// Compute longest common subsequence
function computeLCS(oldLines: string[], newLines: string[]): LCSMatch[] {
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

// Group diff lines into chunks of changes and unchanged sections
function groupIntoChunks(diffLines: DiffLine[]): DiffChunk[] {
  const chunks: DiffChunk[] = [];
  let currentChunk: DiffChunk | null = null;
  let chunkId = 0;

  for (const line of diffLines) {
    const isChange = line.type === 'added' || line.type === 'removed';
    const chunkType = isChange ? 'changes' : 'unchanged';

    if (!currentChunk || currentChunk.type !== chunkType) {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = {
        id: chunkId++,
        type: chunkType,
        lines: [],
      };
    }

    currentChunk.lines.push(line);
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

interface DiffLineRowProps {
  line: DiffLine;
}

const DiffLineRow: React.FC<DiffLineRowProps> = ({ line }) => (
  <tr
    className={
      line.type === 'added'
        ? 'bg-success-50'
        : line.type === 'removed'
        ? 'bg-danger-50'
        : ''
    }
  >
    {/* Old line number */}
    <td className="w-12 px-2 py-0.5 text-right text-neutral-400 select-none border-r border-neutral-200 bg-neutral-50">
      {line.oldLineNum ?? ''}
    </td>
    {/* New line number */}
    <td className="w-12 px-2 py-0.5 text-right text-neutral-400 select-none border-r border-neutral-200 bg-neutral-50">
      {line.newLineNum ?? ''}
    </td>
    {/* Diff indicator */}
    <td
      className={`w-6 px-1 py-0.5 text-center select-none ${
        line.type === 'added'
          ? 'text-success-600 bg-success-100'
          : line.type === 'removed'
          ? 'text-danger-600 bg-danger-100'
          : 'text-neutral-300'
      }`}
    >
      {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
    </td>
    {/* Content */}
    <td className="px-2 py-0.5 whitespace-pre">
      {line.content || ' '}
    </td>
  </tr>
);

interface CollapsedSectionProps {
  hiddenCount: number;
  onExpand: () => void;
  startOldLine?: number;
  startNewLine?: number;
  endOldLine?: number;
  endNewLine?: number;
}

const CollapsedSection: React.FC<CollapsedSectionProps> = ({
  hiddenCount,
  onExpand,
  startOldLine,
  endOldLine,
}) => (
  <tr className="bg-neutral-100 border-y border-neutral-300">
    <td colSpan={4} className="py-1 text-center">
      <button
        onClick={onExpand}
        className="px-3 py-0.5 text-xs text-neutral-600 hover:text-neutral-800 hover:bg-neutral-200 rounded transition-colors"
      >
        <span className="inline-flex items-center gap-1.5">
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
          Show {hiddenCount} unchanged line{hiddenCount !== 1 ? 's' : ''}
          {startOldLine && endOldLine && (
            <span className="text-neutral-400 ml-1">
              (lines {startOldLine}–{endOldLine})
            </span>
          )}
        </span>
      </button>
    </td>
  </tr>
);

interface UnchangedChunkProps {
  chunk: DiffChunk;
  isFirst: boolean;
  isLast: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const UnchangedChunk: React.FC<UnchangedChunkProps> = ({
  chunk,
  isFirst,
  isLast,
  isExpanded,
  onToggleExpand,
}) => {
  const lines = chunk.lines;
  const totalLines = lines.length;

  // Calculate how many lines to show at start/end
  const showAtStart = isFirst ? 0 : CONTEXT_LINES;
  const showAtEnd = isLast ? 0 : CONTEXT_LINES;
  const minToShow = showAtStart + showAtEnd;
  
  // If there aren't enough lines to hide, or it's expanded, show all
  const hiddenCount = totalLines - minToShow;
  const shouldCollapse = !isExpanded && hiddenCount >= MIN_COLLAPSE_LINES;

  if (!shouldCollapse) {
    // Show all lines (either expanded or not enough to collapse)
    return (
      <>
        {lines.map((line, idx) => (
          <DiffLineRow key={`${chunk.id}-${idx}`} line={line} />
        ))}
      </>
    );
  }

  // Show with collapse
  const startLines = lines.slice(0, showAtStart);
  const endLines = lines.slice(totalLines - showAtEnd);
  const hiddenLines = lines.slice(showAtStart, totalLines - showAtEnd);

  return (
    <>
      {startLines.map((line, idx) => (
        <DiffLineRow key={`${chunk.id}-start-${idx}`} line={line} />
      ))}
      <CollapsedSection
        hiddenCount={hiddenLines.length}
        onExpand={onToggleExpand}
        startOldLine={hiddenLines[0]?.oldLineNum}
        startNewLine={hiddenLines[0]?.newLineNum}
        endOldLine={hiddenLines[hiddenLines.length - 1]?.oldLineNum}
        endNewLine={hiddenLines[hiddenLines.length - 1]?.newLineNum}
      />
      {endLines.map((line, idx) => (
        <DiffLineRow key={`${chunk.id}-end-${idx}`} line={line} />
      ))}
    </>
  );
};

const DiffView: React.FC<DiffViewProps> = ({ originalContent, currentContent, isNewFile, filePath }) => {
  console.log('[DiffView] Component rendering', { 
    isNewFile, 
    originalContentLength: originalContent?.length,
    currentContentLength: currentContent?.length,
    filePath 
  });

  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set());
  const [htmlMode, setHtmlMode] = useState<'visual' | 'code'>('visual');

  const isProbablyHtml = useMemo(() => {
    const s = (currentContent || '').trimStart().toLowerCase();
    if (s.startsWith('<!doctype html')) return true;
    if (s.startsWith('<html')) return true;
    // Heuristic: if it contains an <html> tag near the top, treat as HTML
    if (s.slice(0, 5000).includes('<html')) return true;
    return false;
  }, [currentContent]);

  const visualHtmlDiff = useMemo(() => {
    if (!isProbablyHtml) return null;
    try {
      return HtmlVisualDiffer.diffToHtmlDocument(originalContent, currentContent);
    } catch (e) {
      return { kind: 'unsupported' as const, reason: e instanceof Error ? e.message : 'Failed to compute visual diff' };
    }
  }, [isProbablyHtml, originalContent, currentContent]);

  const diffLines = useMemo((): DiffLine[] => {
    console.log('[DiffView] Computing diffLines...', { isNewFile, hasOriginal: originalContent !== null });
    try {
      if (isNewFile || originalContent === null) {
        // All lines are new
        const lines = currentContent.split('\n').map((line, idx): DiffLine => ({
          type: 'added',
          content: line,
          newLineNum: idx + 1,
        }));
        console.log('[DiffView] diffLines computed (new file)', { lineCount: lines.length });
        return lines;
      }

      if (originalContent === currentContent) {
        // No changes
        const lines = currentContent.split('\n').map((line, idx): DiffLine => ({
          type: 'unchanged',
          content: line,
          oldLineNum: idx + 1,
          newLineNum: idx + 1,
        }));
        console.log('[DiffView] diffLines computed (no changes)', { lineCount: lines.length });
        return lines;
      }

      console.log('[DiffView] Computing diff between original and current...');
      const lines = computeDiff(originalContent, currentContent);
      console.log('[DiffView] diffLines computed (with changes)', { lineCount: lines.length });
      return lines;
    } catch (err) {
      console.error('[DiffView] Error computing diffLines:', err);
      throw err;
    }
  }, [originalContent, currentContent, isNewFile]);

  const chunks = useMemo(() => groupIntoChunks(diffLines), [diffLines]);

  const stats = useMemo(() => {
    const added = diffLines.filter((l) => l.type === 'added').length;
    const removed = diffLines.filter((l) => l.type === 'removed').length;
    return { added, removed };
  }, [diffLines]);

  const hasChanges = stats.added > 0 || stats.removed > 0;

  const toggleChunk = (chunkId: number) => {
    setExpandedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(chunkId)) {
        next.delete(chunkId);
      } else {
        next.add(chunkId);
      }
      return next;
    });
  };

  const expandAll = () => {
    const unchangedChunkIds = chunks
      .filter((c) => c.type === 'unchanged')
      .map((c) => c.id);
    setExpandedChunks(new Set(unchangedChunkIds));
  };

  const collapseAll = () => {
    setExpandedChunks(new Set());
  };

  const hasCollapsibleSections = chunks.some(
    (chunk, idx) => {
      if (chunk.type !== 'unchanged') return false;
      const isFirst = idx === 0;
      const isLast = idx === chunks.length - 1;
      const showAtStart = isFirst ? 0 : CONTEXT_LINES;
      const showAtEnd = isLast ? 0 : CONTEXT_LINES;
      return chunk.lines.length - showAtStart - showAtEnd >= MIN_COLLAPSE_LINES;
    }
  );

  const allExpanded = hasCollapsibleSections && 
    chunks.every((c) => c.type !== 'unchanged' || expandedChunks.has(c.id));

  if (isProbablyHtml) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        {/* Header w/ mode toggle */}
        <div className="flex-shrink-0 px-4 py-2 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-neutral-600">View:</span>
            <div className="inline-flex rounded-lg overflow-hidden border border-neutral-200">
              <button
                onClick={() => setHtmlMode('visual')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  htmlMode === 'visual'
                    ? 'bg-white text-brand-600'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
                title="Show rendered text changes (plain text diff)"
              >
                Text
              </button>
              <button
                onClick={() => setHtmlMode('code')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  htmlMode === 'code'
                    ? 'bg-white text-brand-600'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
                title="Show raw HTML code diff"
              >
                Code
              </button>
            </div>
          </div>

          {/* Stats display */}
          {htmlMode === 'visual' && visualHtmlDiff?.kind === 'visual' ? (
            <div className="text-xs text-neutral-500">
              {visualHtmlDiff.hasVisibleChanges ? (
                <>
                  <span className="text-success-600 font-medium">+{visualHtmlDiff.stats.added}</span>
                  <span className="mx-2">·</span>
                  <span className="text-danger-600 font-medium">−{visualHtmlDiff.stats.removed}</span>
                </>
              ) : (
                <span>No visible changes</span>
              )}
            </div>
          ) : null}
        </div>

        {htmlMode === 'visual' ? (
          <div className="flex-1 overflow-hidden bg-white">
            {visualHtmlDiff?.kind === 'visual' ? (
              <div className="h-full flex flex-col overflow-hidden">
                {!visualHtmlDiff.hasVisibleChanges && visualHtmlDiff.notes?.length ? (
                  <div className="flex-shrink-0 px-4 py-2 bg-warning-50 border-b border-warning-200 text-warning-800 text-sm">
                    {visualHtmlDiff.notes[0]}
                  </div>
                ) : null}
                <iframe
                  title="Visual HTML Diff"
                  className="w-full flex-1 border-0"
                  sandbox="allow-same-origin"
                  srcDoc={visualHtmlDiff.html}
                />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-neutral-500">
                Text diff unavailable. Switch to &ldquo;Code&rdquo;.
              </div>
            )}
          </div>
        ) : (
          // Fall through to code diff UI below
          <div className="flex-1 flex flex-col min-h-0">
            {/* Stats header (code diff) */}
            <div className="flex-shrink-0 px-4 py-2 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
              <div className="flex items-center gap-4">
                {hasChanges ? (
                  <>
                    <span className="text-sm text-neutral-600">
                      {isNewFile ? 'New file' : 'Changes'}:
                    </span>
                    {stats.added > 0 && (
                      <span className="text-sm text-success-600 font-medium">+{stats.added}</span>
                    )}
                    {stats.removed > 0 && (
                      <span className="text-sm text-danger-600 font-medium">-{stats.removed}</span>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-neutral-500">No changes</span>
                )}
              </div>
              {hasCollapsibleSections && (
                <button
                  onClick={allExpanded ? collapseAll : expandAll}
                  className="text-xs text-neutral-500 hover:text-neutral-700 transition-colors"
                >
                  {allExpanded ? 'Collapse all' : 'Expand all'}
                </button>
              )}
            </div>

            {/* Diff content */}
            <div className="flex-1 min-h-0 overflow-auto font-mono text-sm">
              <table className="w-full border-collapse">
                <tbody>
                  {chunks.map((chunk, idx) => {
                    if (chunk.type === 'changes') {
                      return chunk.lines.map((line, lineIdx) => (
                        <DiffLineRow key={`${chunk.id}-${lineIdx}`} line={line} />
                      ));
                    }

                    return (
                      <UnchangedChunk
                        key={chunk.id}
                        chunk={chunk}
                        isFirst={idx === 0}
                        isLast={idx === chunks.length - 1}
                        isExpanded={expandedChunks.has(chunk.id)}
                        onToggleExpand={() => toggleChunk(chunk.id)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Stats header */}
      <div className="flex-shrink-0 px-4 py-2 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {hasChanges ? (
            <>
              <span className="text-sm text-neutral-600">
                {isNewFile ? 'New file' : 'Changes'}:
              </span>
              {stats.added > 0 && (
                <span className="text-sm text-success-600 font-medium">+{stats.added}</span>
              )}
              {stats.removed > 0 && (
                <span className="text-sm text-danger-600 font-medium">-{stats.removed}</span>
              )}
            </>
          ) : (
            <span className="text-sm text-neutral-500">No changes</span>
          )}
        </div>
        {hasCollapsibleSections && (
          <button
            onClick={allExpanded ? collapseAll : expandAll}
            className="text-xs text-neutral-500 hover:text-neutral-700 transition-colors"
          >
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </button>
        )}
      </div>

      {/* Diff content */}
      <div className="flex-1 min-h-0 overflow-auto font-mono text-sm">
        <table className="w-full border-collapse">
          <tbody>
            {chunks.map((chunk, idx) => {
              if (chunk.type === 'changes') {
                return chunk.lines.map((line, lineIdx) => (
                  <DiffLineRow key={`${chunk.id}-${lineIdx}`} line={line} />
                ));
              }

              return (
                <UnchangedChunk
                  key={chunk.id}
                  chunk={chunk}
                  isFirst={idx === 0}
                  isLast={idx === chunks.length - 1}
                  isExpanded={expandedChunks.has(chunk.id)}
                  onToggleExpand={() => toggleChunk(chunk.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DiffView;
