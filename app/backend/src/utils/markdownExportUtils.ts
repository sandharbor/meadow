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

import fs from 'fs';
import path from 'path';
import type { SitePageConfig } from '../../../shared_code/types/sitePageConfig.js';
import { replaceOutsideCode } from '../html/markdown.js';
import { LINK_PATTERN } from '../html/constants.js';
import { isLinkTracked } from '../html/linkModificationService.js';
import { pageConfigToKey } from '../html/types.js';
import { SiteConfigPaths } from '../../../shared_code/paths/siteConfigPaths.js';
import { removeSrsCommentsFromMarkdown } from './srsMarkdownUtils.js';
import { logger } from './logging/backendLoggingUtils.js';

/**
 * Replaces wiki-links to non-publishable pages with `_link not tracked_` in markdown content.
 * Links inside fenced code blocks and inline code spans are left unchanged.
 */
export function sanitizeMarkdownLinks(
  content: string,
  sitePageConfigsForLinks: SitePageConfig[]
): string {
  return replaceOutsideCode(content, LINK_PATTERN, (match: string, linkText: string) => {
    if (isLinkTracked(linkText, sitePageConfigsForLinks)) {
      return match;
    }
    return '_link not tracked_';
  });
}

function walkFilesRecursively(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFilesRecursively(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Prepares the intermediate markdown export directory by:
 * - Reading original content from the source graph (before tag rewriting)
 * - Filtering out orphaned pages (not in traversablePageKeys)
 * - Filtering out tag site pages (x-tagpages/) which only exist for HTML navigation
 * - Sanitizing wiki-links to non-publishable pages
 * - Copying only files that belong to traversable pages
 *
 * @param trackedContentDir - The tracked_page_content directory (used to enumerate which
 *   files belong to this site and for config matching)
 * @param sourceContentDir - The original source graph directory (content is read from here
 *   to avoid tag rewriting artifacts in tracked_page_content)
 * @param exportDir - The output directory for the filtered markdown export
 * @param traversablePageKeys - Set of page keys reachable via working graph traversal
 * @param sitePageConfs - All page configs for the site
 * @param sitePageConfigsForLinks - Page configs filtered to only traversable pages
 */
export function prepareMarkdownExportDirectory(
  trackedContentDir: string,
  sourceContentDir: string | undefined,
  exportDir: string,
  traversablePageKeys: Set<string>,
  sitePageConfs: Record<string, SitePageConfig>,
  sitePageConfigsForLinks: SitePageConfig[],
  options?: { srsEnabled?: boolean }
): void {
  // Clean and recreate export directory
  if (fs.existsSync(exportDir)) {
    fs.rmSync(exportDir, { recursive: true, force: true });
  }
  fs.mkdirSync(exportDir, { recursive: true });

  // Walk the tracked content directory to enumerate files for this site.
  const allFiles = walkFilesRecursively(trackedContentDir);

  for (const filePath of allFiles) {
    const relativePath = path.relative(trackedContentDir, filePath);
    const outputPath = path.join(exportDir, relativePath);

    // Skip tag site pages — they exist only to support HTML navigation,
    // not as original source content.
    const topDir = relativePath.split(path.sep)[0];
    if (topDir === SiteConfigPaths.TAGPAGES_DIR) {
      continue;
    }

    if (filePath.endsWith('.md')) {
      // For markdown files, compute the page key and check if traversable
      const dir = path.dirname(relativePath);
      const subdir = dir === '.' ? '' : dir;
      const title = path.basename(filePath, '.md');

      // Find the matching page config to get its key
      const matchingConf = Object.values(sitePageConfs).find(conf =>
        conf.title === title &&
        (conf.source_graph_subdirectory || '') === subdir &&
        (conf.file_type === 'md' || !conf.file_type)
      );

      if (!matchingConf) {
        logger.debug(`Markdown export: skipping untracked file ${relativePath}`);
        continue;
      }

      // Skip non-whitelisted pages (blacklisted pages may be in the traversal
      // as visited nodes but should not be exported)
      if (matchingConf.config.list_type !== 'whitelist') {
        logger.debug(`Markdown export: skipping non-whitelisted page ${relativePath}`);
        continue;
      }

      const key = pageConfigToKey(matchingConf);
      if (!traversablePageKeys.has(key)) {
        logger.debug(`Markdown export: skipping orphaned page ${relativePath}`);
        continue;
      }

      // Read from the original source graph to get content before tag rewriting.
      // Fall back to tracked_page_content if the source graph file doesn't exist.
      const sourceFilePath = sourceContentDir
        ? path.join(sourceContentDir, relativePath)
        : null;
      const readFrom = (sourceFilePath && fs.existsSync(sourceFilePath))
        ? sourceFilePath
        : filePath;

      let content = fs.readFileSync(readFrom, 'utf-8');
      content = sanitizeMarkdownLinks(content, sitePageConfigsForLinks);
      if (options?.srsEnabled) {
        content = removeSrsCommentsFromMarkdown(content);
      }

      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(outputPath, content, 'utf-8');
    } else {
      // For non-markdown files (images etc.), check if they belong to a traversable page
      const dir = path.dirname(relativePath);
      const subdir = dir === '.' ? '' : dir;
      const ext = path.extname(filePath).slice(1); // remove leading dot
      const nameWithoutExt = path.basename(filePath, path.extname(filePath));

      const matchingConf = Object.values(sitePageConfs).find(conf =>
        conf.title === nameWithoutExt &&
        conf.file_type === ext &&
        (conf.source_graph_subdirectory || '') === subdir
      );

      if (matchingConf) {
        const key = pageConfigToKey(matchingConf);
        if (!traversablePageKeys.has(key)) {
          logger.debug(`Markdown export: skipping orphaned non-md file ${relativePath}`);
          continue;
        }
      }

      // Read from source graph when available, fall back to tracked content
      const sourceFilePath = sourceContentDir
        ? path.join(sourceContentDir, relativePath)
        : null;
      const readFrom = (sourceFilePath && fs.existsSync(sourceFilePath))
        ? sourceFilePath
        : filePath;

      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.copyFileSync(readFrom, outputPath);
    }
  }
}
