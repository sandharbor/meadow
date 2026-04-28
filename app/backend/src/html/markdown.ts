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
import { logger } from '../utils/logging/backendLoggingUtils.js';

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
 * Applies a regex replacement only to text outside of fenced code blocks
 * (```...```) and inline code spans (`...`). Code segments are preserved
 * verbatim.
 */
export function replaceOutsideCode(
  markdown: string,
  pattern: RegExp,
  replacer: (substring: string, ...args: string[]) => string
): string {
  // Split into code and non-code segments.
  // Fenced code blocks and inline code backticks are captured as odd-indexed parts.
  const codePattern = /(```[\s\S]*?```|`[^`]+`)/g;
  const parts = markdown.split(codePattern);

  return parts.map((part, index) => {
    // Odd indices are captured code segments — return unchanged
    if (index % 2 === 1) {
      return part;
    }
    // Even indices are regular text — apply replacement
    return part.replace(pattern, replacer);
  }).join('');
}

export function splitMarkdownBlocks(markdownText: string): BlockInfo[] {
  const blocks: BlockInfo[] = [];
  const lines = markdownText.split('\n');
  let currentBlock: string[] = [];
  let currentType: BlockInfo['type'] | null = null;
  let inCodeBlock = false;

  for (const line of lines) {
    // Handle code blocks
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        // Start new code block
        if (currentBlock.length > 0) {
          blocks.push({ type: currentType!, content: currentBlock.join('\n') });
          currentBlock = [];
        }
        currentType = 'code';
        inCodeBlock = true;
        currentBlock.push(line);
      } else {
        // End code block
        currentBlock.push(line);
        blocks.push({ type: currentType!, content: currentBlock.join('\n') });
        currentBlock = [];
        inCodeBlock = false;
        currentType = null;
      }
      continue;
    }

    if (inCodeBlock) {
      currentBlock.push(line);
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