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

import express from 'express';
import fs from 'fs';
import path, { join } from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { sourceFileRequestPathCandidates } from '../../../../../../shared_code/utils/fileTypeUtils.js';
import { encodePathForUrl } from '../../../../../../shared_code/utils/urlUtils.js';
import { loadGzipPathSet, COMPRESSION_MANIFEST_FILENAME } from '../../../../../../shared_code/utils/compressionManifestUtils.js';
import { SiteConfig } from '../../../../../../shared_code/types/siteConfig.js';
import { SiteConfigPaths } from '../../../../../../shared_code/paths/siteConfigPaths.js';
import { getConfigDirectory, getSiteDirectory, getSiteConfigPath, getSiteHtmlDirectory } from '../../../../shared/site-config/siteConfigPaths.js';
import { generateHtmlForSite } from '../html/htmlService.js';
import { normalizePageTitle } from '../html/shared.js';
import { loadSiteConfig } from '../../../../shared/utils/siteConfigUtils.js';
import { getHtmlPathForPage } from '../../../../shared/utils/htmlPathLookup.js';
import { ensureTrackedPageContent } from '../../../../shared/utils/trackedPageContentUtils.js';
import { commitChangesNative } from '../../../../shared/utils/configDirectory/gitUtils/gitStatusUtils.js';
import { clearSiteGuidCache, logSiteError, logSiteInfo } from '../../../../shared/utils/logging/siteLogger.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getRequestOrigin(req: express.Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

// Serve the vendored Excalidraw renderer bundle so the editor frontend
// can use the same exportToSvg + lz-string surface that the published site
// uses. The bundle is the build artifact at
// `src/areas/site/generation/html/shared/excalidraw-vendor.js` (refreshed via
// `node scripts/build-excalidraw-vendor.mjs`).
router.get('/generation/assets/excalidraw-vendor.js', (_req, res) => {
  const bundlePath = path.join(__dirname, '..', 'html', 'shared', 'excalidraw-vendor.js');
  if (!fs.existsSync(bundlePath)) {
    return res.status(404).send('// excalidraw-vendor.js not found');
  }
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(bundlePath);
});



// Preview site endpoint  
router.post('/sites/:siteSlug/generation/preview', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      const requestOrigin = getRequestOrigin(req);
      
      if (!siteSlug) {
        return res.status(400).json({ error: 'siteSlug is required' });
      }

      // Get the site directory path
      const siteDirectory = getSiteDirectory(siteSlug);
      
      if (!fs.existsSync(siteDirectory)) {
        return res.status(404).json({ error: `Site '${siteSlug}' not found` });
      }

      // Load site config to get source directory
      const siteConfig = loadSiteConfig(siteDirectory);
      
      // Ensure tracked page content is populated from source directory
      if (siteConfig.sourceDirectory) {
        await ensureTrackedPageContent(siteDirectory, siteConfig.sourceDirectory);
      }

      // Generate HTML using TypeScript implementation
      try {
        logger.info(`Generating HTML for site: ${siteDirectory}`);
        
        // Generate preview HTML ONLY (not published version)
        await generateHtmlForSite(siteDirectory, { preview: true });

        // Check if preview HTML directory exists
        const previewHtmlDir = SiteConfigPaths.getPreviewDir(siteDirectory);
        
        if (!fs.existsSync(previewHtmlDir)) {
          return res.status(500).json({ error: 'Preview HTML directory not found after generation' });
        }

        // Get the site config to determine the traversal page
        const configPath = SiteConfigPaths.getSiteConfigFile(siteDirectory);
        let traversalPageTitle = '';
        let traversalPageDirectory: string | undefined = undefined;
        
        try {
          if (fs.existsSync(configPath)) {
            const yamlContent = fs.readFileSync(configPath, 'utf8');
            const config = YAML.parse(yamlContent) as { 
              defaultTraversalSitePageTitle?: string;
              defaultTraversalSitePageDirectory?: string;
            };
            traversalPageTitle = config?.defaultTraversalSitePageTitle || '';
            traversalPageDirectory = config?.defaultTraversalSitePageDirectory;
          }
        } catch (error) {
          logger.warn('Could not read site config for traversal page:', error);
        }

        // Look for the traversal page HTML file using the page's subdirectory from config
        let traversalPageUrl = '';
        if (traversalPageTitle) {
          const foundPath = getHtmlPathForPage(siteDirectory, traversalPageTitle, traversalPageDirectory);
          if (foundPath) {
            traversalPageUrl = `${requestOrigin}/api/sites/${siteSlug}/generation/published/${encodePathForUrl(foundPath)}`;
          }
        }

        // If no specific traversal page, look for any HTML file in root directory
        // (we don't pick alphabetically from subdirs to avoid unexpected behavior)
        if (!traversalPageUrl) {
          const htmlFiles = fs.readdirSync(previewHtmlDir).filter(file => file.endsWith('.html'));
          if (htmlFiles.length > 0) {
            // Use the first HTML file found, but log a warning since this is a fallback
            logger.warn(`No traversal page specified or found, falling back to first HTML file: ${htmlFiles[0]}`);
            traversalPageUrl = `${requestOrigin}/api/sites/${siteSlug}/generation/published/${encodePathForUrl(htmlFiles[0])}`;
          }
        }

        res.json({
          success: true,
          message: 'Site preview generated successfully',
          traversalPageUrl
        });
        
      } catch (execError) {
        logger.error('Error executing HTML generation:', execError);
        const error = execError as Error & { code?: string; signal?: string };
        
        let errorMessage = 'HTML generation failed';
        if (error.message.includes('timeout')) {
          errorMessage = 'HTML generation process timed out';
        } else if (error.code) {
          errorMessage = `HTML generation exited with code ${error.code}`;
        }
        
        return res.status(500).json({ 
          error: errorMessage,
          details: error.message
        });
      }
      
    } catch (error) {
      next(error);
    }
  })().catch(next);
});

export interface PreviewProgress {
  stage: 'preparing' | 'generating' | 'complete' | 'error';
  message: string;
  progress?: {
    current: number;
    total: number;
    percent: number;
  };
  result?: {
    success: boolean;
    traversalPageUrl?: string;
    error?: string;
  };
}

// Preview site endpoint with Server-Sent Events for progress
router.get('/sites/:siteSlug/generation/preview-stream', (req, res, _next) => {
  const { siteSlug } = req.params;
  const requestOrigin = getRequestOrigin(req);
  const startPageTitleRaw = typeof req.query.startPageTitle === 'string' ? req.query.startPageTitle : undefined;
  const startPageDirectoryRaw = typeof req.query.startPageDirectory === 'string' ? req.query.startPageDirectory : undefined;
  const startPagePathRaw = typeof req.query.startPagePath === 'string' ? req.query.startPagePath : undefined;
  const startPageTitle = startPageTitleRaw?.trim() ? startPageTitleRaw.trim() : undefined;
  const startPageDirectory = (startPageDirectoryRaw ?? '').trim();
  const startPagePath = startPagePathRaw?.trim() ? startPagePathRaw.trim() : undefined;

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders?.();

  const sendProgress = (progress: PreviewProgress) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    }

    // Lightweight logging for diagnostics
    if (siteSlug) {
      if (progress.stage === 'error') {
        logSiteError(siteSlug, `[preview] ${progress.message}`);
      } else if (progress.stage !== 'generating') {
        logSiteInfo(siteSlug, `[preview] ${progress.message}`);
      }
    }
  };

  // Per-site token to cancel older renders when a new preview-stream starts
  const g = globalThis as unknown as {
    __meadowPreviewTokens?: Map<string, number>;
    __meadowActivePreviewGenerations?: Set<string>;
  };
  if (!g.__meadowPreviewTokens) {
    g.__meadowPreviewTokens = new Map<string, number>();
  }
  if (!g.__meadowActivePreviewGenerations) {
    g.__meadowActivePreviewGenerations = new Set<string>();
  }
  const previewRenderTokens = g.__meadowPreviewTokens;
  const activePreviewGenerations = g.__meadowActivePreviewGenerations;

  const nextToken = () => {
    const prev = previewRenderTokens.get(siteSlug) ?? 0;
    const next = prev + 1;
    previewRenderTokens.set(siteSlug, next);
    return next;
  };

  void (async () => {
    try {
      if (!siteSlug) {
        sendProgress({ stage: 'error', message: 'siteSlug is required', result: { success: false, error: 'siteSlug is required' } });
        res.end();
        return;
      }

      sendProgress({ stage: 'preparing', message: 'Preparing to render preview...' });

      // Get the site directory path
      const siteDirectory = getSiteDirectory(siteSlug);
      if (!fs.existsSync(siteDirectory)) {
        sendProgress({ stage: 'error', message: `Site '${siteSlug}' not found`, result: { success: false, error: `Site '${siteSlug}' not found` } });
        res.end();
        return;
      }

      // Load site config to get source directory
      const siteConfig = loadSiteConfig(siteDirectory);

      // Ensure tracked page content is populated from source directory
      if (siteConfig.sourceDirectory) {
        await ensureTrackedPageContent(siteDirectory, siteConfig.sourceDirectory);
      }

      // Generate preview HTML ONLY (not published version)
      sendProgress({ stage: 'generating', message: 'Generating HTML...', progress: { current: 0, total: 0, percent: 0 } });

      // Track that preview generation is active for this site
      activePreviewGenerations.add(siteSlug);

      const token = nextToken();
      const shouldCancel = () => (previewRenderTokens.get(siteSlug) ?? token) !== token;
      let startUrlSent = false;
      let firstPageUrl: string | null = null;

      await generateHtmlForSite(siteDirectory, {
        preview: true,
        startPage: startPageTitle ? { title: startPageTitle, directory: startPageDirectory } : undefined,
        startPagePath,
        shouldCancel,
        onStartPageRendered: ({ relativeHtmlPath }) => {
          if (startUrlSent) return;
          startUrlSent = true;
          const traversalPageUrl = `${requestOrigin}/api/sites/${siteSlug}/generation/published/${encodePathForUrl(relativeHtmlPath)}`;
          firstPageUrl = traversalPageUrl;
          sendProgress({
            stage: 'generating',
            message: 'Start page ready',
            result: { success: true, traversalPageUrl },
            progress: { current: 0, total: 0, percent: 0 }
          });
        },
        onProgress: (info) => {
          if (info.stage === 'rendering-pages' && typeof info.current === 'number' && typeof info.total === 'number') {
            sendProgress({
              stage: 'generating',
              message: info.message,
              progress: {
                current: info.current,
                total: info.total,
                percent: typeof info.percent === 'number' ? info.percent : 0
              }
            });
          } else if (info.stage === 'copying-shared' || info.stage === 'scanning-links' || info.stage === 'computing-breadcrumbs') {
            sendProgress({ stage: 'generating', message: info.message, progress: { current: 0, total: 0, percent: 0 } });
          }
        }
      });

      // If this render was cancelled (superseded by a newer request), send a cancelled message
      // so the frontend knows to ignore this stream (a newer one is in progress)
      if (shouldCancel()) {
        logger.info(`[preview-stream] Render cancelled for ${siteSlug}, not sending success`);
        sendProgress({ stage: 'cancelled' as 'error', message: 'Superseded by newer request' });
        res.end();
        return;
      }

      // Check if preview HTML directory exists
      const previewHtmlDir = SiteConfigPaths.getPreviewDir(siteDirectory);
      if (!fs.existsSync(previewHtmlDir)) {
        sendProgress({ stage: 'error', message: 'Preview HTML directory not found after generation', result: { success: false, error: 'Preview HTML directory not found after generation' } });
        res.end();
        return;
      }

      // Get the site config to determine the traversal page
      const configPath = SiteConfigPaths.getSiteConfigFile(siteDirectory);
      let traversalPageTitle = '';
      let traversalPageDirectory: string | undefined = undefined;

      try {
        if (fs.existsSync(configPath)) {
          const yamlContent = fs.readFileSync(configPath, 'utf8');
          const config = YAML.parse(yamlContent) as {
            defaultTraversalSitePageTitle?: string;
            defaultTraversalSitePageDirectory?: string;
          };
          traversalPageTitle = config?.defaultTraversalSitePageTitle || '';
          traversalPageDirectory = config?.defaultTraversalSitePageDirectory;
        }
      } catch (error) {
        logger.warn('Could not read site config for traversal page:', error);
      }

      // Look for the traversal page HTML file using the page's subdirectory from config
      let traversalPageUrl = '';
      if (traversalPageTitle) {
        const foundPath = getHtmlPathForPage(siteDirectory, traversalPageTitle, traversalPageDirectory);
        if (foundPath) {
          traversalPageUrl = `${requestOrigin}/api/sites/${siteSlug}/generation/published/${encodePathForUrl(foundPath)}`;
        }
      }

      // If no specific traversal page, look for any HTML file in root directory
      if (!traversalPageUrl) {
        const htmlFiles = fs.readdirSync(previewHtmlDir).filter(file => file.endsWith('.html'));
        if (htmlFiles.length > 0) {
          logger.warn(`No traversal page specified or found, falling back to first HTML file: ${htmlFiles[0]}`);
          traversalPageUrl = `${requestOrigin}/api/sites/${siteSlug}/generation/published/${encodePathForUrl(htmlFiles[0])}`;
        }
      }

      // If the caller requested a specific start page, prefer that for the completion URL.
      if (startPageTitle && firstPageUrl) {
        traversalPageUrl = firstPageUrl;
      }

      sendProgress({
        stage: 'complete',
        message: 'Preview generated successfully',
        result: { success: true, traversalPageUrl }
      });
      res.end();
    } catch (error) {
      sendProgress({
        stage: 'error',
        message: error instanceof Error ? error.message : 'Preview generation failed',
        result: { success: false, error: error instanceof Error ? error.message : String(error) }
      });
      res.end();
    } finally {
      // Clear preview generation tracking
      activePreviewGenerations.delete(siteSlug);
    }
  })();
});


// Get normalized page name (applies user-defined hook transformations)
router.get('/sites/:siteSlug/generation/normalize-page-name', (req, res, next) => {
  try {
    const { siteSlug } = req.params;
    const { pageName } = req.query;

    if (!siteSlug) {
      return res.status(400).json({ error: 'siteSlug is required' });
    }

    if (!pageName || typeof pageName !== 'string') {
      return res.status(400).json({ error: 'pageName query parameter is required' });
    }

    const siteDirectory = getSiteDirectory(siteSlug);

    if (!fs.existsSync(siteDirectory)) {
      return res.status(404).json({ error: `Site '${siteSlug}' not found` });
    }

    // Load site config for normalization
    const siteConfig = loadSiteConfig(siteDirectory);

    // Apply the hook transformation to get the normalized name
    const normalizedName = normalizePageTitle(pageName, siteConfig, siteSlug);

    res.json({
      success: true,
      originalName: pageName,
      normalizedName
    });

  } catch (error) {
    logger.error('Error normalizing page name:', error);
    next(error);
  }
});


// Serve source graph files (images, etc.) for thumbnails
router.get('/sites/:siteSlug/generation/source-file/*', (req, res, next) => {
  try {
    const { siteSlug } = req.params;
    // Extract the wildcard path from the URL and decode it
    const requestPath = req.path;
    const sourceFileIndex = requestPath.indexOf('/source-file/');
    const rawFilename = sourceFileIndex !== -1 ? requestPath.substring(sourceFileIndex + '/source-file/'.length) : '';
    const filename = decodeURIComponent(rawFilename);
    
    if (!siteSlug || !filename) {
      return res.status(400).json({ error: 'siteSlug and filename are required' });
    }

    // Security check: prevent directory traversal with ..
    if (filename.includes('..')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Load site config to get sourceDirectory
    const configPath = getSiteConfigPath(siteSlug);
    let sourceDirectory = '';
    try {
      if (!fs.existsSync(configPath)) {
        return res.status(500).json({ error: `site_config.yaml not found for slug ${siteSlug}` });
      }
      const yamlContent = fs.readFileSync(configPath, 'utf8');
      const config = YAML.parse(yamlContent) as { sourceDirectory?: string };
      if (config && typeof config.sourceDirectory === 'string') {
        sourceDirectory = config.sourceDirectory;
      }
    } catch {
      return next(new Error(`Failed to load site configuration for ${siteSlug}`));
    }

    if (!sourceDirectory) {
      return res.status(500).json({ error: `Could not determine the source directory for site ${siteSlug}` });
    }

    const filePath = sourceFileRequestPathCandidates(filename)
      .map(candidateFilename => join(sourceDirectory, candidateFilename))
      .find(candidatePath => fs.existsSync(candidatePath));
    
    if (!filePath) {
      return res.status(404).json({ error: 'Source file not found' });
    }

    // Set appropriate content type based on file extension
    if (filename.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filename.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/gif');
    } else if (filename.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    }

    // Send the file
    res.sendFile(filePath);
    
  } catch (error) {
    next(error);
  }
});


// Serve published HTML files and static assets
router.get('/sites/:siteSlug/generation/published/*', (req, res, next) => {
  try {
    const { siteSlug } = req.params;
    // Extract the wildcard path from the URL and decode it
    const requestPath = req.path;
    const publishedIndex = requestPath.indexOf('/published/');
    const rawFilename = publishedIndex !== -1 ? requestPath.substring(publishedIndex + '/published/'.length) : '';
    const filename = decodeURIComponent(rawFilename);
    
    if (!siteSlug || !filename) {
      return res.status(400).json({ error: 'siteSlug and filename are required' });
    }

    // Security check: prevent directory traversal with ..
    if (filename.includes('..')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = join(getSiteHtmlDirectory(siteSlug), 'preview', filename);

    if (!fs.existsSync(filePath)) {
      // Check if preview generation is in progress for this site
      const g = globalThis as unknown as { __meadowActivePreviewGenerations?: Set<string> };
      const isGenerating = g.__meadowActivePreviewGenerations?.has(siteSlug) ?? false;

      if (isGenerating && filename.endsWith('.html')) {
        // Return a waiting page that auto-refreshes
        res.setHeader('Content-Type', 'text/html');
        return res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="1">
  <title>Generating Preview...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #e0e0e0;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    h2 { color: #374151; margin: 0 0 0.5rem; }
    p { color: #6b7280; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h2>Generating Preview...</h2>
    <p>This page is being rendered. It will load automatically when ready.</p>
  </div>
</body>
</html>`);
      }

      return res.status(404).json({ error: 'Preview file not found', requestedPath: filePath });
    }

    // Don't expose the internal compression manifest to the browser.
    if (path.basename(filename) === COMPRESSION_MANIFEST_FILENAME) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Set appropriate content type based on file extension
    if (filename.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html');
    } else if (filename.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (filename.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (filename.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filename.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/gif');
    } else if (filename.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    } else if (filename.endsWith('.woff')) {
      res.setHeader('Content-Type', 'font/woff');
    } else if (filename.endsWith('.woff2')) {
      res.setHeader('Content-Type', 'font/woff2');
    } else if (filename.endsWith('.ttf')) {
      res.setHeader('Content-Type', 'font/ttf');
    } else if (filename.endsWith('.eot')) {
      res.setHeader('Content-Type', 'application/vnd.ms-fontobject');
    }

    // If the file is in the compression manifest, the bytes on disk are
    // already gzipped. Tell the browser so it decompresses transparently.
    // Preview must be a true preview of what gets published; the same gzipped
    // bytes go to S3 with the same Content-Encoding metadata.
    const ASSETS_PREFIX = '_mw_assets/';
    if (filename.startsWith(ASSETS_PREFIX)) {
      const relativeAssetPath = filename.slice(ASSETS_PREFIX.length);
      const assetsDir = join(getSiteHtmlDirectory(siteSlug), 'preview', '_mw_assets');
      const gzipped = loadGzipPathSet(assetsDir);
      if (gzipped?.has(relativeAssetPath)) {
        res.setHeader('Content-Encoding', 'gzip');
      }
    }

    // Send the file
    res.sendFile(filePath);
    
  } catch (error) {
    next(error);
  }
});


// Update publish options (breadcrumbs, backlinks, tags)
router.patch('/sites/:slug/generation/options', (req, res, next) => {
  const { slug } = req.params;
  const {
    generationBreadcrumbsEnabled,
    generationBacklinksEnabled,
    generationTagsEnabled,
    generationHoverPreviewEnabled,
    generationMarkdownZipEnabled,
    generationSpacedRepetitionEnabled,
    generationSpacedRepetitionTags,
  } = req.body as {
    generationBreadcrumbsEnabled?: boolean | null;
    generationBacklinksEnabled?: boolean | null;
    generationTagsEnabled?: boolean | null;
    generationHoverPreviewEnabled?: boolean | null;
    generationMarkdownZipEnabled?: boolean | null;
    generationSpacedRepetitionEnabled?: boolean | null;
    generationSpacedRepetitionTags?: string[] | null;
  };

  const siteDirectory = getSiteDirectory(slug);

  try {
    if (!fs.existsSync(siteDirectory)) {
      return res.status(404).json({ error: 'Site not found' });
    }

    const validateBoolOrNullOrUndef = (v: unknown): v is boolean | null | undefined =>
      v === undefined || v === null || typeof v === 'boolean';
    const validateStringArrayOrNullOrUndef = (v: unknown): v is string[] | null | undefined =>
      v === undefined ||
      v === null ||
      (Array.isArray(v) && v.every(item => typeof item === 'string'));

    if (
      !validateBoolOrNullOrUndef(generationBreadcrumbsEnabled) ||
      !validateBoolOrNullOrUndef(generationBacklinksEnabled) ||
      !validateBoolOrNullOrUndef(generationTagsEnabled) ||
      !validateBoolOrNullOrUndef(generationHoverPreviewEnabled) ||
      !validateBoolOrNullOrUndef(generationMarkdownZipEnabled) ||
      !validateBoolOrNullOrUndef(generationSpacedRepetitionEnabled) ||
      !validateStringArrayOrNullOrUndef(generationSpacedRepetitionTags)
    ) {
      return res.status(400).json({ error: 'Publish options must be boolean, null, or undefined' });
    }

    // Read existing config to support "inherit" (null => delete key) without losing unknown fields.
    const configPath = getSiteConfigPath(slug);
    const yamlContent = fs.readFileSync(configPath, 'utf8');
    const existingConfig = YAML.parse(yamlContent) as SiteConfig;
    const updatedConfig: SiteConfig = { ...existingConfig, siteUpdatedAt: new Date().toISOString() };

    const setOrDelete = <K extends 'generationBreadcrumbsEnabled' | 'generationBacklinksEnabled' | 'generationTagsEnabled' | 'generationHoverPreviewEnabled' | 'generationMarkdownZipEnabled' | 'generationSpacedRepetitionEnabled' | 'generationSpacedRepetitionTags'>(
      key: K,
      value: SiteConfig[K] | null | undefined
    ) => {
      if (value === undefined) return;
      if (value === null) {
        delete updatedConfig[key];
        return;
      }
      updatedConfig[key] = value;
    };

    setOrDelete('generationBreadcrumbsEnabled', generationBreadcrumbsEnabled);
    setOrDelete('generationBacklinksEnabled', generationBacklinksEnabled);
    setOrDelete('generationTagsEnabled', generationTagsEnabled);
    setOrDelete('generationHoverPreviewEnabled', generationHoverPreviewEnabled);
    setOrDelete('generationMarkdownZipEnabled', generationMarkdownZipEnabled);
    setOrDelete('generationSpacedRepetitionEnabled', generationSpacedRepetitionEnabled);
    setOrDelete(
      'generationSpacedRepetitionTags',
      generationSpacedRepetitionTags?.map(tag => tag.trim()).filter(tag => tag.length > 0)
    );

    // Enforce dependency when backlinks are explicitly overridden off for this site.
    if (generationBacklinksEnabled === false) {
      updatedConfig.generationTagsEnabled = false;
    }

    fs.writeFileSync(configPath, YAML.stringify(updatedConfig), 'utf8');
    clearSiteGuidCache(slug);

    // Commit only the conf directory (fire and forget).
    // Important: we must NOT commit the preview directory here because preview
    // regeneration (triggered by this config change) deletes and recreates the
    // preview dir.  If this commit races with that deletion, git would record
    // the preview files as deleted, causing getOriginalContent() to treat
    // subsequently-regenerated preview files as "new" instead of "modified".
    const confDir = SiteConfigPaths.getConfDir(siteDirectory);
    if (fs.existsSync(confDir)) {
      void (async () => {
        try {
          await commitChangesNative(
            [confDir],
            'user changed site config',
            { configDir: getConfigDirectory() }
          );
        } catch (commitError) {
          logger.warn('[generation/options] Failed to commit config change:', commitError);
        }
      })();
    }

    res.json({ success: true, message: 'Publish options updated successfully' });
  } catch (error) {
    next(error);
  }
});
export default router;
