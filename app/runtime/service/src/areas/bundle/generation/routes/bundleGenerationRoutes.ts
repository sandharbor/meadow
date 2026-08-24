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
import { sourceFileRequestPathCandidates } from '../../../../../../../shared_code/utils/fileTypeUtils.js';
import { encodePathForUrl } from '../../../../../../../shared_code/utils/urlUtils.js';
import { loadGzipPathSet, COMPRESSION_MANIFEST_FILENAME } from '../../../../../../../shared_code/utils/compressionManifestUtils.js';
import { BundleConfig } from '../../../../../../../contracts/types/bundleConfig.js';
import { BundleConfigPaths } from '../../../../../../../shared_code/paths/bundleConfigPaths.js';
import { getConfigDirectory, getBundleDirectory, getBundleConfigPath } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { generateHtmlForBundle } from '../html/htmlService.js';
import {
  createNewGeneratedBundleVersion,
  generateCurrentBundleVersion,
} from '../../../../shared/generated-bundle-versioning/generatedBundleVersionLifecycle.js';
import { currentGeneratedBundleVersionDirectory } from '../../../../shared/generated-bundle-versioning/generatedBundleVersionManifestService.js';
import { normalizePageTitle } from '../html/shared.js';
import { loadBundleConfig, saveBundleConfigToPath } from '../../../../shared/utils/bundleConfigUtils.js';
import { getHtmlPathForPage } from '../../../../shared/utils/htmlPathLookup.js';
import { ensureTrackedPageContent } from '../source-material/trackedPageContent.js';
import { readOpenKnowledgeFormatGenerationManifest } from '../open-knowledge-format/openKnowledgeFormatGenerationManifest.js';
import { getOpenKnowledgeFormatLogPageOptions } from '../open-knowledge-format/openKnowledgeFormatLogPages.js';
import { commitChangesNative } from '../../../../shared/utils/configDirectory/gitUtils/gitStatusUtils.js';
import { clearBundleGuidCache, logBundleError, logBundleInfo } from '../../../../shared/utils/logging/bundleLogger.js';
import { createBundleOperationLogger } from '../../../../shared/utils/logging/bundleOperationLogger.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';
import { timeAsync, timeSync } from '../../../../shared/telemetry/timingMetrics.js';
import { parseBundleNodeConfig, resolveBundleNodeRoles } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import {
  createPreviewReadToken,
  MEADOW_PREVIEW_TOKEN_QUERY,
} from '../../../../shared/app-shell/controlPlaneSecurity.js';
import {
  CLI_MUTATION_BEHAVIORS,
  CLI_OPERATION_SCHEMA_VERSION,
} from '../../../../../../../contracts/types/cliOperations.js';
import { assessBundleBoundary } from '../../../../shared/bundle-boundary-review/bundleBoundaryReviewService.js';
import type { BundleBoundaryReviewRequest } from '../../../../../../../contracts/types/bundleBoundaryReview.js';

const router = express.Router();

function previewDirectory(bundleDirectory: string): string | null {
  // Operation-specific staging directories are never reader-visible. Until
  // the lifecycle commit point installs a version, preview requests either
  // keep serving the prior installed version or show the generating page.
  return currentGeneratedBundleVersionDirectory(bundleDirectory);
}

function isPreviewGenerationActive(bundleSlug: string): boolean {
  const g = globalThis as unknown as { __meadowActivePreviewGenerations?: Set<string> };
  return g.__meadowActivePreviewGenerations?.has(bundleSlug) ?? false;
}

function sendGeneratingPreviewPage(res: express.Response): void {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="1"><title>Generating Preview...</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 2rem; }
    .spinner { width: 40px; height: 40px; border: 4px solid #e0e0e0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { color: #374151; margin: 0 0 0.5rem; } p { color: #6b7280; margin: 0; }
  </style>
</head><body><div class="container"><div class="spinner"></div><h2>Generating Preview...</h2><p>This page is being rendered. It will load automatically when ready.</p></div></body></html>`);
}

async function generateCurrentVersionHtml(
  bundleSlug: string,
  bundleDirectory: string,
  options: Omit<NonNullable<Parameters<typeof generateHtmlForBundle>[1]>, 'outputDirectory'>,
) {
  const operation = createBundleOperationLogger(bundleSlug, 'version-generate');
  operation.info('Started staging the current generated version');
  try {
    const result = await generateCurrentBundleVersion(bundleDirectory, {
      operationId: () => operation.operationId,
      onPhase: phase => operation.debug(`Reached ${phase}`),
      generate: async (stagingDirectory) => {
        await generateHtmlForBundle(bundleDirectory, { ...options, outputDirectory: stagingDirectory });
      },
      validate: () => {
        if (options.shouldCancel?.()) throw new Error('Preview generation was superseded by a newer request');
      },
    });
    operation.info(`${result.created ? 'Created first' : 'Regenerated current'} version ${result.versionId}; manifest and generated files installed atomically`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('superseded by a newer request')) {
      operation.warn('Superseded by a newer preview request; local staging was rolled back safely');
    } else {
      operation.error(`Failed and rolled back local staging; retry is safe: ${message}`);
    }
    throw error;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getRequestOrigin(req: express.Request): string { return `${req.protocol}://${req.get('host')}`; }

function previewFileUrl(req: express.Request, bundleSlug: string, relativePath: string): string {
  const capability = process.env.MEADOW_API_CAPABILITY;
  if (!capability) throw new Error('Preview access requires the launch capability');
  const url = new URL(
    `${getRequestOrigin(req)}/api/bundles/${encodeURIComponent(bundleSlug)}/generation/published/${encodePathForUrl(relativePath)}`,
  );
  url.searchParams.set(MEADOW_PREVIEW_TOKEN_QUERY, createPreviewReadToken(capability, bundleSlug));
  return url.toString();
}

function loadDefaultTraversalPage(bundleDirectory: string): { title: string; directory: string } {
  const configPath = BundleConfigPaths.getBundleConfigFile(bundleDirectory);
  const nodeConfigPath = BundleConfigPaths.getBundleNodeConfigFile(bundleDirectory);
  const bundleConfig = YAML.parse(fs.readFileSync(configPath, 'utf8')) as BundleConfig;
  const nodes = parseBundleNodeConfig(fs.readFileSync(nodeConfigPath, 'utf8'), nodeConfigPath);
  const { defaultTraversalNode } = resolveBundleNodeRoles(nodes, bundleConfig, configPath);
  return {
    title: defaultTraversalNode.bundleNodeName,
    directory: defaultTraversalNode.sourceGraphSubdirectory || '',
  };
}

// Serve the vendored Excalidraw renderer bundle so the editor frontend
// can use the same exportToSvg + lz-string surface that the published bundle
// uses. The bundle is the build artifact at
// `src/areas/bundle/generation/html/shared/excalidraw-vendor.js` (refreshed via
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

router.get('/bundles/:bundleSlug/generation/open-knowledge-format/manifest', (req, res, next) => {
  try {
    const { bundleSlug } = req.params;
    if (!bundleSlug) {
      return res.status(400).json({ error: 'bundleSlug is required' });
    }

    const bundleDirectory = getBundleDirectory(bundleSlug);
    if (!fs.existsSync(bundleDirectory)) {
      return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
    }

    res.json(readOpenKnowledgeFormatGenerationManifest(bundleDirectory));
  } catch (error) {
    next(error);
  }
});

router.get('/bundles/:bundleSlug/generation/open-knowledge-format/log-page-options', (req, res, next) => {
  (async () => {
    const { bundleSlug } = req.params;
    if (!bundleSlug) {
      return res.status(400).json({ error: 'bundleSlug is required' });
    }

    const bundleDirectory = getBundleDirectory(bundleSlug);
    if (!fs.existsSync(bundleDirectory)) {
      return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
    }

    const bundleConfig = loadBundleConfig(bundleDirectory);
    if (bundleConfig.sourceDirectory) {
      await ensureTrackedPageContent(bundleDirectory, bundleConfig.sourceDirectory);
    }

    const rawQuery = typeof req.query.query === 'string' ? req.query.query : '';
    const parsedLimit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : NaN;
    const limit = !Number.isNaN(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;
    res.json(await getOpenKnowledgeFormatLogPageOptions(bundleDirectory, { query: rawQuery, limit }));
  })().catch(next);
});

router.post('/bundles/:bundleSlug/generation/versions', (req, res, next) => {
  void (async () => {
    const operation = createBundleOperationLogger(req.params.bundleSlug ?? 'unknown', 'version-create');
    try {
      const { bundleSlug } = req.params;
      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
      const bundleDirectory = getBundleDirectory(bundleSlug);
      if (!fs.existsSync(bundleDirectory)) {
        return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
      }

      const boundaryReview = await assessBundleBoundary(bundleSlug);
      if (boundaryReview.reviewRequired && boundaryReview.reviewRequest) {
        const request = boundaryReview.reviewRequest;
        return res.status(202).json({
          schemaVersion: CLI_OPERATION_SCHEMA_VERSION,
          operation: 'bundle.generate',
          slug: bundleSlug,
          changed: false,
          mutationBehavior: CLI_MUTATION_BEHAVIORS.generateBundle,
          paused: true,
          reviewRequest: request,
          nextActions: request.findings
            .filter(finding => finding.code === 'sensitivity-reaffirmation-required')
            .map(finding => ({
              operation: 'track-node' as const,
              args: [
                'bundle', 'node', 'track', bundleSlug,
                '--id', finding.bundleNodeId,
                '--include-sensitive',
              ],
              displayCommand: `meadow bundle node track ${bundleSlug} --id ${finding.bundleNodeId} --include-sensitive`,
            })),
        });
      }
      const body = (req.body ?? {}) as {
        notes?: unknown;
        readerConnectionToPredecessor?: unknown;
        confirmedNoGeneratedChanges?: unknown;
      };
      if (body.notes !== undefined && typeof body.notes !== 'string') {
        return res.status(400).json({ error: 'notes must be a string' });
      }
      if (
        body.readerConnectionToPredecessor !== undefined
        && body.readerConnectionToPredecessor !== 'connected'
        && body.readerConnectionToPredecessor !== 'disconnected'
      ) {
        return res.status(400).json({ error: 'readerConnectionToPredecessor must be connected or disconnected' });
      }

      const bundleConfig = loadBundleConfig(bundleDirectory);
      if (bundleConfig.sourceDirectory) {
        await ensureTrackedPageContent(bundleDirectory, bundleConfig.sourceDirectory);
      }
      operation.info('Started creating a new local generated version');
      const result = await createNewGeneratedBundleVersion(bundleDirectory, {
        operationId: () => operation.operationId,
        onPhase: phase => operation.debug(`Reached ${phase}`),
        notes: body.notes ?? '',
        readerConnectionToPredecessor: body.readerConnectionToPredecessor ?? 'connected',
        confirmedNoGeneratedChanges: body.confirmedNoGeneratedChanges === true,
        generate: async stagingDirectory => {
          await generateHtmlForBundle(bundleDirectory, { preview: true, outputDirectory: stagingDirectory });
        },
      });
      operation.info(`Created version ${result.versionId}; predecessor ${result.manifest.versions.at(-2)?.versionId ?? 'none'} is frozen and the manifest is committed`);
      res.json({ success: true, versionId: result.versionId, operationId: operation.operationId });
    } catch (error) {
      logger.error('Error creating generated bundle version:', error);
      const bundleSlug = req.params.bundleSlug;
      if (bundleSlug) {
        operation.error(`Failed and rolled back local changes; retry is safe: ${error instanceof Error ? error.message : String(error)}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      const status = /requires confirmation|must have at least one saved generation|Regenerate and save|Frozen version|conflicting/.test(message)
        ? 409
        : 500;
      res.status(status).json({ error: message });
    }
  })().catch(next);
});

// Preview bundle endpoint
router.post('/bundles/:bundleSlug/generation/preview', (req, res, next) => {
  (async () => {
    try {
      const { bundleSlug } = req.params;
      
      if (!bundleSlug) {
        return res.status(400).json({ error: 'bundleSlug is required' });
      }

      // Get the bundle directory path
      const bundleDirectory = getBundleDirectory(bundleSlug);
      
      if (!fs.existsSync(bundleDirectory)) {
        return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
      }

      const boundaryReview = await assessBundleBoundary(bundleSlug);
      if (boundaryReview.reviewRequired && boundaryReview.reviewRequest) {
        const request = boundaryReview.reviewRequest;
        return res.status(202).json({
          schemaVersion: CLI_OPERATION_SCHEMA_VERSION,
          operation: 'bundle.generate',
          slug: bundleSlug,
          changed: false,
          mutationBehavior: CLI_MUTATION_BEHAVIORS.generateBundle,
          paused: true,
          reviewRequest: request,
          nextActions: request.findings
            .filter(finding => finding.code === 'sensitivity-reaffirmation-required')
            .map(finding => ({
              operation: 'track-node' as const,
              args: [
                'bundle', 'node', 'track', bundleSlug,
                '--id', finding.bundleNodeId,
                '--include-sensitive',
              ],
              displayCommand: `meadow bundle node track ${bundleSlug} --id ${finding.bundleNodeId} --include-sensitive`,
            })),
        });
      }

      // Load bundle config to get source directory
      const bundleConfig = loadBundleConfig(bundleDirectory);
      
      // Ensure tracked page content is populated from source directory
      if (bundleConfig.sourceDirectory) {
        const sourceDirectory = bundleConfig.sourceDirectory;
        await timeAsync(
          'bundle.preview.request.stage',
          { stage: 'sync_tracked_page_content', bundle_slug: bundleSlug },
          () => ensureTrackedPageContent(bundleDirectory, sourceDirectory)
        );
      }

      // Generate HTML using TypeScript implementation
      try {
        logger.info(`Generating HTML for bundle: ${bundleDirectory}`);

        // Generate preview HTML ONLY (not published version)
        const generationResult = await timeAsync(
          'bundle.preview.request.stage',
          { stage: 'generate_html', bundle_slug: bundleSlug },
          () => generateCurrentVersionHtml(bundleSlug, bundleDirectory, { preview: true })
        );

        const generatedHtmlDir = generationResult.directory;
        
        if (!fs.existsSync(generatedHtmlDir)) {
          return res.status(500).json({ error: 'Generated HTML directory not found after generation' });
        }

        // Get the bundle config to determine the traversal page
        let traversalPageTitle = '';
        let traversalPageDirectory: string | undefined = undefined;
        
        try {
          const traversalPage = timeSync(
            'bundle.preview.request.stage',
            { stage: 'load_traversal_config', bundle_slug: bundleSlug },
            () => loadDefaultTraversalPage(bundleDirectory),
          );
          traversalPageTitle = traversalPage.title;
          traversalPageDirectory = traversalPage.directory;
        } catch (error) {
          logger.warn('Could not read bundle config for traversal page:', error);
        }

        // Look for the traversal page HTML file using the page's subdirectory from config
        let traversalPageUrl = '';
        if (traversalPageTitle) {
          const foundPath = getHtmlPathForPage(bundleDirectory, traversalPageTitle, traversalPageDirectory);
          if (foundPath) {
            traversalPageUrl = previewFileUrl(req, bundleSlug, foundPath);
          }
        }

        // If no specific traversal page, look for any HTML file in root directory
        // (we don't pick alphabetically from subdirs to avoid unexpected behavior)
        if (!traversalPageUrl) {
          const htmlFiles = fs.readdirSync(generatedHtmlDir).filter(file => file.endsWith('.html'));
          if (htmlFiles.length > 0) {
            // Use the first HTML file found, but log a warning since this is a fallback
            logger.warn(`No traversal page specified or found, falling back to first HTML file: ${htmlFiles[0]}`);
            traversalPageUrl = previewFileUrl(req, bundleSlug, htmlFiles[0]);
          }
        }

        res.json({
          schemaVersion: CLI_OPERATION_SCHEMA_VERSION,
          operation: 'bundle.generate',
          success: true,
          slug: bundleSlug,
          changed: true,
          mutationBehavior: CLI_MUTATION_BEHAVIORS.generateBundle,
          versionId: generationResult.versionId,
          saved: false,
          previewUrl: traversalPageUrl,
          message: 'Bundle preview generated successfully',
          traversalPageUrl,
          ...(boundaryReview.reviewRequest && { reviewRequest: boundaryReview.reviewRequest }),
          nextActions: [
            ...(boundaryReview.reviewRequest ? [{
              operation: 'open-review' as const,
              args: ['review', 'open', boundaryReview.reviewRequest.reviewRequestId],
              displayCommand: `meadow review open ${boundaryReview.reviewRequest.reviewRequestId}`,
            }] : []),
            {
              operation: 'save-generation' as const,
              args: ['bundle', 'save-generation', bundleSlug, '--version', generationResult.versionId],
              displayCommand: `meadow bundle save-generation ${bundleSlug} --version ${generationResult.versionId}`,
            },
          ],
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
    reviewRequest?: BundleBoundaryReviewRequest;
  };
}

// Preview bundle endpoint with Server-Sent Events for progress
router.get('/bundles/:bundleSlug/generation/preview-stream', (req, res, _next) => {
  const { bundleSlug } = req.params;
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
    if (bundleSlug) {
      if (progress.stage === 'error') {
        logBundleError(bundleSlug, `[preview] ${progress.message}`);
      } else if (progress.stage !== 'generating') {
        logBundleInfo(bundleSlug, `[preview] ${progress.message}`);
      }
    }
  };

  // Per-bundle token to cancel older renders when a new preview-stream starts
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
    const prev = previewRenderTokens.get(bundleSlug) ?? 0;
    const next = prev + 1;
    previewRenderTokens.set(bundleSlug, next);
    return next;
  };

  void (async () => {
    try {
      if (!bundleSlug) {
        sendProgress({ stage: 'error', message: 'bundleSlug is required', result: { success: false, error: 'bundleSlug is required' } });
        res.end();
        return;
      }

      const boundaryReview = await assessBundleBoundary(bundleSlug);
      if (boundaryReview.reviewRequired && boundaryReview.reviewRequest) {
        sendProgress({
          stage: 'error',
          message: 'Bundle Boundary Review requires explicit sensitive-file reaffirmation before generation.',
          result: {
            success: false,
            error: 'bundle-boundary-review-required',
            reviewRequest: boundaryReview.reviewRequest,
          },
        });
        res.end();
        return;
      }

      sendProgress({ stage: 'preparing', message: 'Preparing to render preview...' });

      // Get the bundle directory path
      const bundleDirectory = getBundleDirectory(bundleSlug);
      if (!fs.existsSync(bundleDirectory)) {
        sendProgress({ stage: 'error', message: `Bundle '${bundleSlug}' not found`, result: { success: false, error: `Bundle '${bundleSlug}' not found` } });
        res.end();
        return;
      }

      // Load bundle config to get source directory
      const bundleConfig = loadBundleConfig(bundleDirectory);

      // Ensure tracked page content is populated from source directory
      if (bundleConfig.sourceDirectory) {
        const sourceDirectory = bundleConfig.sourceDirectory;
        await timeAsync(
          'bundle.preview.request.stage',
          { stage: 'sync_tracked_page_content', bundle_slug: bundleSlug },
          () => ensureTrackedPageContent(bundleDirectory, sourceDirectory)
        );
      }

      // Generate preview HTML ONLY (not published version)
      sendProgress({ stage: 'generating', message: 'Generating HTML...', progress: { current: 0, total: 0, percent: 0 } });

      // Track that preview generation is active for this bundle
      activePreviewGenerations.add(bundleSlug);

      const token = nextToken();
      const shouldCancel = () => (previewRenderTokens.get(bundleSlug) ?? token) !== token;
      let startUrlSent = false;
      let firstPageUrl: string | null = null;

      const generationResult = await timeAsync(
        'bundle.preview.request.stage',
        { stage: 'generate_html', bundle_slug: bundleSlug },
        () => generateCurrentVersionHtml(bundleSlug, bundleDirectory, {
          preview: true,
          startPage: startPageTitle ? { title: startPageTitle, directory: startPageDirectory } : undefined,
          startPagePath,
          shouldCancel,
          onStartPageRendered: ({ relativeHtmlPath }) => {
            if (startUrlSent) return;
            startUrlSent = true;
            const traversalPageUrl = previewFileUrl(req, bundleSlug, relativeHtmlPath);
            firstPageUrl = traversalPageUrl;
            sendProgress({
              stage: 'generating',
              message: 'Start page ready',
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
        })
      );

      // If this render was cancelled (superseded by a newer request), send a cancelled message
      // so the frontend knows to ignore this stream (a newer one is in progress)
      if (shouldCancel()) {
        logger.info(`[preview-stream] Render cancelled for ${bundleSlug}, not sending success`);
        sendProgress({ stage: 'cancelled' as 'error', message: 'Superseded by newer request' });
        res.end();
        return;
      }

      // Check if preview HTML directory exists
      const generatedHtmlDir = generationResult.directory;
      if (!fs.existsSync(generatedHtmlDir)) {
        sendProgress({ stage: 'error', message: 'Generated HTML directory not found after generation', result: { success: false, error: 'Generated HTML directory not found after generation' } });
        res.end();
        return;
      }

      // Get the bundle config to determine the traversal page
      let traversalPageTitle = '';
      let traversalPageDirectory: string | undefined = undefined;

      try {
        const traversalPage = timeSync(
          'bundle.preview.request.stage',
          { stage: 'load_traversal_config', bundle_slug: bundleSlug },
          () => loadDefaultTraversalPage(bundleDirectory),
        );
        traversalPageTitle = traversalPage.title;
        traversalPageDirectory = traversalPage.directory;
      } catch (error) {
        logger.warn('Could not read bundle config for traversal page:', error);
      }

      // Look for the traversal page HTML file using the page's subdirectory from config
      let traversalPageUrl = '';
      if (traversalPageTitle) {
        const foundPath = getHtmlPathForPage(bundleDirectory, traversalPageTitle, traversalPageDirectory);
        if (foundPath) {
          traversalPageUrl = previewFileUrl(req, bundleSlug, foundPath);
        }
      }

      // If no specific traversal page, look for any HTML file in root directory
      if (!traversalPageUrl) {
        const htmlFiles = fs.readdirSync(generatedHtmlDir).filter(file => file.endsWith('.html'));
        if (htmlFiles.length > 0) {
          logger.warn(`No traversal page specified or found, falling back to first HTML file: ${htmlFiles[0]}`);
          traversalPageUrl = previewFileUrl(req, bundleSlug, htmlFiles[0]);
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
      activePreviewGenerations.delete(bundleSlug);
    }
  })();
});


// Get normalized page name (applies user-defined hook transformations)
router.get('/bundles/:bundleSlug/generation/normalize-page-name', (req, res, next) => {
  try {
    const { bundleSlug } = req.params;
    const { pageName } = req.query;

    if (!bundleSlug) {
      return res.status(400).json({ error: 'bundleSlug is required' });
    }

    if (!pageName || typeof pageName !== 'string') {
      return res.status(400).json({ error: 'pageName query parameter is required' });
    }

    const bundleDirectory = getBundleDirectory(bundleSlug);

    if (!fs.existsSync(bundleDirectory)) {
      return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
    }

    // Load bundle config for normalization
    const bundleConfig = loadBundleConfig(bundleDirectory);

    // Apply the hook transformation to get the normalized name
    const normalizedName = normalizePageTitle(pageName, bundleConfig, bundleSlug);

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
router.get('/bundles/:bundleSlug/generation/source-file/*', (req, res, next) => {
  try {
    const { bundleSlug } = req.params;
    // Extract the wildcard path from the URL and decode it
    const requestPath = req.path;
    const sourceFileIndex = requestPath.indexOf('/source-file/');
    const rawFilename = sourceFileIndex !== -1 ? requestPath.substring(sourceFileIndex + '/source-file/'.length) : '';
    const filename = decodeURIComponent(rawFilename);
    
    if (!bundleSlug || !filename) {
      return res.status(400).json({ error: 'bundleSlug and filename are required' });
    }

    // Security check: prevent directory traversal with ..
    if (filename.includes('..')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Load bundle config to get sourceDirectory
    const configPath = getBundleConfigPath(bundleSlug);
    let sourceDirectory = '';
    try {
      if (!fs.existsSync(configPath)) {
        return res.status(500).json({ error: `bundle_config.yaml not found for slug ${bundleSlug}` });
      }
      const yamlContent = fs.readFileSync(configPath, 'utf8');
      const config = YAML.parse(yamlContent) as { sourceDirectory?: string };
      if (config && typeof config.sourceDirectory === 'string') {
        sourceDirectory = config.sourceDirectory;
      }
    } catch {
      return next(new Error(`Failed to load bundle configuration for ${bundleSlug}`));
    }

    if (!sourceDirectory) {
      return res.status(500).json({ error: `Could not determine the source directory for bundle ${bundleSlug}` });
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
router.get('/bundles/:bundleSlug/generation/published/*', (req, res, next) => {
  try {
    const { bundleSlug } = req.params;
    // Extract the wildcard path from the URL and decode it
    const requestPath = req.path;
    const publishedIndex = requestPath.indexOf('/published/');
    const rawFilename = publishedIndex !== -1 ? requestPath.substring(publishedIndex + '/published/'.length) : '';
    const filename = decodeURIComponent(rawFilename);
    
    if (!bundleSlug || !filename) {
      return res.status(400).json({ error: 'bundleSlug and filename are required' });
    }

    // Security check: prevent directory traversal with ..
    if (filename.includes('..')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const bundleDirectory = getBundleDirectory(bundleSlug);
    const generatedHtmlDir = previewDirectory(bundleDirectory);
    if (!generatedHtmlDir) {
      if (isPreviewGenerationActive(bundleSlug) && filename.endsWith('.html')) {
        sendGeneratingPreviewPage(res);
        return;
      }
      return res.status(404).json({ error: 'No generated bundle version found' });
    }
    const filePath = join(generatedHtmlDir, filename);

    if (!fs.existsSync(filePath)) {
      if (isPreviewGenerationActive(bundleSlug) && filename.endsWith('.html')) {
        sendGeneratingPreviewPage(res);
        return;
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
      const assetsDir = join(generatedHtmlDir, '_mw_assets');
      const gzipped = loadGzipPathSet(assetsDir);
      if (gzipped?.has(relativeAssetPath)) {
        res.setHeader('Content-Encoding', 'gzip');
      }
    }

    // The current directory is replaced as one unit. If sendFile opens during
    // the rename window, resolve the installed directory again and retry once.
    const sendInstalledFile = (candidatePath: string, retried: boolean) => res.sendFile(candidatePath, error => {
      if (!error) return;
      const fileError = error as NodeJS.ErrnoException & { status?: number };
      if (fileError.code === 'ENOENT' || fileError.status === 404) {
        if (!retried && !res.headersSent) {
          const latestDirectory = previewDirectory(bundleDirectory);
          const latestPath = latestDirectory ? join(latestDirectory, filename) : null;
          if (latestPath && fs.existsSync(latestPath)) {
            sendInstalledFile(latestPath, true);
            return;
          }
        }
        if (!res.headersSent) {
          res.status(404).json({ error: 'Preview file not found', requestedPath: candidatePath });
        }
        return;
      }
      if (fileError.code === 'ECONNABORTED' || req.aborted || res.destroyed) {
        return;
      }
      next(error);
    });
    sendInstalledFile(filePath, false);
    
  } catch (error) {
    next(error);
  }
});


// Update publish options (breadcrumbs, backlinks, tags)
router.patch('/bundles/:slug/generation/options', (req, res, next) => {
  const { slug } = req.params;
  const {
    generationBreadcrumbsEnabled,
    generationBacklinksEnabled,
    generationTagsEnabled,
    generationSearchEnabled,
    generationHoverPreviewEnabled,
    generationFolderNavigationEnabled,
    generationMarkdownZipEnabled,
    generationOpenKnowledgeFormatEnabled,
    generationOpenKnowledgeFormatIndexMode,
    generationOpenKnowledgeFormatIndexSourcePath,
    generationOpenKnowledgeFormatLogMode,
    generationOpenKnowledgeFormatLogSourcePath,
    generationSpacedRepetitionEnabled,
    generationSpacedRepetitionTags,
  } = req.body as {
    generationBreadcrumbsEnabled?: boolean | null;
    generationBacklinksEnabled?: boolean | null;
    generationTagsEnabled?: boolean | null;
    generationSearchEnabled?: boolean | null;
    generationHoverPreviewEnabled?: boolean | null;
    generationFolderNavigationEnabled?: boolean | null;
    generationMarkdownZipEnabled?: boolean | null;
    generationOpenKnowledgeFormatEnabled?: boolean | null;
    generationOpenKnowledgeFormatIndexMode?: 'generated' | 'trackedPage' | null;
    generationOpenKnowledgeFormatIndexSourcePath?: string | null;
    generationOpenKnowledgeFormatLogMode?: 'auto' | 'none' | 'trackedPage' | null;
    generationOpenKnowledgeFormatLogSourcePath?: string | null;
    generationSpacedRepetitionEnabled?: boolean | null;
    generationSpacedRepetitionTags?: string[] | null;
  };

  const bundleDirectory = getBundleDirectory(slug);

  try {
    if (!fs.existsSync(bundleDirectory)) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    const validateBoolOrNullOrUndef = (v: unknown): v is boolean | null | undefined =>
      v === undefined || v === null || typeof v === 'boolean';
    const validateStringArrayOrNullOrUndef = (v: unknown): v is string[] | null | undefined =>
      v === undefined ||
      v === null ||
      (Array.isArray(v) && v.every(item => typeof item === 'string'));
    const validateStringOrNullOrUndef = (v: unknown): v is string | null | undefined =>
      v === undefined || v === null || typeof v === 'string';
    const validateOkfLogModeOrNullOrUndef = (v: unknown): v is 'auto' | 'none' | 'trackedPage' | null | undefined =>
      v === undefined || v === null || v === 'auto' || v === 'none' || v === 'trackedPage';
    const validateOkfIndexModeOrNullOrUndef = (v: unknown): v is 'generated' | 'trackedPage' | null | undefined =>
      v === undefined || v === null || v === 'generated' || v === 'trackedPage';

    if (
      !validateBoolOrNullOrUndef(generationBreadcrumbsEnabled) ||
      !validateBoolOrNullOrUndef(generationBacklinksEnabled) ||
      !validateBoolOrNullOrUndef(generationTagsEnabled) ||
      !validateBoolOrNullOrUndef(generationSearchEnabled) ||
      !validateBoolOrNullOrUndef(generationHoverPreviewEnabled) ||
      !validateBoolOrNullOrUndef(generationFolderNavigationEnabled) ||
      !validateBoolOrNullOrUndef(generationMarkdownZipEnabled) ||
      !validateBoolOrNullOrUndef(generationOpenKnowledgeFormatEnabled) ||
      !validateOkfIndexModeOrNullOrUndef(generationOpenKnowledgeFormatIndexMode) ||
      !validateStringOrNullOrUndef(generationOpenKnowledgeFormatIndexSourcePath) ||
      !validateOkfLogModeOrNullOrUndef(generationOpenKnowledgeFormatLogMode) ||
      !validateStringOrNullOrUndef(generationOpenKnowledgeFormatLogSourcePath) ||
      !validateBoolOrNullOrUndef(generationSpacedRepetitionEnabled) ||
      !validateStringArrayOrNullOrUndef(generationSpacedRepetitionTags)
    ) {
      return res.status(400).json({ error: 'Publish options must be boolean, null, or undefined' });
    }
    if (
      generationOpenKnowledgeFormatIndexMode === 'trackedPage' &&
      generationOpenKnowledgeFormatIndexSourcePath !== undefined &&
      !generationOpenKnowledgeFormatIndexSourcePath?.trim()
    ) {
      return res.status(400).json({ error: 'OKF index source path is required when index mode is trackedPage' });
    }
    if (
      generationOpenKnowledgeFormatLogMode === 'trackedPage' &&
      generationOpenKnowledgeFormatLogSourcePath !== undefined &&
      !generationOpenKnowledgeFormatLogSourcePath?.trim()
    ) {
      return res.status(400).json({ error: 'OKF log source path is required when log mode is trackedPage' });
    }

    // Read existing config to support "inherit" (null => delete key) without losing unknown fields.
    const configPath = getBundleConfigPath(slug);
    const yamlContent = fs.readFileSync(configPath, 'utf8');
    const existingConfig = YAML.parse(yamlContent) as BundleConfig;
    const updatedConfig: BundleConfig = { ...existingConfig, bundleUpdatedAt: new Date().toISOString() };

    const setOrDelete = <K extends 'generationBreadcrumbsEnabled' | 'generationBacklinksEnabled' | 'generationTagsEnabled' | 'generationSearchEnabled' | 'generationHoverPreviewEnabled' | 'generationFolderNavigationEnabled' | 'generationMarkdownZipEnabled' | 'generationOpenKnowledgeFormatEnabled' | 'generationOpenKnowledgeFormatIndexMode' | 'generationOpenKnowledgeFormatIndexSourcePath' | 'generationOpenKnowledgeFormatLogMode' | 'generationOpenKnowledgeFormatLogSourcePath' | 'generationSpacedRepetitionEnabled' | 'generationSpacedRepetitionTags'>(
      key: K,
      value: BundleConfig[K] | null | undefined
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
    setOrDelete('generationSearchEnabled', generationSearchEnabled);
    setOrDelete('generationHoverPreviewEnabled', generationHoverPreviewEnabled);
    setOrDelete('generationFolderNavigationEnabled', generationFolderNavigationEnabled);
    setOrDelete('generationMarkdownZipEnabled', generationMarkdownZipEnabled);
    setOrDelete('generationOpenKnowledgeFormatEnabled', generationOpenKnowledgeFormatEnabled);
    setOrDelete('generationOpenKnowledgeFormatIndexMode', generationOpenKnowledgeFormatIndexMode);
    setOrDelete(
      'generationOpenKnowledgeFormatIndexSourcePath',
      typeof generationOpenKnowledgeFormatIndexSourcePath === 'string'
        ? generationOpenKnowledgeFormatIndexSourcePath.trim()
        : generationOpenKnowledgeFormatIndexSourcePath
    );
    setOrDelete('generationOpenKnowledgeFormatLogMode', generationOpenKnowledgeFormatLogMode);
    setOrDelete(
      'generationOpenKnowledgeFormatLogSourcePath',
      typeof generationOpenKnowledgeFormatLogSourcePath === 'string'
        ? generationOpenKnowledgeFormatLogSourcePath.trim()
        : generationOpenKnowledgeFormatLogSourcePath
    );
    setOrDelete('generationSpacedRepetitionEnabled', generationSpacedRepetitionEnabled);
    setOrDelete(
      'generationSpacedRepetitionTags',
      generationSpacedRepetitionTags?.map(tag => tag.trim()).filter(tag => tag.length > 0)
    );

    if (generationOpenKnowledgeFormatIndexMode && generationOpenKnowledgeFormatIndexMode !== 'trackedPage') {
      delete updatedConfig.generationOpenKnowledgeFormatIndexSourcePath;
    }
    if (generationOpenKnowledgeFormatLogMode && generationOpenKnowledgeFormatLogMode !== 'trackedPage') {
      delete updatedConfig.generationOpenKnowledgeFormatLogSourcePath;
    }

    // Enforce dependency when backlinks are explicitly overridden off for this bundle.
    if (generationBacklinksEnabled === false) {
      updatedConfig.generationTagsEnabled = false;
    }

    saveBundleConfigToPath(configPath, updatedConfig);
    clearBundleGuidCache(slug);

    // Commit only the conf directory (fire and forget).
    // Important: we must NOT commit the generated HTML directory here because
    // regeneration (triggered by this config change) deletes and recreates it.
    // If this commit races with that deletion, git would record the generated
    // files as deleted, causing getOriginalContent() to treat subsequently
    // regenerated files as "new" instead of "modified".
    const configDir = BundleConfigPaths.getConfigDir(bundleDirectory);
    if (fs.existsSync(configDir)) {
      void (async () => {
        try {
          await commitChangesNative(
            [configDir],
            'user changed bundle config',
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
