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

import * as yaml from 'js-yaml';
import { BlockInfo } from './types.js';
import { findCodeRanges, mapOutsideCode, type CodeScanOptions } from './markdownCode.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';
import { splitFrontmatter } from '../../../../shared/utils/frontmatterUtils.js';

export function removeFrontmatter(markdownText: string): string {
  return splitFrontmatter(markdownText)?.body ?? markdownText;
}

export function frontmatterAsDict(markdownText: string): Record<string, unknown> {
  const split = splitFrontmatter(markdownText);
  if (!split) {
    return {};
  }
  
  const frontmatterText = split.yaml;
  try {
    return yaml.load(frontmatterText) as Record<string, unknown> || {};
  } catch (error) {
    logger.warn('Failed to parse frontmatter YAML:', error);
    return {};
  }
}

/**
 * Removes Obsidian comments (`%%…%%`), as Obsidian hides them when reading a
 * note. A comment opens outside code and may span lines; one that never closes
 * hides the rest of the note. `\%%` is two literal percent signs.
 */
export function removeComments(markdown: string): string {
  const code = findCodeRanges(markdown);
  const inCode = (index: number) => code.some(range => index >= range.start && index < range.end);
  const escaped = (index: number) => {
    let backslashes = 0;
    for (let i = index - 1; i >= 0 && markdown[i] === '\\'; i--) backslashes++;
    return backslashes % 2 === 1;
  };
  const nextDelimiter = (from: number, outsideCode: boolean) => {
    for (let i = markdown.indexOf('%%', from); i >= 0; i = markdown.indexOf('%%', i + 1)) {
      if (escaped(i)) {
        i++; // both percent signs of `\%%` are text
        continue;
      }
      if (!outsideCode || !inCode(i)) return i;
    }
    return -1;
  };

  let out = '';
  let cursor = 0;
  for (let open = nextDelimiter(0, true); open >= 0; open = nextDelimiter(cursor, true)) {
    const close = nextDelimiter(open + 2, false);
    out += markdown.slice(cursor, open);
    if (close < 0) return out;
    cursor = close + 2;
  }
  return out + markdown.slice(cursor);
}

/**
 * Rewrites Obsidian inline footnotes (`text^[note]`) as ordinary footnotes:
 * a reference `[^inline-1]` where the note was, and its definition at the end
 * of the note, so they are numbered and listed with the others. The note may
 * contain brackets, such as a link, but not a blank line.
 */
export function inlineFootnotesToReferences(markdown: string): string {
  const code = findCodeRanges(markdown);
  const definitions: string[] = [];
  let out = '';
  let cursor = 0;
  for (let start = markdown.indexOf('^[', cursor); start >= 0; start = markdown.indexOf('^[', cursor)) {
    let depth = 0;
    let end = -1;
    for (let i = start + 1; i < markdown.length; i++) {
      if (markdown.startsWith('\n\n', i)) break;
      if (markdown[i] === '[') depth++;
      if (markdown[i] === ']' && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end < 0 || code.some(range => start >= range.start && start < range.end)) {
      out += markdown.slice(cursor, start + 2);
      cursor = start + 2;
      continue;
    }
    const label = `inline-${definitions.length + 1}`;
    definitions.push(`[^${label}]: ${markdown.slice(start + 2, end)}`);
    out += `${markdown.slice(cursor, start)}[^${label}]`;
    cursor = end + 1;
  }
  out += markdown.slice(cursor);
  return definitions.length ? `${out}\n\n${definitions.join('\n\n')}\n` : out;
}

// Text that is part of an address or an HTML tag rather than prose: a
// Markdown link destination, an autolink or HTML tag, or a bare URL.
const ADDRESS_OR_TAG = /\]\([^)]*\)|<[^>\n]*>|\bhttps?:\/\/[^\s<>()]+/g;

/** Like replaceOutsideCode, but also leaves addresses and HTML tags as written. */
export function replaceInProse(
  markdown: string,
  pattern: RegExp,
  replacer: (substring: string, ...args: string[]) => string
): string {
  return mapOutsideCode(markdown, text => {
    let out = '';
    let cursor = 0;
    for (const address of text.matchAll(ADDRESS_OR_TAG)) {
      out += text.slice(cursor, address.index).replace(pattern, replacer) + address[0];
      cursor = address.index + address[0].length;
    }
    return out + text.slice(cursor).replace(pattern, replacer);
  });
}

/**
 * Applies a regex replacement only to text outside of code blocks and inline
 * code spans (see markdownCode.ts), and outside HTML blocks with `htmlBlocks`.
 * Code is preserved verbatim.
 */
export function replaceOutsideCode(
  markdown: string,
  pattern: RegExp,
  replacer: (substring: string, ...args: string[]) => string,
  options: CodeScanOptions = {}
): string {
  return mapOutsideCode(markdown, text => text.replace(pattern, replacer), options);
}

export function splitMarkdownBlocks(markdownText: string): BlockInfo[] {
  const blocks: BlockInfo[] = [];
  const lines = markdownText.split('\n');
  let currentBlock: string[] = [];
  let currentType: BlockInfo['type'] | null = null;
  let currentLast = 0;

  // Each code block, and each HTML block that starts a block of its own, as
  // the line range it covers, is kept whole. An HTML block right after a
  // paragraph line stays with that paragraph, as a card's review comment
  // (`<!--SR:…-->`) stays with its card.
  const wholeBlockLines: { first: number; last: number; type: BlockInfo['type'] }[] = [];
  let offset = 0;
  const lineStarts = lines.map(line => {
    const start = offset;
    offset += line.length + 1;
    return start;
  });
  const lineEnd = (index: number) => lineStarts[index] + lines[index].length;
  for (const range of findCodeRanges(markdownText, { htmlBlocks: true }).filter(r => r.kind === 'block' || r.kind === 'html')) {
    const first = lineStarts.indexOf(range.start);
    let last = first;
    while (last + 1 < lines.length && lineStarts[last + 1] < range.end) last++;
    wholeBlockLines.push({ first, last, type: range.kind === 'block' ? 'code' : 'paragraph' });
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    const wholeBlock = wholeBlockLines.find(block => block.first === index &&
      (block.type === 'code' || currentBlock.length === 0));
    if (wholeBlock) {
      if (currentBlock.length > 0) {
        blocks.push({ type: currentType!, content: currentBlock.join('\n'), end: lineEnd(currentLast) });
        currentBlock = [];
        currentType = null;
      }
      blocks.push({
        type: wholeBlock.type,
        content: lines.slice(wholeBlock.first, wholeBlock.last + 1).join('\n'),
        end: lineEnd(wholeBlock.last),
      });
      index = wholeBlock.last;
      continue;
    }

    // Handle headers: `#` to `######` and a space, so a `#tag` line is text
    if (/^ {0,3}#{1,6}(?:[ \t]|$)/.test(line)) {
      if (currentBlock.length > 0) {
        blocks.push({ type: currentType!, content: currentBlock.join('\n'), end: lineEnd(currentLast) });
        currentBlock = [];
      }
      currentType = 'header';
      currentBlock.push(line);
      blocks.push({ type: currentType, content: currentBlock.join('\n'), end: lineEnd(index) });
      currentBlock = [];
      currentType = null;
      continue;
    }

    // Handle paragraphs
    if (line.trim()) {
      if (!currentType) {
        currentType = 'paragraph';
      }
      currentBlock.push(line);
      currentLast = index;
    } else if (currentBlock.length > 0) {
      blocks.push({ type: currentType!, content: currentBlock.join('\n'), end: lineEnd(currentLast) });
      currentBlock = [];
      currentType = null;
    }
  }

  // Add any remaining block
  if (currentBlock.length > 0) {
    blocks.push({ type: currentType!, content: currentBlock.join('\n'), end: lineEnd(currentLast) });
  }

  return blocks;
} 