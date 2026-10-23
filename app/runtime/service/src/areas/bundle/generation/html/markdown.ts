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
import { findCodeRanges, mapOutsideCode } from './markdownCode.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';

const FRONTMATTER_PATTERN = /^---\n[\s\S]*?\n---\n/;

export function removeFrontmatter(markdownText: string): string {
  return markdownText.replace(FRONTMATTER_PATTERN, '');
}

export function frontmatterAsDict(markdownText: string): Record<string, unknown> {
  const match = markdownText.match(FRONTMATTER_PATTERN);
  if (!match) {
    return {};
  }
  
  const frontmatterText = match[0].slice(4, -4); // Remove the --- delimiters
  try {
    return yaml.load(frontmatterText) as Record<string, unknown> || {};
  } catch (error) {
    logger.warn('Failed to parse frontmatter YAML:', error);
    return {};
  }
}

/**
 * Applies a regex replacement only to text outside of code blocks and inline
 * code spans (see markdownCode.ts). Code is preserved verbatim.
 */
export function replaceOutsideCode(
  markdown: string,
  pattern: RegExp,
  replacer: (substring: string, ...args: string[]) => string
): string {
  return mapOutsideCode(markdown, text => text.replace(pattern, replacer));
}

export function splitMarkdownBlocks(markdownText: string): BlockInfo[] {
  const blocks: BlockInfo[] = [];
  const lines = markdownText.split('\n');
  let currentBlock: string[] = [];
  let currentType: BlockInfo['type'] | null = null;

  // Each code block, as the line range it covers, is kept whole.
  const codeBlockLines: { first: number; last: number }[] = [];
  let offset = 0;
  const lineStarts = lines.map(line => {
    const start = offset;
    offset += line.length + 1;
    return start;
  });
  for (const range of findCodeRanges(markdownText).filter(r => r.kind === 'block')) {
    const first = lineStarts.indexOf(range.start);
    let last = first;
    while (last + 1 < lines.length && lineStarts[last + 1] < range.end) last++;
    codeBlockLines.push({ first, last });
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    const codeBlock = codeBlockLines.find(block => block.first === index);
    if (codeBlock) {
      if (currentBlock.length > 0) {
        blocks.push({ type: currentType!, content: currentBlock.join('\n') });
        currentBlock = [];
        currentType = null;
      }
      blocks.push({ type: 'code', content: lines.slice(codeBlock.first, codeBlock.last + 1).join('\n') });
      index = codeBlock.last;
      continue;
    }

    // Handle headers
    if (line.trim().startsWith('#')) {
      if (currentBlock.length > 0) {
        blocks.push({ type: currentType!, content: currentBlock.join('\n') });
        currentBlock = [];
      }
      currentType = 'header';
      currentBlock.push(line);
      blocks.push({ type: currentType, content: currentBlock.join('\n') });
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
    } else if (currentBlock.length > 0) {
      blocks.push({ type: currentType!, content: currentBlock.join('\n') });
      currentBlock = [];
      currentType = null;
    }
  }

  // Add any remaining block
  if (currentBlock.length > 0) {
    blocks.push({ type: currentType!, content: currentBlock.join('\n') });
  }

  return blocks;
} 