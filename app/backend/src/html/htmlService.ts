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
import { setTimeout as delay } from 'timers/promises';
import { Page } from './page.js';
import { renderPageToHtml, renderExcalidrawPageToHtml, renderSimpleBacklinksHtml, CollectedSrsCard } from './htmlGenerator.js';
import { buildExcalidrawClientLinkMap } from './linkModificationService.js';
import { markdownContentToPageLinkFilenames, normalizePageTitle } from './shared.js';
import {
  SitePageConfigs,
  InverseLinks,
  PageNameToPage,
  pageConfigToKey
} from './types.js';
import { getSitesDirectory, getConfigDirectory } from '../routes/siteConfigRoutes.js';
import { parsePageConfig } from '../../../shared_code/utils/sitePageConfigUtils.js';
import { SiteConfig } from '../../../shared_code/types/siteConfig.js';
import { FileType } from '../../../shared_code/types/FileType.js';
import { SiteConfigPaths } from '../../../shared_code/paths/siteConfigPaths.js';
import { loadSiteConfig, getLatestGeneratedSiteVersionWithFallback } from '../utils/siteConfigUtils.js';
import { generateVersionId, recordGeneratedSiteVersion } from '../services/publishService.js';
import { loadAppConfig } from '../../../shared_code/utils/appConfigUtils.js';
import { resolveEffectiveGenerationOptions } from '../../../shared_code/utils/generationOptionsUtils.js';
import { runWorkingGraphRaw } from '../utils/workingGraphUtils.js';
import type { LinkResolvedInfo } from '../../../shared_code/types/ISitePage.js';
import { hashAndRenameStaticAssets } from './staticAssets.js';
import { createRequire } from 'module';

// Load highlight.js github-light theme once at module load so the preset
// stylesheet pipeline can append it to style.css (scoping the theme to code
// blocks rendered via marked-highlight).
const require_ = createRequire(import.meta.url);
const HLJS_THEME_CSS: string = (() => {
  try {
    const cssPath = require_.resolve('highlight.js/styles/github.min.css');
    return fs.readFileSync(cssPath, 'utf8');
  } catch {
    return '';
  }
})();
import { createMarkdownExportZip, writeMarkdownExportManifest } from '../utils/zipUtils.js';
import { prepareModifiedSrsMarkdownDirectory } from '../utils/srsMarkdownUtils.js';
import { prepareMarkdownExportDirectory } from '../utils/markdownExportUtils.js';
import type { StaticAssetNames } from './types.js';
import { encodePathForUrl } from '../../../shared_code/utils/urlUtils.js';
import { logger } from '../utils/logging/backendLoggingUtils.js';
import { getEffectivePresetIdForSiteDirectory, getPresetAssetsPath } from '../utils/stylePresetsLoader.js';
import { resolveCustomAssets } from '../utils/customAssetsLoader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dev constant: pause after each HTML file is generated to make progress more visible on small datasets.
// Should always be 0 in production.
const AFTER_HTML_GENERATION_PAUSE_MS = 0;

function getPublishedSiteSrsAssetsPath(): string {
  if (process.env.NODE_ENV === 'production' && __dirname.includes('Resources')) {
    return path.join(__dirname, 'published_site_utils', 'srs');
  }

  return path.join(__dirname, 'published_site_utils', 'srs');
}

// TODO: feels like we could get this from the siteConfig?
function extractSiteSlugFromDirectory(siteDirectory: string): string | null {
  const sitesDir = getSitesDirectory();
  if (siteDirectory.startsWith(sitesDir + path.sep)) {
    const relativePath = siteDirectory.substring(sitesDir.length + 1);
    // Return the first directory component (the site slug)
    const parts = relativePath.split(path.sep);
    return parts[0] || null;
  }
  return null;
}

// Re-export for backward compatibility
export { generateVersionId, createOrUpdateGeneratedSiteVersions } from '../services/publishService.js';

/**
 * Wait for a file to exist on disk with polling.
 * This helps avoid race conditions where we signal "file ready" before the OS has flushed writes.
 */
async function waitForFileExists(filePath: string, maxWaitMs: number = 2000, pollIntervalMs: number = 50): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    if (fs.existsSync(filePath)) {
      return true;
    }
    await delay(pollIntervalMs);
  }
  return false;
}

export function publishToVersionedDirectory(
  siteDirectory: string,
  siteConfig: SiteConfig
): { version: string; directory: string } {
  const previewHtmlDirectory = SiteConfigPaths.getPreviewDir(siteDirectory);

  // Get the latest version or create a new one if none exists
  let latestVersion = getLatestGeneratedSiteVersionWithFallback(siteDirectory, siteConfig);

  if (!latestVersion) {
    latestVersion = generateVersionId();
  }

  // Create the versioned directory
  const versionedDirectory = path.join(SiteConfigPaths.getGeneratedSiteVersionsDir(siteDirectory), latestVersion);

  // Remove existing version directory if it exists
  if (fs.existsSync(versionedDirectory)) {
    fs.rmSync(versionedDirectory, { recursive: true, force: true });
  }

  // Copy from preview to versioned directory
  fs.cpSync(previewHtmlDirectory, versionedDirectory, { recursive: true });

  // Record the version (ensures generatedSiteVersions in site_config.yaml + generated_site_versions.yaml)
  recordGeneratedSiteVersion(siteDirectory, latestVersion, { siteConfig });

  return { version: latestVersion, directory: versionedDirectory };
}

export function publishToNewVersion(
  siteDirectory: string,
  siteConfig: SiteConfig,
  notes: string = ''
): { version: string; directory: string } {
  const previewHtmlDirectory = SiteConfigPaths.getPreviewDir(siteDirectory);

  // Always create a new version
  const newVersion = generateVersionId();

  // Create the versioned directory
  const versionedDirectory = path.join(SiteConfigPaths.getGeneratedSiteVersionsDir(siteDirectory), newVersion);

  // Copy from preview to versioned directory
  fs.cpSync(previewHtmlDirectory, versionedDirectory, { recursive: true });

  // Record the version (ensures generatedSiteVersions in site_config.yaml + generated_site_versions.yaml)
  recordGeneratedSiteVersion(siteDirectory, newVersion, { isNewVersion: true, notes, siteConfig });

  return { version: newVersion, directory: versionedDirectory };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

function toPosixRelativePath(relPath: string): string {
  return relPath.split(path.sep).join('/');
}

/**
 * Updates older published versions by injecting a "new version" pointer banner into each page.
 *
 * - If the corresponding page exists in the new version, link to that page in the new version.
 * - If it does not exist, show a warning message and link to the new version's initial page instead.
 */
export function updateOlderVersionsWithPointer(
  siteDirectory: string,
  newVersionId: string,
  newVersionBaseUrl: string,
  olderVersionIds: string[],
  initialPageTitle: string,
  initialPagePath: string
): { filesUpdated: number; pagesNotInNewVersion: number } {
  const publishedRoot = SiteConfigPaths.getGeneratedSiteVersionsDir(siteDirectory);
  const newVersionDir = path.join(publishedRoot, newVersionId);

  const newVersionHtmlFiles = walkFilesRecursively(newVersionDir)
    .filter((f) => f.toLowerCase().endsWith('.html'))
    .map((f) => toPosixRelativePath(path.relative(newVersionDir, f)));
  const newVersionHtmlSet = new Set(newVersionHtmlFiles);

  const trimmedBaseUrl = newVersionBaseUrl.replace(/\/+$/, '');
  const initialHref = `${trimmedBaseUrl}/${encodePathForUrl(initialPagePath)}`;
  const initialTitleEscaped = escapeHtml(initialPageTitle || 'Home');

  let filesUpdated = 0;
  let pagesNotInNewVersion = 0;

  for (const olderVersionId of olderVersionIds) {
    if (!olderVersionId || olderVersionId === newVersionId) continue;
    const olderVersionDir = path.join(publishedRoot, olderVersionId);
    if (!fs.existsSync(olderVersionDir)) continue;

    const olderHtmlFiles = walkFilesRecursively(olderVersionDir).filter((f) => f.toLowerCase().endsWith('.html'));

    for (const filePath of olderHtmlFiles) {
      const rel = toPosixRelativePath(path.relative(olderVersionDir, filePath));

      const existsInNewVersion = newVersionHtmlSet.has(rel);
      const newPageHref = `${trimmedBaseUrl}/${encodePathForUrl(rel)}`;

      const bannerHtml = existsInNewVersion
        ? `<div id="new-version-pointer" class="new-version-pointer"><strong>New version available:</strong> <a href="${newPageHref}">Open this page in the newer version</a>.</div>`
        : `<div id="new-version-pointer" class="new-version-pointer page-removed"><strong>New version available:</strong> This page does not exist in the newer version. Go to <a href="${initialHref}">${initialTitleEscaped}</a> instead.</div>`;

      const original = fs.readFileSync(filePath, 'utf8');

      // Replace existing placeholder or previously injected banner.
      const replaced = original.replace(
        /<div\s+id="new-version-pointer"[^>]*>[\s\S]*?<\/div>/,
        bannerHtml
      );

      if (replaced !== original) {
        fs.writeFileSync(filePath, replaced, 'utf8');
        filesUpdated += 1;
        if (!existsInNewVersion) pagesNotInNewVersion += 1;
      }
    }
  }

  return { filesUpdated, pagesNotInNewVersion };
}

export function parseSitePageConfig(sitePageConfFile: string): SitePageConfigs {
  const pageConfigs: SitePageConfigs = {};

  if (!fs.existsSync(sitePageConfFile)) {
    logger.warn(`Site page conf file not found: ${sitePageConfFile}`);
    return pageConfigs;
  }

  const content = fs.readFileSync(sitePageConfFile, 'utf-8');

  try {
    // Use the shared parsing utility (now parses YAML format)
    const pageConfArray = parsePageConfig(content);

    // Convert from PageConf[] to SitePageConfigs format using unique keys
    for (const pageConf of pageConfArray) {
      const key = pageConfigToKey(pageConf);
      pageConfigs[key] = pageConf;
    }
  } catch (error) {
    logger.warn(`Error parsing page config: ${String(error)}`);
  }

  return pageConfigs;
}

export async function generateHtmlForSite(
  siteDirectory: string,
  options: {
    publish?: boolean;
    publishNewVersion?: boolean;
    preview?: boolean;
    startPage?: { title: string; directory?: string };
    startPagePath?: string; // relative HTML path to prioritize (e.g., "subdir/Page Name.html")
    onStartPageRendered?: (info: { title: string; directory: string; relativeHtmlPath: string }) => void;
    shouldCancel?: () => boolean;
    onProgress?: (info: {
      stage: 'preparing' | 'copying-shared' | 'scanning-links' | 'computing-breadcrumbs' | 'rendering-pages' | 'complete';
      message: string;
      current?: number;
      total?: number;
      percent?: number;
    }) => void;
  } = {}
): Promise<void> {
  logger.info(`Processing site: ${siteDirectory}`);

  const emitProgress = (info: {
    stage: 'preparing' | 'copying-shared' | 'scanning-links' | 'computing-breadcrumbs' | 'rendering-pages' | 'complete';
    message: string;
    current?: number;
    total?: number;
    percent?: number;
  }) => {
    try {
      options.onProgress?.(info);
    } catch (err) {
      logger.warn(`[generateHtmlForSite] onProgress callback threw (ignored): ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  emitProgress({ stage: 'preparing', message: 'Preparing HTML render...' });
  
  // Extract the site slug from the directory path
  const siteSlug = extractSiteSlugFromDirectory(siteDirectory);
  
  // Load site configuration
  const siteConfig = loadSiteConfig(siteDirectory);
  
  const trackedPageContentDirectory = SiteConfigPaths.getTrackedPageContentDir(siteDirectory);
  const modifiedPageContentDirectory = SiteConfigPaths.getModifiedPageContentDir(siteDirectory);
  let renderContentDirectory = trackedPageContentDirectory;
  
  // Use new directory structure: html/preview for preview, html/generated_site_versions/<version> for published
  const previewHtmlDirectory = SiteConfigPaths.getPreviewDir(siteDirectory);
  
  const sitePageConfPath = SiteConfigPaths.getSitePageConfigFile(siteDirectory);
  const sitePageConfs = parseSitePageConfig(sitePageConfPath);
  const appConfig = loadAppConfig(getConfigDirectory());
  const generationOptions = resolveEffectiveGenerationOptions(appConfig, siteConfig);

  if (generationOptions.spacedRepetitionEnabled) {
    try {
      prepareModifiedSrsMarkdownDirectory(
        trackedPageContentDirectory,
        modifiedPageContentDirectory,
        generationOptions.spacedRepetitionTags
      );
      if (fs.existsSync(modifiedPageContentDirectory)) {
        renderContentDirectory = modifiedPageContentDirectory;
      }
    } catch (error) {
      logger.error(`Error preparing modified SRS markdown: ${String(error)}`);
      renderContentDirectory = trackedPageContentDirectory;
    }
  } else if (fs.existsSync(modifiedPageContentDirectory)) {
    fs.rmSync(modifiedPageContentDirectory, { recursive: true, force: true });
  }
  
  // Filter for whitelisted markdown pages only (we only render HTML for markdown files)
  const whitelistedMdPageKeys = Object.keys(sitePageConfs).filter(key => {
    const conf = sitePageConfs[key];
    return conf.config.list_type === 'whitelist' && (conf.file_type === 'md' || !conf.file_type);
  });
  

  // Create and clean the preview directory
  if (fs.existsSync(previewHtmlDirectory)) {
    fs.rmSync(previewHtmlDirectory, { recursive: true, force: true });
  }
  fs.mkdirSync(previewHtmlDirectory, { recursive: true });

  const assetsDirectory = path.join(previewHtmlDirectory, '_mw_assets');
  fs.mkdirSync(assetsDirectory, { recursive: true });

  // Get the effective style preset for this site
  const effectivePresetId = getEffectivePresetIdForSiteDirectory(siteDirectory);
  const presetDirectory = getPresetAssetsPath(effectivePresetId);

  logger.debug(`Using style preset: ${effectivePresetId}`);
  logger.debug(`Preset directory: ${presetDirectory}`);
  logger.debug(`Preset directory exists: ${fs.existsSync(presetDirectory)}`);

  emitProgress({ stage: 'copying-shared', message: 'Copying shared assets...' });

  // Copy preset assets (style.css, javascript.js, fonts/)
  // Skip style.css or javascript.js if base is disabled
  if (fs.existsSync(presetDirectory)) {
    try {
      const items = fs.readdirSync(presetDirectory);
      logger.debug(`Found preset items: ${items.join(', ')}`);

      for (const item of items) {
        // Skip base CSS/JS if disabled
        if (generationOptions.baseStyleCssDisabled && item === 'style.css') {
          logger.debug(`Skipping base style.css (disabled)`);
          continue;
        }
        if (generationOptions.baseJavascriptJsDisabled && item === 'javascript.js') {
          logger.debug(`Skipping base javascript.js (disabled)`);
          continue;
        }

        const srcPath = path.join(presetDirectory, item);
        const dstPath = path.join(assetsDirectory, item);

        if (fs.statSync(srcPath).isFile()) {
          fs.copyFileSync(srcPath, dstPath);
          logger.debug(`Copied file: ${item} to ${dstPath}`);
        } else if (fs.statSync(srcPath).isDirectory()) {
          fs.cpSync(srcPath, dstPath, { recursive: true });
          logger.debug(`Copied directory: ${item} to ${dstPath}`);
        }
      }
      logger.debug(`Successfully copied preset files from ${presetDirectory} to ${assetsDirectory}`);

      // Append highlight.js theme to the preset stylesheet so server-side
      // syntax highlighting (marked-highlight + hljs) has matching CSS.
      const presetStylePath = path.join(assetsDirectory, 'style.css');
      if (HLJS_THEME_CSS && fs.existsSync(presetStylePath)) {
        fs.appendFileSync(
          presetStylePath,
          `\n/* highlight.js github theme */\n${HLJS_THEME_CSS}\n`
        );
      }
    } catch (error) {
      logger.error(`Error copying preset files: ${String(error)}`);
    }
  } else {
    logger.warn(`Preset directory not found at ${presetDirectory}`);
  }

  // Resolve and copy custom assets (user-provided CSS/JS that loads after base)
  const configDir = getConfigDirectory();
  const customAssets = resolveCustomAssets(configDir, siteDirectory);

  if (customAssets.globalStyleCssPath) {
    fs.copyFileSync(customAssets.globalStyleCssPath, path.join(assetsDirectory, 'global-style.css'));
    logger.debug(`Copied global style.css from ${customAssets.globalStyleCssPath}`);
  }
  if (customAssets.siteStyleCssPath) {
    fs.copyFileSync(customAssets.siteStyleCssPath, path.join(assetsDirectory, 'site-style.css'));
    logger.debug(`Copied site style.css from ${customAssets.siteStyleCssPath}`);
  }
  if (customAssets.globalJavascriptJsPath) {
    fs.copyFileSync(customAssets.globalJavascriptJsPath, path.join(assetsDirectory, 'global-javascript.js'));
    logger.debug(`Copied global javascript.js from ${customAssets.globalJavascriptJsPath}`);
  }
  if (customAssets.siteJavascriptJsPath) {
    fs.copyFileSync(customAssets.siteJavascriptJsPath, path.join(assetsDirectory, 'site-javascript.js'));
    logger.debug(`Copied site javascript.js from ${customAssets.siteJavascriptJsPath}`);
  }

  // Copy extra files (images, fonts, etc.) from custom_assets dirs
  // Global first, then site overlay (site files with same name override global)
  const extraOutputDir = path.join(assetsDirectory, 'extra');
  const hasExtraFiles = customAssets.globalExtraFilesDir || customAssets.siteExtraFilesDir;
  if (hasExtraFiles) {
    const copyExtras = (sourceDir: string) => {
      if (!fs.existsSync(sourceDir)) return;
      const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
      for (const entry of entries) {
        // Skip the known CSS/JS asset files
        if (entry.name === 'style.css' || entry.name === 'javascript.js') continue;
        const srcPath = path.join(sourceDir, entry.name);
        const dstPath = path.join(extraOutputDir, entry.name);
        if (entry.isFile()) {
          fs.mkdirSync(extraOutputDir, { recursive: true });
          fs.copyFileSync(srcPath, dstPath);
        } else if (entry.isDirectory()) {
          fs.cpSync(srcPath, dstPath, { recursive: true });
        }
      }
    };
    if (customAssets.globalExtraFilesDir) copyExtras(customAssets.globalExtraFilesDir);
    if (customAssets.siteExtraFilesDir) copyExtras(customAssets.siteExtraFilesDir);
  }

  // Copy mermaid.min.js from shared directory (common to all presets)
  let sharedDirectory: string;
  if (process.env.NODE_ENV === 'production' && __dirname.includes('Resources')) {
    sharedDirectory = path.join(__dirname, 'shared');
  } else {
    sharedDirectory = path.join(__dirname, 'shared');
  }

  const mermaidSrc = path.join(sharedDirectory, 'mermaid.min.js');
  const mermaidDst = path.join(assetsDirectory, 'mermaid.min.js');
  if (fs.existsSync(mermaidSrc)) {
    fs.copyFileSync(mermaidSrc, mermaidDst);
    logger.debug(`Copied mermaid.min.js to ${mermaidDst}`);
  } else {
    logger.warn(`mermaid.min.js not found at ${mermaidSrc}`);
  }

  const calloutsSrc = path.join(sharedDirectory, 'callouts.css');
  const calloutsDst = path.join(assetsDirectory, 'callouts.css');
  if (fs.existsSync(calloutsSrc)) {
    fs.copyFileSync(calloutsSrc, calloutsDst);
    logger.debug(`Copied callouts.css to ${calloutsDst}`);
  } else {
    logger.warn(`callouts.css not found at ${calloutsSrc}`);
  }

  // Excalidraw assets — only copied for sites that include at least one Excalidraw drawing.
  const siteHasExcalidraw = Object.values(sitePageConfs).some(
    conf => conf.file_type === 'excalidraw' && conf.config.list_type === 'whitelist'
  );
  if (siteHasExcalidraw) {
    const excalidrawAssets = [
      'meadow-excalidraw.css',
      'excalidraw-vendor.js', // pre-bundled @excalidraw/excalidraw + lz-string; sets window.MeadowExcalidraw
      'meadow-excalidraw.js', // small init script that hydrates placeholder containers
    ];
    for (const asset of excalidrawAssets) {
      const src = path.join(sharedDirectory, asset);
      const dst = path.join(assetsDirectory, asset);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
        logger.debug(`Copied ${asset} to ${dst}`);
      } else {
        logger.warn(`${asset} not found at ${src}`);
      }
    }
  }

  if (generationOptions.spacedRepetitionEnabled) {
    const srsAssetsDirectory = getPublishedSiteSrsAssetsPath();
    const srsOutputDirectory = path.join(assetsDirectory, 'srs');
    fs.mkdirSync(srsOutputDirectory, { recursive: true });
    const srsAssetNames = ['srs.js', 'srs.css'];

    for (const assetName of srsAssetNames) {
      const sourcePath = path.join(srsAssetsDirectory, assetName);
      const targetPath = path.join(srsOutputDirectory, assetName);
      if (!fs.existsSync(sourcePath)) {
        logger.warn(`SRS asset not found at ${sourcePath}`);
        continue;
      }
      fs.copyFileSync(sourcePath, targetPath);
      logger.debug(`Copied SRS asset: ${assetName}`);
    }
  }

  // Hash+rename static assets (css/js/mermaid/fonts) so they can be cached immutably in browsers/CDNs.
  // IMPORTANT: This must happen BEFORE pages are rendered so HTML references the new basenames.
  let staticAssetNames: StaticAssetNames | undefined;
  try {
    staticAssetNames = hashAndRenameStaticAssets(assetsDirectory);
  } catch (error) {
    logger.error(`Error hashing/renaming shared assets: ${String(error)}`);
    staticAssetNames = undefined;
  }
  
  // Convert site page configs to array format for passing to renderPageToHtml and getWorkingGraph
  const sitePageConfigsArray = Object.values(sitePageConfs);

  // Compute breadcrumb paths using the same traversal logic as the main graph (now via Rust working_graph)
  const initialSitePageTitle = siteConfig.initialSitePageTitle || '';
  const initialSitePageDirectory = siteConfig.initialSitePageDirectory || '';
  // Key breadcrumbPaths by pageKey (title|directory|file_type) to handle duplicate titles correctly
  let breadcrumbPaths: { [pageKey: string]: string[] } = {};
  let allLinkResolutionMaps: Map<string, Record<string, LinkResolvedInfo>> = new Map();
  // Track which pages are reachable via traversal - only these should have HTML generated
  const traversablePageKeys: Set<string> = new Set();
  const breadcrumbsEnabled = generationOptions.breadcrumbsEnabled;

  // Compute working graph traversal BEFORE creating the markdown export ZIP,
  // so we know which pages are reachable and can exclude orphaned pages.
  try {
    emitProgress({
      stage: 'computing-breadcrumbs',
      message: breadcrumbsEnabled ? 'Creating traversal and breadcrumbs...' : 'Creating traversal...'
    });
    if (initialSitePageTitle) {
      const initialConf = sitePageConfigsArray.find(c =>
        c.title === initialSitePageTitle && (c.source_graph_subdirectory || '') === (initialSitePageDirectory || '')
      );
      const initialFileType = initialConf?.file_type || 'md';

      type RustLinkResolvedInfo = { link_resolved_target_directory: string; link_resolved_target_path: string | null };
      type RustPage = { title: string; sourceGraphSubdirectory: string; file_type: FileType; path?: string[] };
      type RustOutput = { pages: RustPage[]; allLinkResolutionMaps?: Record<string, Record<string, RustLinkResolvedInfo>> };

      const raw = await runWorkingGraphRaw({
        graphRoot: renderContentDirectory,
        sitePageConfigPath: sitePageConfPath,
        initial: { title: initialSitePageTitle, directory: initialSitePageDirectory || '', file_type: initialFileType },
        traversal: { title: initialSitePageTitle, directory: initialSitePageDirectory || '', file_type: initialFileType },
        frontierDepth: 0,
        allowImagesToExtendToFrontier: true,
        allowLowerDepths: false,
      });
      const output = JSON.parse(raw) as RustOutput;

      allLinkResolutionMaps = new Map(Object.entries(output.allLinkResolutionMaps || {}));
      logger.debug(`Loaded link resolution maps for ${allLinkResolutionMaps.size} pages from working_graph`);

      for (const graphPage of output.pages) {
        const pageKey = pageConfigToKey({
          title: graphPage.title,
          source_graph_subdirectory: graphPage.sourceGraphSubdirectory,
          file_type: graphPage.file_type,
          config: { list_type: 'whitelist' } // dummy config for key generation
        });

        traversablePageKeys.add(pageKey);

        if (breadcrumbsEnabled && graphPage.path) {
          const titlePath = graphPage.path.map(ident => {
            const lastSlash = ident.lastIndexOf('/');
            const titleWithExt = lastSlash >= 0 ? ident.substring(lastSlash + 1) : ident;
            const lastDot = titleWithExt.lastIndexOf('.');
            return lastDot >= 0 ? titleWithExt.substring(0, lastDot) : titleWithExt;
          });
          breadcrumbPaths[pageKey] = titlePath;
        }
      }

      if (breadcrumbsEnabled) {
        logger.debug(`Computed breadcrumb paths for ${Object.keys(breadcrumbPaths).length} pages using working graph`);
      }
      logger.debug(`Found ${traversablePageKeys.size} traversable pages (only these will have HTML generated)`);
    }
  } catch (err) {
    logger.warn(`Could not load working_graph data for link resolution and breadcrumbs (will proceed without it): ${err instanceof Error ? err.message : String(err)}`);
  }

  // Filter site page configs to only include pages in the working graph.
  // This ensures links to tracked-but-not-in-graph pages show as "link not tracked".
  const sitePageConfigsArrayForLinks = sitePageConfigsArray.filter(conf => {
    const key = pageConfigToKey(conf);
    return traversablePageKeys.has(key);
  });

  // Generate markdown export ZIP if enabled.
  // Now that traversal is complete, we can filter orphaned pages and sanitize links.
  let markdownZipEnabled = false;
  if (generationOptions.markdownZipEnabled) {
    try {
      const markdownExportDir = SiteConfigPaths.getMarkdownExportDir(siteDirectory);
      prepareMarkdownExportDirectory(
        trackedPageContentDirectory,
        siteConfig.sourceDirectory || undefined,
        markdownExportDir,
        traversablePageKeys,
        sitePageConfs,
        sitePageConfigsArrayForLinks,
        { srsEnabled: generationOptions.spacedRepetitionEnabled }
      );
      const mdExportOutputDir = path.join(assetsDirectory, 'md-export');
      fs.mkdirSync(mdExportOutputDir, { recursive: true });
      const zipResult = await createMarkdownExportZip(markdownExportDir, mdExportOutputDir);
      writeMarkdownExportManifest(mdExportOutputDir, zipResult);
      if (zipResult) {
        markdownZipEnabled = true;
        logger.info(`Generated markdown export ZIP: ${zipResult}`);
      }
    } catch (error) {
      logger.error(`Error generating markdown export ZIP: ${String(error)}`);
    }
  } else {
    const mdExportOutputDir = path.join(assetsDirectory, 'md-export');
    if (fs.existsSync(mdExportOutputDir)) {
      writeMarkdownExportManifest(mdExportOutputDir, null);
    }
    // Clean up intermediate directory if it exists
    const markdownExportDir = SiteConfigPaths.getMarkdownExportDir(siteDirectory);
    if (fs.existsSync(markdownExportDir)) {
      fs.rmSync(markdownExportDir, { recursive: true, force: true });
    }
  }

  // Build the inverse_links mappings by scanning all traversable text-content
  // pages (markdown and Excalidraw drawings, since the latter store
  // wikilinks in the Text Elements section of their .md). This excludes
  // orphaned tracked pages (isTracked: true but isInWorkingGraph: false).
  const inverseLinks: InverseLinks = {};
  const pageNameToPage: PageNameToPage = {};

  emitProgress({ stage: 'scanning-links', message: 'Scanning links for backlinks...' });
  const traversableLinkScanPageKeys = Object.keys(sitePageConfs).filter(pageKey => {
    const conf = sitePageConfs[pageKey];
    const ft = conf.file_type;
    const isScannable = ft === 'md' || ft === undefined || ft === 'excalidraw';
    return isScannable && conf.config.list_type === 'whitelist' && traversablePageKeys.has(pageKey);
  });
  for (const pageKey of traversableLinkScanPageKeys) {
    const conf = sitePageConfs[pageKey];
    const subdir = conf.source_graph_subdirectory || '';
    // Excalidraw drawings live as `<title>.excalidraw.md` on disk.
    const filename = conf.file_type === 'excalidraw'
      ? `${conf.title}.excalidraw.md`
      : `${conf.title}.md`;
    const pageContentPath = subdir
      ? path.join(renderContentDirectory, subdir, filename)
      : path.join(renderContentDirectory, filename);

    if (!fs.existsSync(pageContentPath)) {
      continue;
    }

    // Read the markdown content
    const content = fs.readFileSync(pageContentPath, 'utf-8');

    // Find all wiki-style links [[link name]] and standard markdown links [text](path.md)
    const links = markdownContentToPageLinkFilenames(content);

    // Also capture excalidraw embeds `![[X.excalidraw]]` as inlinks to the
    // X drawing — the markdown link extractor skips them (image-typed) but we
    // want backlinks to render on the standalone Excalidraw page.
    const excalidrawEmbedRe = /!\[\[([^\]]+)\]\]/g;
    let exMatch;
    while ((exMatch = excalidrawEmbedRe.exec(content)) !== null) {
      const inner = exMatch[1].split('|')[0]; // strip size/alias
      if (!/\.excalidraw$/i.test(inner)) continue;
      const stripped = inner.replace(/\.excalidraw$/i, '');
      const lastSlash = stripped.lastIndexOf('/');
      const title = lastSlash >= 0 ? stripped.slice(lastSlash + 1) : stripped;
      if (title && !links.includes(title)) {
        links.push(title);
      }
    }

    // Also scan for standard markdown file links [text](path.md)
    const mdLinkPattern = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;
    let mdLinkMatch;
    while ((mdLinkMatch = mdLinkPattern.exec(content)) !== null) {
      const href = mdLinkMatch[2].trim();
      // Skip external links and anchor-only links
      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')) continue;
      // Extract the filename stem from the href (strip path and extension)
      const hrefWithoutAnchor = href.split('#')[0];
      const filename = hrefWithoutAnchor.split('/').pop() ?? '';
      const stem = filename.replace(/\.[^.]+$/, '');
      if (stem && !links.includes(stem)) {
        links.push(stem);
      }
    }

    // For each link found, add the current page to the inverse_links for that target
    for (const link of links) {
      if (!inverseLinks[link]) {
        inverseLinks[link] = [];
      }

      if (!inverseLinks[link].includes(conf.title)) {
        inverseLinks[link].push(conf.title);
      }
    }

    // Create a simple page object
    pageNameToPage[conf.title] = new Page();
  }

  // Second pass: generate HTML for each traversable page to preview directory with subdirectories
  // Only pages reachable via the working graph traversal will have HTML generated
  const traversableMdPageKeys = whitelistedMdPageKeys.filter(pageKey => traversablePageKeys.has(pageKey));

  // Determine which page to render first (for fast preview UX)
  const requestedStartTitle = options.startPage?.title;
  const requestedStartDir = options.startPage?.directory ?? '';
  const defaultStartTitle = siteConfig.defaultTraversalSitePageTitle || siteConfig.initialSitePageTitle || '';
  const defaultStartDir = siteConfig.defaultTraversalSitePageDirectory || siteConfig.initialSitePageDirectory || '';

  const startTitle = requestedStartTitle || defaultStartTitle;
  const startDir = requestedStartTitle ? requestedStartDir : defaultStartDir;

  // If a startPagePath was provided (e.g. "subdir/My Page.html"), find the matching page key
  let startPageKey: string | undefined;
  if (options.startPagePath) {
    const targetPath = decodeURIComponent(options.startPagePath);
    startPageKey = traversableMdPageKeys.find(k => {
      const c = sitePageConfs[k];
      const normalizedName = normalizePageTitle(c.title, siteConfig, siteSlug || undefined);
      const subdir = c.source_graph_subdirectory || '';
      const expectedPath = subdir ? `${subdir}/${normalizedName}.html` : `${normalizedName}.html`;
      return expectedPath === targetPath;
    });
  }

  if (!startPageKey && startTitle) {
    startPageKey = traversableMdPageKeys.find(k => {
      const c = sitePageConfs[k];
      return c.title === startTitle && (c.source_graph_subdirectory || '') === (startDir || '');
    });
  }

  // Render start page first, then the rest deterministically.
  const renderOrder: string[] = startPageKey
    ? [startPageKey, ...traversableMdPageKeys.filter(k => k !== startPageKey)]
    : [...traversableMdPageKeys];

  const totalToRender = renderOrder.length;
  let renderedOrSkipped = 0;
  let lastPercent = -1;
  emitProgress({ stage: 'rendering-pages', message: `Rendering HTML pages...`, current: 0, total: totalToRender, percent: 0 });

  const allCollectedSrsCards: Array<CollectedSrsCard & { pageId: string; pageTitle: string }> = [];

  let startPageRenderedEmitted = false;
  for (const pageKey of renderOrder) {
    if (options.shouldCancel?.()) {
      logger.warn('[generateHtmlForSite] Cancel requested; stopping render loop early');
      break;
    }
    
    const conf = sitePageConfs[pageKey];
    const subdir = conf.source_graph_subdirectory || '';
    const pageContentPath = subdir 
      ? path.join(renderContentDirectory, subdir, `${conf.title}.md`)
      : path.join(renderContentDirectory, `${conf.title}.md`);

    if (!fs.existsSync(pageContentPath)) {
      logger.warn(`Page content file not found for ${conf.title} at ${pageContentPath}`);
      renderedOrSkipped += 1;
      const percent = totalToRender > 0 ? Math.floor((renderedOrSkipped / totalToRender) * 100) : 100;
      if (percent !== lastPercent) {
        lastPercent = percent;
        emitProgress({
          stage: 'rendering-pages',
          message: `Rendering HTML pages...`,
          current: renderedOrSkipped,
          total: totalToRender,
          percent
        });
      }
      continue;
    }
    
    // Normalize the output filename to match how links are normalized
    const normalizedOutputFilename = normalizePageTitle(conf.title, siteConfig, siteSlug || undefined);
    
    // Create output subdirectory if needed
    const outputSubdir = subdir 
      ? path.join(previewHtmlDirectory, subdir)
      : previewHtmlDirectory;
    if (subdir && !fs.existsSync(outputSubdir)) {
      fs.mkdirSync(outputSubdir, { recursive: true });
    }
    
    // Source directory includes subdirectory for finding the markdown file
    const sourceDir = subdir 
      ? path.join(renderContentDirectory, subdir)
      : renderContentDirectory;
    
    // Get the link resolution map for this page
    // Page ident format is "directory/title.file_type" or "/title.file_type" for root
    const pageIdent = subdir ? `${subdir}/${conf.title}.md` : `/${conf.title}.md`;
    const linkResolutionMap = allLinkResolutionMaps.get(pageIdent);

    // Determine if this is the initial page (no breadcrumbs for initial page)
    // Match by title AND directory to handle duplicate titles correctly
    const isInitialPage = conf.title === initialSitePageTitle &&
      (conf.source_graph_subdirectory || '') === initialSitePageDirectory;
    // Look up breadcrumb path by pageKey to handle duplicate titles correctly
    const breadcrumbPath = breadcrumbPaths[pageKey] || [];
    
    // Use effective publish options (site override -> global -> default)
    const showBreadcrumbs = breadcrumbsEnabled && !isInitialPage && breadcrumbPath.length > 0;
    const showBacklinks = generationOptions.backlinksEnabled;

    // Generate to preview directory (with subdirectory)
    const { htmlPath, srsCards } = renderPageToHtml(
      sourceDir,  // Source directory (includes subdir for finding the .md file)
      pageNameToPage,
      conf.title,  // current_page_name
      normalizedOutputFilename,  // output_filename
      outputSubdir,  // output folder (may be subdirectory)
      inverseLinks,
      siteConfig,
      '',  // site_config_file
      sitePageConfigsArrayForLinks,
      {
        processBacklinks: showBacklinks,
        processingMode: 'each-page',
        showBacklinkContext: true,
        skipUninterestingLeafPages: false,
        preserveFrontmatter: false,
        showBreadcrumbs,
        showHoverPreview: generationOptions.hoverPreviewEnabled,
        breadcrumbPath,
        initialPageTitle: initialSitePageTitle,
        staticAssetNames,
        markdownZipEnabled,
        srsEnabled: generationOptions.spacedRepetitionEnabled,
      },
      siteSlug || undefined,
      subdir,  // current page's source directory (for relative path calculations)
      renderContentDirectory,  // base content directory for image lookups
      previewHtmlDirectory,  // base output directory for image output
      linkResolutionMap,
      allLinkResolutionMaps
    );

    if (htmlPath) {
      logger.debug(`Generated HTML for: ${conf.title} in ${subdir || 'root'}`);
    }

    if (generationOptions.spacedRepetitionEnabled && srsCards.length > 0) {
      const srsPageId = subdir ? `${subdir}/${normalizedOutputFilename}.html` : `${normalizedOutputFilename}.html`;
      for (const card of srsCards) {
        allCollectedSrsCards.push({
          ...card,
          pageId: srsPageId,
          pageTitle: normalizedOutputFilename,
        });
      }
    }

    // Emit callback once the first (start) page is rendered so callers can show preview immediately.
    if (!startPageRenderedEmitted) {
      const isStart = startPageKey ? pageKey === startPageKey : renderedOrSkipped === 0;
      if (isStart && htmlPath) {
        // Wait for file to actually exist on disk before signaling ready
        // This avoids race conditions where the frontend tries to load before the OS has flushed the write
        const fileExists = await waitForFileExists(htmlPath);
        if (fileExists) {
          startPageRenderedEmitted = true;
          const relativeHtmlPath = subdir ? `${subdir}/${normalizedOutputFilename}.html` : `${normalizedOutputFilename}.html`;
          try {
            options.onStartPageRendered?.({ title: conf.title, directory: subdir, relativeHtmlPath });
          } catch (err) {
            logger.warn(`[generateHtmlForSite] onStartPageRendered callback threw (ignored): ${err instanceof Error ? err.message : String(err)}`);
          }
        } else {
          logger.warn(`[generateHtmlForSite] Timed out waiting for start page file to exist: ${htmlPath}`);
        }
      }
    }

    renderedOrSkipped += 1;
    const percent = totalToRender > 0 ? Math.floor((renderedOrSkipped / totalToRender) * 100) : 100;
    if (percent !== lastPercent) {
      lastPercent = percent;
      emitProgress({
        stage: 'rendering-pages',
        message: `Rendering HTML pages...`,
        current: renderedOrSkipped,
        total: totalToRender,
        percent
      });
    }

    // Yield between pages so the server can still respond to preview file requests while rendering continues.
    // Use AFTER_HTML_GENERATION_PAUSE_MS to add an artificial delay for debugging progress visualization.
    await delay(AFTER_HTML_GENERATION_PAUSE_MS);
  }

  // Standalone Excalidraw HTML pages (so direct navigation works and breadcrumbs
  // pointing at an Excalidraw drawing resolve to a real page). The body is the
  // inline-rendered SVG; the standard page shell wraps breadcrumbs and footer.
  const traversableExcalidrawPageKeys = Object.keys(sitePageConfs).filter(key => {
    const conf = sitePageConfs[key];
    return conf.config.list_type === 'whitelist' && conf.file_type === 'excalidraw' && traversablePageKeys.has(key);
  });
  for (const pageKey of traversableExcalidrawPageKeys) {
    const conf = sitePageConfs[pageKey];
    const subdir = conf.source_graph_subdirectory || '';
    // Obsidian Excalidraw drawings live on disk as `<title>.excalidraw.md`.
    const sourceMdPath = subdir
      ? path.join(renderContentDirectory, subdir, `${conf.title}.excalidraw.md`)
      : path.join(renderContentDirectory, `${conf.title}.excalidraw.md`);

    const outputSubdir = subdir
      ? path.join(previewHtmlDirectory, subdir)
      : previewHtmlDirectory;
    if (subdir && !fs.existsSync(outputSubdir)) {
      fs.mkdirSync(outputSubdir, { recursive: true });
    }

    const normalizedOutputFilename = normalizePageTitle(conf.title, siteConfig, siteSlug || undefined);

    // Build breadcrumb HTML inline using the same lookup as renderPageToHtml.
    const breadcrumbPath = breadcrumbPaths[pageKey] || [];
    const isInitialPage = conf.title === initialSitePageTitle &&
      (conf.source_graph_subdirectory || '') === initialSitePageDirectory;
    const showBreadcrumbs = breadcrumbsEnabled && !isInitialPage && breadcrumbPath.length > 1;
    let breadcrumbHtml = '';
    if (showBreadcrumbs) {
      const items: string[] = [];
      for (let i = 0; i < breadcrumbPath.length; i++) {
        const t = breadcrumbPath[i];
        const isLast = i === breadcrumbPath.length - 1;
        const normTitle = normalizePageTitle(t, siteConfig, siteSlug || undefined);
        if (isLast) {
          items.push(`<span class="breadcrumb-current">${normTitle}</span>`);
        } else {
          const bcConf = sitePageConfigsArrayForLinks.find(c => c.title === t);
          const bcDir = bcConf?.source_graph_subdirectory || '';
          const encoded = encodeURIComponent(normTitle);
          const targetPath = bcDir ? `${bcDir}/${encoded}.html` : `${encoded}.html`;
          // Compute a relative href from this excalidraw page's directory.
          const fromDir = subdir;
          const fromParts = fromDir ? fromDir.split('/').filter(Boolean) : [];
          const toParts = targetPath.split('/');
          let common = 0;
          while (common < fromParts.length && common < toParts.length - 1 && fromParts[common] === toParts[common]) common++;
          const up = '../'.repeat(fromParts.length - common);
          const relative = up + toParts.slice(common).join('/');
          items.push(`<a href="${relative}" class="breadcrumb-link">${normTitle}</a>`);
        }
      }
      breadcrumbHtml = `<nav class="breadcrumbs" aria-label="Breadcrumb">${items.join('<span class="breadcrumb-separator">→</span>')}</nav>`;
    }

    const backlinksHtml = generationOptions.backlinksEnabled
      ? renderSimpleBacklinksHtml(
          conf.title,
          subdir,
          inverseLinks,
          sitePageConfigsArrayForLinks,
          siteConfig,
          siteSlug || undefined,
        )
      : '';

    // Copy the source .excalidraw.md alongside the page so the client can
    // fetch it by relative path. Embeds in other pages already trigger a
    // copy via linkOrImageHtml, but this loop covers Excalidraw pages that
    // never get embedded.
    const sourceMdDest = path.join(outputSubdir, `${conf.title}.excalidraw.md`);
    if (fs.existsSync(sourceMdPath) && !fs.existsSync(sourceMdDest)) {
      fs.copyFileSync(sourceMdPath, sourceMdDest);
    }
    const drawingMdHref = encodePathForUrl(`${conf.title}.excalidraw.md`);

    // Pre-resolve the wikilinks living inside this Excalidraw drawing using
    // the working-graph data. The client renderer reads this map to set the
    // right href on each linked text element, instead of re-implementing
    // Obsidian's link-resolution rules in JavaScript.
    const excalidrawIdent = subdir ? `${subdir}/${conf.title}.excalidraw` : `/${conf.title}.excalidraw`;
    const clientLinkMap = buildExcalidrawClientLinkMap({
      excalidrawPageIdent: excalidrawIdent,
      hostPageDirectory: subdir,
      sitePageConfigs: sitePageConfigsArrayForLinks,
      allLinkResolutionMaps,
      siteConfig,
      siteSlug: siteSlug || undefined,
    });

    renderExcalidrawPageToHtml({
      sourceMdPath,
      outputFolder: outputSubdir,
      outputFilename: normalizedOutputFilename,
      pageTitle: normalizedOutputFilename,
      currentPageDirectory: subdir,
      drawingMdHref,
      clientLinkMap,
      breadcrumbHtml,
      backlinksHtml,
      staticAssetNames,
      siteConfig,
      siteSlug: siteSlug || undefined,
    });
  }

  if (generationOptions.spacedRepetitionEnabled && allCollectedSrsCards.length > 0) {
    const siteGuid = siteConfig.siteGuid || '';
    const globalCards = allCollectedSrsCards.map(c => ({
      guid: c.guid,
      kind: c.kind,
      promptHtml: c.promptHtml,
      answerHtml: c.answerHtml,
      siblingGroup: c.siblingGroup,
      pageId: c.pageId,
      pageTitle: c.pageTitle,
    }));
    const srsOutputDirectory = path.join(assetsDirectory, 'srs');
    fs.mkdirSync(srsOutputDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(srsOutputDirectory, 'srs-all-cards.json'),
      JSON.stringify({ version: 1, siteGuid, cards: globalCards })
    );
  }

  emitProgress({ stage: 'complete', message: 'HTML render complete', current: totalToRender, total: totalToRender, percent: 100 });
  
  // If publish flag is set, also create versioned directory
  if (options.publish) {
    const { version, directory } = publishToVersionedDirectory(siteDirectory, siteConfig);
    logger.info(`Published to versioned directory: ${version} at ${directory}`);
  }

  // If publish-new-version flag is set, create a new version
  if (options.publishNewVersion) {
    const { version, directory } = publishToNewVersion(siteDirectory, siteConfig);
    logger.info(`Published to new version: ${version} at ${directory}`);
  }
} 
