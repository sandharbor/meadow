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

// Finds the parts of a Markdown document that are code, so that the text
// passes which run before marked (wikilinks, tags, comments, emoji, block ids)
// and the backlink scan leave code exactly as written.
//
// Block code follows CommonMark:
// - A fence is three or more backticks or tildes, optionally inside block
//   quote markers. It closes on a line with the same character, at least as
//   many of them, and nothing else. An unclosed fence runs to the end.
// - An indented code block starts with four spaces or a tab after a blank
//   line, unless it continues a list item or footnote.
//
// Inline code is a backtick run closed by the next run of exactly the same
// length within the same paragraph. A run without a partner is literal text.
// Headings and table rows are single-line paragraphs; a list item starts a
// new one.
//
// Code nested inside list items and block quotes is approximated: fences are
// recognized at any indentation, and indented code is not looked for there.
//
// Obsidian syntax escaped with a backslash is kept verbatim the same way: an
// escaped wikilink or embed (`\[[Note]]`) and an escaped tag (`\#tag`). marked
// then shows the escaped character as text.

export interface CodeRange {
  start: number;
  end: number;
  kind: 'block' | 'inline' | 'escaped';
}

const FENCE_OPEN = /^((?:[ \t]*>)*)[ \t]*(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^(?:[ \t]*>)*[ \t]*(`{3,}|~{3,})[ \t]*$/;
const INDENTED = /^(?: {4}|\t)/;
const LIST_ITEM = /^[ \t]{0,3}(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
const FOOTNOTE_DEFINITION = /^\[\^[^\]]+\]:/;
const SINGLE_LINE_BLOCK = /^[ \t]{0,3}(?:#{1,6}(?:[ \t]|$)|\|)/;

export function findCodeRanges(markdown: string): CodeRange[] {
  const ranges: CodeRange[] = [];
  const lines = markdown.split('\n');
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  const lineEnd = (index: number) => lineStarts[index] + lines[index].length;

  let paragraphStart: number | null = null;
  let paragraphEnd = 0;
  const flushParagraph = () => {
    if (paragraphStart !== null) {
      ranges.push(...findInlineCode(markdown, paragraphStart, paragraphEnd));
      paragraphStart = null;
    }
  };

  let previousBlank = true;
  let continuesContainer = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const fence = FENCE_OPEN.exec(line);
    if (fence && !(fence[2][0] === '`' && fence[3].includes('`'))) {
      flushParagraph();
      let close = i + 1;
      while (close < lines.length) {
        const closing = FENCE_CLOSE.exec(lines[close]);
        if (closing && closing[1][0] === fence[2][0] && closing[1].length >= fence[2].length) break;
        close++;
      }
      const last = Math.min(close, lines.length - 1);
      ranges.push({ start: lineStarts[i], end: lineEnd(last), kind: 'block' });
      i = last + 1;
      previousBlank = false;
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      previousBlank = true;
      i++;
      continue;
    }

    const indented = INDENTED.test(line);
    if (indented && previousBlank && !continuesContainer) {
      let last = i;
      for (let next = i + 1; next < lines.length; next++) {
        if (lines[next].trim() === '') continue;
        if (!INDENTED.test(lines[next])) break;
        last = next;
      }
      ranges.push({ start: lineStarts[i], end: lineEnd(last), kind: 'block' });
      i = last + 1;
      previousBlank = false;
      continue;
    }

    if (LIST_ITEM.test(line) || FOOTNOTE_DEFINITION.test(line)) {
      continuesContainer = true;
      flushParagraph();
    } else if (!indented && previousBlank) {
      continuesContainer = false;
    }

    if (SINGLE_LINE_BLOCK.test(line)) {
      flushParagraph();
      ranges.push(...findInlineCode(markdown, lineStarts[i], lineEnd(i)));
    } else {
      paragraphStart ??= lineStarts[i];
      paragraphEnd = lineEnd(i);
    }
    previousBlank = false;
    i++;
  }
  flushParagraph();
  ranges.push(...findEscapedSyntax(markdown, ranges));

  return ranges.sort((a, b) => a.start - b.start);
}

/** `\[[Note]]` and `\#tag` outside code, where the backslash is not itself escaped. */
function findEscapedSyntax(markdown: string, code: CodeRange[]): CodeRange[] {
  const ranges: CodeRange[] = [];
  for (const match of markdown.matchAll(/\\(?:\[\[[^\]\n]*\]\]|#)/g)) {
    const start = match.index;
    let backslashes = 0;
    for (let i = start - 1; i >= 0 && markdown[i] === '\\'; i--) backslashes++;
    if (backslashes % 2 === 1) continue;
    if (code.some(range => start >= range.start && start < range.end)) continue;
    ranges.push({ start, end: start + match[0].length, kind: 'escaped' });
  }
  return ranges;
}

function findInlineCode(markdown: string, start: number, end: number): CodeRange[] {
  const ranges: CodeRange[] = [];
  const runs: { start: number; length: number }[] = [];
  for (let i = start; i < end; i++) {
    if (markdown[i] !== '`') continue;
    let runEnd = i;
    while (runEnd < end && markdown[runEnd] === '`') runEnd++;
    let runStart = i;
    let backslashes = 0;
    for (let b = i - 1; b >= start && markdown[b] === '\\'; b--) backslashes++;
    if (backslashes % 2 === 1) runStart++; // an escaped backtick is literal
    if (runEnd > runStart) runs.push({ start: runStart, length: runEnd - runStart });
    i = runEnd - 1;
  }

  let r = 0;
  while (r < runs.length) {
    const opening = runs[r];
    const closing = runs.findIndex((run, index) => index > r && run.length === opening.length);
    if (closing < 0) {
      r++;
      continue;
    }
    ranges.push({ start: opening.start, end: runs[closing].start + runs[closing].length, kind: 'inline' });
    r = closing + 1;
  }
  return ranges;
}

/** Applies `replace` to each stretch of text outside code (and escaped syntax), which is kept verbatim. */
export function mapOutsideCode(markdown: string, replace: (text: string) => string): string {
  let out = '';
  let cursor = 0;
  for (const range of findCodeRanges(markdown)) {
    out += replace(markdown.slice(cursor, range.start)) + markdown.slice(range.start, range.end);
    cursor = range.end;
  }
  return out + replace(markdown.slice(cursor));
}

/**
 * Returns the text with every code character (and escaped syntax) replaced by
 * a space, newlines kept, so link and tag scanners can search it without
 * finding code, and offsets still line up with the original.
 */
export function blankOutCode(markdown: string): string {
  let out = '';
  let cursor = 0;
  for (const range of findCodeRanges(markdown)) {
    out += markdown.slice(cursor, range.start) + markdown.slice(range.start, range.end).replace(/[^\n]/g, ' ');
    cursor = range.end;
  }
  return out + markdown.slice(cursor);
}
