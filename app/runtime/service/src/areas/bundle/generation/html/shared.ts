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
import * as path from 'path';
import he from 'he';
import { Page } from './page.js';
import { EMBEDDED_FILE_EXTENSIONS, LINK_PATTERN } from './constants.js';
import { removeComments, removeFrontmatter } from './markdown.js';
import { blankOutCode } from './markdownCode.js';
import { LinkInfo } from './types.js';
import { BundleConfig } from '../../../../../../../contracts/types/shared/bundle-config/bundleConfig.js';
import { HooksLoader } from '../utils/hooksLoader.js';
import { logBundleDebug, logBundleWarn } from '../../../../shared/utils/logging/bundleLogger.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';

/**
 * A link target's Markdown as it renders (no frontmatter or comments), for
 * finding its headings, or undefined when it is not a readable Markdown file.
 */
export function readLinkedNote(contentDirectory: string | undefined, resolvedTargetPath: string | null | undefined): string | undefined {
  if (!contentDirectory || !resolvedTargetPath || !/\.md$/i.test(resolvedTargetPath)) return undefined;
  const filePath = path.join(contentDirectory, resolvedTargetPath.replace(/^\//, ''));
  if (!fs.existsSync(filePath)) return undefined;
  return removeComments(removeFrontmatter(fs.readFileSync(filePath, 'utf-8')));
}

export function normalizePageTitle(pageTitle: string, bundleConfig: BundleConfig, bundleSlug?: string): string {
  if (bundleSlug) {
    logBundleDebug(bundleSlug, `[normalizeBundlePageTitle] Called with title: "${pageTitle}"`);
  } else {
    logger.debug(`[normalizeBundlePageTitle] Called with title: "${pageTitle}", bundleSlug: "${bundleSlug}"`);
  }

  // First, try to use the hook if bundleSlug is provided
  if (bundleSlug) {
    logBundleDebug(bundleSlug, `[normalizeBundlePageTitle] Attempting to execute hook`);
    try {
      const hookResult = HooksLoader.tryExecutePageTitleNormalization(bundleSlug, pageTitle, bundleConfig);
      logBundleDebug(bundleSlug, `[normalizeBundlePageTitle] Hook result: "${hookResult}"`);
      // If hook returned a different result, use it
      if (hookResult !== pageTitle) {
        logBundleDebug(bundleSlug, `[normalizeBundlePageTitle] Hook transformed "${pageTitle}" -> "${hookResult}"`);
        return hookResult;
      } else {
        logBundleDebug(bundleSlug, `[normalizeBundlePageTitle] Hook returned same value, no transformation`);
      }
    } catch (error) {
      // Log error but continue with default logic
      logBundleWarn(bundleSlug, `Hook execution failed, falling back to default normalization logic: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    logger.debug(`[normalizeBundlePageTitle] No bundleSlug provided, skipping hook execution`);
  }

  if (bundleSlug) logBundleDebug(bundleSlug, `[normalizeBundlePageTitle] Final result: "${pageTitle}"`);
  else logger.debug(`[normalizeBundlePageTitle] Final result: "${pageTitle}"`);
  return pageTitle;
}

// A page is read for its own render and again for each page it links to.
// Each read is checked against the file's current stamp.
const recentNotes = new Map<string, { stamp: string; text: string }>();
const MAX_RECENT_NOTES = 5000;

/** The text of the note at `file`, or undefined when there is none. */
function readNoteFile(file: string): string | undefined {
  let stats: fs.BigIntStats;
  try {
    stats = fs.statSync(file, { bigint: true });
  } catch {
    return undefined;
  }
  const stamp = `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}:${stats.ctimeNs}`;
  const recent = recentNotes.get(file);
  if (recent?.stamp === stamp) return recent.text;
  const text = fs.readFileSync(file, 'utf-8');
  recentNotes.delete(file);
  if (recentNotes.size >= MAX_RECENT_NOTES) recentNotes.delete(recentNotes.keys().next().value!);
  recentNotes.set(file, { stamp, text });
  return text;
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

  let mdContent = mdPath ? readNoteFile(mdPath) : undefined;
  if (mdContent === undefined) {
    return '';
  }

  if (!preserveFrontmatter) {
    // The note as it is rendered: no frontmatter and no comments.
    mdContent = removeComments(removeFrontmatter(mdContent));
  }

  // Keep trailing whitespace normalization stable for transclusions and block anchors.
  return mdContent.trimEnd();
}

export function anchorNameFor(pageName: string): string {
  return pageName.toLowerCase().replace(/ /g, '-');
}

/**
 * Escapes a string so it can be used safely as the value of an HTML attribute
 * (between double quotes). Use this when building attribute values by string
 * concatenation rather than via Handlebars/marked (which escape on their own).
 *
 * Delegates to `he.escape` (Mathias Bynens' library) — the standard
 * maintained implementation. We don't roll our own.
 */
export function escapeHtmlAttribute(value: string): string {
  return he.escape(value);
}

/** Obsidian's image size: a width (`100`) or a width and height (`100x145`). */
export const IMAGE_SIZE_PATTERN = /^(\d+)(?:x(\d+))?$/;

/**
 * The style attribute for an image size. A width alone is a maximum, so the
 * image can still shrink; a width and height set both, as in Obsidian.
 */
export function imageSizeStyle(size: string | undefined): string {
  const match = size ? IMAGE_SIZE_PATTERN.exec(size) : null;
  if (!match) return '';
  return match[2] ? ` style="width: ${match[1]}px; height: ${match[2]}px"` : ` style="max-width: ${match[1]}px"`;
}

/**
 * Splits Markdown image alt text into the alt text and an Obsidian size:
 * `250` or `A meadow|80`.
 */
export function altTextAndSize(text: string): { alt: string; size?: string } {
  const match = /^(?:(.*)\|)?(\d+(?:x\d+)?)$/.exec(text);
  return match ? { alt: match[1] ?? '', size: match[2] } : { alt: text };
}

export function linkTextToLinkInfo(link: string): LinkInfo {
  // Normalize escaped pipes (\|) to regular pipes (|).
  // In markdown tables, Obsidian escapes the alias pipe as \| to avoid
  // conflicting with the table cell separator.
  link = link.replace(/\\\|/g, '|');
  const targetEnd = link.search(/[#^|]/);
  const target = targetEnd < 0 ? link : link.slice(0, targetEnd);
  const qualifier = target.indexOf('::');
  if (qualifier >= 0) {
    const filename = target.slice(0, qualifier);
    const suffix = targetEnd < 0 ? '' : link.slice(targetEnd);
    const pipe = suffix.indexOf('|');
    const alias = pipe < 0 ? undefined : suffix.slice(pipe + 1);
    const section = (pipe < 0 ? suffix : suffix.slice(0, pipe)).match(/#(.*)/)?.[1];
    return EMBEDDED_FILE_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext))
      ? { type: 'image', filename, size: alias && IMAGE_SIZE_PATTERN.test(alias) ? alias : undefined, fragment: section }
      : { type: 'page', filename, alternative_name: alias, section };
  }
  const lowerLink = link.toLowerCase();
  // An embedded file is everything before its options after `#`.
  const [beforeAlias] = link.split('|');
  const hash = beforeAlias.indexOf('#');
  const file = hash < 0 ? beforeAlias : beforeAlias.slice(0, hash);

  // Check if it's an image, audio, video, or PDF
  if (EMBEDDED_FILE_EXTENSIONS.some(ext => file.toLowerCase().endsWith(ext))) {
    const sizeMatch = lowerLink.match(/\|(\d+(?:x\d+)?)$/);
    return {
      type: 'image',
      filename: file,
      size: sizeMatch ? sizeMatch[1] : undefined,
      ...(hash >= 0 && { fragment: beforeAlias.slice(hash + 1) }),
    };
  } else {
    // [[filename#optional section name|optional alternative name]]
    const [target, alternativeName] = link.split('|');
    // The note is everything before the first `#`; the rest is a block, a
    // heading, or a chain of headings (`Heading#Subheading`).
    const hash = target.indexOf('#');
    return {
      type: 'page',
      filename: hash < 0 ? target : target.slice(0, hash),
      alternative_name: alternativeName,
      section: hash < 0 ? undefined : target.slice(hash + 1)
    };
  }
}

/** The wikilinks in `content`, ignoring any inside code. */
export function markdownContentToLinks(content: string): Record<string, LinkInfo> {
  const links: Record<string, LinkInfo> = {};
  const scannable = blankOutCode(content);
  let match;

  // Reset the regex to start from the beginning
  LINK_PATTERN.lastIndex = 0;

  while ((match = LINK_PATTERN.exec(scannable)) !== null) {
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
