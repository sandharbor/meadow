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

import path from 'path';
import { marked } from 'marked';
import type { SitePageConfig } from '../../../shared_code/types/sitePageConfig.js';
import type { SiteConfig } from '../../../shared_code/types/siteConfig.js';
import type { LinkResolvedInfo } from '../../../shared_code/types/ISitePage.js';
import { encodePathForUrl } from '../../../shared_code/utils/urlUtils.js';
import { linkOrImageHtml as linkOrImageHtmlService } from './linkModificationService.js';
import {
  calculateRelativePath,
  getMdContent,
  linkTextToLinkInfo,
  normalizePageTitle,
} from './shared.js';
import { replaceOutsideCode, splitMarkdownBlocks } from './markdown.js';
import { HooksLoader } from '../utils/hooksLoader.js';
import { replaceSrsCardsWithCustomElements } from '../utils/srsMarkdownUtils.js';

export interface TransclusionOptions {
  /** Directory of the final page that will contain this transclusion (for relative URL calculation) */
  finalPageDirectory: string;
  /** Root directory of tracked_page_content */
  baseContentDirectory: string;
  /** Root directory of preview output (for images) */
  baseOutputFolder: string;

  sitePageConfigs: SitePageConfig[];
  siteConfig: SiteConfig;
  siteSlug?: string;

  /** Link resolution map for the page that *contains* the transclusion syntax */
  linkResolutionMapForCaller?: Record<string, LinkResolvedInfo>;
  /** All link resolution maps, keyed by page ident, for resolving links within the transcluded page's own context */
  allLinkResolutionMaps?: Map<string, Record<string, LinkResolvedInfo>>;

  /** Whether this transclusion is nested inside another transclusion */
  isNested?: boolean;
  /** Recursion guard */
  visited?: Set<string>;
  /** Hard recursion depth limit */
  remainingDepth?: number;
}

interface ResolvedPageTarget {
  title: string;
  directory: string;
  sitePageConfig: SitePageConfig;
  pageIdent: string;
  normalizedOutputTitle: string;
}

const DEFAULT_REMAINING_DEPTH = 10;

function configureMarkedExternalLinksOnce(): void {
  // Marked is global-ish; ensure we match the renderer behavior used in htmlGenerator.ts
  const renderer = new marked.Renderer();
  renderer.link = function (linkData: { href: string; title?: string | null; text: string }) {
    const { href, title, text } = linkData;
    const titleAttr = title ? ` title="${title}"` : '';
    const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
    if (isExternal) {
      return `<a href="${href}"${titleAttr} rel="noreferrer noopener" target="_blank">${text}</a>`;
    }
    return `<a href="${href}"${titleAttr}>${text}</a>`;
  };

  marked.setOptions({
    gfm: true,
    breaks: false,
    pedantic: false,
  });
  marked.use({ renderer });
}

function unwrapSingleParagraph(html: string): string {
  const trimmed = html.trim();
  const match = trimmed.match(/^<p>([\s\S]*)<\/p>$/);
  if (!match || match[1].includes('</p>')) {
    return trimmed;
  }
  return match[1].trim();
}

function customProcessEmbeddedMarkdown(mdContent: string, siteSlug?: string): string {
  if (siteSlug) {
    return HooksLoader.tryExecuteMarkdownProcessingPage(siteSlug, mdContent);
  }
  return mdContent;
}

function pageIdentFor(title: string, directory: string): string {
  const dir = (directory || '').replace(/\/+$/, '');
  return dir ? `${dir}/${title}.md` : `/${title}.md`;
}

function findPageConfig(
  resolvedTitle: string,
  resolvedDirectory: string,
  linkHasExplicitPath: boolean,
  sitePageConfigs: SitePageConfig[]
): SitePageConfig | undefined {
  // Exact match first (title + directory)
  const exact = sitePageConfigs.find(
    (c) =>
      c.title === resolvedTitle &&
      (c.source_graph_subdirectory || '') === (resolvedDirectory || '') &&
      (c.file_type === 'md' || !c.file_type)
  );
  if (exact) {
    return exact;
  }

  // Fallback: if caller didn't specify an explicit path, allow title-only lookup
  if (!linkHasExplicitPath) {
    return sitePageConfigs.find((c) => c.title === resolvedTitle && (c.file_type === 'md' || !c.file_type));
  }

  return undefined;
}

function resolveTargetFromCallerContext(
  linkText: string,
  sitePageConfigs: SitePageConfig[],
  siteConfig: SiteConfig,
  siteSlug: string | undefined,
  linkResolutionMapForCaller: Record<string, LinkResolvedInfo> | undefined
): ResolvedPageTarget | null {
  const linkInfo = linkTextToLinkInfo(linkText);
  if (linkInfo.type !== 'page') {
    return null;
  }

  const originalFilename = linkInfo.filename;
  const linkHasExplicitPath = originalFilename.includes('/');

  const resolvedInfo = linkResolutionMapForCaller?.[linkText];
  const resolvedDirectory = resolvedInfo?.link_resolved_target_directory ?? '';

  let resolvedTitle = originalFilename;
  if (resolvedInfo?.link_resolved_target_path) {
    const parts = resolvedInfo.link_resolved_target_path.split('/');
    resolvedTitle = parts[parts.length - 1].replace(/\.md$/, '');
  } else if (originalFilename.includes('/')) {
    // If caller wrote [[dir/title]] style, the filename part is after last slash
    const parts = originalFilename.split('/');
    resolvedTitle = parts[parts.length - 1];
  }

  const cfg = findPageConfig(resolvedTitle, resolvedDirectory, linkHasExplicitPath, sitePageConfigs);
  if (!cfg || cfg.config.list_type !== 'whitelist') {
    return null;
  }

  const normalizedOutputTitle = siteSlug ? normalizePageTitle(cfg.title, siteConfig, siteSlug) : cfg.title;
  const directory = cfg.source_graph_subdirectory || '';

  return {
    title: cfg.title,
    directory,
    sitePageConfig: cfg,
    pageIdent: pageIdentFor(cfg.title, directory),
    normalizedOutputTitle,
  };
}

function extractFullPageMarkdown(md: string): string {
  return md;
}

function extractSectionMarkdown(md: string, sectionName: string): string {
  const lines = md.split('\n');
  let startIdx = -1;
  let startLevel = 0;

  const normalizedTarget = sectionName.trim();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    if (!match) continue;
    const level = match[1].length;
    const headerText = match[2].trim();
    if (headerText === normalizedTarget) {
      startIdx = i;
      startLevel = level;
      break;
    }
  }

  if (startIdx < 0) {
    return '';
  }

  const out: string[] = [];
  out.push(lines[startIdx]);
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const match = /^(#{1,6})\s+/.exec(line.trim());
    if (match) {
      const level = match[1].length;
      if (level <= startLevel) {
        break;
      }
    }
    out.push(line);
  }

  return out.join('\n').trim();
}

function extractBlockMarkdown(md: string, blockIdWithOptionalCaret: string): string {
  const id = blockIdWithOptionalCaret.replace(/^\^/, '').trim();
  if (!id) return '';

  const blocks = splitMarkdownBlocks(md);
  const token = `^${id}`;

  const match = blocks.find((b) => b.content.includes(token));
  return match ? match.content.trim() : '';
}

function convertWikiLinksInMarkdown(
  md: string,
  sitePageConfigs: SitePageConfig[],
  options: {
    siteConfig: SiteConfig;
    siteSlug?: string;
    baseContentDirectory: string;
    baseOutputFolder: string;
    finalPageDirectory: string;
    linkResolutionMapForSourcePage?: Record<string, LinkResolvedInfo>;
  }
): string {
  function linkOrImageHtml(linkText: string): string {
    return linkOrImageHtmlService(linkText, sitePageConfigs, {
      siteConfig: options.siteConfig,
      siteSlug: options.siteSlug,
      baseContentDirectory: options.baseContentDirectory,
      baseOutputFolder: options.baseOutputFolder,
      processingMode: 'each-page',
      currentPageDirectory: options.finalPageDirectory,
      linkResolutionMap: options.linkResolutionMapForSourcePage,
    });
  }

  // Images (Obsidian-style)
  md = replaceOutsideCode(md, /!\[\[(.*?)\]\]/g, (_match: string, linkText: string) => linkOrImageHtml(linkText));
  // Regular wiki links
  md = replaceOutsideCode(md, /\[\[(.*?)\]\]/g, (_match: string, linkText: string) => linkOrImageHtml(linkText));

  return md;
}

function wrapTransclusionHtml(
  innerHtml: string,
  seeInContextHref: string | null,
  isNested: boolean
): string {
  const button = !isNested && seeInContextHref
    ? `<a class="transcluded-see-in-context" href="${seeInContextHref}" title="See in context">⤢</a>`
    : '';
  return `<div class="transcluded">${button}<div class="transcluded-content">${innerHtml}</div></div>`;
}

export function renderTransclusionToHtml(linkText: string, options: TransclusionOptions): string {
  const {
    sitePageConfigs,
    siteConfig,
    siteSlug,
    baseContentDirectory,
    baseOutputFolder,
    finalPageDirectory,
    linkResolutionMapForCaller,
    allLinkResolutionMaps,
  } = options;

  const isNested = options.isNested ?? false;
  const remainingDepth = options.remainingDepth ?? DEFAULT_REMAINING_DEPTH;
  const visited = options.visited ?? new Set<string>();

  if (remainingDepth <= 0) {
    return '<span class="link-not-tracked">link not tracked</span>';
  }

  const resolved = resolveTargetFromCallerContext(
    linkText,
    sitePageConfigs,
    siteConfig,
    siteSlug,
    linkResolutionMapForCaller
  );

  if (!resolved) {
    return '<span class="link-not-tracked">link not tracked</span>';
  }

  const linkInfo = linkTextToLinkInfo(linkText);
  const sectionOrBlock = linkInfo.section;

  const visitKey = `${resolved.pageIdent}#${sectionOrBlock || ''}`;
  if (visited.has(visitKey)) {
    return '<span class="link-not-tracked">link not tracked</span>';
  }
  visited.add(visitKey);

  // Read markdown from tracked_page_content root + page directory
  const sourceDir = resolved.directory
    ? path.join(baseContentDirectory, resolved.directory)
    : baseContentDirectory;
  const rawMd = getMdContent(sourceDir, resolved.title, false);

  let extractedMd = '';
  if (!sectionOrBlock) {
    extractedMd = extractFullPageMarkdown(rawMd);
  } else if (sectionOrBlock.startsWith('^')) {
    extractedMd = extractBlockMarkdown(rawMd, sectionOrBlock);
  } else {
    extractedMd = extractSectionMarkdown(rawMd, sectionOrBlock);
  }

  // If extraction failed, treat as non-tracked (no content to show)
  if (!extractedMd.trim()) {
    return '<span class="link-not-tracked">link not tracked</span>';
  }

  // Resolve links *inside the transcluded content* using the transcluded page's own map,
  // but calculate relative URLs as if the final page is the caller.
  const linkResolutionMapForSourcePage =
    allLinkResolutionMaps?.get(resolved.pageIdent) ?? undefined;

  // First, recursively expand nested transclusions inside the extracted markdown.
  const expandedMd = extractedMd.replace(/!\[\[(.*?)\]\]/g, (_m: string, inner: string) => {
    return renderTransclusionToHtml(inner, {
      ...options,
      // The page containing this nested embed is the transcluded page, so resolve target from that page's context.
      linkResolutionMapForCaller: linkResolutionMapForSourcePage,
      isNested: true,
      visited,
      remainingDepth: remainingDepth - 1,
    });
  });

  // Convert remaining wiki links and images into proper markdown/HTML with final-page-relative URLs
  const processedMdForLinks = convertWikiLinksInMarkdown(expandedMd, sitePageConfigs, {
    siteConfig,
    siteSlug,
    baseContentDirectory,
    baseOutputFolder,
    finalPageDirectory,
    linkResolutionMapForSourcePage,
  });

  configureMarkedExternalLinksOnce();
  const finalMd = replaceSrsCardsWithCustomElements(
    customProcessEmbeddedMarkdown(processedMdForLinks, siteSlug),
    (fragment: string) => unwrapSingleParagraph(marked(fragment) as string)
  );
  const innerHtml = marked(finalMd) as string;

  // Build see-in-context link to the transcluded page (top-level only)
  const targetPath = resolved.directory
    ? `${resolved.directory}/${resolved.normalizedOutputTitle}.html`
    : `${resolved.normalizedOutputTitle}.html`;
  const rel = calculateRelativePath(finalPageDirectory, targetPath);
  const seeInContextHref = encodePathForUrl(rel);

  return wrapTransclusionHtml(innerHtml, seeInContextHref, isNested);
}

