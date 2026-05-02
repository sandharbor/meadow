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

import * as fs from 'fs';
import * as path from 'path';
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

/**
 * Detects whether a markdown file is an Obsidian Excalidraw drawing by content.
 * Obsidian's Excalidraw plugin marks files with `excalidraw-plugin: parsed` in
 * the YAML frontmatter. Mirrors the Rust detection in working_graph_code.
 */
export function isExcalidrawMarkdown(content: string): boolean {
  if (!content.startsWith('---')) {
    return false;
  }
  const afterOpen = content.slice(3);
  const closeIdx = afterOpen.indexOf('\n---');
  if (closeIdx === -1) {
    return false;
  }
  const frontmatter = afterOpen.slice(0, closeIdx);
  return frontmatter.includes('excalidraw-plugin: parsed');
}

/**
 * Resolves the expected sidecar pagespec path for a markdown file. Sidecar
 * files carry pagespec metadata for files that cannot embed pagespecs inline
 * (Excalidraw drawings, SVGs, binary images, etc.). The sidecar lives in the
 * same directory as the file it describes.
 *
 * Naming: `<basename>.<file_type>.pagespec.yaml`.
 * - Excalidraw: `<name>.excalidraw.md` → `<name>.excalidraw.pagespec.yaml`
 * - SVG/image (future use): `<name>.svg` → `<name>.svg.pagespec.yaml`
 *
 * Returns the absolute path the sidecar would have, regardless of whether it
 * actually exists. Returns null when no sidecar convention applies (regular
 * .md files use inline blocks today).
 */
export function getSidecarPagespecPath(mdFilePath: string, mdContent: string): string | null {
  const dir = path.dirname(mdFilePath);
  const basename = path.basename(mdFilePath);

  if (isExcalidrawMarkdown(mdContent)) {
    let stem = basename.endsWith('.md') ? basename.slice(0, -3) : basename;
    if (!stem.endsWith('.excalidraw')) {
      stem = `${stem}.excalidraw`;
    }
    return path.join(dir, `${stem}.pagespec.yaml`);
  }

  return null;
}

/**
 * Parses a sidecar `.pagespec.yaml` file's contents into a PagespecsBlock.
 * Returns null if the YAML doesn't parse or doesn't have the expected shape.
 */
export function parsePagespecSidecarContent(content: string): PagespecsBlock | null {
  try {
    const parsed = YAML.parse(content) as PagespecsBlock;
    if (parsed && Array.isArray(parsed.pagespecs)) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Given a sidecar pagespec path like `<dir>/<basename>.<ft>.pagespec.yaml`,
 * derives the on-disk source filename it describes. Returns null if the path
 * doesn't follow the convention.
 *
 * - `<dir>/foo.excalidraw.pagespec.yaml` → `<dir>/foo.excalidraw.md`
 *   (Obsidian Excalidraw drawings live as `<title>.excalidraw.md`).
 * - `<dir>/foo.svg.pagespec.yaml`        → `<dir>/foo.svg`
 *   (general image case — kept for future migration of inline-stripped SVG
 *   pagespecs onto sidecars).
 */
export function sourceFileForSidecarPath(sidecarPath: string): string | null {
  const dir = path.dirname(sidecarPath);
  const base = path.basename(sidecarPath);
  if (!base.endsWith('.pagespec.yaml')) {
    return null;
  }
  const stem = base.slice(0, -'.pagespec.yaml'.length);
  // The stem is `<basename>.<file_type>`. Recover the file_type to know
  // whether the on-disk source has an extra `.md` suffix.
  const dot = stem.lastIndexOf('.');
  if (dot <= 0) return null;
  const fileType = stem.slice(dot + 1).toLowerCase();
  if (fileType === 'excalidraw') {
    return path.join(dir, `${stem}.md`);
  }
  return path.join(dir, stem);
}

/**
 * Returns the effective pagespec block for a markdown file, looking first at
 * an inline ` ```yaml pagespecs: ``` ` block at the end of the content, and
 * falling back to a sibling sidecar file when none is found inline.
 *
 * Excalidraw `.md` files always use sidecars; their content is rewritten by
 * Obsidian and would lose any appended block.
 */
export function getEffectivePagespecBlock(mdFilePath: string, mdContent?: string): {
  block: PagespecsBlock | null;
  source: 'inline' | 'sidecar' | 'none';
  sourcePath: string;
} {
  const content = mdContent ?? fs.readFileSync(mdFilePath, 'utf-8');

  if (hasPagespecsBlock(content)) {
    const block = extractPagespecsBlock(content);
    return { block, source: 'inline', sourcePath: mdFilePath };
  }

  const sidecarPath = getSidecarPagespecPath(mdFilePath, content);
  if (sidecarPath && fs.existsSync(sidecarPath)) {
    try {
      const sidecarContent = fs.readFileSync(sidecarPath, 'utf-8');
      const parsed = YAML.parse(sidecarContent) as PagespecsBlock;
      if (parsed && Array.isArray(parsed.pagespecs)) {
        return { block: parsed, source: 'sidecar', sourcePath: sidecarPath };
      }
    } catch {
      // fall through; treat as missing
    }
    return { block: null, source: 'sidecar', sourcePath: sidecarPath };
  }

  return { block: null, source: 'none', sourcePath: mdFilePath };
}
