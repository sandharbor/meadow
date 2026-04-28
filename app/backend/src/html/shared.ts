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

import * as fs from 'fs';
import { Page } from './page.js';
import { IMAGE_EXTENSIONS, LINK_PATTERN } from './constants.js';
import { removeFrontmatter } from './markdown.js';
import { LinkInfo } from './types.js';
import { SiteConfig } from '../../../shared_code/types/siteConfig.js';
import { HooksLoader } from '../utils/hooksLoader.js';
import { logSiteDebug, logSiteWarn } from '../utils/logging/siteLogger.js';
import { logger } from '../utils/logging/backendLoggingUtils.js';
import { extractContentWithoutPagespecs } from '../../../shared_code/test/pagespecUtils.js';

export function normalizePageTitle(pageTitle: string, siteConfig: SiteConfig, siteSlug?: string): string {
  if (siteSlug) {
    logSiteDebug(siteSlug, `[normalizeSitePageTitle] Called with title: "${pageTitle}"`);
  } else {
    logger.debug(`[normalizeSitePageTitle] Called with title: "${pageTitle}", siteSlug: "${siteSlug}"`);
  }

  // First, try to use the hook if siteSlug is provided
  if (siteSlug) {
    logSiteDebug(siteSlug, `[normalizeSitePageTitle] Attempting to execute hook`);
    try {
      const hookResult = HooksLoader.tryExecutePageTitleNormalization(siteSlug, pageTitle);
      logSiteDebug(siteSlug, `[normalizeSitePageTitle] Hook result: "${hookResult}"`);
      // If hook returned a different result, use it
      if (hookResult !== pageTitle) {
        logSiteDebug(siteSlug, `[normalizeSitePageTitle] Hook transformed "${pageTitle}" -> "${hookResult}"`);
        return hookResult;
      } else {
        logSiteDebug(siteSlug, `[normalizeSitePageTitle] Hook returned same value, no transformation`);
      }
    } catch (error) {
      // Log error but continue with default logic
      logSiteWarn(siteSlug, `Hook execution failed, falling back to default normalization logic: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    logger.debug(`[normalizeSitePageTitle] No siteSlug provided, skipping hook execution`);
  }

  // Fall back to original normalization logic
  if (pageTitle === siteConfig.initialSitePageTitle) {
    if (siteSlug) logSiteDebug(siteSlug, `[normalizeSitePageTitle] Using initial page output name mapping`);
    else logger.debug(`[normalizeSitePageTitle] Using initial page output name mapping`);
    pageTitle = siteConfig.initialSitePageTitle || pageTitle;
  }

  if (siteSlug) logSiteDebug(siteSlug, `[normalizeSitePageTitle] Final result: "${pageTitle}"`);
  else logger.debug(`[normalizeSitePageTitle] Final result: "${pageTitle}"`);
  return pageTitle;
}

export function getMdContent(
  directory: string,
  pageName: string,
  preserveFrontmatter = false,
  pathForPageName?: Map<string, string>
): string {
  let mdPath: string;

  if (pathForPageName) {
    mdPath = pathForPageName.get(pageName) || '';
  } else {
    // way slower than using the cached pathForPageName
    mdPath = Page.findFullFilesystemPath(directory, pageName);
  }

  if (!mdPath || !fs.existsSync(mdPath)) {
    return '';
  }

  let mdContent = fs.readFileSync(mdPath, 'utf-8');

  if (!preserveFrontmatter) {
    mdContent = removeFrontmatter(mdContent);
  }

  // Always strip pagespecs blocks - they are test metadata, not content
  mdContent = extractContentWithoutPagespecs(mdContent);

  return mdContent;
}

export function anchorNameFor(pageName: string): string {
  return pageName.toLowerCase().replace(/ /g, '-');
}

export function linkTextToLinkInfo(link: string): LinkInfo {
  // Normalize escaped pipes (\|) to regular pipes (|).
  // In markdown tables, Obsidian escapes the alias pipe as \| to avoid
  // conflicting with the table cell separator.
  link = link.replace(/\\\|/g, '|');
  const lowerLink = link.toLowerCase();

  // Check if it's an image
  if (IMAGE_EXTENSIONS.some(ext => lowerLink.split('|')[0].endsWith(ext))) {
    const sizeMatch = lowerLink.match(/\|(\d+)$/);
    return {
      type: 'image',
      filename: link.split('|')[0],
      size: sizeMatch ? sizeMatch[1] : undefined
    };
  } else {
    // [[filename|optional alternative name#optional section name]]
    const parts = link.split('#');
    const filenameParts = parts[0].split('|');
    return {
      type: 'page',
      filename: filenameParts[0],
      alternative_name: filenameParts.length > 1 ? filenameParts[1] : undefined,
      section: parts.length > 1 ? parts[1] : undefined
    };
  }
}

export function markdownContentToLinks(content: string): Record<string, LinkInfo> {
  const links: Record<string, LinkInfo> = {};
  let match;

  // Reset the regex to start from the beginning
  LINK_PATTERN.lastIndex = 0;

  while ((match = LINK_PATTERN.exec(content)) !== null) {
    const link = match[1];
    links[link] = linkTextToLinkInfo(link);
  }

  return links;
}

export function markdownContentToPageLinkFilenames(content: string): string[] {
  const linkInfo = markdownContentToLinks(content);
  return Object.keys(linkInfo)
    .filter(link => linkInfo[link].type === 'page')
    .map(link => linkInfo[link].filename);
}

/**
 * Calculates the relative path from a source directory to a target directory/file.
 * 
 * @param fromDir - The directory where the source file is located (e.g., "t002/extra nested" or "")
 * @param toPath - The path to the target file (e.g., "t002/file.html" or "file.html")
 * @returns The relative path from fromDir to toPath (e.g., "../file.html" or "extra nested/file.html")
 * 
 * Examples:
 * - calculateRelativePath("", "file.html") => "file.html"
 * - calculateRelativePath("t002", "file.html") => "../file.html"
 * - calculateRelativePath("t002", "t002/file.html") => "file.html"
 * - calculateRelativePath("t002/extra nested", "t002/file.html") => "../file.html"
 * - calculateRelativePath("", "t002/extra nested/file.html") => "t002/extra nested/file.html"
 */
export function calculateRelativePath(fromDir: string, toPath: string): string {
  // Normalize paths - remove trailing slashes and handle empty strings
  const normalizedFromDir = fromDir.replace(/\/+$/, '');
  const normalizedToPath = toPath.replace(/^\/+/, '');
  
  // If fromDir is empty (root), the relative path is just the toPath
  if (!normalizedFromDir) {
    return normalizedToPath;
  }
  
  // Split into components
  const fromParts = normalizedFromDir.split('/').filter(p => p);
  const toParts = normalizedToPath.split('/').filter(p => p);
  
  // Find common prefix length
  let commonLength = 0;
  while (
    commonLength < fromParts.length && 
    commonLength < toParts.length - 1 && // -1 because last part of toPath is the filename
    fromParts[commonLength] === toParts[commonLength]
  ) {
    commonLength++;
  }
  
  // Calculate how many levels to go up from fromDir
  const upCount = fromParts.length - commonLength;
  
  // Build the relative path
  const upPath = '../'.repeat(upCount);
  const downPath = toParts.slice(commonLength).join('/');
  
  return upPath + downPath;
} 