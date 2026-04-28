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
import { SiteConfig } from '../../../shared_code/types/siteConfig.js';
import { SitePageConfig } from '../../../shared_code/types/sitePageConfig.js';
import {
  normalizePageTitle,
  getMdContent,
  anchorNameFor,
  linkTextToLinkInfo,
  markdownContentToPageLinkFilenames,
  calculateRelativePath
} from './shared.js';
import { linkOrImageHtml as linkOrImageHtmlService } from './linkModificationService.js';
import type { LinkResolvedInfo } from '../../../shared_code/types/ISitePage.js';
import { IMAGE_FILE_TYPES, KNOWN_FILE_TYPES } from './constants.js';
import { encodePathForUrl } from '../../../shared_code/utils/urlUtils.js';
import { HooksLoader } from '../utils/hooksLoader.js';
import { frontmatterAsDict, replaceOutsideCode, splitMarkdownBlocks } from './markdown.js';
import { renderTransclusionToHtml } from './transclusion.js';
import { logger } from '../utils/logging/backendLoggingUtils.js';
import { MARKDOWN_EXPORT_MANIFEST_FILENAME } from '../utils/zipUtils.js';
import { replaceSrsCardsWithCustomElements } from '../utils/srsMarkdownUtils.js';

export interface CollectedSrsCard {
  guid: string;
  kind: string;
  promptHtml: string;
  answerHtml: string;
  siblingGroup?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configure marked once at module load. marked is a singleton; calling
// `marked.use` on every render would accumulate extensions and slow rendering
// to a crawl on larger sites.
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

export function customProcessBacklinksMarkdown(mdContent: string, siteSlug?: string): string {
  if (siteSlug) {
    return HooksLoader.tryExecuteMarkdownProcessingBacklinks(siteSlug, mdContent);
  }
  // No processing if no siteSlug - hooks system handles all custom logic
  return mdContent;
}

export function customProcessPageMarkdown(mdContent: string, siteSlug?: string): string {
  if (siteSlug) {
    return HooksLoader.tryExecuteMarkdownProcessingPage(siteSlug, mdContent);
  }
  // No processing if no siteSlug - hooks system handles all custom logic
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
  siteConfig: SiteConfig,
  siteConfigFile: string,
  sitePageConfigs: SitePageConfig[],
  options: RenderOptions = {},
  siteSlug?: string,
  currentPageDirectory?: string,  // The source directory of the current page
  baseContentDirectory?: string,  // Base tracked_page_content directory for image lookups
  baseOutputFolder?: string,  // Base preview directory for image output
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
    staticAssetNames,
    markdownZipEnabled,
    srsEnabled = false,
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

  let mdContent = customProcessPageMarkdown(initialMdContent, siteSlug);
  const markdownForAnchors = mdContent;

  interface WikiLinkOverrides {
    linkResolutionMapOverride?: Record<string, LinkResolvedInfo>;
    currentPageDirectoryOverride?: string;
  }

  function linkOrImageHtml(linkText: string, highlightDoNotLinkPageName?: string, overrides?: WikiLinkOverrides): string {
    return linkOrImageHtmlService(linkText, sitePageConfigs, {
      pageNameToPage,
      siteConfig,
      siteSlug,
      directory,
      baseContentDirectory,
      outputFolder,
      baseOutputFolder,
      processingMode,
      skipUninterestingLeafPages,
      highlightDoNotLinkPageName,
      currentPageDirectory: overrides?.currentPageDirectoryOverride ?? currentPageDirectory,
      linkResolutionMap: overrides?.linkResolutionMapOverride ?? linkResolutionMap
    });
  }

  function convertWikiLinks(mdContent: string, highlightDoNotLinkPageName?: string, overrides?: WikiLinkOverrides): string {
    // First, handle image links with exclamation marks
    mdContent = replaceOutsideCode(mdContent, /!\[\[(.*?)\]\]/g, (_match: string, linkText: string) => {
      // Obsidian-style embeds: images stay images; otherwise treat as transclusion.
      const linkInfo = linkTextToLinkInfo(linkText);
      if (linkInfo.type === 'image') {
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
        sitePageConfigs,
        siteConfig,
        siteSlug,
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
        // Link not in resolution map -- might point outside the site
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

      // Page link
      const resolvedTitle = fileName.replace(/\.md$/, '');

      let linkConfig = sitePageConfigs.find(c =>
        c.title === resolvedTitle &&
        (c.source_graph_subdirectory || '') === targetDir &&
        (c.file_type === 'md' || !c.file_type) &&
        c.config.list_type === 'whitelist'
      );
      if (!linkConfig) {
        linkConfig = sitePageConfigs.find(c =>
          c.title === resolvedTitle &&
          (c.file_type === 'md' || !c.file_type) &&
          c.config.list_type === 'whitelist'
        );
      }

      if (!linkConfig) {
        return '<span class="link-not-tracked">link not tracked</span>';
      }

      const effectiveTargetDir = linkConfig.source_graph_subdirectory ?? targetDir;
      const normalizedTitle = siteConfig && siteSlug
        ? normalizePageTitle(linkConfig.title, siteConfig, siteSlug)
        : linkConfig.title;

      // Highlight self-links (links back to the current page) as non-clickable
      if (highlightDoNotLinkPageName &&
          (resolvedTitle.toLowerCase() === highlightDoNotLinkPageName.toLowerCase())) {
        return `<span class="highlight-do-not-link">${normalizedTitle}</span>`;
      }

      const targetPath = effectiveTargetDir
        ? encodePathForUrl(`${effectiveTargetDir}/${normalizedTitle}.html`)
        : encodePathForUrl(`${normalizedTitle}.html`);
      const relativeUrl = calculateRelativePath(effectivePageDir, targetPath);

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
          
          const backlinkConfig = sitePageConfigs.find(sitePageConfig => sitePageConfig.title === backlink);
          if (!backlinkConfig || backlinkConfig.config.list_type !== 'whitelist') {
            shouldInclude = false;
          }
          
          if (backlink === siteConfigFile.replace('.md', '')) {
            shouldInclude = false;
          }

          if (shouldInclude) {
            let backlinkContextHtml = '';
            
            // Get the backlink's source directory for relative path calculation
            const backlinkSourceDir = backlinkConfig?.source_graph_subdirectory || '';
            const normalizedBacklinkName = normalizePageTitle(backlink, siteConfig, siteSlug);

            if (showBacklinkContext) {
              // Find the backlink content in its subdirectory
              // Use baseContentDirectory (tracked_page_content root) as the base,
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
                const withFixedLinksAndBreaks = customProcessBacklinksMarkdown(withFixedLinks, siteSlug);
                const html = marked(withFixedLinksAndBreaks) as string;
                
                // Calculate relative path for "see in context" link
                const encodedBacklinkName = encodeURIComponent(normalizedBacklinkName);
                const targetPath = backlinkSourceDir 
                  ? `${backlinkSourceDir}/${encodedBacklinkName}.html`
                  : `${encodedBacklinkName}.html`;
                const relativeContextUrl = calculateRelativePath(currentPageDirectory || '', targetPath);
                
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
            const targetPath = backlinkSourceDir 
              ? `${backlinkSourceDir}/${encodedBacklinkName}.html`
              : `${encodedBacklinkName}.html`;
            const relativeUrl = calculateRelativePath(currentPageDirectory || '', targetPath);
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

  // Set up Handlebars template
  let templatesDir: string;
  if (process.env.NODE_ENV === 'production' && __dirname.includes('Resources')) {
    // Running in Electron app production mode
    templatesDir = path.join(__dirname, 'templates');
  } else {
    // Running in development mode
    templatesDir = path.join(__dirname, 'templates');
  }
  const templatePath = path.join(templatesDir, 'page.html');
  logger.debug(`Looking for HTML template at: ${templatePath}`);
  const templateSource = fs.readFileSync(templatePath, 'utf-8');
  const template = handlebars.compile(templateSource);

  const pageTitle = normalizePageTitle(pageName, siteConfig, siteSlug);

  if (processingMode === 'single-page') {
    const anchor = anchorNameFor(pageTitle);
    htmlContent = `<h2 id='${anchor}'>Page: ${pageTitle}</h2>\n` + htmlContent;
  }

  // Calculate assets prefix based on current directory depth
  // Pages in subdirectories need to go up to find the shared assets
  const depth = currentPageDirectory ? currentPageDirectory.split('/').filter(p => p).length : 0;
  const assetsPrefix = '../'.repeat(depth) + '_mw_assets/';

  // Generate breadcrumb HTML if enabled
  let breadcrumbHtml = '';
  if (showBreadcrumbs && breadcrumbPath.length > 1) {
    // Don't show breadcrumbs on the initial page (breadcrumbPath would just be itself)
    const breadcrumbItems: string[] = [];
    
    for (let i = 0; i < breadcrumbPath.length; i++) {
      const pathPageTitle = breadcrumbPath[i];
      const isLast = i === breadcrumbPath.length - 1;
      const normalizedTitle = normalizePageTitle(pathPageTitle, siteConfig, siteSlug);
      
      if (isLast) {
        // Current page - no link, just text
        breadcrumbItems.push(`<span class="breadcrumb-current">${normalizedTitle}</span>`);
      } else {
        // Find the source directory of this breadcrumb page to compute relative path
        const breadcrumbSitePageConfig = sitePageConfigs.find(c => c.title === pathPageTitle);
        const breadcrumbSourceDir = breadcrumbSitePageConfig?.source_graph_subdirectory || '';
        const encodedBreadcrumbName = encodeURIComponent(normalizedTitle);
        const targetPath = breadcrumbSourceDir 
          ? `${breadcrumbSourceDir}/${encodedBreadcrumbName}.html`
          : `${encodedBreadcrumbName}.html`;
        const relativeUrl = calculateRelativePath(currentPageDirectory || '', targetPath);
        breadcrumbItems.push(`<a href="${relativeUrl}" class="breadcrumb-link">${normalizedTitle}</a>`);
      }
    }
    
    breadcrumbHtml = `<nav class="breadcrumbs" aria-label="Breadcrumb">${breadcrumbItems.join('<span class="breadcrumb-separator">→</span>')}</nav>`;
  }

  // Render the template with the HTML content
  const includeMermaid = htmlContent.includes('class="mermaid"') || htmlContent.includes('language-mermaid');
  const includeCallouts = htmlContent.includes('class="callout ');
  // Empty string means base was disabled; only pass to template if non-empty
  const styleCssRaw = staticAssetNames?.styleCss ?? 'style.css';
  const styleCss = styleCssRaw || undefined;
  const javascriptJsRaw = staticAssetNames?.javascriptJs ?? 'javascript.js';
  const javascriptJs = javascriptJsRaw || undefined;
  const mermaidMinJs = staticAssetNames?.mermaidMinJs ?? 'mermaid.min.js';
  const calloutsCss = staticAssetNames?.calloutsCss ?? 'callouts.css';
  const srsCss = staticAssetNames?.srsCss ?? 'srs.css';
  const srsJs = staticAssetNames?.srsJs ?? 'srs.js';
  const globalStyleCss = staticAssetNames?.globalStyleCss;
  const siteStyleCss = staticAssetNames?.siteStyleCss;
  const globalJavascriptJs = staticAssetNames?.globalJavascriptJs;
  const siteJavascriptJs = staticAssetNames?.siteJavascriptJs;
  const srsPageId = currentPageDirectory
    ? `${currentPageDirectory}/${outputFilename}.html`
    : `${outputFilename}.html`;
  const fullPageContent = template({
    content: htmlContent,
    page_title: pageTitle,
    assets_prefix: assetsPrefix,
    breadcrumbs: breadcrumbHtml,
    backlinks: backlinksHtml,
    include_mermaid: includeMermaid,
    include_callouts: includeCallouts,
    style_css: styleCss,
    javascript_js: javascriptJs,
    global_style_css: globalStyleCss,
    site_style_css: siteStyleCss,
    global_javascript_js: globalJavascriptJs,
    site_javascript_js: siteJavascriptJs,
    mermaid_min_js: mermaidMinJs,
    callouts_css: calloutsCss,
    srs_css: srsCss,
    srs_js: srsJs,
    srs_enabled: srsEnabled,
    srs_site_guid: siteConfig.siteGuid || '',
    srs_page_id: srsPageId,
    include_hover_preview: showHoverPreview,
    markdown_zip_enabled: markdownZipEnabled,
    markdown_zip_manifest_url: `${assetsPrefix}md-export/${MARKDOWN_EXPORT_MANIFEST_FILENAME}`
  });

  let htmlPath: string | null = null;

  if (processingMode === 'each-page') {
    const htmlFilename = `${outputFilename}.html`;
    htmlPath = path.join(outputFolder, htmlFilename);
    let finalContent = fullPageContent;
    if (siteSlug) {
      finalContent = HooksLoader.tryExecuteHtmlPostProcessing(siteSlug, fullPageContent, pageName);
    }
    fs.writeFileSync(htmlPath, finalContent);

    logger.debug(`Rendered page to HTML: ${pageName}`);
  }

  return { htmlPath, htmlContent, srsCards: collectedSrsCards };
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
