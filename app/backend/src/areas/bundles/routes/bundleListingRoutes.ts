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
import {
  generateBundleNodeId,
  parseBundleNodeConfig,
  stringifyBundleNodeConfig,
} from '../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { BundleConfig } from '../../../../../shared_code/types/bundleConfig.js';
import { FileType } from '../../../../../shared_code/types/FileType.js';
import { AppConfigPaths } from '../../../../../shared_code/paths/appConfigPaths.js';
import { AppConfigGitUtils, GIT_AUTHORS } from '../../../../../shared_code/utils/appConfigGitUtils.js';
import { rankSourcePageCandidatesWithCount, recentSourcePageCandidatesWithCount } from '../../../../../shared_code/utils/sourcePageSearchUtils.js';
import { generateBundleGuid } from '../../../../../shared_code/utils/bundleGuidUtils.js';
import { extractContentWithoutPagespecs } from '../../../../../shared_code/utils/pagespecBlockUtils.js';
import { getAllBackendProviders } from '../../../shared/publishing-provider-host/providerRegistry.js';
import { getConfigDirectory, getBundlesDirectory, getBundleDirectory, getBundleConfigPath } from '../../../shared/bundle-config/bundleConfigPaths.js';
import { loadBundleConfig, updateBundleConfig, getGeneratedBundleVersionsWithFallback } from '../../../shared/utils/bundleConfigUtils.js';
import { clearBundleGuidCache, logBundleError, logBundleInfo } from '../../../shared/utils/logging/bundleLogger.js';
import { logger } from '../../../shared/utils/logging/backendLoggingUtils.js';
import { findUniqueName } from '../../../shared/utils/uniqueNameUtils.js';
import { listMarkdownSourcePages } from '../../../shared/utils/sourcePageFileUtils.js';
import { loadValidatedBundleNodeConfiguration } from '../../../shared/bundle-node/bundleNodeConfigLoader.js';
import {
  preflightFolderBundle,
  verifyFolderBundlePreflight,
  type FolderBundleCreationPlan,
} from '../services/folderBundleCreation.js';
import { persistFolderBundleAtomically } from '../services/folderBundlePersistence.js';
import {
  getFolderBundleRepairStatus,
} from '../../../shared/bundle-config/folderBundleRepair.js';
import selectedFolderRepairRoutes from './selectedFolderRepairRoutes.js';
import bundleSettingsRoutes from './bundleSettingsRoutes.js';
import { resolveDefaultDepth } from '../services/bundleTraversalDefaults.js';

const router = express.Router();
router.use(selectedFolderRepairRoutes);
router.use(bundleSettingsRoutes);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Recursively copy a directory, stripping pagespecs blocks from .md files.
 */
function copyDirectoryWithPagespecStripping(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryWithPagespecStripping(srcPath, destPath);
    } else if (entry.name.endsWith('.md')) {
      const content = fs.readFileSync(srcPath, 'utf8');
      fs.writeFileSync(destPath, extractContentWithoutPagespecs(content), 'utf8');
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// List all bundle slugs (folder names in data/bundles)
router.get('/bundles', (req, res, next) => {
  const bundlesDir = getBundlesDirectory();
  try {
    const bundleSlugs = fs.readdirSync(bundlesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    res.json(bundleSlugs);
  } catch (error) {
    next(error);
  }
});

// Get bundle config from bundle_config.yaml. Provider-specific fields live
// under each provider's /api/sharing/publishing-providers/{id}/bundles/{slug}/... —
// core deliberately doesn't merge them in.
router.get('/bundles/:slug/config', (req, res, next) => {
  const { slug } = req.params;
  const configPath = getBundleConfigPath(slug);
  try {
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'bundle_config.yaml not found' });
    }
    const yamlContent = fs.readFileSync(configPath, 'utf8');
    const config = YAML.parse(yamlContent) as BundleConfig;
    res.json(config);
  } catch (error) {
    next(error);
  }
});

// Obsidian integration helpers
// We treat a directory as an Obsidian vault if it contains a ".obsidian" folder.
router.get('/bundles/:slug/obsidian-info', (req, res, next) => {
  const { slug } = req.params;
  const configPath = getBundleConfigPath(slug);
  try {
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'bundle_config.yaml not found' });
    }
    const yamlContent = fs.readFileSync(configPath, 'utf8');
    const config = YAML.parse(yamlContent) as BundleConfig;

    const sourceDirectory = typeof config.sourceDirectory === 'string' ? config.sourceDirectory : null;
    if (!sourceDirectory) {
      return res.json({
        hasObsidianVault: false,
        sourceDirectory: null,
        vaultNameGuess: null,
      });
    }

    const obsidianDir = join(sourceDirectory, '.obsidian');
    const hasObsidianVault = fs.existsSync(obsidianDir) && fs.statSync(obsidianDir).isDirectory();
    const vaultNameGuess = path.basename(sourceDirectory);

    res.json({
      hasObsidianVault,
      sourceDirectory,
      vaultNameGuess,
    });
  } catch (error) {
    next(error);
  }
});

// Get all bundles with their configurations for the enhanced bundle list
router.get('/bundles/detailed', (req, res, next) => {
  const bundlesDir = getBundlesDirectory();
  try {
    const bundleSlugs = fs.readdirSync(bundlesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    const bundlesWithConfig = bundleSlugs.map(slug => {
      try {
        const bundleDirectory = join(bundlesDir, slug);
        const config = loadBundleConfig(bundleDirectory);
        const { entryNode } = loadValidatedBundleNodeConfiguration(bundleDirectory);
        const repairStatus = getFolderBundleRepairStatus(bundleDirectory);
        return {
          slug,
          ...config,
          entryBundleNodeName: entryNode.bundleNodeName,
          entrySourceGraphSubdirectory: entryNode.sourceGraphSubdirectory || '',
          entryFileType: entryNode.fileType,
          ...repairStatus,
          generatedBundleVersions: getGeneratedBundleVersionsWithFallback(bundleDirectory, config)
        };
      } catch {
        return { slug, error: 'Failed to parse bundle_config.yaml' };
      }
    });

    // Sort by lastPublishedAt descending, then by updatedAt descending
    bundlesWithConfig.sort((a, b) => {
      // Handle errors by putting them at the end
      if (a.error && !b.error) return 1;
      if (!a.error && b.error) return -1;
      if (a.error && b.error) return 0;

      const aConfig = a as BundleConfig & { slug: string };
      const bConfig = b as BundleConfig & { slug: string };
      const aPublished = aConfig.bundleLastPublishedAt as string | null;
      const bPublished = bConfig.bundleLastPublishedAt as string | null;
      const aUpdated = aConfig.bundleUpdatedAt as string | null;
      const bUpdated = bConfig.bundleUpdatedAt as string | null;

      // Sort by lastPublishedAt first (descending)
      if (aPublished && bPublished) {
        const publishedComparison = new Date(bPublished).getTime() - new Date(aPublished).getTime();
        if (publishedComparison !== 0) return publishedComparison;
      } else if (aPublished && !bPublished) {
        return -1; // Bundles with published dates come first
      } else if (!aPublished && bPublished) {
        return 1;
      }

      // Then sort by updatedAt (descending)
      if (aUpdated && bUpdated) {
        return new Date(bUpdated).getTime() - new Date(aUpdated).getTime();
      } else if (aUpdated && !bUpdated) {
        return -1;
      } else if (!aUpdated && bUpdated) {
        return 1;
      }

      return 0;
    });

    res.json(bundlesWithConfig);
  } catch (error) {
    next(error);
  }
});

// Get unique directories from all bundle configs for the form dropdown
router.get('/bundles/directories', (req, res, next) => {
  const bundlesDir = getBundlesDirectory();
  try {
    const bundleSlugs = fs.readdirSync(bundlesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    const directories = new Set<string>();
    
    bundleSlugs.forEach(slug => {
      try {
        const bundleDirectory = join(bundlesDir, slug);
        const config = loadBundleConfig(bundleDirectory);
        if (config.sourceDirectory) {
          directories.add(config.sourceDirectory);
        }
      } catch {
        // Skip invalid configs
      }
    });

    res.json(Array.from(directories).sort());
  } catch (error) {
    next(error);
  }
});

// Check if a bundle tracks a specific page
router.get('/bundles/:bundleSlug/tracks-page', (req, res, next) => {
  const { bundleSlug } = req.params;
  const { pageName } = req.query;

  if (!bundleSlug || !pageName || typeof pageName !== 'string') {
    res.status(400).json({ error: 'bundleSlug and pageName are required' });
    return;
  }

  try {
    const bundlesDir = getBundlesDirectory();
    const bundleDirectory = join(bundlesDir, String(bundleSlug));

    // Check if bundle exists
    if (!fs.existsSync(bundleDirectory)) {
      res.status(404).json({ error: 'Bundle not found' });
      return;
    }

    // Load bundle configuration
    const config = loadBundleConfig(bundleDirectory);

    // Check if the bundle tracks the specified page
    const tracksPage = checkIfBundleTracksPage(bundleDirectory, pageName, config);

    res.json({ tracks: tracksPage });
  } catch (error) {
    logger.error('Error checking if bundle tracks page:', error);
    next(error);
  }
});

// Helper function to check if a bundle tracks a specific page
function checkIfBundleTracksPage(bundleDirectory: string, pageName: string, _config: BundleConfig): boolean {
  const bundleSlug = bundleDirectory.split('/').pop() || 'unknown';
  logBundleInfo(bundleSlug, `[checkIfBundleTracksPage] Checking for page: "${pageName}"`);

  try {
    // Check bundle_node_config.yaml for the page
    const bundleNodeConfPath = getBundleConfigPath(bundleSlug, 'bundle_node_config.yaml');
    logBundleInfo(bundleSlug, `[checkIfBundleTracksPage] Checking bundle_node_config.yaml`);

    if (fs.existsSync(bundleNodeConfPath)) {
      try {
        const content = fs.readFileSync(bundleNodeConfPath, 'utf-8');
        logBundleInfo(bundleSlug, `[checkIfBundleTracksPage] bundle_node_config.yaml exists, size: ${content.length} bytes`);

        // Parse the YAML and check for the page
        const bundleNodeConfigs = parseBundleNodeConfig(content);
        const titles = bundleNodeConfigs.map(bundleNodeConfig => bundleNodeConfig.bundleNodeName);
        logBundleInfo(bundleSlug, `[checkIfBundleTracksPage] Titles in bundle_node_config.yaml: ${titles.join(', ')}`);

        const found = bundleNodeConfigs.some(bundleNodeConfig => bundleNodeConfig.bundleNodeName.toLowerCase() === pageName.toLowerCase());
        if (found) {
          logBundleInfo(bundleSlug, `[checkIfBundleTracksPage] ✓ Found in bundle_node_config.yaml`);
          return true;
        } else {
          logBundleInfo(bundleSlug, `[checkIfBundleTracksPage] ✗ NOT found in bundle_node_config.yaml`);
        }
      } catch (error) {
        logBundleError(bundleSlug, `[checkIfBundleTracksPage] Error reading bundle_node_config.yaml: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      logBundleInfo(bundleSlug, `[checkIfBundleTracksPage] bundle_node_config.yaml does not exist`);
    }

    logBundleInfo(bundleSlug, `[checkIfBundleTracksPage] Final result: NOT FOUND`);
    return false;
  } catch (error) {
    logBundleError(bundleSlug, `[checkIfBundleTracksPage] Error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

function cleanSourcePageSearchText(value: string): string {
  return value
    .replace(/\.excalidraw\.md$/i, '')
    .replace(/\.excalidraw$/i, '')
    .replace(/\.md$/i, '');
}

// Search for pages in a source directory by name
// Returns all matching pages with their full paths (for handling duplicates)
router.get('/bundles/source-pages/exact-search', (req, res, next) => {
  (async () => {
    const { sourceDirectory, pageName } = req.query;

    if (!sourceDirectory || typeof sourceDirectory !== 'string') {
      return res.status(400).json({ error: 'sourceDirectory is required' });
    }

    if (!pageName || typeof pageName !== 'string') {
      return res.status(400).json({ error: 'pageName is required' });
    }

    // Strip known source-file suffixes if present (users sometimes include them by mistake).
    const cleanPageName = cleanSourcePageSearchText(pageName);

    try {
      // Check if directory exists
      if (!fs.existsSync(sourceDirectory)) {
        return res.status(404).json({ error: 'Source directory not found' });
      }

      const allMdPages = await listMarkdownSourcePages(sourceDirectory);

      // Find all markdown pages that match the given name (case-insensitive)
      const matchingPages = allMdPages
        .filter(n => n.title.toLowerCase() === cleanPageName.toLowerCase())
        .map(n => ({
          title: n.title,
          directory: n.directory,
          fileType: n.file_type,
          fullPath: n.fullPath,
          modifiedTimeMs: n.modifiedTimeMs
        }));

      res.json({
        found: matchingPages.length > 0,
        count: matchingPages.length,
        pages: matchingPages
      });
    } catch (error) {
      logger.error('Error searching pages in source:', error);
      next(error);
    }
  })().catch(next);
});

// List all markdown source pages in a source directory (for create/edit bundle typeahead preload)
router.get('/bundles/source-pages', (req, res, next) => {
  (async () => {
    const { sourceDirectory } = req.query;

    if (!sourceDirectory || typeof sourceDirectory !== 'string') {
      return res.status(400).json({ error: 'sourceDirectory is required' });
    }

    try {
      if (!fs.existsSync(sourceDirectory)) {
        return res.status(404).json({ error: 'Source directory not found' });
      }

      const pages = await listMarkdownSourcePages(sourceDirectory);
      res.json({ count: pages.length, pages });
    } catch (error) {
      logger.error('Error listing source pages:', error);
      next(error);
    }
  })().catch(next);
});

// Search markdown source pages in a source directory by title (server-side typeahead).
// Uses the same ranking rules as the create/edit bundle modal previously used client-side.
router.get('/bundles/source-pages/search', (req, res, next) => {
  (async () => {
    const { sourceDirectory, query, limit } = req.query;

    if (!sourceDirectory || typeof sourceDirectory !== 'string') {
      return res.status(400).json({ error: 'sourceDirectory is required' });
    }

    const rawQuery = typeof query === 'string' ? query : '';
    // Strip known source-file suffixes if present (users sometimes include them by mistake).
    const cleanQuery = cleanSourcePageSearchText(rawQuery);

    const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : NaN;
    const finalLimit = !isNaN(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 25;

    try {
      if (!fs.existsSync(sourceDirectory)) {
        return res.status(404).json({ error: 'Source directory not found' });
      }

      const allMdPages = await listMarkdownSourcePages(sourceDirectory);

      if (!cleanQuery.trim()) {
        const recent = recentSourcePageCandidatesWithCount(allMdPages, finalLimit);
        const pages = recent.results.map(({ bucket: _bucket, ...n }) => n);
        return res.json({ count: recent.totalCount, pages });
      }

      const ranked = rankSourcePageCandidatesWithCount(cleanQuery, allMdPages, finalLimit);
      const pages = ranked.results.map(({ bucket: _bucket, ...n }) => n);
      return res.json({ count: ranked.totalCount, pages });
    } catch (error) {
      logger.error('Error searching source pages:', error);
      next(error);
    }
  })().catch(next);
});

// Archive a bundle
router.post('/bundles/:slug/archive', (req, res, next) => {
  const { slug } = req.params;
  const bundleDirectory = getBundleDirectory(slug);
  
  try {
    if (!fs.existsSync(bundleDirectory)) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    updateBundleConfig(bundleDirectory, { archivedAt: new Date().toISOString() });
    clearBundleGuidCache(slug);
    logBundleInfo(slug, 'Bundle archived');
    
    res.json({ success: true, message: 'Bundle archived successfully' });
  } catch (error) {
    next(error);
  }
});

// Unarchive a bundle
router.post('/bundles/:slug/unarchive', (req, res, next) => {
  const { slug } = req.params;
  const bundleDirectory = getBundleDirectory(slug);
  
  try {
    if (!fs.existsSync(bundleDirectory)) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    updateBundleConfig(bundleDirectory, { archivedAt: null });
    clearBundleGuidCache(slug);
    logBundleInfo(slug, 'Bundle unarchived');
    
    res.json({ success: true, message: 'Bundle unarchived successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * SSE endpoint to delete a bundle, including S3 files and prefix soft-delete for published bundles.
 * Stages: authenticating → deleting-s3 → soft-deleting-prefix → deleting-local → complete
 */
router.get('/bundles/:slug/delete-bundle-stream', (req, res, _next) => {
  const { slug } = req.params;

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders?.();

  const sendProgress = (progress: {
    stage: string;
    message: string;
    result?: { success: boolean; error?: string; warning?: string };
  }) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    }
  };

  (async () => {
    try {
      const bundleDir = getBundleDirectory(slug);

      if (!fs.existsSync(bundleDir)) {
        sendProgress({ stage: 'error', message: 'Bundle not found', result: { success: false, error: 'Bundle not found' } });
        res.end();
        return;
      }

      // Load config before any deletion
      try {
        loadBundleConfig(bundleDir);
      } catch {
        // Config unreadable — proceed with local-only deletion
      }

      logBundleInfo(slug, 'Bundle deletion started');

      // Ask each registered publishing provider to clean up anything it
      // published for this bundle. Warnings surface in the final response;
      // we still delete locally even if a provider fails.
      const warnings: string[] = [];
      for (const provider of getAllBackendProviders()) {
        if (!provider.isBundlePublished?.(slug)) continue;
        if (!provider.cleanupPublishedBundle) continue;
        try {
          const result = await provider.cleanupPublishedBundle({
            bundleSlug: slug,
            onProgress: (progress) => {
              sendProgress({ stage: progress.stage, message: progress.message });
            },
          });
          if (result.warning) warnings.push(result.warning);
        } catch (cleanupError) {
          const err = cleanupError as Error;
          warnings.push(`${provider.manifest.displayName}: ${err.message}`);
        }
      }
      const s3Warning = warnings.length > 0 ? warnings.join(' ') : undefined;

      // Stage 4: Delete local files
      sendProgress({ stage: 'deleting-local', message: 'Deleting local files...' });

      logBundleInfo(slug, 'Bundle deleted');
      fs.rmSync(bundleDir, { recursive: true, force: true });
      clearBundleGuidCache(slug);

      sendProgress({
        stage: 'complete',
        message: 'Bundle deleted successfully',
        result: { success: true, warning: s3Warning }
      });

      res.end();

    } catch (error) {
      const err = error as Error;
      sendProgress({ stage: 'error', message: 'Delete failed', result: { success: false, error: err.message } });
      res.end();
    }
  })().catch((error) => {
    sendProgress({ stage: 'error', message: 'Unexpected error', result: { success: false, error: String(error) } });
    res.end();
  });
});

// Delete a bundle completely (local files only — used for unpublished bundles)
router.delete('/bundles/:slug', (req, res, next) => {
  const { slug } = req.params;
  const bundleDir = getBundleDirectory(slug);
  
  try {
    if (!fs.existsSync(bundleDir)) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    // Log before deletion so we can still read bundle_config.yaml (and thus the GUID)
    logBundleInfo(slug, 'Bundle deleted');

    // Recursively delete the entire bundle directory
    fs.rmSync(bundleDir, { recursive: true, force: true });
    clearBundleGuidCache(slug);
    
    res.json({ success: true, message: 'Bundle deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Add the example bundle
router.post('/bundles/add-example', (req, res, next) => {
  try {
    // Find a unique slug: example-bundle, example-bundle-1, example-bundle-2, ...
    const slug = findUniqueName('example-bundle', (name) => fs.existsSync(getBundleDirectory(name)));

    // Resolve paths to bundled example data
    const isDev = process.env.MEADOW_IS_DEV === 'true';
    let sourceGraphSrc: string;
    let fixtureSrc: string;

    if (isDev) {
      // Dev: resolve the app root from this route module.
      const projectRoot = join(__dirname, '..', '..', '..', '..', '..');
      sourceGraphSrc = join(projectRoot, 'shared_data', 'source_graphs', 'example-bundle-data');
      fixtureSrc = join(projectRoot, 'shared_data', 'home_fixtures', 'home_fixture_example', 'bundles', 'example-bundle');
    } else {
      const exampleBundlePath = process.env.MEADOW_EXAMPLE_BUNDLE_PATH!;
      sourceGraphSrc = join(exampleBundlePath, 'source_graph');
      fixtureSrc = join(exampleBundlePath, 'home_fixture', 'bundles', 'example-bundle');
    }

    const configDir = getConfigDirectory();

    // Copy source graph to a unique directory, stripping pagespecs from .md files
    const sourceGraphDirName = slug.replace(/-/g, '_') + '_source_graph';
    const sourceGraphDest = join(configDir, sourceGraphDirName);
    copyDirectoryWithPagespecStripping(sourceGraphSrc, sourceGraphDest);

    // Copy config/ from fixture
    const bundleDir = getBundleDirectory(slug);
    fs.mkdirSync(bundleDir, { recursive: true });
    fs.cpSync(join(fixtureSrc, 'config'), join(bundleDir, 'config'), { recursive: true });

    // Update bundle_config.yaml with fresh values
    const bundleConfigPath = join(bundleDir, 'config', 'bundle_config.yaml');
    const bundleConfigContent = fs.readFileSync(bundleConfigPath, 'utf8');
    const bundleConfig = YAML.parse(bundleConfigContent) as BundleConfig;

    bundleConfig.bundleGuid = generateBundleGuid();
    bundleConfig.sourceDirectory = sourceGraphDest;
    bundleConfig.bundleCreatedAt = new Date().toISOString();
    bundleConfig.bundleUpdatedAt = new Date().toISOString();

    fs.writeFileSync(bundleConfigPath, YAML.stringify(bundleConfig), 'utf8');

    clearBundleGuidCache(slug);
    logBundleInfo(slug, 'Example bundle created');

    // Commit via AppConfigGitUtils. Include the freshly-copied source graph
    // directory alongside the bundle config so MeadowHome has no untracked
    // files after the example bundle is created.
    const gitUtils = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, configDir);
    void (async () => {
      try {
        await gitUtils.commitDirs([
          `bundles/${slug}/config`,
          sourceGraphDirName,
        ], `initial bundle config for ${slug}`);
      } catch (error) {
        logger.error('[example bundle creation] Error committing bundle config:', error);
      }
    })();

    res.json({ success: true, slug });
  } catch (error) {
    next(error);
  }
});

router.post('/bundles/folders/preflight', (req, res, next) => {
  void (async () => {
    const {
      sourceDirectory,
      selectedFolders,
      bundleName,
      defaultOutlinksDepth,
      defaultInlinksDepth,
    } = req.body as {
      sourceDirectory?: string;
      selectedFolders?: string[];
      bundleName?: string;
      defaultOutlinksDepth?: number;
      defaultInlinksDepth?: number;
    };
    const result = await preflightFolderBundle({
      sourceDirectory: sourceDirectory ?? '',
      selectedFolders: selectedFolders ?? [],
      bundleName: bundleName ?? 'Folder bundle',
      defaultOutlinksDepth,
      defaultInlinksDepth,
    });
    res.json(result);
  })().catch(next);
});

router.post('/bundles/folders', (req, res, next) => {
  void (async () => {
    const {
      slug,
      sourceDirectory,
      selectedFolders,
      bundleName,
      bundleNotes,
      fingerprint,
      plan,
      confirmHighImpact,
    } = req.body as {
      slug?: string;
      sourceDirectory?: string;
      selectedFolders?: string[];
      bundleName?: string;
      bundleNotes?: string;
      fingerprint?: string;
      plan?: FolderBundleCreationPlan;
      confirmHighImpact?: boolean;
    };
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Bundle slug must contain only lowercase letters, numbers, and dashes' });
    }
    if (!fingerprint || !plan) {
      return res.status(400).json({ error: 'A confirmed folder-bundle preflight is required' });
    }
    const verified = await verifyFolderBundlePreflight({
      sourceDirectory: sourceDirectory ?? '',
      selectedFolders: selectedFolders ?? [],
      bundleName: bundleName ?? slug,
      defaultOutlinksDepth: plan.defaultOutlinksDepth,
      defaultInlinksDepth: plan.defaultInlinksDepth,
      plannedFolderBundleNodeIds: plan.folderBundleNodeIds,
      plannedCollectionBundleNodeId: plan.collectionBundleNodeId,
    }, fingerprint);
    if (verified.highImpactWarning && confirmHighImpact !== true) {
      return res.status(409).json({
        error: 'This folder bundle requires explicit high-impact confirmation',
        preflight: verified,
      });
    }

    const actualSlug = findUniqueName(slug, name => fs.existsSync(getBundleDirectory(name)));
    const bundleDir = getBundleDirectory(actualSlug);
    const stagingDir = join(getBundlesDirectory(), `.${actualSlug}.creating-${generateBundleGuid()}`);
    try {
      const now = new Date().toISOString();
      const bundleConfig: BundleConfig = {
        bundleGuid: generateBundleGuid(),
        sourceDirectory: verified.plan.sourceDirectory,
        entryBundleNodeId: verified.plan.entryBundleNodeId,
        defaultTraversalBundleNodeId: verified.plan.entryBundleNodeId,
        defaultOutlinksDepth: verified.plan.defaultOutlinksDepth,
        defaultInlinksDepth: verified.plan.defaultInlinksDepth,
        generationFolderNavigationEnabled: true,
        generatedBundleVersions: [],
        archivedAt: null,
        bundleCreatedAt: now,
        bundleUpdatedAt: now,
        bundleLastPublishedAt: null,
        bundleNotes: bundleNotes ?? '',
      };
      const gitUtils = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, getConfigDirectory());
      await persistFolderBundleAtomically({
        bundleDirectory: bundleDir,
        stagingDirectory: stagingDir,
        bundleConfig,
        nodes: verified.nodes,
        commit: () => gitUtils.commitFiles([
          AppConfigPaths.relative.bundleConfigFile(actualSlug),
          AppConfigPaths.relative.bundleNodeConfigFile(actualSlug),
        ], `initial folder bundle config for ${actualSlug}`),
      });
      clearBundleGuidCache(actualSlug);
      logBundleInfo(actualSlug, 'Folder bundle created');
      res.json({ success: true, message: 'Bundle created successfully', slug: actualSlug });
    } catch (error) {
      clearBundleGuidCache(actualSlug);
      throw error;
    }
  })().catch(next);
});

// Create a new page-derived bundle
router.post('/bundles', (req, res, _next) => {
  const {
    slug,
    sourceDirectory,
    entryBundleNodeName,
    entrySourceGraphSubdirectory,
    entryFileType,
    bundleNotes,
    defaultOutlinksDepth: requestedDefaultOutlinksDepth,
    defaultInlinksDepth: requestedDefaultInlinksDepth,
  } = req.body as {
    slug: string;
    sourceDirectory: string;
    entryBundleNodeName: string;
    entrySourceGraphSubdirectory?: string;
    entryFileType?: string;
    bundleNotes?: string;
    defaultOutlinksDepth?: number;
    defaultInlinksDepth?: number;
  };

  if (!slug || !sourceDirectory || !entryBundleNodeName) {
    res.status(400).json({ error: 'All fields are required' });
    return;
  }

  // Validate slug format (alphanumeric and dashes only)
  if (!/^[a-z0-9-]+$/.test(slug)) {
    res.status(400).json({ error: 'Bundle slug must contain only lowercase letters, numbers, and dashes' });
    return;
  }

  const defaultOutlinksDepth = resolveDefaultDepth(requestedDefaultOutlinksDepth, 3);
  const defaultInlinksDepth = resolveDefaultDepth(requestedDefaultInlinksDepth, 1);
  if (defaultOutlinksDepth === null || defaultInlinksDepth === null) {
    res.status(400).json({ error: 'Default traversal depths must be non-negative integers' });
    return;
  }

  // Auto-increment slug if it already exists (e.g. my-bundle -> my-bundle-1)
  const actualSlug = findUniqueName(slug, (name) => fs.existsSync(getBundleDirectory(name)));
  const bundleDir = getBundleDirectory(actualSlug);

  // Create bundle directory structure
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.mkdirSync(join(bundleDir, 'config'), { recursive: true });

  const entryBundleNodeId = generateBundleNodeId([]);

  // Create bundle_config.yaml
  const bundleConfig: BundleConfig = {
    bundleGuid: generateBundleGuid(),
    sourceDirectory,
    entryBundleNodeId,
    defaultTraversalBundleNodeId: entryBundleNodeId,
    defaultOutlinksDepth,
    defaultInlinksDepth,
    generatedBundleVersions: [],
    archivedAt: null,
    bundleCreatedAt: new Date().toISOString(),
    bundleUpdatedAt: new Date().toISOString(),
    bundleLastPublishedAt: null,
    bundleNotes: bundleNotes || ""
  };

  const yamlContent = YAML.stringify(bundleConfig);
  fs.writeFileSync(join(bundleDir, 'config/bundle_config.yaml'), yamlContent, 'utf8');

  clearBundleGuidCache(actualSlug);
  logBundleInfo(actualSlug, 'Bundle created');

  // Create initial bundle_node_config.yaml with reasonable defaults
  const bundleNodeConf = stringifyBundleNodeConfig([{
    bundleNodeName: entryBundleNodeName,
    ...(entrySourceGraphSubdirectory && { sourceGraphSubdirectory: entrySourceGraphSubdirectory }),
    bundleNodeKind: 'file',
    fileType: (entryFileType || 'md') as FileType,
    bundleNodeId: entryBundleNodeId,
    listType: 'whitelist',
  }]);
  fs.writeFileSync(join(bundleDir, 'config/bundle_node_config.yaml'), bundleNodeConf, 'utf8');

  // Commit the initial bundle config files to git
  const gitUtils = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, getConfigDirectory());
  void (async () => {
    try {
      await gitUtils.commitFiles([
        AppConfigPaths.relative.bundleConfigFile(actualSlug),
        AppConfigPaths.relative.bundleNodeConfigFile(actualSlug),
      ], `initial bundle config for ${actualSlug}`);
    } catch (error) {
      logger.error('[bundle creation] Error committing initial bundle config:', error);
    }
  })();

  res.json({ success: true, message: 'Bundle created successfully', slug: actualSlug });
});

// Update bundle notes only (for inline editing)
router.patch('/bundles/:slug/notes', (req, res, next) => {
  const { slug } = req.params;
  const { bundleNotes } = req.body as { bundleNotes: string };

  const bundleDirectory = getBundleDirectory(slug);
  
  try {
    if (!fs.existsSync(bundleDirectory)) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    // Update only the notes and updatedAt
    updateBundleConfig(bundleDirectory, { 
      bundleNotes: bundleNotes || "",
      bundleUpdatedAt: new Date().toISOString()
    });

    res.json({ success: true, message: 'Bundle notes updated successfully' });
  } catch (error) {
    next(error);
  }
});
export default router;
