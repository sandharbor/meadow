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
import fs from 'fs';
import type { BundleNodeConfig } from '../../../../../../shared_code/types/bundleNodeConfig.js';
import { linkTextToLinkInfo, normalizePageTitle, calculateRelativePath, escapeHtmlAttribute } from './shared.js';
import type { LinkInfo, PageNameToPage } from './types.js';
import { BundleConfig } from '../../../../../../shared_code/types/bundleConfig.js';
import type { LinkResolvedInfo } from '../../../../../../shared_code/types/IBundleNode.js';
import { encodePathForUrl } from '../../../../../../shared_code/utils/urlUtils.js';
import { extractContentWithoutPagespecs, hasPagespecsBlock } from '../../../../../../shared_code/utils/pagespecBlockUtils.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';
import { IMAGE_FILE_TYPES } from './constants.js';
import type { BundleRouteTable } from './bundleRoutePlanner.js';

interface ResolvedTarget {
  directory: string;
  filename: string;
}

/**
 * Given a resolved link target (from the Rust working_graph's link resolution
 * map) and the directory of the page that will host the resulting HTML,
 * returns the relative `href` value the page should link to. Returns null
 * when the target isn't resolvable or isn't whitelisted on this bundle.
 *
 * Centralizes the rules — title normalization, md/excalidraw → .html,
 * keep-extension for images, calculate-relative + URL-encode — that the
 * bundle's page links and image embeds all share.
 *
 * `targetUrlMode` controls what URL gets built for md/excalidraw targets:
 *   - 'rendered-page' (default): point at the rendered HTML page
 *     (`<title>.html` with normalized title). Use when building hyperlinks.
 *   - 'source-file': point at the source file (`<title>.<file_type>`).
 *     Use when the consumer needs to fetch the source — e.g. the image
 *     branch building `<img src>` URLs or `data-meadow-excalidraw-src`.
 *
 * For non-md/non-excalidraw types the two modes are equivalent (image
 * files have no separate "rendered page").
 */
export function resolveTrackedLinkHref(args: {
  resolved: LinkResolvedInfo;
  hostPageDirectory: string;
  bundleNodeConfigs: BundleNodeConfig[];
  bundleConfig?: BundleConfig;
  bundleSlug?: string;
  targetUrlMode?: 'rendered-page' | 'source-file';
  routeTable?: BundleRouteTable;
  hostOutputDirectory?: string;
}): string | null {
  const { resolved, hostPageDirectory, bundleNodeConfigs, bundleConfig, bundleSlug } = args;
  const targetUrlMode = args.targetUrlMode ?? 'rendered-page';
  const targetPath = resolved.link_resolved_target_path;
  if (!targetPath) return null;
  const lastSlash = targetPath.lastIndexOf('/');
  const targetFilename = lastSlash >= 0 ? targetPath.slice(lastSlash + 1) : targetPath;
  const targetDir = resolved.link_resolved_target_directory ?? '';

  const dotIdx = targetFilename.lastIndexOf('.');
  if (dotIdx <= 0) return null;
  const targetTitle = targetFilename.slice(0, dotIdx);
  const targetExt = targetFilename.slice(dotIdx + 1).toLowerCase();

  const cfg = bundleNodeConfigs.find(c =>
    c.bundleNodeKind === 'file' && c.bundleNodeName === targetTitle &&
    (c.sourceGraphSubdirectory || '') === targetDir &&
    (c.fileType || 'md') === targetExt
  );
  if (!cfg || cfg.listType !== 'whitelist') return null;

  if (targetUrlMode === 'rendered-page' && args.routeTable?.has(cfg.bundleNodeId)) {
    return encodePathForUrl(calculateRelativePath(args.hostOutputDirectory ?? hostPageDirectory, args.routeTable.get(cfg.bundleNodeId)!));
  }

  let urlFilename: string;
  if (targetUrlMode === 'rendered-page' && (targetExt === 'md' || targetExt === 'excalidraw')) {
    const normalizedTitle = bundleConfig && bundleSlug
      ? normalizePageTitle(targetTitle, bundleConfig, bundleSlug)
      : targetTitle;
    urlFilename = `${normalizedTitle}.html`;
  } else {
    urlFilename = targetFilename;
  }
  const targetForUrl = targetDir ? `${targetDir}/${urlFilename}` : urlFilename;
  return encodePathForUrl(calculateRelativePath(hostPageDirectory, targetForUrl));
}

/**
 * For a given Excalidraw drawing's resolution map, computes:
 *   - `tracked`: a `linkText → { href, normalizedText }` record. `href` is
 *     relative to the page that hosts the drawing (an embedding page or the
 *     standalone Excalidraw page itself); `normalizedText` is the resolved
 *     target's title after the page-title hook runs, so the client can update
 *     the in-drawing label to match the rendered page name. `normalizedText`
 *     is omitted when the wikilink uses an alias (the alias should win) or
 *     when the title hasn't changed.
 *   - `untracked`: link texts whose target resolves but isn't whitelisted on
 *     this bundle. The client renderer replaces the rendered text of these
 *     elements with "link not tracked" so readers see the same affordance
 *     they get on regular pages.
 */
export interface ExcalidrawTrackedLink {
  href: string;
  normalizedText?: string;
}

export interface ExcalidrawEmbeddedFileData {
  tracked: Record<string, string>;
  untracked: string[];
}

export interface ExcalidrawEmbedOptions {
  enableEmbeddedLinks?: boolean;
  enableFullscreenButton?: boolean;
  enableOpenDedicatedPage?: boolean;
}

const EXCALIDRAW_EMBEDDED_FILE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']);

function resolvedTargetExtension(resolved: LinkResolvedInfo): string | null {
  const targetPath = resolved.link_resolved_target_path;
  if (!targetPath) return null;
  const lastSlash = targetPath.lastIndexOf('/');
  const targetFilename = lastSlash >= 0 ? targetPath.slice(lastSlash + 1) : targetPath;
  const dotIdx = targetFilename.lastIndexOf('.');
  return dotIdx > 0 ? targetFilename.slice(dotIdx + 1).toLowerCase() : null;
}

function isEmbeddedExcalidrawFileTarget(resolved: LinkResolvedInfo): boolean {
  const ext = resolvedTargetExtension(resolved);
  return !!ext && EXCALIDRAW_EMBEDDED_FILE_EXTENSIONS.has(ext);
}

function isResolvedImageLikeTarget(resolved: LinkResolvedInfo | undefined): boolean {
  const ext = resolved ? resolvedTargetExtension(resolved) : null;
  return !!ext && (IMAGE_FILE_TYPES as readonly string[]).includes(ext);
}

export function isImageLikeWikiLink(
  linkText: string,
  linkResolutionMap?: Record<string, LinkResolvedInfo>
): boolean {
  const linkInfo = linkTextToLinkInfo(linkText);
  return linkInfo.type === 'image' || isResolvedImageLikeTarget(linkResolutionMap?.[linkText]);
}

function linkInfoWithResolvedTargetType(
  linkText: string,
  linkResolutionMap?: Record<string, LinkResolvedInfo>
): LinkInfo {
  const linkInfo = linkTextToLinkInfo(linkText);
  if (linkInfo.type === 'page' && isResolvedImageLikeTarget(linkResolutionMap?.[linkText])) {
    return {
      type: 'image',
      filename: linkInfo.filename,
      size: linkInfo.alternative_name && /^\d+$/.test(linkInfo.alternative_name)
        ? linkInfo.alternative_name
        : undefined,
    };
  }
  return linkInfo;
}

export function buildExcalidrawClientLinkData(args: {
  excalidrawPageIdent: string; // `<dir>/<title>.excalidraw` (or `/<title>.excalidraw` for root)
  hostPageDirectory: string; // directory of the page rendering the drawing's HTML
  bundleNodeConfigs: BundleNodeConfig[];
  allLinkResolutionMaps: Map<string, Record<string, LinkResolvedInfo>> | undefined;
  bundleConfig?: BundleConfig;
  bundleSlug?: string;
  routeTable?: BundleRouteTable;
  hostOutputDirectory?: string;
}): { tracked: Record<string, ExcalidrawTrackedLink>; untracked: string[] } {
  const { excalidrawPageIdent, hostPageDirectory, bundleNodeConfigs, allLinkResolutionMaps, bundleConfig, bundleSlug } = args;
  const tracked: Record<string, ExcalidrawTrackedLink> = {};
  const untracked: string[] = [];
  if (!allLinkResolutionMaps) return { tracked, untracked };
  const map = allLinkResolutionMaps.get(excalidrawPageIdent);
  if (!map) return { tracked, untracked };

  // Iterate in a stable order so the JSON serialised onto the page is
  // deterministic. The upstream working_graph map comes from a Rust HashMap
  // whose iteration order isn't guaranteed; without sorting, identical input
  // produces different `data-meadow-excalidraw-links` strings between runs.
  for (const linkText of Object.keys(map).sort()) {
    const resolved = map[linkText];
    const href = resolveTrackedLinkHref({
      resolved,
      hostPageDirectory,
      bundleNodeConfigs,
      bundleConfig,
      bundleSlug,
      routeTable: args.routeTable,
      hostOutputDirectory: args.hostOutputDirectory,
    });
    if (href) {
      const entry: ExcalidrawTrackedLink = { href };
      // Aliased wikilinks (`[[Page|alias]]`) keep the alias as the rendered
      // text — only rewrite the label when there's no alias and the hook
      // actually changed the page title.
      const hasAlias = linkText.includes('|');
      if (!hasAlias && bundleConfig && bundleSlug && resolved.link_resolved_target_path) {
        const targetPath = resolved.link_resolved_target_path;
        const lastSlash = targetPath.lastIndexOf('/');
        const targetFilename = lastSlash >= 0 ? targetPath.slice(lastSlash + 1) : targetPath;
        const dotIdx = targetFilename.lastIndexOf('.');
        if (dotIdx > 0) {
          const targetTitle = targetFilename.slice(0, dotIdx);
          const normalizedTitle = normalizePageTitle(targetTitle, bundleConfig, bundleSlug);
          if (normalizedTitle !== targetTitle) {
            entry.normalizedText = normalizedTitle;
          }
        }
      }
      tracked[linkText] = entry;
    } else if (resolved.link_resolved_target_path) {
      // The link resolved to a real source file but it isn't whitelisted on
      // this bundle — surface that to the reader instead of rendering the
      // page's title as plain text.
      untracked.push(linkText);
    }
  }
  return { tracked, untracked };
}

export function buildExcalidrawClientEmbeddedFileData(args: {
  excalidrawPageIdent: string; // `<dir>/<title>.excalidraw` (or `/<title>.excalidraw` for root)
  hostPageDirectory: string; // directory of the page rendering the drawing's HTML
  bundleNodeConfigs: BundleNodeConfig[];
  allLinkResolutionMaps: Map<string, Record<string, LinkResolvedInfo>> | undefined;
}): ExcalidrawEmbeddedFileData {
  const { excalidrawPageIdent, hostPageDirectory, bundleNodeConfigs, allLinkResolutionMaps } = args;
  const tracked: Record<string, string> = {};
  const untracked: string[] = [];
  if (!allLinkResolutionMaps) return { tracked, untracked };
  const map = allLinkResolutionMaps.get(excalidrawPageIdent);
  if (!map) return { tracked, untracked };

  for (const linkText of Object.keys(map).sort()) {
    const resolved = map[linkText];
    if (!isEmbeddedExcalidrawFileTarget(resolved)) continue;

    const href = resolveTrackedLinkHref({
      resolved,
      hostPageDirectory,
      bundleNodeConfigs,
      targetUrlMode: 'source-file',
    });
    if (href) {
      tracked[linkText] = href;
    } else if (resolved.link_resolved_target_path) {
      untracked.push(linkText);
    }
  }
  return { tracked, untracked };
}

export function copyExcalidrawEmbeddedFiles(args: {
  excalidrawPageIdent: string;
  contentDir: string;
  outputDir: string;
  bundleNodeConfigs: BundleNodeConfig[];
  allLinkResolutionMaps: Map<string, Record<string, LinkResolvedInfo>> | undefined;
}): void {
  const { excalidrawPageIdent, contentDir, outputDir, bundleNodeConfigs, allLinkResolutionMaps } = args;
  if (!allLinkResolutionMaps) return;
  const map = allLinkResolutionMaps.get(excalidrawPageIdent);
  if (!map) return;

  for (const linkText of Object.keys(map).sort()) {
    const resolved = map[linkText];
    if (!isEmbeddedExcalidrawFileTarget(resolved)) continue;
    const href = resolveTrackedLinkHref({
      resolved,
      hostPageDirectory: '',
      bundleNodeConfigs,
      targetUrlMode: 'source-file',
    });
    if (!href || !resolved.link_resolved_target_path) continue;

    const sourcePath = path.join(contentDir, resolved.link_resolved_target_path);
    const targetPath = path.join(outputDir, resolved.link_resolved_target_path);
    if (!fs.existsSync(sourcePath)) {
      logger.warn(`Excalidraw embedded file not found: ${sourcePath}`);
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function embeddedFileAttrs(data: ExcalidrawEmbeddedFileData): string {
  const filesAttr = Object.keys(data.tracked).length > 0
    ? ` data-meadow-excalidraw-files="${escapeHtmlAttribute(JSON.stringify(data.tracked))}"`
    : '';
  const untrackedFilesAttr = data.untracked.length > 0
    ? ` data-meadow-excalidraw-untracked-files="${escapeHtmlAttribute(JSON.stringify(data.untracked))}"`
    : '';
  return filesAttr + untrackedFilesAttr;
}

/**
 * Extracts the resolved target directory and filename from the link resolution map.
 * Falls back to parsing the original filename if no resolution is available.
 */
function resolveTarget(
  linkText: string,
  originalFilename: string,
  linkResolutionMap: Record<string, LinkResolvedInfo> | undefined,
  extensionToStrip?: string
): ResolvedTarget {
  const resolvedInfo = linkResolutionMap?.[linkText];
  const directory = resolvedInfo?.link_resolved_target_directory ?? '';
  
  let filename = originalFilename;
  if (resolvedInfo?.link_resolved_target_path) {
    const pathParts = resolvedInfo.link_resolved_target_path.split('/');
    filename = pathParts[pathParts.length - 1];
  } else if (originalFilename.includes('/')) {
    // Fallback: extract filename from original if it includes a path
    const pathParts = originalFilename.split('/');
    filename = pathParts[pathParts.length - 1];
  }
  
  if (extensionToStrip) {
    filename = filename.replace(new RegExp(`\\.${extensionToStrip}$`), '');
  }
  
  return { directory, filename };
}

/**
 * Checks whether a wiki-link target (page or image) resolves to a whitelisted/publishable page.
 * Reusable outside of HTML rendering (e.g. sources export sanitisation).
 */
export function isLinkTracked(
  linkText: string,
  bundleNodeConfigs: BundleNodeConfig[],
  linkResolutionMap?: Record<string, LinkResolvedInfo>
): boolean {
  const linkInfo = linkInfoWithResolvedTargetType(linkText, linkResolutionMap);

  if (linkInfo.type === 'image') {
    const originalImageFilename = linkInfo.filename;
    const { directory: imageSourceDir, filename: imageName } = resolveTarget(
      linkText, originalImageFilename, linkResolutionMap
    );
    const imageNameWithoutExt = imageName.replace(/\.[^.]+$/, '');
    const imageExt = imageName.replace(/^.*\./, '');
    let imageConfig = bundleNodeConfigs.find(bundleNodeConfig =>
      bundleNodeConfig.bundleNodeKind === 'file' && bundleNodeConfig.bundleNodeName === imageNameWithoutExt &&
      bundleNodeConfig.fileType === imageExt &&
      (bundleNodeConfig.sourceGraphSubdirectory || '') === (imageSourceDir || '')
    );

    // Fallback: if no match found and the link had an explicit path but
    // resolveTarget couldn't determine the directory (no linkResolutionMap),
    // extract the directory from the original path and retry.
    if (!imageConfig && !imageSourceDir && originalImageFilename.includes('/')) {
      const lastSlash = originalImageFilename.lastIndexOf('/');
      const explicitDir = originalImageFilename.substring(0, lastSlash);
      imageConfig = bundleNodeConfigs.find(bundleNodeConfig =>
        bundleNodeConfig.bundleNodeKind === 'file' && bundleNodeConfig.bundleNodeName === imageNameWithoutExt &&
        bundleNodeConfig.fileType === imageExt &&
        (bundleNodeConfig.sourceGraphSubdirectory || '') === explicitDir
      );
    }

    // Fallback: if still no match and the original link had no explicit path,
    // try matching by title alone (the image may live in a subdirectory).
    // Mirrors the page-link fallback logic.
    if (!imageConfig && !originalImageFilename.includes('/')) {
      imageConfig = bundleNodeConfigs.find(bundleNodeConfig =>
        bundleNodeConfig.bundleNodeKind === 'file' && bundleNodeConfig.bundleNodeName === imageNameWithoutExt &&
        bundleNodeConfig.fileType === imageExt
      );
    }

    return imageConfig?.listType === 'whitelist';
  }

  if (linkInfo.type === 'page') {
    const originalLinkFilename = linkInfo.filename;
    const { directory: targetPageDirectory, filename: resolvedTitle } = resolveTarget(
      linkText, originalLinkFilename, linkResolutionMap, 'md'
    );

    let linkConfig = bundleNodeConfigs.find(bundleNodeConfig =>
      bundleNodeConfig.bundleNodeKind === 'file' && bundleNodeConfig.bundleNodeName === resolvedTitle &&
      (bundleNodeConfig.sourceGraphSubdirectory || '') === targetPageDirectory &&
      (bundleNodeConfig.fileType === 'md' || !bundleNodeConfig.fileType)
    );

    const linkHasExplicitPath = originalLinkFilename.includes('/');

    // Fallback: if the link had an explicit path but resolveTarget couldn't
    // determine the directory (no linkResolutionMap), extract the directory
    // from the original path and retry.
    if (!linkConfig && linkHasExplicitPath && !targetPageDirectory) {
      const lastSlash = originalLinkFilename.lastIndexOf('/');
      const explicitDir = originalLinkFilename.substring(0, lastSlash);
      linkConfig = bundleNodeConfigs.find(bundleNodeConfig =>
        bundleNodeConfig.bundleNodeKind === 'file' && bundleNodeConfig.bundleNodeName === resolvedTitle &&
        (bundleNodeConfig.sourceGraphSubdirectory || '') === explicitDir &&
        (bundleNodeConfig.fileType === 'md' || !bundleNodeConfig.fileType)
      );
    }

    // Fallback: title-only lookup when no explicit path was given (the page
    // may live in a subdirectory).
    if (!linkConfig && !linkHasExplicitPath) {
      linkConfig = bundleNodeConfigs.find(bundleNodeConfig =>
        bundleNodeConfig.bundleNodeKind === 'file' && bundleNodeConfig.bundleNodeName === resolvedTitle &&
        (bundleNodeConfig.fileType === 'md' || !bundleNodeConfig.fileType)
      );
    }

    return linkConfig?.listType === 'whitelist';
  }

  return false;
}

export interface LinkOrImageHtmlOptions {
  pageNameToPage?: PageNameToPage;
  bundleConfig?: BundleConfig;
  bundleSlug?: string;
  directory?: string;
  baseContentDirectory?: string;  // Base source-content directory for image lookups
  outputFolder?: string;
  baseOutputFolder?: string;  // Base generated HTML directory for image output
  processingMode?: 'each-page' | 'single-page';
  skipUninterestingLeafPages?: boolean;
  highlightDoNotLinkPageName?: string;
  currentPageDirectory?: string;  // The directory of the current page being rendered
  linkResolutionMap?: Record<string, LinkResolvedInfo>;  // Pre-computed link resolution map
  allLinkResolutionMaps?: Map<string, Record<string, LinkResolvedInfo>>;
  excalidrawEmbedOptions?: ExcalidrawEmbedOptions;
  routeTable?: BundleRouteTable;
  currentOutputDirectory?: string;
}

export function linkOrImageHtml(
  linkText: string,
  bundleNodeConfigs: BundleNodeConfig[],
  options: LinkOrImageHtmlOptions = {}
): string {
  const {
    pageNameToPage,
    bundleConfig,
    bundleSlug,
    directory,
    baseContentDirectory,
    outputFolder,
    baseOutputFolder,
    processingMode = 'each-page',
    skipUninterestingLeafPages = false,
    highlightDoNotLinkPageName,
    currentPageDirectory = '',
    linkResolutionMap,
    allLinkResolutionMaps,
    excalidrawEmbedOptions,
    routeTable,
    currentOutputDirectory = currentPageDirectory,
  } = options;

  const linkInfo = linkInfoWithResolvedTargetType(linkText, linkResolutionMap);

  if (linkInfo.type === 'image') {
    const originalImageFilename = linkInfo.filename;
    const sizeConstraint = linkInfo.size;

    const { directory: imageSourceDir, filename: imageName } = resolveTarget(
      linkText, originalImageFilename, linkResolutionMap
    );

    // Check if the image is blacklisted before copying/rendering it
    if (!isLinkTracked(linkText, bundleNodeConfigs, linkResolutionMap)) {
      return '<span class="link-not-tracked">link not tracked</span>';
    }

    // Use baseContentDirectory for image source lookups (images are relative to content root)
    // Use baseOutputFolder for image output (images go to their subdirectory in preview root)
    const contentDir = baseContentDirectory || directory;
    const outputDir = baseOutputFolder || outputFolder;

    const isExcalidraw = imageName.toLowerCase().endsWith('.excalidraw');

    if (contentDir && outputDir) {
      // Find source image from the BASE content directory with subdirectory
      const imageSrc = imageSourceDir
        ? path.join(contentDir, imageSourceDir, imageName)
        : path.join(contentDir, imageName);

      // Determine output path - images go in their subdirectory relative to the preview root
      const imageOutputDir = imageSourceDir
        ? path.join(outputDir, imageSourceDir)
        : outputDir;

      // Ensure output directory exists
      if (imageSourceDir && !fs.existsSync(imageOutputDir)) {
        fs.mkdirSync(imageOutputDir, { recursive: true });
      }

      const imageDest = path.join(imageOutputDir, imageName);

      if (isExcalidraw) {
        // Excalidraw drawings live on disk as `<name>.excalidraw.md` (Obsidian
        // Excalidraw plugin format). Copy the source markdown next to the
        // embed location so the client renderer can fetch it. The actual
        // rendering happens in the browser via excalidraw-vendor.js +
        // meadow-excalidraw.js.
        const excalidrawMdSrc = `${imageSrc}.md`;
        const excalidrawMdDest = `${imageDest}.md`;
        if (fs.existsSync(excalidrawMdSrc)) {
          fs.copyFileSync(excalidrawMdSrc, excalidrawMdDest);
          logger.debug(`Copied excalidraw source: ${imageName}.md to ${imageOutputDir}`);
        } else {
          logger.warn(`Excalidraw source not found: ${excalidrawMdSrc}`);
        }
      } else if (fs.existsSync(imageSrc)) {
        // SVG files are text-based and may contain appended pagespecs blocks — strip before writing
        if (imageName.toLowerCase().endsWith('.svg')) {
          const svgContent = fs.readFileSync(imageSrc, 'utf-8');
          if (hasPagespecsBlock(svgContent)) {
            fs.writeFileSync(imageDest, extractContentWithoutPagespecs(svgContent) + '\n', 'utf-8');
          } else {
            fs.copyFileSync(imageSrc, imageDest);
          }
        } else {
          fs.copyFileSync(imageSrc, imageDest);
        }
        logger.debug(`Copied image: ${imageName} to ${imageOutputDir}`);
      } else {
        logger.warn(`Image not found: ${imageSrc}`);
      }
    }

    // The image branch wants the URL of the source file itself (e.g.,
    // `meadow.png`, or `<name>.excalidraw` so the Excalidraw branch below
    // can append `.md` to point at the source markdown). Use the helper in
    // 'source-file' mode so md/excalidraw don't get rewritten to `.html`.
    const resolvedImageInfo = linkResolutionMap?.[linkText];
    let encodedImagePath: string | null = null;
    if (resolvedImageInfo) {
      encodedImagePath = resolveTrackedLinkHref({
        resolved: resolvedImageInfo,
        hostPageDirectory: currentPageDirectory,
        bundleNodeConfigs,
        bundleConfig,
        bundleSlug,
        targetUrlMode: 'source-file',
      });
    }
    if (encodedImagePath === null) {
      const imageTargetPath = imageSourceDir
        ? `${imageSourceDir}/${imageName}`
        : imageName;
      encodedImagePath = encodePathForUrl(calculateRelativePath(currentPageDirectory, imageTargetPath));
    }

    if (isExcalidraw) {
      // Embed: an anchor link to the standalone HTML page, with a placeholder
      // container that the client renderer (meadow-excalidraw.js) fills with
      // the rendered SVG by fetching the source `.excalidraw.md` and handing
      // its scene to Excalidraw's own exportToSvg.
      //
      // Deliberately omit `data-meadow-excalidraw-links` here: when a drawing
      // is embedded in another page, clicking anywhere on it (including a
      // pinned wikilink inside the scene) should take the reader to the
      // standalone page — that's where in-drawing links are interactive. The
      // outer `<a class="meadow-excalidraw-embed-link">` gets all the clicks
      // because Excalidraw's exportToSvg only wraps elements in `<a>` when
      // `element.link` is set, and the init script only sets `link` from
      // entries in the link map.
      const embedOptions = {
        enableEmbeddedLinks: false,
        enableFullscreenButton: false,
        enableOpenDedicatedPage: true,
        ...excalidrawEmbedOptions,
      };
      const styleAttr = sizeConstraint ? ` style="max-width: ${sizeConstraint}px"` : '';
      const drawingTitle = imageName.replace(/\.excalidraw$/i, '');
      // The standalone Excalidraw HTML lives at the *normalized* title (the
      // pageTitleNormalization hook can rename it), so the embed must point at
      // the normalized filename or the link 404s when the hook is active.
      const drawingHtmlName = bundleConfig && bundleSlug
        ? normalizePageTitle(drawingTitle, bundleConfig, bundleSlug)
        : drawingTitle;
      const pageHref = encodePathForUrl(
        calculateRelativePath(currentPageDirectory, imageSourceDir
          ? `${imageSourceDir}/${drawingHtmlName}.html`
          : `${drawingHtmlName}.html`)
      );
      const mdSrc = `${encodedImagePath}.md`;
      const titleAttr = escapeHtmlAttribute(`Open ${drawingHtmlName}`);
      const excalidrawPageIdent = imageSourceDir
        ? `${imageSourceDir}/${drawingTitle}.excalidraw`
        : `/${drawingTitle}.excalidraw`;
      const fileAttrs = embeddedFileAttrs(buildExcalidrawClientEmbeddedFileData({
        excalidrawPageIdent,
        hostPageDirectory: currentPageDirectory,
        bundleNodeConfigs,
        allLinkResolutionMaps,
      }));
      if (contentDir && outputDir) {
        copyExcalidrawEmbeddedFiles({
          excalidrawPageIdent,
          contentDir,
          outputDir,
          bundleNodeConfigs,
          allLinkResolutionMaps,
        });
      }

      if (!embedOptions.enableEmbeddedLinks &&
          !embedOptions.enableFullscreenButton &&
          embedOptions.enableOpenDedicatedPage) {
        return `<a class="meadow-excalidraw-embed-link" href="${pageHref}"${styleAttr} title="${titleAttr}"><span class="meadow-excalidraw-embed" data-meadow-excalidraw-src="${mdSrc}"${fileAttrs}><span class="meadow-excalidraw-loading">Loading drawing…</span></span><span class="meadow-excalidraw-open-icon" aria-hidden="true">⤢</span></a>`;
      }

      let linksAttr = '';
      let untrackedAttr = '';
      if (embedOptions.enableEmbeddedLinks) {
        const { tracked, untracked } = buildExcalidrawClientLinkData({
          excalidrawPageIdent,
          hostPageDirectory: currentPageDirectory,
          bundleNodeConfigs,
          allLinkResolutionMaps,
          bundleConfig,
          bundleSlug,
          routeTable,
          hostOutputDirectory: currentOutputDirectory,
        });
        if (Object.keys(tracked).length > 0) {
          linksAttr = ` data-meadow-excalidraw-links="${escapeHtmlAttribute(JSON.stringify(tracked))}"`;
        }
        if (untracked.length > 0) {
          untrackedAttr = ` data-meadow-excalidraw-untracked-links="${escapeHtmlAttribute(JSON.stringify(untracked))}"`;
        }
      }

      const fullscreenClass = embedOptions.enableFullscreenButton ? ' meadow-excalidraw-can-fullscreen' : '';
      const fullscreenAttr = embedOptions.enableFullscreenButton ? ' data-meadow-excalidraw-fullscreen="true"' : '';
      const embedHtml = `<span class="meadow-excalidraw-embed${fullscreenClass}" data-meadow-excalidraw-src="${mdSrc}"${linksAttr}${untrackedAttr}${fileAttrs}${fullscreenAttr}><span class="meadow-excalidraw-loading">Loading drawing…</span></span>`;
      const openHtml = embedOptions.enableOpenDedicatedPage
        ? `<a class="meadow-excalidraw-open-icon meadow-excalidraw-open-link" href="${pageHref}" title="${titleAttr}" aria-label="${titleAttr}">⤢</a>`
        : '';
      return `<span class="meadow-excalidraw-embed-frame"${styleAttr}>${embedHtml}${openHtml}</span>`;
    }

    if (sizeConstraint) {
      return `<img src="${encodedImagePath}" style="max-width: ${sizeConstraint}px" alt="${originalImageFilename}" />`;
    } else {
      return `<img src="${encodedImagePath}" alt="${originalImageFilename}" />`;
    }
  }

  if (linkInfo.type === 'page') {
    const originalLinkFilename = linkInfo.filename;

    const { directory: targetPageDirectory, filename: resolvedTitle } = resolveTarget(
      linkText, originalLinkFilename, linkResolutionMap, 'md'
    );

    // Check if the link target is a publishable (whitelisted) page
    if (!isLinkTracked(linkText, bundleNodeConfigs, linkResolutionMap)) {
      return '<span class="link-not-tracked">link not tracked</span>';
    }

    // Find the target page's config for rendering (need linkConfig for title normalization etc.)
    let linkConfig = bundleNodeConfigs.find(bundleNodeConfig =>
      bundleNodeConfig.bundleNodeKind === 'file' && bundleNodeConfig.bundleNodeName === resolvedTitle &&
      (bundleNodeConfig.sourceGraphSubdirectory || '') === targetPageDirectory &&
      (bundleNodeConfig.fileType === 'md' || !bundleNodeConfig.fileType)
    );

    const linkHasExplicitPath = originalLinkFilename.includes('/');
    if (!linkConfig && !linkHasExplicitPath) {
      linkConfig = bundleNodeConfigs.find(bundleNodeConfig =>
        bundleNodeConfig.bundleNodeKind === 'file' && bundleNodeConfig.bundleNodeName === resolvedTitle &&
        (bundleNodeConfig.fileType === 'md' || !bundleNodeConfig.fileType)
      );
    }

    const normalizedLinkFilename = bundleConfig && bundleSlug 
      ? normalizePageTitle(linkConfig?.bundleNodeName || resolvedTitle, bundleConfig, bundleSlug)
      : (linkConfig?.bundleNodeName || resolvedTitle);

    if (highlightDoNotLinkPageName &&
        (originalLinkFilename.toLowerCase() === highlightDoNotLinkPageName.toLowerCase() ||
         resolvedTitle.toLowerCase() === highlightDoNotLinkPageName.toLowerCase())) {
      return `<span class="highlight-do-not-link">${normalizedLinkFilename}</span>`;
    }

    if (pageNameToPage && originalLinkFilename in pageNameToPage) {
      const page = pageNameToPage[originalLinkFilename];
      if (skipUninterestingLeafPages && page.isUninterestingLeafPage()) {
        return `<span class="uninteresting-leaf-page">${normalizedLinkFilename}</span>`;
      }
    }

    if (normalizedLinkFilename !== originalLinkFilename) {
      logger.debug(`link '${originalLinkFilename}' normalized to '${normalizedLinkFilename}' in html output`);
    }

    let textToDisplayInHyperlink = normalizedLinkFilename;
    if (linkInfo.alternative_name) {
      textToDisplayInHyperlink = linkInfo.alternative_name;
    }

    if (processingMode === 'each-page') {
      // Compute the href via the centralised resolved-target-to-href helper
      // when the working_graph gave us a resolved entry. Fall back to the
      // older config-driven path for the rare cases where no map entry
      // exists (e.g. callers that don't pass a resolution map).
      const resolvedInfo = linkResolutionMap?.[linkText];
      let relativeUrl: string | null = null;
      if (resolvedInfo) {
        relativeUrl = resolveTrackedLinkHref({
          resolved: resolvedInfo,
          hostPageDirectory: currentPageDirectory,
          bundleNodeConfigs,
          bundleConfig,
          bundleSlug,
          routeTable,
          hostOutputDirectory: currentOutputDirectory,
        });
      }
      if (relativeUrl === null) {
        const effectiveTargetDirectory = (!linkHasExplicitPath && linkConfig?.sourceGraphSubdirectory !== undefined)
          ? linkConfig.sourceGraphSubdirectory
          : targetPageDirectory;
        const targetPath = effectiveTargetDirectory
          ? encodePathForUrl(`${effectiveTargetDirectory}/${normalizedLinkFilename}.html`)
          : encodePathForUrl(`${normalizedLinkFilename}.html`);
        relativeUrl = calculateRelativePath(currentOutputDirectory, targetPath);
      }
      return `[${textToDisplayInHyperlink}](${relativeUrl})`;
    } else if (processingMode === 'single-page') {
      return `<a href="#${anchorNameFor(normalizedLinkFilename)}">${textToDisplayInHyperlink}</a>`;
    }
  }

  return linkText;
}

function anchorNameFor(pageName: string): string {
  return pageName.toLowerCase().replace(/[^a-z0-9]/g, '-');
} 
