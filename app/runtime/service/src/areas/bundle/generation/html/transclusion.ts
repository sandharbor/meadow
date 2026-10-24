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
import type { BundleNodeConfig } from '../../../../../../../contracts/types/shared/bundle-graph/bundleNodeConfig.js';
import type { BundleConfig } from '../../../../../../../contracts/types/shared/bundle-config/bundleConfig.js';
import type { LinkResolvedInfo } from '../../../../../../../contracts/types/shared/bundle-graph/IBundleNode.js';
import { encodePathForUrl } from '../../../../../../../shared_code/utils/urlUtils.js';
import {
  isImageLikeWikiLink,
  linkOrImageHtml as linkOrImageHtmlService,
} from './linkModificationService.js';
import {
  calculateRelativePath,
  getMdContent,
  linkTextToLinkInfo,
  normalizePageTitle,
} from './shared.js';
import { replaceOutsideCode, splitMarkdownBlocks } from './markdown.js';
import { findCodeRanges } from './markdownCode.js';
import { styleBlockIds } from './pageAnchors.js';
import { markdownLinks, withInternalLinks } from './markedLinks.js';
import { HooksLoader } from '../utils/hooksLoader.js';
import { replaceSrsCardsWithCustomElements } from '../render-source/srsMarkdown.js';

/**
 * Rendered embeds waiting to be put into their page. An embed is rendered to
 * HTML as soon as it is found, but the page's remaining text passes and marked
 * must not read that HTML as Markdown (a `[[link]]` inside the embedded
 * note's code is text), so the page holds a placeholder and restores the HTML
 * after marked has run.
 */
export class HeldEmbeds {
  private readonly html: string[] = [];

  // The placeholder is a <div>, like the embed it stands for, so marked
  // treats the lines around it the same way.
  hold(html: string): string {
    return `<div data-meadow-embed="${this.html.push(html) - 1}"></div>`;
  }

  restore(rendered: string): string {
    return rendered.replace(/<div data-meadow-embed="(\d+)"><\/div>/g, (_match, index: string) => this.html[Number(index)]);
  }
}

export interface MarkdownLink {
  href: string;
  title?: string | null;
  textHtml: string;
  isImage: boolean;
}

export interface TransclusionOptions {
  /** Directory of the final page that will contain this transclusion (for relative URL calculation) */
  finalPageDirectory: string;
  /** Root directory of the active source content phase */
  baseContentDirectory: string;
  /** Root directory of generated HTML output (for images) */
  baseOutputFolder: string;

  bundleNodeConfigs: BundleNodeConfig[];
  bundleConfig: BundleConfig;
  bundleSlug?: string;

  /** Link resolution map for the page that *contains* the transclusion syntax */
  linkResolutionMapForCaller?: Record<string, LinkResolvedInfo>;
  /** All link resolution maps, keyed by page ident, for resolving links within the transcluded page's own context */
  allLinkResolutionMaps?: Map<EncodedBundleNodeKey, Record<string, LinkResolvedInfo>>;

  /** Whether this transclusion is nested inside another transclusion */
  isNested?: boolean;
  /**
   * The embeds that contain this one. Embedding one of them again would be a
   * cycle; embedding the same note twice side by side is not.
   */
  visited?: Set<string>;
  /** Hard recursion depth limit */
  remainingDepth?: number;
  /**
   * Renders a Markdown link or image in the embedded content to a note of the
   * source graph, given the embedded page's link resolution map, or returns
   * null to leave it as written. URLs are relative to the final page.
   */
  renderMarkdownLink?: (link: MarkdownLink, linkResolutionMap?: Record<string, LinkResolvedInfo>) => string | null;
}

interface ResolvedPageTarget {
  title: string;
  directory: string;
  bundleNodeConfig: BundleNodeConfig;
  pageIdent: EncodedBundleNodeKey;
  normalizedOutputTitle: string;
}

const DEFAULT_REMAINING_DEPTH = 10;

function configureMarkedExternalLinksOnce(): void {
  // Marked is global-ish; ensure we match the renderer behavior used in htmlGenerator.ts
  marked.setOptions({
    gfm: true,
    breaks: false,
    pedantic: false,
  });
  marked.use(markdownLinks);
}

function unwrapSingleParagraph(html: string): string {
  const trimmed = html.trim();
  const match = trimmed.match(/^<p>([\s\S]*)<\/p>$/);
  if (!match || match[1].includes('</p>')) {
    return trimmed;
  }
  return match[1].trim();
}

function customProcessEmbeddedMarkdown(mdContent: string, bundleSlug?: string, bundleConfig?: BundleConfig): string {
  if (bundleSlug) {
    return HooksLoader.tryExecuteMarkdownProcessingPage(bundleSlug, mdContent, bundleConfig);
  }
  return mdContent;
}

function pageIdentFor(title: string, directory: string): EncodedBundleNodeKey {
  const dir = (directory || '').replace(/\/+$/, '');
  return serializeBundleNodeKey(fileNodeKeyFromSourceGraphPath(dir ? `${dir}/${title}.md` : `${title}.md`));
}

function findPageConfig(
  resolvedTitle: string,
  resolvedDirectory: string,
  linkHasExplicitPath: boolean,
  bundleNodeConfigs: BundleNodeConfig[]
): BundleNodeConfig | undefined {
  // Exact match first (title + directory)
  const exact = bundleNodeConfigs.find(
    (c) =>
      c.bundleNodeKind === 'file' && c.bundleNodeName === resolvedTitle &&
      (c.sourceGraphSubdirectory || '') === (resolvedDirectory || '') &&
      (c.fileType === 'md' || !c.fileType)
  );
  if (exact) {
    return exact;
  }

  // Fallback: if caller didn't specify an explicit path, allow title-only lookup
  if (!linkHasExplicitPath) {
    return bundleNodeConfigs.find((c) => c.bundleNodeKind === 'file' && c.bundleNodeName === resolvedTitle && c.fileType === 'md');
  }

  return undefined;
}

function resolveTargetFromCallerContext(
  linkText: string,
  bundleNodeConfigs: BundleNodeConfig[],
  bundleConfig: BundleConfig,
  bundleSlug: string | undefined,
  linkResolutionMapForCaller: Record<string, LinkResolvedInfo> | undefined
): ResolvedPageTarget | null {
  const linkInfo = linkTextToLinkInfo(linkText);
  if (linkInfo.type !== 'page') {
    return null;
  }

  const originalFilename = linkInfo.filename;
  const linkHasExplicitPath = originalFilename.includes('/');

  const resolvedInfo = linkResolutionMapForCaller?.[linkText];
  if (resolvedInfo && !resolvedInfo.link_resolved_target_path) return null;
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

  const cfg = findPageConfig(resolvedTitle, resolvedDirectory, Boolean(resolvedInfo) || linkHasExplicitPath, bundleNodeConfigs);
  if (!cfg || cfg.listType !== 'whitelist') {
    return null;
  }

  const normalizedOutputTitle = bundleSlug ? normalizePageTitle(cfg.bundleNodeName, bundleConfig, bundleSlug) : cfg.bundleNodeName;
  const directory = cfg.sourceGraphSubdirectory || '';

  return {
    title: cfg.bundleNodeName,
    directory,
    bundleNodeConfig: cfg,
    pageIdent: pageIdentFor(cfg.bundleNodeName, directory),
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

  // A line inside a code block, such as a shell `# comment`, is not a heading.
  const codeLines = blockCodeLineIndexes(md);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = codeLines.has(i) ? null : /^(#{1,6})\s+(.*)$/.exec(line.trim());
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
    const match = codeLines.has(i) ? null : /^(#{1,6})\s+/.exec(line.trim());
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

/** The indexes of the lines that are inside fenced or indented code blocks. */
function blockCodeLineIndexes(md: string): Set<number> {
  const indexes = new Set<number>();
  let lineStart = 0;
  const lineStarts = md.split('\n').map(line => {
    const start = lineStart;
    lineStart += line.length + 1;
    return start;
  });
  for (const range of findCodeRanges(md).filter(r => r.kind === 'block')) {
    lineStarts.forEach((start, index) => {
      if (start >= range.start && start < range.end) indexes.add(index);
    });
  }
  return indexes;
}

const LIST_ITEM_LINE = /^([ \t]*)(?:[-*+]|\d{1,9}[.)])[ \t]/;

function extractBlockMarkdown(md: string, blockIdWithOptionalCaret: string): string {
  const id = blockIdWithOptionalCaret.replace(/^\^/, '').trim();
  if (!id) return '';

  // The identifier ends its line, so `^key` is not found inside `^key-insight`.
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const identifierLine = new RegExp(`(?:^|\\s)\\^${escapedId}[ \t]*$`);

  const blocks = splitMarkdownBlocks(md);
  const match = blocks.find((b) => b.content.split('\n').some(line => identifierLine.test(line)));
  if (!match) return '';

  // An identifier on a list item names that item, with anything nested under
  // it, rather than the whole list.
  const lines = match.content.split('\n');
  const itemIndex = lines.findIndex(line => identifierLine.test(line));
  const item = LIST_ITEM_LINE.exec(lines[itemIndex]);
  if (!item) return match.content.trim();
  const indent = item[1].length;
  let last = itemIndex;
  while (last + 1 < lines.length && /^[ \t]*/.exec(lines[last + 1])![0].length > indent) last++;
  return lines.slice(itemIndex, last + 1).map(line => line.slice(indent)).join('\n');
}

function convertWikiLinksInMarkdown(
  md: string,
  bundleNodeConfigs: BundleNodeConfig[],
  options: {
    bundleConfig: BundleConfig;
    bundleSlug?: string;
    baseContentDirectory: string;
    baseOutputFolder: string;
    finalPageDirectory: string;
    linkResolutionMapForSourcePage?: Record<string, LinkResolvedInfo>;
  }
): string {
  function linkOrImageHtml(linkText: string): string {
    return linkOrImageHtmlService(linkText, bundleNodeConfigs, {
      bundleConfig: options.bundleConfig,
      bundleSlug: options.bundleSlug,
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
    bundleNodeConfigs,
    bundleConfig,
    bundleSlug,
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
    bundleNodeConfigs,
    bundleConfig,
    bundleSlug,
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
  const enclosingEmbeds = new Set([...visited, visitKey]);

  // Read markdown from active source-content root + page directory
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
  const nestedEmbeds = new HeldEmbeds();
  const expandedMd = replaceOutsideCode(extractedMd, /!\[\[(.*?)\]\]/g, (_m: string, inner: string) => {
    if (isImageLikeWikiLink(inner, linkResolutionMapForSourcePage)) {
      return `![[${inner}]]`;
    }
    return nestedEmbeds.hold(renderTransclusionToHtml(inner, {
      ...options,
      // The page containing this nested embed is the transcluded page, so resolve target from that page's context.
      linkResolutionMapForCaller: linkResolutionMapForSourcePage,
      isNested: true,
      visited: enclosingEmbeds,
      remainingDepth: remainingDepth - 1,
    }));
  });

  // Markdown links in the embedded content resolve with the embedded page's map,
  // like its wikilinks. Those with unescaped spaces in their destination are not
  // links to marked, so they are rendered here; marked renders the rest.
  const renderMarkdownLink = (link: MarkdownLink) =>
    options.renderMarkdownLink?.(link, linkResolutionMapForSourcePage) ?? null;
  const withSpacedMarkdownLinks = replaceOutsideCode(
    expandedMd,
    /(!?)\[([^\]]+)\]\(([^)]+)\)/g,
    (match: string, bang: string, text: string, href: string) =>
      renderMarkdownLink({ href, textHtml: text, isImage: bang === '!' }) ?? match
  );

  // Convert remaining wiki links and images into proper markdown/HTML with final-page-relative URLs
  const processedMdForLinks = convertWikiLinksInMarkdown(withSpacedMarkdownLinks, bundleNodeConfigs, {
    bundleConfig,
    bundleSlug,
    baseContentDirectory,
    baseOutputFolder,
    finalPageDirectory,
    linkResolutionMapForSourcePage,
  });

  configureMarkedExternalLinksOnce();
  const finalMd = replaceSrsCardsWithCustomElements(
    customProcessEmbeddedMarkdown(processedMdForLinks, bundleSlug, bundleConfig),
    (fragment: string) => unwrapSingleParagraph(marked(fragment) as string)
  );
  // The embedded page's block ids are styled but not made into ids here.
  const innerHtml = nestedEmbeds.restore(
    withInternalLinks(renderMarkdownLink, () => marked(styleBlockIds(finalMd, { linkable: false })) as string)
  );

  // Build see-in-context link to the transcluded page (top-level only)
  const targetPath = resolved.directory
    ? `${resolved.directory}/${resolved.normalizedOutputTitle}.html`
    : `${resolved.normalizedOutputTitle}.html`;
  const rel = calculateRelativePath(finalPageDirectory, targetPath);
  const seeInContextHref = encodePathForUrl(rel);

  return wrapTransclusionHtml(innerHtml, seeInContextHref, isNested);
}

import { serializeBundleNodeKey, fileNodeKeyFromSourceGraphPath } from '../../../../../../../shared_code/utils/bundleNodeKey.js';

import type { EncodedBundleNodeKey } from '../../../../../../../contracts/types/shared/bundle-graph/bundleNodeKey.js';
