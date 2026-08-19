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
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { marked } from 'marked';
import markedFootnote from 'marked-footnote';
import customHeadingId from 'marked-custom-heading-id';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import * as nodeEmoji from 'node-emoji';
import { extendedSyntaxExtensions } from './markedExtensions.js';
import handlebars from 'handlebars';
import { Page } from './page.js';
import {
  PageNameToPage,
  InverseLinks,
  RenderOptions,
  BacklinkContext
} from './types.js';
import { BundleConfig } from '../../../../../../shared_code/types/bundleConfig.js';
import { BundleNodeConfig } from '../../../../../../shared_code/types/bundleNodeConfig.js';
import {
  normalizePageTitle,
  getMdContent,
  anchorNameFor,
  linkTextToLinkInfo,
  markdownContentToPageLinkFilenames,
  calculateRelativePath,
  escapeHtmlAttribute
} from './shared.js';
import {
  isImageLikeWikiLink,
  linkOrImageHtml as linkOrImageHtmlService,
  resolveTrackedLinkHref,
  type MediaEmbedOptions,
} from './linkModificationService.js';
import type { LinkResolvedInfo } from '../../../../../../shared_code/types/IBundleNode.js';
import { IMAGE_FILE_TYPES, KNOWN_FILE_TYPES } from './constants.js';
import { encodePathForUrl } from '../../../../../../shared_code/utils/urlUtils.js';
import { HooksLoader } from '../utils/hooksLoader.js';
import { frontmatterAsDict, replaceOutsideCode, splitMarkdownBlocks } from './markdown.js';
import { renderTransclusionToHtml } from './transclusion.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';
import { SOURCES_EXPORT_MANIFEST_FILENAME } from '../../../../shared/utils/zipUtils.js';
import {
  CUSTOMIZATION_ASSETS_DIRECTORY,
  SOURCES_EXPORT_ASSETS_DIRECTORY,
  SPACED_REPETITION_ASSETS_DIRECTORY,
} from '../customizationAssets.js';
import {
  OPEN_KNOWLEDGE_FORMAT_ASSETS_DIR,
  OPEN_KNOWLEDGE_FORMAT_BUNDLE_DIR,
  OPEN_KNOWLEDGE_FORMAT_MANIFEST_FILENAME
} from '../open-knowledge-format/openKnowledgeFormatArchive.js';
import { replaceSrsCardsWithCustomElements } from '../render-source/srsMarkdown.js';

export interface CollectedSrsCard {
  guid: string;
  kind: string;
  promptHtml: string;
  answerHtml: string;
  siblingGroup?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let cachedPageTemplatePath = '';
let cachedPageTemplateMtimeMs = -1;
let cachedPageTemplate: ReturnType<typeof handlebars.compile> | null = null;

function getPageTemplate(): ReturnType<typeof handlebars.compile> {
  const templatePath = path.join(__dirname, 'templates', 'page.html');
  const mtimeMs = fs.statSync(templatePath).mtimeMs;
  if (!cachedPageTemplate || cachedPageTemplatePath !== templatePath || cachedPageTemplateMtimeMs !== mtimeMs) {
    const templateSource = fs.readFileSync(templatePath, 'utf-8');
    cachedPageTemplate = handlebars.compile(templateSource);
    cachedPageTemplatePath = templatePath;
    cachedPageTemplateMtimeMs = mtimeMs;
  }
  return cachedPageTemplate;
}

// Configure marked once at module load. marked is a singleton; calling
// `marked.use` on every render would accumulate extensions and slow rendering
// to a crawl on larger bundles.
const markedRenderer = new marked.Renderer();
markedRenderer.link = function (linkData: { href: string; title?: string | null; text: string }) {
  const { href, title, text } = linkData;
  const titleAttr = title ? ` title="${title}"` : '';
  const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
  if (isExternal) {
    return `<a href="${href}"${titleAttr} rel="noreferrer noopener" target="_blank">${text}</a>`;
  }
  return `<a href="${href}"${titleAttr}>${text}</a>`;
};

marked.setOptions({ gfm: true, breaks: false, pedantic: false });
marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        } catch {
          // Fall through to unhighlighted code.
        }
      }
      return code;
    }
  }),
  { renderer: markedRenderer },
  customHeadingId(),
  markedFootnote(),
  ...extendedSyntaxExtensions
);

export function customProcessBacklinksMarkdown(mdContent: string, bundleSlug?: string): string {
  if (bundleSlug) {
    return HooksLoader.tryExecuteMarkdownProcessingBacklinks(bundleSlug, mdContent);
  }
  // No processing if no bundleSlug - hooks system handles all custom logic
  return mdContent;
}

export function customProcessPageMarkdown(mdContent: string, bundleSlug?: string): string {
  if (bundleSlug) {
    return HooksLoader.tryExecuteMarkdownProcessingPage(bundleSlug, mdContent);
  }
  // No processing if no bundleSlug - hooks system handles all custom logic
  return mdContent;
}

function unwrapSingleParagraph(html: string): string {
  const trimmed = html.trim();
  const match = trimmed.match(/^<p>([\s\S]*)<\/p>$/);
  if (!match || match[1].includes('</p>')) {
    return trimmed;
  }
  return match[1].trim();
}

export function renderPageToHtml(
  directory: string,
  pageNameToPage: PageNameToPage,
  pageName: string,
  outputFilename: string,
  outputFolder: string,
  inverseLinks: InverseLinks,
  bundleConfig: BundleConfig,
  bundleConfigFile: string,
  bundleNodeConfigs: BundleNodeConfig[],
  options: RenderOptions = {},
  bundleSlug?: string,
  currentPageDirectory?: string,  // The source directory of the current page
  baseContentDirectory?: string,  // Base source-content directory for image lookups
  baseOutputFolder?: string,  // Base generated HTML directory for image output
  linkResolutionMap?: Record<string, LinkResolvedInfo>,  // Pre-computed link resolution map
  allLinkResolutionMaps?: Map<string, Record<string, LinkResolvedInfo>>  // All page link resolution maps for transclusion
): { htmlPath: string | null; htmlContent: string | null; srsCards: CollectedSrsCard[] } {
  const {
    processBacklinks = true,
    processingMode = 'each-page',
    showBacklinkContext = false,
    skipUninterestingLeafPages = false,
    preserveFrontmatter = false,
    showBreadcrumbs = false,
    showHoverPreview = false,
    breadcrumbPath = [],
    breadcrumbBundleNodeIds = [],
    routeTable,
    currentOutputDirectory = currentPageDirectory ?? '',
    staticAssetNames,
    sourcesExportEnabled,
    openKnowledgeFormatEnabled,
    srsEnabled = false,
    searchEnabled = false,
    folderNavigation,
  } = options;

  const mdPath = Page.findFullFilesystemPath(directory, pageName);
  if (!fs.existsSync(mdPath)) {
    logger.warn(`render_page_to_html: md_path not found: ${mdPath}`);
    return { htmlPath: null, htmlContent: null, srsCards: [] };
  }

  const rawMdContent = getMdContent(directory, pageName, true);
  const initialMdContent = getMdContent(directory, pageName, false);

  const page = pageNameToPage[pageName];

  if (skipUninterestingLeafPages && page?.isUninterestingLeafPage()) {
    logger.debug(`Skipping ${pageName} as it is an uninteresting leaf page`);
    return { htmlPath: null, htmlContent: null, srsCards: [] };
  }

  let mdContent = customProcessPageMarkdown(initialMdContent, bundleSlug);
  const markdownForAnchors = mdContent;

  interface WikiLinkOverrides {
    linkResolutionMapOverride?: Record<string, LinkResolvedInfo>;
    currentPageDirectoryOverride?: string;
    mediaEmbedOptions?: MediaEmbedOptions;
  }

  function linkOrImageHtml(linkText: string, highlightDoNotLinkPageName?: string, overrides?: WikiLinkOverrides): string {
    return linkOrImageHtmlService(linkText, bundleNodeConfigs, {
      pageNameToPage,
      bundleConfig,
      bundleSlug,
      directory,
      baseContentDirectory,
      outputFolder,
      baseOutputFolder,
      processingMode,
      skipUninterestingLeafPages,
      highlightDoNotLinkPageName,
      currentPageDirectory: overrides?.currentPageDirectoryOverride ?? currentPageDirectory,
      linkResolutionMap: overrides?.linkResolutionMapOverride ?? linkResolutionMap,
      allLinkResolutionMaps,
      mediaEmbedOptions: overrides?.mediaEmbedOptions,
      routeTable,
      currentOutputDirectory,
    });
  }

  function parseDirectiveBoolean(value: string): boolean | undefined {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return undefined;
  }

  function parseMeadowDirectiveOptions(body: string): MediaEmbedOptions {
    const options: MediaEmbedOptions = {};
    for (const line of body.split('\n')) {
      const match = line.match(/^\s*(enableEmbeddedLinks|enableFullscreenButton|enableOpenDedicatedPage)\s*:\s*(.+?)\s*$/);
      if (!match) continue;
      const value = parseDirectiveBoolean(match[2]);
      if (value === undefined) continue;
      options[match[1] as keyof MediaEmbedOptions] = value;
    }
    return options;
  }

  function renderMeadowContainerDirective(body: string, highlightDoNotLinkPageName?: string, overrides?: WikiLinkOverrides): string {
    const embedMatch = body.match(/!\[\[([^\]]+)\]\]/);
    if (!embedMatch) {
      return body.trim();
    }
    const linkText = embedMatch[1];
    const effectiveLinkResolutionMap = overrides?.linkResolutionMapOverride ?? linkResolutionMap;
    const resolvedTargetPath = effectiveLinkResolutionMap?.[linkText]?.link_resolved_target_path ?? '';
    const linkInfo = linkTextToLinkInfo(linkText);
    const lowerFilename = linkInfo.filename.toLowerCase();
    const lowerResolvedTargetPath = resolvedTargetPath.toLowerCase();
    const isConfigurableMedia = lowerFilename.endsWith('.excalidraw')
      || lowerResolvedTargetPath.endsWith('.excalidraw')
      || lowerFilename.endsWith('.svg')
      || lowerResolvedTargetPath.endsWith('.svg');
    if (!isImageLikeWikiLink(linkText, effectiveLinkResolutionMap) || !isConfigurableMedia) {
      return body.trim();
    }
    return linkOrImageHtml(linkText, highlightDoNotLinkPageName, {
      ...overrides,
      mediaEmbedOptions: {
        ...parseMeadowDirectiveOptions(body),
        ...overrides?.mediaEmbedOptions,
      },
    });
  }

  function convertWikiLinks(mdContent: string, highlightDoNotLinkPageName?: string, overrides?: WikiLinkOverrides): string {
    mdContent = replaceOutsideCode(
      mdContent,
      /(^|\n):::\s*meadow\s*\n([\s\S]*?)\n:::(?=\n|$)/g,
      (_match: string, prefix: string, body: string) =>
        `${prefix}${renderMeadowContainerDirective(body, highlightDoNotLinkPageName, overrides)}`
    );

    // First, handle image links with exclamation marks
    mdContent = replaceOutsideCode(mdContent, /!\[\[(.*?)\]\]/g, (_match: string, linkText: string) => {
      // Obsidian-style embeds: images stay images; otherwise treat as transclusion.
      const effectiveLinkResolutionMap = overrides?.linkResolutionMapOverride ?? linkResolutionMap;
      if (isImageLikeWikiLink(linkText, effectiveLinkResolutionMap)) {
        return linkOrImageHtml(linkText, highlightDoNotLinkPageName, overrides);
      }

      // Transclusion (full page / section / block)
      const contentRoot = baseContentDirectory || directory;
      const outputRoot = baseOutputFolder || outputFolder;

      if (!contentRoot || !outputRoot) {
        return '<span class="link-not-tracked">link not tracked</span>';
      }

      return renderTransclusionToHtml(linkText, {
        finalPageDirectory: overrides?.currentPageDirectoryOverride ?? currentPageDirectory ?? '',
        baseContentDirectory: contentRoot,
        baseOutputFolder: outputRoot,
        bundleNodeConfigs,
        bundleConfig,
        bundleSlug,
        linkResolutionMapForCaller: overrides?.linkResolutionMapOverride ?? linkResolutionMap,
        allLinkResolutionMaps,
        isNested: false,
      });
    });

    // Then handle regular wiki links
    mdContent = replaceOutsideCode(mdContent, /\[\[(.*?)\]\]/g, (_match: string, linkText: string) =>
      linkOrImageHtml(linkText, highlightDoNotLinkPageName, overrides)
    );

    // Handle standard markdown file links: [text](relative/path.md) and ![alt](relative/path.png)
    // These must be processed before marked because marked cannot handle spaces in URLs.
    // We match both [text](href) and ![alt](href), skip external links and anchor-only links.
    mdContent = replaceOutsideCode(mdContent, /(!?)\[([^\]]+)\]\(([^)]+)\)/g, (match: string, bang: string, text: string, href: string) => {
      // Skip external links
      if (href.startsWith('http://') || href.startsWith('https://')) {
        return match;
      }
      // Skip anchor-only links
      if (href.startsWith('#')) {
        return match;
      }

      const effectiveLinkResolutionMap = overrides?.linkResolutionMapOverride ?? linkResolutionMap;
      const effectivePageDir = overrides?.currentPageDirectoryOverride ?? currentPageDirectory ?? '';
      const resolvedInfo = effectiveLinkResolutionMap?.[href];

      if (!resolvedInfo) {
        // Link not in resolution map -- might point outside the bundle
        const hrefLower = href.toLowerCase().split(/[?#]/)[0];
        if (KNOWN_FILE_TYPES.some(ext => hrefLower.endsWith(`.${ext}`))) {
          return '<span class="link-not-tracked">link not tracked</span>';
        }
        return match;
      }

      const resolvedPath = resolvedInfo.link_resolved_target_path ?? '';
      const targetDir = resolvedInfo.link_resolved_target_directory ?? '';
      const fileName = resolvedPath.split('/').pop() ?? '';
      const extMatch = resolvedPath.match(/\.([^.]+)$/);
      const fileType = extMatch ? extMatch[1].toLowerCase() : 'md';
      const isImage = IMAGE_FILE_TYPES.includes(fileType);

      if (isImage) {
        // Copy image to output
        const contentDir = baseContentDirectory || directory;
        const outputDir = baseOutputFolder || outputFolder;
        if (contentDir && outputDir) {
          const imageSrc = targetDir
            ? path.join(contentDir, targetDir, fileName)
            : path.join(contentDir, fileName);
          const imageOutputDir = targetDir
            ? path.join(outputDir, targetDir)
            : outputDir;
          if (targetDir && !fs.existsSync(imageOutputDir)) {
            fs.mkdirSync(imageOutputDir, { recursive: true });
          }
          const imageDest = path.join(imageOutputDir, fileName);
          if (fs.existsSync(imageSrc)) {
            fs.copyFileSync(imageSrc, imageDest);
          }
        }

        const imageTargetPath = targetDir ? `${targetDir}/${fileName}` : fileName;
        const relativeImagePath = calculateRelativePath(effectivePageDir, imageTargetPath);
        const encodedPath = encodePathForUrl(relativeImagePath);

        if (bang === '!') {
          // Image embed ![alt](path)
          return `<img src="${encodedPath}" alt="${text}" />`;
        } else {
          // Link to image [text](path)
          return `<a href="${encodedPath}">${text}</a>`;
        }
      }

      // Rendered page link (Markdown or native HTML)
      const resolvedTitle = fileName.replace(/\.(?:md|html)$/i, '');
      const renderedPageFileType = fileType === 'html' ? 'html' : 'md';

      let linkConfig = bundleNodeConfigs.find(c =>
        c.bundleNodeKind === 'file' && c.bundleNodeName === resolvedTitle &&
        (c.sourceGraphSubdirectory || '') === targetDir &&
        (c.fileType || 'md') === renderedPageFileType &&
        c.listType === 'whitelist'
      );
      if (!linkConfig) {
        linkConfig = bundleNodeConfigs.find(c =>
          c.bundleNodeKind === 'file' && c.bundleNodeName === resolvedTitle &&
          (c.fileType || 'md') === renderedPageFileType &&
          c.listType === 'whitelist'
        );
      }

      if (!linkConfig) {
        return '<span class="link-not-tracked">link not tracked</span>';
      }

      const normalizedTitle = bundleConfig && bundleSlug
        ? normalizePageTitle(linkConfig.bundleNodeName, bundleConfig, bundleSlug)
        : linkConfig.bundleNodeName;

      // Highlight self-links (links back to the current page) as non-clickable
      if (highlightDoNotLinkPageName &&
          (resolvedTitle.toLowerCase() === highlightDoNotLinkPageName.toLowerCase())) {
        return `<span class="highlight-do-not-link">${normalizedTitle}</span>`;
      }

      // Centralised URL build: resolved-target → relative-href, gated by
      // whitelist. Same helper that drives the wiki-link page branch.
      const relativeUrl = resolveTrackedLinkHref({
        resolved: resolvedInfo,
        hostPageDirectory: effectivePageDir,
        bundleNodeConfigs,
        bundleConfig,
        bundleSlug,
        routeTable,
        hostOutputDirectory: currentOutputDirectory,
      });
      if (relativeUrl === null) {
        return '<span class="link-not-tracked">link not tracked</span>';
      }

      if (processingMode === 'each-page') {
        return `<a href="${relativeUrl}">${text}</a>`;
      } else if (processingMode === 'single-page') {
        return `<a href="#${anchorNameFor(normalizedTitle)}">${text}</a>`;
      }

      return match;
    });

    return mdContent;
  }

  function renderMarkdownFragmentToHtml(fragment: string): string {
    const convertedFragment = convertWikiLinks(fragment);
    const fragmentHtml = marked(convertedFragment) as string;
    return unwrapSingleParagraph(fragmentHtml);
  }

  const collectedSrsCards: CollectedSrsCard[] = [];
  if (srsEnabled) {
    mdContent = replaceSrsCardsWithCustomElements(mdContent, renderMarkdownFragmentToHtml, (card) => {
      collectedSrsCards.push(card);
    });
  }

  let convertedContent = convertWikiLinks(mdContent);

  // Strip Obsidian-style comments (%%...%%) outside code fences.
  // Block comments: %% on its own line ... %% on its own line
  convertedContent = replaceOutsideCode(
    convertedContent,
    /%%[\s\S]*?%%/g,
    () => ''
  );

  // Convert :shortcode: emoji outside code fences.
  convertedContent = replaceOutsideCode(
    convertedContent,
    /:([a-z0-9_+-]+):/gi,
    (match: string, name: string) => (nodeEmoji.has(name) ? nodeEmoji.get(name) ?? match : match)
  );

  if (convertedContent.startsWith('http')) {
    const lines = convertedContent.split('\n');
    if (lines.length > 1 && lines[1].trim() === '') {
      const url = lines[0].trim();
      const convertedFirstLine = `[${url}](${url})`;
      convertedContent = convertedFirstLine + '\n' + lines.slice(1).join('\n');
    }
  }

  let convertedContentWithAnchors = convertedContent;
  if (showBacklinkContext) {
    // Pass mdContent as the original for hashing to ensure consistency with backlink context
    convertedContentWithAnchors = addBlockAnchors(convertedContent, markdownForAnchors);
  }

  // Style block identifiers (e.g. ^foo-bar) as small superscript text
  convertedContentWithAnchors = replaceOutsideCode(
    convertedContentWithAnchors,
    / \^([a-zA-Z0-9][a-zA-Z0-9_-]*)/g,
    (_match: string, id: string) => ` <sup class="block-id">^${id}</sup>`
  );

  let htmlContent = marked(convertedContentWithAnchors) as string;

  function createFrontmatterTable(frontmatter: Record<string, unknown>): string | null {
    if (Object.keys(frontmatter).length === 0) {
      return null;
    }
    
    let frontmatterTable = "<table class='frontmatter'>\n";
    for (const [key, value] of Object.entries(frontmatter)) {
      const keyStr = typeof key === 'string' ? key : String(key);
      let valueStr: string;
      
      if (value === null || value === undefined) {
        valueStr = '';
      } else if (typeof value === 'string') {
        valueStr = value;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        valueStr = String(value);
      } else {
        // For objects and other types, use JSON.stringify
        try {
          valueStr = JSON.stringify(value);
        } catch {
          valueStr = '[Complex Object]';
        }
      }
      
      if (typeof valueStr === 'string' && valueStr.startsWith('"') && valueStr.endsWith('"')) {
        valueStr = valueStr.slice(1, -1);
      }
      
      let valueCell = convertWikiLinks(valueStr);
      valueCell = marked(valueCell) as string;
      
      if (valueCell.startsWith('<p>') && valueCell.endsWith('</p>')) {
        valueCell = valueCell.slice(3, -4);
      }
      
      frontmatterTable += `<tr><td>${keyStr}</td><td>${valueCell}</td></tr>\n`;
    }
    frontmatterTable += "</table>\n";
    return frontmatterTable;
  }

  if (preserveFrontmatter) {
    const frontmatter = frontmatterAsDict(rawMdContent);
    const frontmatterTable = createFrontmatterTable(frontmatter);
    if (frontmatterTable) {
      htmlContent = `${frontmatterTable}\n\n<hr>\n\n${htmlContent}`;
    }
  }

  // After markdown conversion, modify the HTML to add our custom classes
  htmlContent = htmlContent
    .replace(/<pre><code>/g, '<pre><code class="fenced-code">')
    .replace(/<code>/g, '<code class="inline-code">')
  // After converting markdown to HTML, process mermaid diagrams
  htmlContent = processMermaidDiagrams(htmlContent);

  // Ensure a newline after block-level closing tags (</pre>, </div>) when
  // followed by an opening tag, so the next element doesn't run into them on
  // the same line. The (?=<[^/]) lookahead avoids splitting nested closing
  // tags like </div></div>.
  htmlContent = htmlContent.replace(/<\/(pre|div)>(?=<[^/])/g, '</$1>\n');

  // Generate backlinks HTML separately (for footer section)
  let backlinksHtml = '';
  if (processBacklinks) {
    // Add backlinks section
    // Try path-prefixed key first (e.g., "t011/page name") for links that
    // include a directory path. Fall back to title-only for links without paths.
    const pathPrefixedKey = currentPageDirectory ? `${currentPageDirectory}/${pageName}` : null;
    const backlinkList = (pathPrefixedKey && inverseLinks[pathPrefixedKey])
      ? inverseLinks[pathPrefixedKey]
      : inverseLinks[pageName];
    if (backlinkList) {
      const backlinks = [...new Set(backlinkList)].sort();
      if (backlinks.length > 0) {
        if (processingMode === 'each-page') {
          backlinksHtml += "<h2>Backlinks</h2>\n<ul>\n";
        } else {
          backlinksHtml += "<h4>Backlinks</h4>\n<ul>\n";
        }
        
        for (const backlink of backlinks) {
          let shouldInclude = true;
          
          const backlinkConfig = bundleNodeConfigs.find(bundleNodeConfig => bundleNodeConfig.bundleNodeName === backlink);
          if (!backlinkConfig || backlinkConfig.listType !== 'whitelist') {
            shouldInclude = false;
          }
          
          if (backlink === bundleConfigFile.replace('.md', '')) {
            shouldInclude = false;
          }

          if (shouldInclude) {
            let backlinkContextHtml = '';
            
            // Get the backlink's source directory for relative path calculation
            const backlinkSourceDir = backlinkConfig?.sourceGraphSubdirectory || '';
            const normalizedBacklinkName = normalizePageTitle(backlink, bundleConfig, bundleSlug);

            if (showBacklinkContext) {
              // Find the backlink content in its subdirectory
              // Use baseContentDirectory (source-content root) as the base,
              // not `directory` which is the current page's directory
              const contentRoot = baseContentDirectory || directory;
              const backlinkDir = backlinkSourceDir
                ? `${contentRoot}/${backlinkSourceDir}`
                : contentRoot;
              const backlinkInfo = backlinkContext(backlinkDir, backlink, pageName, currentPageDirectory);

              // Look up the backlink source page's link resolution map so that
              // wiki links inside the context block resolve correctly.
              const backlinkPageIdent = backlinkSourceDir
                ? `${backlinkSourceDir}/${backlink}.md`
                : `/${backlink}.md`;
              const backlinkResolutionMap = allLinkResolutionMaps?.get(backlinkPageIdent);

              for (const info of backlinkInfo) {
                const anchorId = info.anchor_id;
                const block = info.content;
                const withFixedLinks = convertWikiLinks(block, pageName, {
                  linkResolutionMapOverride: backlinkResolutionMap,
                  currentPageDirectoryOverride: currentPageDirectory,
                });
                const withFixedLinksAndBreaks = customProcessBacklinksMarkdown(withFixedLinks, bundleSlug);
                const html = marked(withFixedLinksAndBreaks) as string;
                
                // Calculate relative path for "see in context" link
                const encodedBacklinkName = encodeURIComponent(normalizedBacklinkName);
                const conventionalTargetPath = backlinkSourceDir
                  ? `${backlinkSourceDir}/${normalizedBacklinkName}.html`
                  : `${normalizedBacklinkName}.html`;
                const plannedRoute = routeTable?.get(backlinkConfig!.bundleNodeId);
                const plannedTargetPath = plannedRoute !== conventionalTargetPath ? plannedRoute : undefined;
                const targetPath = plannedTargetPath ?? (backlinkSourceDir
                  ? `${backlinkSourceDir}/${encodedBacklinkName}.html`
                  : `${encodedBacklinkName}.html`);
                const relativeContextPath = calculateRelativePath(currentOutputDirectory, targetPath);
                const relativeContextUrl = plannedTargetPath
                  ? encodePathForUrl(relativeContextPath)
                  : relativeContextPath;
                
                backlinkContextHtml += `
              <div class="backlink-context-container">
                <div class="backlink-context">
                  ${html}
                </div>
                <a class="backlink-see-in-context" href="${relativeContextUrl}#${anchorId}"><i>see in context</i></a>
              </div>
            `;
              }
            }

          if (processingMode === 'each-page') {
            // Calculate relative path from current page to backlink page
            const encodedBacklinkName = encodeURIComponent(normalizedBacklinkName);
            const conventionalTargetPath = backlinkSourceDir
              ? `${backlinkSourceDir}/${normalizedBacklinkName}.html`
              : `${normalizedBacklinkName}.html`;
            const plannedRoute = routeTable?.get(backlinkConfig!.bundleNodeId);
            const plannedTargetPath = plannedRoute !== conventionalTargetPath ? plannedRoute : undefined;
            const targetPath = plannedTargetPath ?? (backlinkSourceDir
              ? `${backlinkSourceDir}/${encodedBacklinkName}.html`
              : `${encodedBacklinkName}.html`);
            const relativePath = calculateRelativePath(currentOutputDirectory, targetPath);
            const relativeUrl = plannedTargetPath ? encodePathForUrl(relativePath) : relativePath;
            backlinksHtml += `<li class="backlink"><a href="${relativeUrl}">${normalizedBacklinkName}</a>${backlinkContextHtml}</li>\n`;
          } else if (processingMode === 'single-page') {
            const anchor = anchorNameFor(normalizedBacklinkName);
            backlinksHtml += `<li class="backlink"><a href="#${anchor}">${normalizedBacklinkName}</a>${backlinkContextHtml}</li>\n`;
          }
          }
        }
        backlinksHtml += "</ul>\n";
      }
    }
  }

  const template = getPageTemplate();

  const pageTitle = normalizePageTitle(pageName, bundleConfig, bundleSlug);

  if (processingMode === 'single-page') {
    const anchor = anchorNameFor(pageTitle);
    htmlContent = `<h2 id='${anchor}'>Page: ${pageTitle}</h2>\n` + htmlContent;
  }

  // Calculate assets prefix based on current directory depth
  // Pages in subdirectories need to go up to find the shared assets
  const depth = currentOutputDirectory ? currentOutputDirectory.split('/').filter(p => p).length : 0;
  const assetsPrefix = '../'.repeat(depth) + '_mw_assets/';

  // Generate breadcrumb HTML if enabled
  let breadcrumbHtml = '';
  if (showBreadcrumbs && breadcrumbPath.length > 1) {
    // Don't show breadcrumbs on the initial page (breadcrumbPath would just be itself)
    const breadcrumbItems: string[] = [];
    
    for (let i = 0; i < breadcrumbPath.length; i++) {
      const pathPageTitle = breadcrumbPath[i];
      const isLast = i === breadcrumbPath.length - 1;
      const normalizedTitle = normalizePageTitle(pathPageTitle, bundleConfig, bundleSlug);
      
      if (isLast) {
        // Current page - no link, just text
        breadcrumbItems.push(`<span class="breadcrumb-current">${normalizedTitle}</span>`);
      } else {
        // Find the source directory of this breadcrumb page to compute relative path
        const breadcrumbBundleNodeConfig = breadcrumbBundleNodeIds[i]
          ? bundleNodeConfigs.find(c => c.bundleNodeId === breadcrumbBundleNodeIds[i])
          : bundleNodeConfigs.find(c => c.bundleNodeName === pathPageTitle);
        const breadcrumbSourceDir = breadcrumbBundleNodeConfig?.sourceGraphSubdirectory || '';
        const encodedBreadcrumbName = encodeURIComponent(normalizedTitle);
        const conventionalTargetPath = breadcrumbSourceDir
          ? `${breadcrumbSourceDir}/${normalizedTitle}.html`
          : `${normalizedTitle}.html`;
        const plannedRoute = breadcrumbBundleNodeConfig
          ? routeTable?.get(breadcrumbBundleNodeConfig.bundleNodeId)
          : undefined;
        const plannedTargetPath = plannedRoute !== conventionalTargetPath ? plannedRoute : undefined;
        const targetPath = plannedTargetPath ?? (breadcrumbSourceDir
          ? `${breadcrumbSourceDir}/${encodedBreadcrumbName}.html`
          : `${encodedBreadcrumbName}.html`);
        const relativePath = calculateRelativePath(currentOutputDirectory, targetPath);
        const relativeUrl = plannedTargetPath ? encodePathForUrl(relativePath) : relativePath;
        breadcrumbItems.push(`<a href="${relativeUrl}" class="breadcrumb-link">${normalizedTitle}</a>`);
      }
    }
    
    breadcrumbHtml = `<nav class="breadcrumbs" aria-label="Breadcrumb">${breadcrumbItems.join('<span class="breadcrumb-separator">→</span>')}</nav>`;
  }

  // Render the template with the HTML content
  const includeMermaid = htmlContent.includes('class="mermaid"') || htmlContent.includes('language-mermaid');
  const includeCallouts = htmlContent.includes('class="callout ');
  const includeExcalidraw = htmlContent.includes('meadow-excalidraw-embed') || htmlContent.includes('meadow-excalidraw-page');
  const includeSvgEmbed = htmlContent.includes('meadow-svg-embed');
  // Empty string means base was disabled; only pass to template if non-empty
  const styleCssRaw = staticAssetNames?.styleCss ?? 'style.css';
  const styleCss = styleCssRaw || undefined;
  const javascriptJsRaw = staticAssetNames?.javascriptJs ?? 'javascript.js';
  const javascriptJs = javascriptJsRaw || undefined;
  const mermaidMinJs = staticAssetNames?.mermaidMinJs ?? 'mermaid.min.js';
  const calloutsCss = staticAssetNames?.calloutsCss ?? 'callouts.css';
  const excalidrawCss = staticAssetNames?.excalidrawCss ?? 'meadow-excalidraw.css';
  const excalidrawVendorJs = staticAssetNames?.excalidrawVendorJs ?? 'excalidraw-vendor.js';
  const excalidrawJs = staticAssetNames?.excalidrawJs ?? 'meadow-excalidraw.js';
  const svgCss = staticAssetNames?.svgCss ?? 'meadow-svg.css';
  const svgJs = staticAssetNames?.svgJs ?? 'meadow-svg.js';
  const srsCss = staticAssetNames?.srsCss
    ?? `${CUSTOMIZATION_ASSETS_DIRECTORY}/${SPACED_REPETITION_ASSETS_DIRECTORY}/srs.css`;
  const srsJs = staticAssetNames?.srsJs
    ?? `${CUSTOMIZATION_ASSETS_DIRECTORY}/${SPACED_REPETITION_ASSETS_DIRECTORY}/srs.js`;
  const searchCss = staticAssetNames?.searchCss ?? 'cust/search/search.css';
  const searchJs = staticAssetNames?.searchJs ?? 'cust/search/search.js';
  const hoverPreviewCss = staticAssetNames?.hoverPreviewCss ?? 'cust/hover_preview/hover-preview.css';
  const hoverPreviewJs = staticAssetNames?.hoverPreviewJs ?? 'cust/hover_preview/hover-preview.js';
  const folderNavigationCss = staticAssetNames?.folderNavigationCss ?? 'cust/folder_nav/folder-nav.css';
  const folderNavigationDataJs = staticAssetNames?.folderNavigationDataJs ?? 'cust/folder_nav/folder-nav-data.js';
  const folderNavigationJs = staticAssetNames?.folderNavigationJs ?? 'cust/folder_nav/folder-nav.js';
  const globalStyleCss = staticAssetNames?.globalStyleCss;
  const bundleStyleCss = staticAssetNames?.bundleStyleCss;
  const globalJavascriptJs = staticAssetNames?.globalJavascriptJs;
  const bundleJavascriptJs = staticAssetNames?.bundleJavascriptJs;
  const srsPageId = currentOutputDirectory
    ? `${currentOutputDirectory}/${outputFilename}.html`
    : `${outputFilename}.html`;
  const downloadArtifacts: Array<{ label: string; title: string; manifest_url: string; browse_url?: string }> = [];
  if (sourcesExportEnabled) {
    downloadArtifacts.push({
      label: 'sources',
      title: 'Download source files as ZIP',
      manifest_url: `${assetsPrefix}${CUSTOMIZATION_ASSETS_DIRECTORY}/${SOURCES_EXPORT_ASSETS_DIRECTORY}/${SOURCES_EXPORT_MANIFEST_FILENAME}`,
    });
  }
  if (openKnowledgeFormatEnabled) {
    downloadArtifacts.push({
      label: 'OKF',
      title: 'Open Knowledge Format package',
      manifest_url: `${assetsPrefix}${CUSTOMIZATION_ASSETS_DIRECTORY}/${OPEN_KNOWLEDGE_FORMAT_ASSETS_DIR}/${OPEN_KNOWLEDGE_FORMAT_MANIFEST_FILENAME}`,
      browse_url: `${assetsPrefix}${CUSTOMIZATION_ASSETS_DIRECTORY}/${OPEN_KNOWLEDGE_FORMAT_ASSETS_DIR}/${OPEN_KNOWLEDGE_FORMAT_BUNDLE_DIR}/index.md`,
    });
  }
  const fullPageContent = template({
    content: htmlContent,
    page_title: pageTitle,
    assets_prefix: assetsPrefix,
    breadcrumbs: breadcrumbHtml,
    backlinks: backlinksHtml,
    include_mermaid: includeMermaid,
    include_callouts: includeCallouts,
    include_excalidraw: includeExcalidraw,
    include_svg_embed: includeSvgEmbed,
    style_css: styleCss,
    javascript_js: javascriptJs,
    global_style_css: globalStyleCss,
    bundle_style_css: bundleStyleCss,
    global_javascript_js: globalJavascriptJs,
    bundle_javascript_js: bundleJavascriptJs,
    mermaid_min_js: mermaidMinJs,
    callouts_css: calloutsCss,
    excalidraw_css: excalidrawCss,
    excalidraw_vendor_js: excalidrawVendorJs,
    excalidraw_js: excalidrawJs,
    svg_css: svgCss,
    svg_js: svgJs,
    srs_css: srsCss,
    srs_js: srsJs,
    search_css: searchCss,
    search_js: searchJs,
    hover_preview_css: hoverPreviewCss,
    hover_preview_js: hoverPreviewJs,
    folder_navigation_enabled: Boolean(folderNavigation),
    folder_navigation_css: folderNavigationCss,
    folder_navigation_data_js: folderNavigationDataJs,
    folder_navigation_js: folderNavigationJs,
    folder_navigation_storage_key: folderNavigation?.storageKey ?? '',
    srs_enabled: srsEnabled,
    srs_bundle_guid: bundleConfig.bundleGuid || '',
    srs_page_id: srsPageId,
    include_hover_preview: showHoverPreview,
    downloadable_artifacts_enabled: downloadArtifacts.length > 0,
    header_actions_enabled: downloadArtifacts.length > 0 || searchEnabled || Boolean(folderNavigation),
    download_artifacts: downloadArtifacts,
    search_enabled: searchEnabled,
  });

  let htmlPath: string | null = null;

  if (processingMode === 'each-page') {
    const htmlFilename = `${outputFilename}.html`;
    htmlPath = path.join(outputFolder, htmlFilename);
    let finalContent = fullPageContent;
    if (bundleSlug) {
      finalContent = HooksLoader.tryExecuteHtmlPostProcessing(bundleSlug, fullPageContent, pageName);
    }
    fs.writeFileSync(htmlPath, finalContent);

    logger.debug(`Rendered page to HTML: ${pageName}`);
  }

  return { htmlPath, htmlContent, srsCards: collectedSrsCards };
}

export function renderGeneratedBundleNodeToHtml(args: {
  outputRoot: string;
  outputRoute: string;
  pageTitle: string;
  bodyHtml: string;
  breadcrumbHtml: string;
  staticAssetNames?: RenderOptions['staticAssetNames'];
  bundleConfig: BundleConfig;
  bundleSlug?: string;
  sourcesExportEnabled?: boolean;
  openKnowledgeFormatEnabled?: boolean;
  searchEnabled?: boolean;
  hoverPreviewEnabled?: boolean;
  folderNavigation?: RenderOptions['folderNavigation'];
}): string {
  const outputDirectory = path.posix.dirname(args.outputRoute) === '.' ? '' : path.posix.dirname(args.outputRoute);
  const assetsPrefix = '../'.repeat(outputDirectory.split('/').filter(Boolean).length) + '_mw_assets/';
  const assets = args.staticAssetNames;
  const downloadArtifacts: Array<{ label: string; title: string; manifest_url: string; browse_url?: string }> = [];
  if (args.sourcesExportEnabled) {
    downloadArtifacts.push({
      label: 'sources',
      title: 'Download source files as ZIP',
      manifest_url: `${assetsPrefix}${CUSTOMIZATION_ASSETS_DIRECTORY}/${SOURCES_EXPORT_ASSETS_DIRECTORY}/${SOURCES_EXPORT_MANIFEST_FILENAME}`,
    });
  }
  if (args.openKnowledgeFormatEnabled) {
    downloadArtifacts.push({
      label: 'OKF',
      title: 'Open Knowledge Format package',
      manifest_url: `${assetsPrefix}${CUSTOMIZATION_ASSETS_DIRECTORY}/${OPEN_KNOWLEDGE_FORMAT_ASSETS_DIR}/${OPEN_KNOWLEDGE_FORMAT_MANIFEST_FILENAME}`,
      browse_url: `${assetsPrefix}${CUSTOMIZATION_ASSETS_DIRECTORY}/${OPEN_KNOWLEDGE_FORMAT_ASSETS_DIR}/${OPEN_KNOWLEDGE_FORMAT_BUNDLE_DIR}/index.md`,
    });
  }
  const fullPageContent = getPageTemplate()({
    content: args.bodyHtml,
    page_title: args.pageTitle,
    assets_prefix: assetsPrefix,
    breadcrumbs: args.breadcrumbHtml,
    backlinks: '',
    include_mermaid: false,
    include_callouts: false,
    include_excalidraw: false,
    style_css: assets?.styleCss ?? 'style.css',
    javascript_js: assets?.javascriptJs ?? 'javascript.js',
    global_style_css: assets?.globalStyleCss,
    bundle_style_css: assets?.bundleStyleCss,
    global_javascript_js: assets?.globalJavascriptJs,
    bundle_javascript_js: assets?.bundleJavascriptJs,
    mermaid_min_js: assets?.mermaidMinJs ?? 'mermaid.min.js',
    callouts_css: assets?.calloutsCss ?? 'callouts.css',
    structural_pages_css: assets?.structuralPagesCss ?? 'structural-pages.css',
    search_css: assets?.searchCss ?? 'cust/search/search.css',
    search_js: assets?.searchJs ?? 'cust/search/search.js',
    hover_preview_css: assets?.hoverPreviewCss ?? 'cust/hover_preview/hover-preview.css',
    hover_preview_js: assets?.hoverPreviewJs ?? 'cust/hover_preview/hover-preview.js',
    folder_navigation_enabled: Boolean(args.folderNavigation),
    folder_navigation_css: assets?.folderNavigationCss ?? 'cust/folder_nav/folder-nav.css',
    folder_navigation_data_js: assets?.folderNavigationDataJs ?? 'cust/folder_nav/folder-nav-data.js',
    folder_navigation_js: assets?.folderNavigationJs ?? 'cust/folder_nav/folder-nav.js',
    folder_navigation_storage_key: args.folderNavigation?.storageKey ?? '',
    srs_enabled: false,
    include_hover_preview: args.hoverPreviewEnabled === true,
    downloadable_artifacts_enabled: downloadArtifacts.length > 0,
    header_actions_enabled: downloadArtifacts.length > 0 || args.searchEnabled || Boolean(args.folderNavigation),
    download_artifacts: downloadArtifacts,
    search_enabled: args.searchEnabled === true,
  });
  const outputPath = path.join(args.outputRoot, ...args.outputRoute.split('/'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const finalContent = args.bundleSlug
    ? HooksLoader.tryExecuteHtmlPostProcessing(args.bundleSlug, fullPageContent, args.pageTitle)
    : fullPageContent;
  fs.writeFileSync(outputPath, finalContent);
  void args.bundleConfig;
  return outputPath;
}

/**
 * Builds the simple backlinks `<h2>Backlinks</h2><ul>...` block used by the
 * standalone Excalidraw page. Only includes whitelisted sources; no context
 * blocks or "see in context" links (those add nothing for a drawing target).
 */
export function renderSimpleBacklinksHtml(
  pageTitle: string,
  currentPageDirectory: string,
  inverseLinks: InverseLinks,
  bundleNodeConfigs: BundleNodeConfig[],
  bundleConfig: BundleConfig,
  bundleSlug?: string,
  routeTable?: RenderOptions['routeTable'],
  currentOutputDirectory: string = currentPageDirectory,
): string {
  const pathPrefixedKey = currentPageDirectory ? `${currentPageDirectory}/${pageTitle}` : null;
  const list = (pathPrefixedKey && inverseLinks[pathPrefixedKey])
    ? inverseLinks[pathPrefixedKey]
    : (inverseLinks[pageTitle] || []);
  const sorted = [...new Set(list)].sort();
  if (sorted.length === 0) return '';

  let html = '<h2>Backlinks</h2>\n<ul>\n';
  for (const backlink of sorted) {
    const cfg = bundleNodeConfigs.find(c => c.bundleNodeName === backlink);
    if (!cfg || cfg.listType !== 'whitelist') continue;
    const sourceDir = cfg.sourceGraphSubdirectory || '';
    const normName = normalizePageTitle(backlink, bundleConfig, bundleSlug);
    const encoded = encodeURIComponent(normName);
    const conventionalTargetPath = sourceDir ? `${sourceDir}/${normName}.html` : `${normName}.html`;
    const plannedRoute = routeTable?.get(cfg.bundleNodeId);
    const plannedTargetPath = plannedRoute !== conventionalTargetPath ? plannedRoute : undefined;
    const targetPath = plannedTargetPath ?? (sourceDir ? `${sourceDir}/${encoded}.html` : `${encoded}.html`);
    const relativePath = calculateRelativePath(currentOutputDirectory, targetPath);
    const relUrl = plannedTargetPath ? encodePathForUrl(relativePath) : relativePath;
    html += `<li class="backlink"><a href="${relUrl}">${normName}</a></li>\n`;
  }
  html += '</ul>\n';
  return html;
}

/**
 * Renders a standalone HTML page for an Excalidraw drawing. The body is a
 * placeholder container that the client renderer (meadow-excalidraw.js) fills
 * with the drawing by fetching the source markdown and calling Excalidraw's
 * own exportToSvg — same renderer the Obsidian editor uses.
 */
export function renderExcalidrawPageToHtml(args: {
  sourceMdPath: string;
  outputFolder: string;
  outputFilename: string; // page-title without extension
  pageTitle: string;
  currentPageDirectory: string;
  drawingMdHref: string; // href the client uses to fetch the source `.excalidraw.md`
  clientLinkMap?: Record<string, import('./linkModificationService.js').ExcalidrawTrackedLink>; // server-resolved wikilinks-inside-drawing
  clientUntrackedLinks?: string[]; // wikilinks-inside-drawing whose target isn't whitelisted
  clientEmbeddedFileMap?: Record<string, string>; // embedded-file wikilinks whose source files are publishable
  clientUntrackedEmbeddedFiles?: string[]; // embedded-file wikilinks whose source files are not publishable
  breadcrumbHtml: string;
  backlinksHtml: string;
  staticAssetNames?: import('./types.js').StaticAssetNames;
  bundleConfig: BundleConfig;
  bundleSlug?: string;
  searchEnabled: boolean;
  folderNavigation?: import('./types.js').FolderNavigationRenderOptions;
}): string | null {
  const {
    sourceMdPath,
    outputFolder,
    outputFilename,
    pageTitle,
    currentPageDirectory,
    drawingMdHref,
    clientLinkMap,
    clientUntrackedLinks,
    clientEmbeddedFileMap,
    clientUntrackedEmbeddedFiles,
    breadcrumbHtml,
    backlinksHtml,
    staticAssetNames,
    bundleConfig,
    bundleSlug,
    searchEnabled,
    folderNavigation,
  } = args;

  if (!fs.existsSync(sourceMdPath)) {
    logger.warn(`Excalidraw source not found: ${sourceMdPath}`);
    return null;
  }

  const linksAttr = clientLinkMap && Object.keys(clientLinkMap).length > 0
    ? ` data-meadow-excalidraw-links="${escapeHtmlAttribute(JSON.stringify(clientLinkMap))}"`
    : '';
  const untrackedAttr = clientUntrackedLinks && clientUntrackedLinks.length > 0
    ? ` data-meadow-excalidraw-untracked-links="${escapeHtmlAttribute(JSON.stringify(clientUntrackedLinks))}"`
    : '';
  const embeddedFilesAttr = clientEmbeddedFileMap && Object.keys(clientEmbeddedFileMap).length > 0
    ? ` data-meadow-excalidraw-files="${escapeHtmlAttribute(JSON.stringify(clientEmbeddedFileMap))}"`
    : '';
  const untrackedEmbeddedFilesAttr = clientUntrackedEmbeddedFiles && clientUntrackedEmbeddedFiles.length > 0
    ? ` data-meadow-excalidraw-untracked-files="${escapeHtmlAttribute(JSON.stringify(clientUntrackedEmbeddedFiles))}"`
    : '';
  const bodyHtml = `<div class="meadow-excalidraw-page" data-meadow-excalidraw-src="${drawingMdHref}"${linksAttr}${untrackedAttr}${embeddedFilesAttr}${untrackedEmbeddedFilesAttr}><span class="meadow-excalidraw-loading">Loading drawing…</span></div>`;

  const depth = currentPageDirectory ? currentPageDirectory.split('/').filter(p => p).length : 0;
  const assetsPrefix = '../'.repeat(depth) + '_mw_assets/';

  const styleCssRaw = staticAssetNames?.styleCss ?? 'style.css';
  const styleCss = styleCssRaw || undefined;
  const javascriptJsRaw = staticAssetNames?.javascriptJs ?? 'javascript.js';
  const javascriptJs = javascriptJsRaw || undefined;
  const mermaidMinJs = staticAssetNames?.mermaidMinJs ?? 'mermaid.min.js';
  const calloutsCss = staticAssetNames?.calloutsCss ?? 'callouts.css';
  const excalidrawCss = staticAssetNames?.excalidrawCss ?? 'meadow-excalidraw.css';
  const excalidrawVendorJs = staticAssetNames?.excalidrawVendorJs ?? 'excalidraw-vendor.js';
  const excalidrawJs = staticAssetNames?.excalidrawJs ?? 'meadow-excalidraw.js';
  const searchCss = staticAssetNames?.searchCss ?? 'cust/search/search.css';
  const searchJs = staticAssetNames?.searchJs ?? 'cust/search/search.js';
  const folderNavigationCss = staticAssetNames?.folderNavigationCss ?? 'cust/folder_nav/folder-nav.css';
  const folderNavigationDataJs = staticAssetNames?.folderNavigationDataJs ?? 'cust/folder_nav/folder-nav-data.js';
  const folderNavigationJs = staticAssetNames?.folderNavigationJs ?? 'cust/folder_nav/folder-nav.js';
  const globalStyleCss = staticAssetNames?.globalStyleCss;
  const bundleStyleCss = staticAssetNames?.bundleStyleCss;
  const globalJavascriptJs = staticAssetNames?.globalJavascriptJs;
  const bundleJavascriptJs = staticAssetNames?.bundleJavascriptJs;

  const template = getPageTemplate();

  const fullPageContent = template({
    content: bodyHtml,
    page_title: pageTitle,
    assets_prefix: assetsPrefix,
    breadcrumbs: breadcrumbHtml,
    backlinks: backlinksHtml,
    include_mermaid: false,
    include_callouts: false,
    include_excalidraw: true,
    style_css: styleCss,
    javascript_js: javascriptJs,
    global_style_css: globalStyleCss,
    bundle_style_css: bundleStyleCss,
    global_javascript_js: globalJavascriptJs,
    bundle_javascript_js: bundleJavascriptJs,
    mermaid_min_js: mermaidMinJs,
    callouts_css: calloutsCss,
    excalidraw_css: excalidrawCss,
    excalidraw_vendor_js: excalidrawVendorJs,
    excalidraw_js: excalidrawJs,
    search_css: searchCss,
    search_js: searchJs,
    folder_navigation_enabled: Boolean(folderNavigation),
    folder_navigation_css: folderNavigationCss,
    folder_navigation_data_js: folderNavigationDataJs,
    folder_navigation_js: folderNavigationJs,
    folder_navigation_storage_key: folderNavigation?.storageKey ?? '',
    srs_enabled: false,
    include_hover_preview: false,
    header_actions_enabled: searchEnabled || Boolean(folderNavigation),
    search_enabled: searchEnabled,
  });

  const htmlPath = path.join(outputFolder, `${outputFilename}.html`);
  let finalContent = fullPageContent;
  if (bundleSlug) {
    finalContent = HooksLoader.tryExecuteHtmlPostProcessing(bundleSlug, fullPageContent, pageTitle);
  }
  fs.writeFileSync(htmlPath, finalContent);
  logger.debug(`Rendered standalone Excalidraw page to HTML: ${pageTitle}`);

  // Suppress unused-import warnings for bundleConfig — kept in signature for
  // consistency with renderPageToHtml and future hook integrations.
  void bundleConfig;

  return htmlPath;
}

function contentToBlockId(content: string): string {
  const hash = createHash('sha1').update(content).digest('hex');
  return hash.substring(0, 7);
}

/**
 * Adds anchor IDs to each block in the markdown content.
 * @param mdContent - The content to add anchors to (may be converted with HTML links)
 * @param originalForHashing - Optional original markdown content to use for computing hashes.
 *                             If provided, hashes are computed from this content to ensure
 *                             consistency between page rendering and backlink context generation.
 */
// Merge a footnote definition (`[^id]: ...`) with any subsequent
// indent-continuation paragraphs so marked-footnote sees them as one block.
// Without this, addBlockAnchors inserts anchors between them and the
// continuation paragraphs get parsed as indented code blocks instead.
function mergeFootnoteContinuations(
  blocks: ReturnType<typeof splitMarkdownBlocks>
): ReturnType<typeof splitMarkdownBlocks> {
  const merged: ReturnType<typeof splitMarkdownBlocks> = [];
  let inFootnote = false;
  for (const b of blocks) {
    const startsFootnote = /^\[\^[^\]]+\]:/.test(b.content);
    const isIndentedContinuation = /^(?: {4}|\t)/.test(b.content);
    if (startsFootnote) {
      merged.push({ ...b });
      inFootnote = true;
    } else if (inFootnote && isIndentedContinuation) {
      merged[merged.length - 1].content += '\n\n' + b.content;
    } else {
      merged.push({ ...b });
      inFootnote = false;
    }
  }
  return merged;
}

function addBlockAnchors(mdContent: string, originalForHashing?: string): string {
  const blocks = mergeFootnoteContinuations(splitMarkdownBlocks(mdContent));
  const hashBlocks = originalForHashing
    ? mergeFootnoteContinuations(splitMarkdownBlocks(originalForHashing))
    : blocks;
  
  const anchoredBlocks: string[] = [];
  
  // Track hash occurrences to handle duplicates
  const hashCounts: Map<string, number> = new Map();
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    // Use the corresponding block from hashBlocks for computing the hash
    const hashBlock = hashBlocks[i] || block;
    const baseHash = contentToBlockId(hashBlock.content);
    
    // Get the current count for this hash (0 if first occurrence)
    const count = hashCounts.get(baseHash) || 0;
    hashCounts.set(baseHash, count + 1);
    
    // Only append increment for duplicates (second occurrence and beyond)
    const blockId = count === 0 ? `block-${baseHash}` : `block-${baseHash}-${count + 1}`;
    const anchor = `<a id="${blockId}" class="block-anchor"></a>`;
    anchoredBlocks.push(`${block.content}\n${anchor}`);
  }
  
  return anchoredBlocks.join('\n\n');
}

function backlinkContext(directory: string, backlink: string, thePageName: string, currentPageDirectory?: string): BacklinkContext[] {
  const mdContent = getMdContent(directory, backlink, false);
  const mdContentWithAnchors = addBlockAnchors(mdContent);
  const blocks = mdContentWithAnchors.split('\n\n');
  const matchingBlockInfo: BacklinkContext[] = [];

  // Links in source markdown may reference a page with or without a directory
  // prefix (e.g. [[page]] vs [[dir/page]]). Build a set of names to match.
  const namesToMatch = [thePageName];
  if (currentPageDirectory) {
    namesToMatch.push(`${currentPageDirectory}/${thePageName}`);
  }

  for (const block of blocks) {
    const { anchorId, content } = stripAndReturnBlockAnchorIds(block);
    const links = markdownContentToPageLinkFilenames(content);
    // Also extract link targets from standard markdown links [text](path.md)
    extractMarkdownLinkFilenames(content, links);

    if (links.some(link => namesToMatch.includes(link))) {
      // For table blocks, extract only the matching row instead of the full table.
      // A markdown table block has lines starting with '|'.
      const tableRow = extractMatchingTableRow(content, namesToMatch);
      if (tableRow !== null) {
        matchingBlockInfo.push({ anchor_id: anchorId, content: tableRow });
      } else {
        matchingBlockInfo.push({ anchor_id: anchorId, content });
      }
    }
  }

  return matchingBlockInfo;
}

/**
 * If the content is a markdown table, return only the header + separator + the
 * row that contains a link matching one of the target names. Returns null when
 * the content is not a table.
 */
function extractMatchingTableRow(content: string, namesToMatch: string[]): string | null {
  const lines = content.split('\n');
  // A markdown table has at least 3 lines (header, separator, data row)
  // and the separator line matches |---|
  if (lines.length < 3 || !/^\|[\s-:|]+\|$/.test(lines[1].trim())) {
    return null;
  }

  const headerLine = lines[0];
  const separatorLine = lines[1];

  for (let i = 2; i < lines.length; i++) {
    const row = lines[i];
    const rowLinks = markdownContentToPageLinkFilenames(row);
    extractMarkdownLinkFilenames(row, rowLinks);
    if (rowLinks.some(link => namesToMatch.includes(link))) {
      return `${headerLine}\n${separatorLine}\n${row}`;
    }
  }

  return null;
}

/**
 * Extracts page title stems from standard markdown links [text](path.md) in content,
 * appending them to the provided links array.
 */
function extractMarkdownLinkFilenames(content: string, links: string[]): void {
  const pattern = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const href = match[2].trim();
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')) continue;
    const hrefWithoutAnchor = href.split('#')[0];
    const filename = hrefWithoutAnchor.split('/').pop() ?? '';
    const stem = filename.replace(/\.[^.]+$/, '');
    if (stem && !links.includes(stem)) {
      links.push(stem);
    }
  }
}

function stripAndReturnBlockAnchorIds(mdBlock: string): { anchorId: string; content: string } {
  // Match both old numeric format (block-\d+) and new hash format (block-[hash] or block-[hash]-[n])
  const anchorPattern = /<a id="(block-(?:\d+|[a-f0-9]{7}(?:-\d+)?))" class="block-anchor"><\/a>/;
  const match = mdBlock.match(anchorPattern);
  
  if (match) {
    const blockId = match[1];
    const content = mdBlock.replace(anchorPattern, '').trim();
    return { anchorId: blockId, content };
  }
  
  return { anchorId: '', content: mdBlock.trim() };
}

function processMermaidDiagrams(htmlContent: string): string {
  const pattern = /<pre><code class="(?:hljs )?language-mermaid">(.*?)<\/code><\/pre>/gs;

  return htmlContent.replace(pattern, (match, diagramContent) => {
    return `<div class="mermaid">${diagramContent}</div>`;
  });
}
