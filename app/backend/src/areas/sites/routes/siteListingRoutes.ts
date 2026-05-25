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
import { parsePageConfig, stringifyPageConfig } from '../../../../../shared_code/utils/sitePageConfigUtils.js';
import { SiteConfig } from '../../../../../shared_code/types/siteConfig.js';
import { FileType } from '../../../../../shared_code/types/FileType.js';
import { AppConfigPaths } from '../../../../../shared_code/paths/appConfigPaths.js';
import { AppConfigGitUtils, GIT_AUTHORS } from '../../../../../shared_code/utils/appConfigGitUtils.js';
import { rankSourcePageCandidatesWithCount, recentSourcePageCandidatesWithCount } from '../../../../../shared_code/utils/sourcePageSearchUtils.js';
import { generateSiteGuid, isValidSiteGuid } from '../../../../../shared_code/utils/siteGuidUtils.js';
import { extractContentWithoutPagespecs } from '../../../../../shared_code/test/pagespecUtils.js';
import { getAllBackendProviders } from '../../../shared/publishing-provider-host/providerRegistry.js';
import { getConfigDirectory, getSitesDirectory, getSiteDirectory, getSiteConfigPath } from '../../../shared/site-config/siteConfigPaths.js';
import { loadSiteConfig, updateSiteConfig, getGeneratedSiteVersionsWithFallback } from '../../../shared/utils/siteConfigUtils.js';
import { clearSiteGuidCache, logSiteError, logSiteInfo } from '../../../shared/utils/logging/siteLogger.js';
import { logger } from '../../../shared/utils/logging/backendLoggingUtils.js';
import { findUniqueName } from '../../../shared/utils/uniqueNameUtils.js';
import { listMarkdownSourcePages } from '../../../shared/utils/sourcePageFileUtils.js';

const router = express.Router();

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


// List all site slugs (folder names in data/sites)
router.get('/sites', (req, res, next) => {
  const sitesDir = getSitesDirectory();
  try {
    const siteSlugs = fs.readdirSync(sitesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    res.json(siteSlugs);
  } catch (error) {
    next(error);
  }
});

// Get site config from site_config.yaml. Provider-specific fields live
// under each provider's /api/sharing/publishing-providers/{id}/sites/{slug}/... —
// core deliberately doesn't merge them in.
router.get('/sites/:slug/config', (req, res, next) => {
  const { slug } = req.params;
  const configPath = getSiteConfigPath(slug);
  try {
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'site_config.yaml not found' });
    }
    const yamlContent = fs.readFileSync(configPath, 'utf8');
    const config = YAML.parse(yamlContent) as SiteConfig;
    res.json(config);
  } catch (error) {
    next(error);
  }
});

// Obsidian integration helpers
// We treat a directory as an Obsidian vault if it contains a ".obsidian" folder.
router.get('/sites/:slug/obsidian-info', (req, res, next) => {
  const { slug } = req.params;
  const configPath = getSiteConfigPath(slug);
  try {
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'site_config.yaml not found' });
    }
    const yamlContent = fs.readFileSync(configPath, 'utf8');
    const config = YAML.parse(yamlContent) as SiteConfig;

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

// Get all sites with their configurations for the enhanced site list
router.get('/sites/detailed', (req, res, next) => {
  const sitesDir = getSitesDirectory();
  try {
    const siteSlugs = fs.readdirSync(sitesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    const sitesWithConfig = siteSlugs.map(slug => {
      try {
        const siteDirectory = join(sitesDir, slug);
        const config = loadSiteConfig(siteDirectory);
        return {
          slug,
          ...config,
          generatedSiteVersions: getGeneratedSiteVersionsWithFallback(siteDirectory, config)
        };
      } catch {
        return { slug, error: 'Failed to parse site_config.yaml' };
      }
    });

    // Sort by lastPublishedAt descending, then by updatedAt descending
    sitesWithConfig.sort((a, b) => {
      // Handle errors by putting them at the end
      if (a.error && !b.error) return 1;
      if (!a.error && b.error) return -1;
      if (a.error && b.error) return 0;

      const aConfig = a as SiteConfig & { slug: string };
      const bConfig = b as SiteConfig & { slug: string };
      const aPublished = aConfig.siteLastPublishedAt as string | null;
      const bPublished = bConfig.siteLastPublishedAt as string | null;
      const aUpdated = aConfig.siteUpdatedAt as string | null;
      const bUpdated = bConfig.siteUpdatedAt as string | null;

      // Sort by lastPublishedAt first (descending)
      if (aPublished && bPublished) {
        const publishedComparison = new Date(bPublished).getTime() - new Date(aPublished).getTime();
        if (publishedComparison !== 0) return publishedComparison;
      } else if (aPublished && !bPublished) {
        return -1; // Sites with published dates come first
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

    res.json(sitesWithConfig);
  } catch (error) {
    next(error);
  }
});

// Get unique directories from all site configs for the form dropdown
router.get('/sites/directories', (req, res, next) => {
  const sitesDir = getSitesDirectory();
  try {
    const siteSlugs = fs.readdirSync(sitesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    const directories = new Set<string>();
    
    siteSlugs.forEach(slug => {
      try {
        const siteDirectory = join(sitesDir, slug);
        const config = loadSiteConfig(siteDirectory);
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

// Check if a site tracks a specific page
router.get('/sites/:siteSlug/tracks-page', (req, res, next) => {
  const { siteSlug } = req.params;
  const { pageName } = req.query;

  if (!siteSlug || !pageName || typeof pageName !== 'string') {
    res.status(400).json({ error: 'siteSlug and pageName are required' });
    return;
  }

  try {
    const sitesDir = getSitesDirectory();
    const siteDirectory = join(sitesDir, String(siteSlug));

    // Check if site exists
    if (!fs.existsSync(siteDirectory)) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }

    // Load site configuration
    const config = loadSiteConfig(siteDirectory);

    // Check if the site tracks the specified page
    const tracksPage = checkIfSiteTracksPage(siteDirectory, pageName, config);

    res.json({ tracks: tracksPage });
  } catch (error) {
    logger.error('Error checking if site tracks page:', error);
    next(error);
  }
});

// Helper function to check if a site tracks a specific page
function checkIfSiteTracksPage(siteDirectory: string, pageName: string, config: SiteConfig): boolean {
  const siteSlug = siteDirectory.split('/').pop() || 'unknown';
  logSiteInfo(siteSlug, `[checkIfSiteTracksPage] Checking for page: "${pageName}"`);

  try {
    // Check if page is the initial page
    if (config.initialSitePageTitle === pageName) {
      logSiteInfo(siteSlug, `[checkIfSiteTracksPage] ✓ Found as initialSitePageTitle`);
      return true;
    }

    // Check if page is in the default traversal page
    if (config.defaultTraversalSitePageTitle === pageName) {
      logSiteInfo(siteSlug, `[checkIfSiteTracksPage] ✓ Found as defaultTraversalSitePageTitle`);
      return true;
    }

    // Check site_page_config.yaml for the page
    const sitePageConfPath = getSiteConfigPath(siteSlug, 'site_page_config.yaml');
    logSiteInfo(siteSlug, `[checkIfSiteTracksPage] Checking site_page_config.yaml`);

    if (fs.existsSync(sitePageConfPath)) {
      try {
        const content = fs.readFileSync(sitePageConfPath, 'utf-8');
        logSiteInfo(siteSlug, `[checkIfSiteTracksPage] site_page_config.yaml exists, size: ${content.length} bytes`);

        // Parse the YAML and check for the page
        const sitePageConfigs = parsePageConfig(content);
        const titles = sitePageConfigs.map(sitePageConfig => sitePageConfig.title);
        logSiteInfo(siteSlug, `[checkIfSiteTracksPage] Titles in site_page_config.yaml: ${titles.join(', ')}`);

        const found = sitePageConfigs.some(sitePageConfig => sitePageConfig.title.toLowerCase() === pageName.toLowerCase());
        if (found) {
          logSiteInfo(siteSlug, `[checkIfSiteTracksPage] ✓ Found in site_page_config.yaml`);
          return true;
        } else {
          logSiteInfo(siteSlug, `[checkIfSiteTracksPage] ✗ NOT found in site_page_config.yaml`);
        }
      } catch (error) {
        logSiteError(siteSlug, `[checkIfSiteTracksPage] Error reading site_page_config.yaml: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      logSiteInfo(siteSlug, `[checkIfSiteTracksPage] site_page_config.yaml does not exist`);
    }

    // Check working graph for the page
    const workingGraphPath = join(siteDirectory, 'working-graph.json');
    logSiteInfo(siteSlug, `[checkIfSiteTracksPage] Checking working-graph.json`);

    if (fs.existsSync(workingGraphPath)) {
      // Support both `pages` (new) and `nodes` (old) keys for backward compatibility
      const workingGraph = JSON.parse(fs.readFileSync(workingGraphPath, 'utf8')) as { pages?: Array<{ title: string }>; nodes?: Array<{ title: string }> };
      const graphPages = workingGraph.pages || workingGraph.nodes;

      logSiteInfo(siteSlug, `[checkIfSiteTracksPage] working-graph.json has ${graphPages?.length || 0} pages`);

      // Check if page exists in the graph
      if (graphPages && graphPages.some((page) => page.title === pageName)) {
        logSiteInfo(siteSlug, `[checkIfSiteTracksPage] ✓ Found in working-graph.json`);
        return true;
      } else {
        logSiteInfo(siteSlug, `[checkIfSiteTracksPage] ✗ NOT found in working-graph.json`);
      }
    } else {
      logSiteInfo(siteSlug, `[checkIfSiteTracksPage] working-graph.json does not exist`);
    }

    logSiteInfo(siteSlug, `[checkIfSiteTracksPage] Final result: NOT FOUND`);
    return false;
  } catch (error) {
    logSiteError(siteSlug, `[checkIfSiteTracksPage] Error: ${error instanceof Error ? error.message : String(error)}`);
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
router.get('/sites/source-pages/exact-search', (req, res, next) => {
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
          file_type: n.file_type,
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

// List all markdown source pages in a source directory (for create/edit site typeahead preload)
router.get('/sites/source-pages', (req, res, next) => {
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
// Uses the same ranking rules as the create/edit site modal previously used client-side.
router.get('/sites/source-pages/search', (req, res, next) => {
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

// Archive a site
router.post('/sites/:slug/archive', (req, res, next) => {
  const { slug } = req.params;
  const siteDirectory = getSiteDirectory(slug);
  
  try {
    if (!fs.existsSync(siteDirectory)) {
      return res.status(404).json({ error: 'Site not found' });
    }

    updateSiteConfig(siteDirectory, { archivedAt: new Date().toISOString() });
    clearSiteGuidCache(slug);
    logSiteInfo(slug, 'Site archived');
    
    res.json({ success: true, message: 'Site archived successfully' });
  } catch (error) {
    next(error);
  }
});

// Unarchive a site
router.post('/sites/:slug/unarchive', (req, res, next) => {
  const { slug } = req.params;
  const siteDirectory = getSiteDirectory(slug);
  
  try {
    if (!fs.existsSync(siteDirectory)) {
      return res.status(404).json({ error: 'Site not found' });
    }

    updateSiteConfig(siteDirectory, { archivedAt: null });
    clearSiteGuidCache(slug);
    logSiteInfo(slug, 'Site unarchived');
    
    res.json({ success: true, message: 'Site unarchived successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * SSE endpoint to delete a site, including S3 files and prefix soft-delete for published sites.
 * Stages: authenticating → deleting-s3 → soft-deleting-prefix → deleting-local → complete
 */
router.get('/sites/:slug/delete-site-stream', (req, res, _next) => {
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
      const siteDir = getSiteDirectory(slug);

      if (!fs.existsSync(siteDir)) {
        sendProgress({ stage: 'error', message: 'Site not found', result: { success: false, error: 'Site not found' } });
        res.end();
        return;
      }

      // Load config before any deletion
      try {
        loadSiteConfig(siteDir);
      } catch {
        // Config unreadable — proceed with local-only deletion
      }

      logSiteInfo(slug, 'Site deletion started');

      // Ask each registered publishing provider to clean up anything it
      // published for this site. Warnings surface in the final response;
      // we still delete locally even if a provider fails.
      const warnings: string[] = [];
      for (const provider of getAllBackendProviders()) {
        if (!provider.isSitePublished?.(slug)) continue;
        if (!provider.cleanupPublishedSite) continue;
        try {
          const result = await provider.cleanupPublishedSite({
            siteSlug: slug,
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

      logSiteInfo(slug, 'Site deleted');
      fs.rmSync(siteDir, { recursive: true, force: true });
      clearSiteGuidCache(slug);

      sendProgress({
        stage: 'complete',
        message: 'Site deleted successfully',
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

// Delete a site completely (local files only — used for unpublished sites)
router.delete('/sites/:slug', (req, res, next) => {
  const { slug } = req.params;
  const siteDir = getSiteDirectory(slug);
  
  try {
    if (!fs.existsSync(siteDir)) {
      return res.status(404).json({ error: 'Site not found' });
    }

    // Log before deletion so we can still read site_config.yaml (and thus the GUID)
    logSiteInfo(slug, 'Site deleted');

    // Recursively delete the entire site directory
    fs.rmSync(siteDir, { recursive: true, force: true });
    clearSiteGuidCache(slug);
    
    res.json({ success: true, message: 'Site deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Add the example site
router.post('/sites/add-example', (req, res, next) => {
  try {
    // Find a unique slug: example-site, example-site-1, example-site-2, ...
    const slug = findUniqueName('example-site', (name) => fs.existsSync(getSiteDirectory(name)));

    // Resolve paths to bundled example data
    const isDev = process.env.MEADOW_IS_DEV === 'true';
    let sourceGraphSrc: string;
    let fixtureSrc: string;

    if (isDev) {
      // Dev: resolve the app root from this route module.
      const projectRoot = join(__dirname, '..', '..', '..', '..', '..');
      sourceGraphSrc = join(projectRoot, 'shared_data', 'source_graphs', 'example-site-data');
      fixtureSrc = join(projectRoot, 'shared_data', 'home_fixtures', 'home_fixture_example', 'sites', 'example-site');
    } else {
      const exampleSitePath = process.env.MEADOW_EXAMPLE_SITE_PATH!;
      sourceGraphSrc = join(exampleSitePath, 'source_graph');
      fixtureSrc = join(exampleSitePath, 'home_fixture', 'sites', 'example-site');
    }

    const configDir = getConfigDirectory();

    // Copy source graph to a unique directory, stripping pagespecs from .md files
    const sourceGraphDirName = slug.replace(/-/g, '_') + '_source_graph';
    const sourceGraphDest = join(configDir, sourceGraphDirName);
    copyDirectoryWithPagespecStripping(sourceGraphSrc, sourceGraphDest);

    // Copy conf/ from fixture
    const siteDir = getSiteDirectory(slug);
    fs.mkdirSync(siteDir, { recursive: true });
    fs.cpSync(join(fixtureSrc, 'conf'), join(siteDir, 'conf'), { recursive: true });

    // Update site_config.yaml with fresh values
    const siteConfigPath = join(siteDir, 'conf', 'site_config.yaml');
    const siteConfigContent = fs.readFileSync(siteConfigPath, 'utf8');
    const siteConfig = YAML.parse(siteConfigContent) as SiteConfig;

    siteConfig.siteGuid = generateSiteGuid();
    siteConfig.sourceDirectory = sourceGraphDest;
    siteConfig.siteCreatedAt = new Date().toISOString();
    siteConfig.siteUpdatedAt = new Date().toISOString();

    fs.writeFileSync(siteConfigPath, YAML.stringify(siteConfig), 'utf8');

    clearSiteGuidCache(slug);
    logSiteInfo(slug, 'Example site created');

    // Commit via AppConfigGitUtils. Include the freshly-copied source graph
    // directory alongside the site config so MeadowHome has no untracked
    // files after the example site is created.
    const gitUtils = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, configDir);
    void (async () => {
      try {
        await gitUtils.commitDirs([
          `sites/${slug}/conf`,
          sourceGraphDirName,
        ], `initial site config for ${slug}`);
      } catch (error) {
        logger.error('[example site creation] Error committing site config:', error);
      }
    })();

    res.json({ success: true, slug });
  } catch (error) {
    next(error);
  }
});

// Create a new site
router.post('/sites', (req, res, _next) => {
  const {
    slug,
    sourceDirectory,
    initialSitePageTitle,
    initialSitePageDirectory,
    initialSitePageFileType,
    siteNotes
  } = req.body as {
    slug: string;
    sourceDirectory: string;
    initialSitePageTitle: string;
    initialSitePageDirectory?: string;
    initialSitePageFileType?: string;
    siteNotes?: string;
  };

  if (!slug || !sourceDirectory || !initialSitePageTitle) {
    res.status(400).json({ error: 'All fields are required' });
    return;
  }

  // Validate slug format (alphanumeric and dashes only)
  if (!/^[a-z0-9-]+$/.test(slug)) {
    res.status(400).json({ error: 'Site slug must contain only lowercase letters, numbers, and dashes' });
    return;
  }

  // Auto-increment slug if it already exists (e.g. my-site -> my-site-1)
  const actualSlug = findUniqueName(slug, (name) => fs.existsSync(getSiteDirectory(name)));
  const siteDir = getSiteDirectory(actualSlug);

  // Create site directory structure
  fs.mkdirSync(siteDir, { recursive: true });
  fs.mkdirSync(join(siteDir, 'conf'), { recursive: true });

  // Create site_config.yaml
  const siteConfig: SiteConfig = {
    siteGuid: generateSiteGuid(),
    sourceDirectory,
    initialSitePageTitle,
    initialSitePageDirectory: initialSitePageDirectory || '',
    defaultTraversalSitePageTitle: initialSitePageTitle,
    defaultTraversalSitePageDirectory: initialSitePageDirectory || '',
    generatedSiteVersions: [],
    archivedAt: null,
    siteCreatedAt: new Date().toISOString(),
    siteUpdatedAt: new Date().toISOString(),
    siteLastPublishedAt: null,
    siteNotes: siteNotes || ""
  };

  const yamlContent = YAML.stringify(siteConfig);
  fs.writeFileSync(join(siteDir, 'conf/site_config.yaml'), yamlContent, 'utf8');

  clearSiteGuidCache(actualSlug);
  logSiteInfo(actualSlug, 'Site created');

  // Create initial site_page_config.yaml with reasonable defaults
  const sitePageConf = stringifyPageConfig([{
    title: initialSitePageTitle,
    ...(initialSitePageDirectory && { source_graph_subdirectory: initialSitePageDirectory }),
    ...(initialSitePageFileType && { file_type: initialSitePageFileType as FileType }),
    config: { list_type: 'whitelist', outlinks_depth: 3, inlinks_depth: 1 }
  }]);
  fs.writeFileSync(join(siteDir, 'conf/site_page_config.yaml'), sitePageConf, 'utf8');

  // Commit the initial site config files to git
  const gitUtils = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, getConfigDirectory());
  void (async () => {
    try {
      await gitUtils.commitFiles([
        AppConfigPaths.relative.siteConfigFile(actualSlug),
        AppConfigPaths.relative.sitePageConfigFile(actualSlug),
      ], `initial site config for ${actualSlug}`);
    } catch (error) {
      logger.error('[site creation] Error committing initial site config:', error);
    }
  })();

  res.json({ success: true, message: 'Site created successfully', slug: actualSlug });
});

// Update a site configuration
router.put('/sites/:slug', (req, res, next) => {
  const { slug } = req.params;
  const {
    sourceDirectory,
    initialSitePageTitle,
    initialSitePageDirectory,
    siteNotes
  } = req.body as {
    sourceDirectory: string;
    initialSitePageTitle: string;
    initialSitePageDirectory?: string;
    siteNotes?: string;
  };

  if (!sourceDirectory || !initialSitePageTitle) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const configPath = getSiteConfigPath(slug);
  
  try {
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Site not found' });
    }

    // Read existing config to preserve internal/unknown fields
    const yamlContent = fs.readFileSync(configPath, 'utf8');
    const existingConfig = YAML.parse(yamlContent) as SiteConfig;

    const siteGuid = isValidSiteGuid(existingConfig.siteGuid) ? existingConfig.siteGuid : generateSiteGuid();

    // Update config while preserving any unknown/internal fields (including siteGuid)
    const updatedConfig: SiteConfig = {
      ...existingConfig,
      siteGuid,
      sourceDirectory,
      initialSitePageTitle,
      initialSitePageDirectory: initialSitePageDirectory || '',
      defaultTraversalSitePageTitle: initialSitePageTitle,
      defaultTraversalSitePageDirectory: initialSitePageDirectory || '',
      archivedAt: existingConfig.archivedAt ?? null,
      siteCreatedAt: existingConfig.siteCreatedAt || new Date().toISOString(),
      siteUpdatedAt: new Date().toISOString(),
      siteLastPublishedAt: existingConfig.siteLastPublishedAt ?? null,
      siteNotes: siteNotes !== undefined ? siteNotes : (existingConfig.siteNotes || "")
    };

    const updatedYaml = YAML.stringify(updatedConfig);
    fs.writeFileSync(configPath, updatedYaml, 'utf8');

    clearSiteGuidCache(slug);
    logSiteInfo(slug, 'Site updated');

    res.json({ success: true, message: 'Site updated successfully' });
  } catch (error) {
    next(error);
  }
});

// Update site notes only (for inline editing)
router.patch('/sites/:slug/notes', (req, res, next) => {
  const { slug } = req.params;
  const { siteNotes } = req.body as { siteNotes: string };

  const siteDirectory = getSiteDirectory(slug);
  
  try {
    if (!fs.existsSync(siteDirectory)) {
      return res.status(404).json({ error: 'Site not found' });
    }

    // Update only the notes and updatedAt
    updateSiteConfig(siteDirectory, { 
      siteNotes: siteNotes || "",
      siteUpdatedAt: new Date().toISOString()
    });

    res.json({ success: true, message: 'Site notes updated successfully' });
  } catch (error) {
    next(error);
  }
});
export default router;
