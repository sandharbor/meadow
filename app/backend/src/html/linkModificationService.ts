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
import type { SitePageConfig } from '../../../shared_code/types/sitePageConfig.js';
import { linkTextToLinkInfo, normalizePageTitle, calculateRelativePath } from './shared.js';
import type { PageNameToPage } from './types.js';
import { SiteConfig } from '../../../shared_code/types/siteConfig.js';
import type { LinkResolvedInfo } from '../../../shared_code/types/ISitePage.js';
import { encodePathForUrl } from '../../../shared_code/utils/urlUtils.js';
import { extractContentWithoutPagespecs, hasPagespecsBlock } from '../../../shared_code/test/pagespecUtils.js';
import { logger } from '../utils/logging/backendLoggingUtils.js';

interface ResolvedTarget {
  directory: string;
  filename: string;
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
 * Reusable outside of HTML rendering (e.g. markdown export sanitisation).
 */
export function isLinkTracked(
  linkText: string,
  sitePageConfigs: SitePageConfig[],
  linkResolutionMap?: Record<string, LinkResolvedInfo>
): boolean {
  const linkInfo = linkTextToLinkInfo(linkText);

  if (linkInfo.type === 'image') {
    const originalImageFilename = linkInfo.filename;
    const { directory: imageSourceDir, filename: imageName } = resolveTarget(
      linkText, originalImageFilename, linkResolutionMap
    );
    const imageNameWithoutExt = imageName.replace(/\.[^.]+$/, '');
    const imageExt = imageName.replace(/^.*\./, '');
    let imageConfig = sitePageConfigs.find(sitePageConfig =>
      sitePageConfig.title === imageNameWithoutExt &&
      sitePageConfig.file_type === imageExt &&
      (sitePageConfig.source_graph_subdirectory || '') === (imageSourceDir || '')
    );

    // Fallback: if no match found and the link had an explicit path but
    // resolveTarget couldn't determine the directory (no linkResolutionMap),
    // extract the directory from the original path and retry.
    if (!imageConfig && !imageSourceDir && originalImageFilename.includes('/')) {
      const lastSlash = originalImageFilename.lastIndexOf('/');
      const explicitDir = originalImageFilename.substring(0, lastSlash);
      imageConfig = sitePageConfigs.find(sitePageConfig =>
        sitePageConfig.title === imageNameWithoutExt &&
        sitePageConfig.file_type === imageExt &&
        (sitePageConfig.source_graph_subdirectory || '') === explicitDir
      );
    }

    // Fallback: if still no match and the original link had no explicit path,
    // try matching by title alone (the image may live in a subdirectory).
    // Mirrors the page-link fallback logic.
    if (!imageConfig && !originalImageFilename.includes('/')) {
      imageConfig = sitePageConfigs.find(sitePageConfig =>
        sitePageConfig.title === imageNameWithoutExt &&
        sitePageConfig.file_type === imageExt
      );
    }

    return imageConfig?.config.list_type === 'whitelist';
  }

  if (linkInfo.type === 'page') {
    const originalLinkFilename = linkInfo.filename;
    const { directory: targetPageDirectory, filename: resolvedTitle } = resolveTarget(
      linkText, originalLinkFilename, linkResolutionMap, 'md'
    );

    let linkConfig = sitePageConfigs.find(sitePageConfig =>
      sitePageConfig.title === resolvedTitle &&
      (sitePageConfig.source_graph_subdirectory || '') === targetPageDirectory &&
      (sitePageConfig.file_type === 'md' || !sitePageConfig.file_type)
    );

    const linkHasExplicitPath = originalLinkFilename.includes('/');

    // Fallback: if the link had an explicit path but resolveTarget couldn't
    // determine the directory (no linkResolutionMap), extract the directory
    // from the original path and retry.
    if (!linkConfig && linkHasExplicitPath && !targetPageDirectory) {
      const lastSlash = originalLinkFilename.lastIndexOf('/');
      const explicitDir = originalLinkFilename.substring(0, lastSlash);
      linkConfig = sitePageConfigs.find(sitePageConfig =>
        sitePageConfig.title === resolvedTitle &&
        (sitePageConfig.source_graph_subdirectory || '') === explicitDir &&
        (sitePageConfig.file_type === 'md' || !sitePageConfig.file_type)
      );
    }

    // Fallback: title-only lookup when no explicit path was given (the page
    // may live in a subdirectory).
    if (!linkConfig && !linkHasExplicitPath) {
      linkConfig = sitePageConfigs.find(sitePageConfig =>
        sitePageConfig.title === resolvedTitle &&
        (sitePageConfig.file_type === 'md' || !sitePageConfig.file_type)
      );
    }

    return linkConfig?.config.list_type === 'whitelist';
  }

  return false;
}

export interface LinkOrImageHtmlOptions {
  pageNameToPage?: PageNameToPage;
  siteConfig?: SiteConfig;
  siteSlug?: string;
  directory?: string;
  baseContentDirectory?: string;  // Base tracked_page_content directory for image lookups
  outputFolder?: string;
  baseOutputFolder?: string;  // Base preview directory for image output
  processingMode?: 'each-page' | 'single-page';
  skipUninterestingLeafPages?: boolean;
  highlightDoNotLinkPageName?: string;
  currentPageDirectory?: string;  // The directory of the current page being rendered
  linkResolutionMap?: Record<string, LinkResolvedInfo>;  // Pre-computed link resolution map
}

export function linkOrImageHtml(
  linkText: string,
  sitePageConfigs: SitePageConfig[],
  options: LinkOrImageHtmlOptions = {}
): string {
  const {
    pageNameToPage,
    siteConfig,
    siteSlug,
    directory,
    baseContentDirectory,
    outputFolder,
    baseOutputFolder,
    processingMode = 'each-page',
    skipUninterestingLeafPages = false,
    highlightDoNotLinkPageName,
    currentPageDirectory = '',
    linkResolutionMap
  } = options;

  const linkInfo = linkTextToLinkInfo(linkText);

  if (linkInfo.type === 'image') {
    const originalImageFilename = linkInfo.filename;
    const sizeConstraint = linkInfo.size;

    const { directory: imageSourceDir, filename: imageName } = resolveTarget(
      linkText, originalImageFilename, linkResolutionMap
    );

    // Check if the image is blacklisted before copying/rendering it
    if (!isLinkTracked(linkText, sitePageConfigs, linkResolutionMap)) {
      return '<span class="link-not-tracked">link not tracked</span>';
    }

    // Use baseContentDirectory for image source lookups (images are relative to content root)
    // Use baseOutputFolder for image output (images go to their subdirectory in preview root)
    const contentDir = baseContentDirectory || directory;
    const outputDir = baseOutputFolder || outputFolder;

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

      if (fs.existsSync(imageSrc)) {
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

    // Calculate relative path from current page to image
    const imageTargetPath = imageSourceDir
      ? `${imageSourceDir}/${imageName}`
      : imageName;
    const relativeImagePath = calculateRelativePath(currentPageDirectory, imageTargetPath);
    const encodedImagePath = encodePathForUrl(relativeImagePath);

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
    if (!isLinkTracked(linkText, sitePageConfigs, linkResolutionMap)) {
      return '<span class="link-not-tracked">link not tracked</span>';
    }

    // Find the target page's config for rendering (need linkConfig for title normalization etc.)
    let linkConfig = sitePageConfigs.find(sitePageConfig =>
      sitePageConfig.title === resolvedTitle &&
      (sitePageConfig.source_graph_subdirectory || '') === targetPageDirectory &&
      (sitePageConfig.file_type === 'md' || !sitePageConfig.file_type)
    );

    const linkHasExplicitPath = originalLinkFilename.includes('/');
    if (!linkConfig && !linkHasExplicitPath) {
      linkConfig = sitePageConfigs.find(sitePageConfig =>
        sitePageConfig.title === resolvedTitle &&
        (sitePageConfig.file_type === 'md' || !sitePageConfig.file_type)
      );
    }

    const normalizedLinkFilename = siteConfig && siteSlug 
      ? normalizePageTitle(linkConfig?.title || resolvedTitle, siteConfig, siteSlug)
      : (linkConfig?.title || resolvedTitle);

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
      // Calculate relative path from current page directory to target page
      // Use the found config's directory when available AND the link had no explicit path
      // (handles fallback case where targetPageDirectory was empty but we found the config 
      // via title-only lookup). If the link had an explicit path, respect that path even if
      // no config was found.
      const effectiveTargetDirectory = (!linkHasExplicitPath && linkConfig?.source_graph_subdirectory !== undefined)
        ? linkConfig.source_graph_subdirectory
        : targetPageDirectory;
      // Encode each path segment separately (directories and filename)
      const targetPath = effectiveTargetDirectory
        ? encodePathForUrl(`${effectiveTargetDirectory}/${normalizedLinkFilename}.html`)
        : encodePathForUrl(`${normalizedLinkFilename}.html`);
      const relativeUrl = calculateRelativePath(currentPageDirectory, targetPath);
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