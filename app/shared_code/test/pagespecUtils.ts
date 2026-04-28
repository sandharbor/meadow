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

/**
 * Utility functions for parsing and working with pagespecs blocks in markdown files.
 */

import YAML from 'yaml';
import type { PagespecsBlock, PagespecEntry } from '../types/test/pagespec.js';

/**
 * Pattern to match a pagespecs YAML block at the end of a markdown file.
 * Matches ```yaml or ```pagespecs code blocks containing a pagespecs: key.
 */
const PAGESPECS_BLOCK_PATTERN = /```(?:yaml|pagespecs)\s*\n([\s\S]*?pagespecs:[\s\S]*?)```\s*$/;

/**
 * Extracts the pagespecs block from markdown content if present.
 * The pagespecs block must be at the end of the file.
 *
 * @param content - The markdown content to parse
 * @returns The parsed PagespecsBlock or null if not found
 */
export function extractPagespecsBlock(content: string): PagespecsBlock | null {
  const match = content.match(PAGESPECS_BLOCK_PATTERN);
  if (!match) {
    return null;
  }

  try {
    const yamlContent = match[1];
    const parsed = YAML.parse(yamlContent) as PagespecsBlock;

    if (!parsed || !Array.isArray(parsed.pagespecs)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Gets the pagespec entry for a specific site from a pagespecs block.
 *
 * @param block - The pagespecs block to search
 * @param siteName - The site name to find
 * @returns The PagespecEntry for the site, or undefined if not found
 */
export function getPagespecForSite(
  block: PagespecsBlock,
  siteName: string
): PagespecEntry | undefined {
  return block.pagespecs.find((spec) => spec.site === siteName);
}

/**
 * Gets all site names referenced in a pagespecs block.
 *
 * @param block - The pagespecs block to examine
 * @returns Array of site names
 */
export function getReferencedSites(block: PagespecsBlock): string[] {
  return block.pagespecs.map((spec) => spec.site);
}

/**
 * Extracts the markdown content without the pagespecs block.
 * This is used when rendering HTML to exclude test metadata from output.
 *
 * @param content - The original markdown content
 * @returns The content with pagespecs block removed
 */
export function extractContentWithoutPagespecs(content: string): string {
  return content.replace(PAGESPECS_BLOCK_PATTERN, '').trimEnd();
}

/**
 * Checks if content has a pagespecs block.
 *
 * @param content - The markdown content to check
 * @returns true if a pagespecs block is present
 */
export function hasPagespecsBlock(content: string): boolean {
  return PAGESPECS_BLOCK_PATTERN.test(content);
}
