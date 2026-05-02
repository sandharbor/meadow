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

import dotenv from 'dotenv';
import express from 'express';
import path, { join } from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { parsePageConfig, stringifyPageConfig } from '../../shared_code/utils/sitePageConfigUtils.js';
import { onDiskFilename } from '../../shared_code/utils/fileTypeUtils.js';
import { encodePathForUrl } from '../../shared_code/utils/urlUtils.js';
import { SitePageConfig } from '../../shared_code/types/sitePageConfig.js';
import { SiteConfig, GeneratedSiteVersion } from '../../shared_code/types/siteConfig.js';
import { FileType, FILE_TYPES } from '../../shared_code/types/FileType.js';
import YAML from 'yaml';
import fs from 'fs';
import { ISitePage } from '../../shared_code/types/ISitePage.js';
import { SiteConfigPaths } from '../../shared_code/paths/siteConfigPaths.js';
import { AppConfigPaths } from '../../shared_code/paths/appConfigPaths.js';
import type { PageTraversalDetails } from '../types/pageFileGraph.js';
import siteConfigRoutes from './routes/siteConfigRoutes.js';
import customFiltersRoutes from './routes/customFiltersRoutes.js';
import hooksRoutes from './routes/hooksRoutes.js';
import customAssetsRoutes from './routes/customAssetsRoutes.js';
import appConfigRoutes from './routes/appConfigRoutes.js';
import localSaveRoutes from './routes/localSaveRoutes.js';
import stylePresetsRoutes from './routes/stylePresetsRoutes.js';
import { getConfigDirectory, getSitesDirectory, getSiteDirectory, getSiteConfigPath, getSiteRawDirectory, getSiteHtmlDirectory } from './routes/siteConfigRoutes.js';
import { generateHtmlForSite } from './html/htmlService.js';
import { normalizePageTitle } from './html/shared.js';
import { loadSiteConfig, updateSiteConfig, loadYamlFromPath, saveYamlToPath, getGeneratedSiteVersionsWithFallback } from './utils/siteConfigUtils.js';
import { getHtmlPathForPage } from './utils/htmlPathLookup.js';
import { generateSiteGuid, isValidSiteGuid } from '../../shared_code/utils/siteGuidUtils.js';
import { FrontmatterUtils } from './utils/frontmatterUtils.js';
import { ensureTrackedPageContent } from './utils/trackedPageContentUtils.js';
import { runWorkingGraphRaw } from './utils/workingGraphUtils.js';
import { AppConfig } from '../../shared_code/types/appConfig.js';
import { ResourcesConfig } from '../../shared_code/types/resourcesConfig.js';
import {
  ensureAllProviderResourcesInitialized,
  getActiveBackendProviders,
  getAllBackendProviders,
  registerAllProviderRoutes,
} from './publishing/providerRegistry.js';
import { ensureAppConfigInitialized, loadAppConfig as loadAppConfigFromDisk, appConfigFileExists } from '../../shared_code/utils/appConfigUtils.js';
import { ensureDefaultGlobalFiltersInitialized } from '../../shared_code/utils/defaultGlobalFiltersUtils.js';
import { getGlobalCustomFiltersPath } from '../../shared_code/utils/globalCustomFiltersUtils.js';
import { loadResourcesConfig, ensureResourcesConfigInitialized } from '../../shared_code/utils/resourcesConfigUtils.js';
import { AppConfigGitUtils, GIT_AUTHORS } from '../../shared_code/utils/appConfigGitUtils.js';
import { rankSourcePageCandidatesWithCount, recentSourcePageCandidatesWithCount } from '../../shared_code/utils/sourcePageSearchUtils.js';
import { commitSiteChanges, getPreviewChanges } from './utils/configDirectory/gitUtils/previewGitService.js';
import { getConfFileTree, getPreviewFileTree, getOriginalContent, readFileContent, findGitRoot, detectFileType, getMimeType, getGitStatusMap, buildFileTree, buildChangedFilesTree } from './utils/confFileExplorerUtils.js';
import { commitChangesNative, runGitDirLogNative, runGitCommitFilesNative, runGitCatFileNative, runGitFileLogNative, runGitHtmlSectionDiffNative } from './utils/configDirectory/gitUtils/gitStatusUtils.js';
// import { startIntermittentAutoCommit } from './utils/configDirectory/gitUtils/intermittentAutoCommit.js';
import { logSiteInfo, logSiteError, clearSiteGuidCache } from './utils/logging/siteLogger.js';
import { findUniqueName } from './utils/uniqueNameUtils.js';
import { listMarkdownSourcePages } from './utils/sourcePageFileUtils.js';
import { logger, setLogDirectoryOverride } from './utils/logging/backendLoggingUtils.js';
import { startLogMaintenance, stopLogMaintenance } from './utils/logging/logfiles/logMaintenanceService.js';
import { extractContentWithoutPagespecs } from '../../shared_code/test/pagespecUtils.js';

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

// Configure dotenv to load environment variables
dotenv.config();

// Helper function to load resources config
const loadResources = (): ResourcesConfig => loadResourcesConfig(getConfigDirectory());

// Note: config directory helpers are imported from `routes/siteConfigRoutes.ts`

import { runMigrationsOnStartup } from './migrations/runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadAppConfig = (): AppConfig => loadAppConfigFromDisk(getConfigDirectory());

const app = express();

// Port is set from resources config in startServer() after config is loaded.
let port: number = 0;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));



// Use graph config routes
app.use('/api', siteConfigRoutes);
app.use('/api', customFiltersRoutes);
app.use('/api/hooks', hooksRoutes);
app.use('/api/custom-assets', customAssetsRoutes);
app.use('/api', appConfigRoutes);
app.use('/api', localSaveRoutes);
app.use('/api', stylePresetsRoutes);

// Mounts each registered provider's routes under
// /api/publishing-providers/<providerId>/...
registerAllProviderRoutes(app);

// Lightweight provider discovery endpoint: the frontend registry merges
// this with its own locally-known manifests so it can decide which provider
// owns the Publish tab, the "open website" button, etc.
app.get('/api/publishing-providers', (_req, res) => {
  const active = new Set(getActiveBackendProviders().map((p) => p.manifest.id));
  res.json({
    providers: getAllBackendProviders().map((p) => ({
      manifest: p.manifest,
      isActive: active.has(p.manifest.id),
    })),
  });
});

// Serve the vendored Excalidraw renderer bundle so the editor frontend
// can use the same exportToSvg + lz-string surface that the published site
// uses. The bundle is the build artifact at
// `src/html/shared/excalidraw-vendor.js` (refreshed via
// `node scripts/build-excalidraw-vendor.mjs`).
app.get('/api/assets/excalidraw-vendor.js', (_req, res) => {
  const bundlePath = path.join(__dirname, 'html', 'shared', 'excalidraw-vendor.js');
  if (!fs.existsSync(bundlePath)) {
    return res.status(404).send('// excalidraw-vendor.js not found');
  }
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(bundlePath);
});


// Copy tracked pages to site's tracked_page_content directory
app.post('/api/site/:siteSlug/copy-tracked-pages', (req, res, next) => {
  (async () => {
    const { siteSlug } = req.params;
    const { trackedPages, commitMessage } = req.body as {
      trackedPages?: Array<{ sourceGraphSubdirectory: string; title: string; file_type: string }>;
      commitMessage?: string;
    };
    
    if (!siteSlug) {
      return res.status(400).json({ error: 'siteSlug is required' });
    }

    if (!trackedPages || !Array.isArray(trackedPages)) {
      return res.status(400).json({ error: 'trackedPages array is required' });
    }

    if (trackedPages.length === 0) {
      return res.json({ message: 'No tracked pages provided', copiedFiles: [] });
    }

    // Load site config to get notesDir (base directory)
    const configPath = getSiteConfigPath(siteSlug);
    let notesDir = '';
    try {
      if (!fs.existsSync(configPath)) {
        return res.status(500).json({ error: `site_config.yaml not found for slug ${siteSlug}` });
      }
      const yamlContent = fs.readFileSync(configPath, 'utf8');
      const config = YAML.parse(yamlContent) as { sourceDirectory?: string };
      if (config && typeof config.sourceDirectory === 'string') {
        notesDir = config.sourceDirectory;
      }
    } catch {
      return next(new Error(`Failed to load site configuration for ${siteSlug}`));
    }
    if (!notesDir) {
      return res.status(500).json({ error: `Could not determine the notes directory for site ${siteSlug}. Ensure site_config.yaml exists and contains a 'directory' property.` });
    }

    // Create target directory if it doesn't exist
    const targetDir = join(getSiteRawDirectory(siteSlug), 'tracked_page_content');
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
    } catch (err) {
      return next(new Error(`Failed to create target directory: ${err instanceof Error ? err.message : String(err)}`));
    }

    // Copy tracked page files
    const copiedFiles: string[] = [];
    const errors: string[] = [];

    for (const page of trackedPages) {
      try {
        const filename = onDiskFilename(page.title, page.file_type);
        const sourceFile = join(notesDir, page.sourceGraphSubdirectory, filename);
        const targetFile = join(targetDir, filename);

        if (fs.existsSync(sourceFile)) {
          fs.copyFileSync(sourceFile, targetFile);
          copiedFiles.push(page.title);
        } else {
          errors.push(`Source file not found: ${sourceFile}`);
        }
      } catch (err) {
        errors.push(`Failed to copy ${page.title}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Commit both the site_page_config.yaml and tracked_page_content as a single commit
    // This ensures the configuration and its tracked content are versioned together
    try {
      const confDir = join(getSiteDirectory(siteSlug), 'conf');
      const dirsToCommit = [confDir, targetDir];
      
      const sha = await commitChangesNative(
        dirsToCommit,
        commitMessage || 'update site page configuration',
        { configDir: getConfigDirectory() }
      );
      if (sha) {
        logger.info(`[copy-tracked-pages] Committed config and tracked content: ${sha}`);
      }
    } catch (commitError) {
      // Log but don't fail the request - the files were saved successfully
      logger.error('[copy-tracked-pages] Failed to commit changes:', commitError);
    }

    res.json({
      message: `Copied ${copiedFiles.length} tracked pages`,
      copiedFiles,
      errors: errors.length > 0 ? errors : undefined
    });
  })().catch(next);
});

app.get('/api/site/:siteSlug/working-graph', (req, res, next) => {
  (async () => {
    const { siteSlug } = req.params;
    const initialPageTitleQuery = req.query.initialPageTitle;
    const traversalPageTitleQuery = req.query.traversalPageTitle as string | undefined;
    const frontierDepthQuery = req.query.frontierDepth as string | undefined;
    const frontierDepth = frontierDepthQuery ? parseInt(frontierDepthQuery, 10) : 0;

    if (typeof initialPageTitleQuery !== 'string' || !initialPageTitleQuery.trim()) {
      return res.status(400).json({ error: 'Missing required query parameter: pageName' });
    }
    const initialPageTitle = initialPageTitleQuery.trim();

    // Load site config to get notesDir and page title/directory settings
    const configPath = getSiteConfigPath(siteSlug);
    let notesDir = '';
    let initialSitePageTitleFromYaml: string | undefined = undefined;
    let initialSitePageDirectoryFromYaml: string | undefined = undefined;
    let defaultTraversalSitePageTitleFromYaml: string | undefined = undefined;
    let defaultTraversalSitePageDirectoryFromYaml: string | undefined = undefined;
    let siteAllowImagesToExtendToFrontier: boolean | undefined = undefined;
    try {
      if (!fs.existsSync(configPath)) {
        return res.status(500).json({ error: `site_config.yaml not found for slug ${siteSlug}` });
      }
      const yamlContent = fs.readFileSync(configPath, 'utf8');
      const config = YAML.parse(yamlContent) as { 
        sourceDirectory?: string; 
        initialSitePageTitle?: string;
        initialSitePageDirectory?: string;
        defaultTraversalSitePageTitle?: string;
        defaultTraversalSitePageDirectory?: string;
        allowImagesToExtendToFrontier?: boolean;
      };
      if (config) {
        if (typeof config.sourceDirectory === 'string') {
          notesDir = config.sourceDirectory;
        }
        if (typeof config.initialSitePageTitle === 'string' && config.initialSitePageTitle.trim()) {
          initialSitePageTitleFromYaml = config.initialSitePageTitle.trim();
        }
        if (typeof config.initialSitePageDirectory === 'string') {
          initialSitePageDirectoryFromYaml = config.initialSitePageDirectory;
        }
        if (typeof config.defaultTraversalSitePageTitle === 'string' && config.defaultTraversalSitePageTitle.trim()) {
          defaultTraversalSitePageTitleFromYaml = config.defaultTraversalSitePageTitle.trim();
        }
        if (typeof config.defaultTraversalSitePageDirectory === 'string') {
          defaultTraversalSitePageDirectoryFromYaml = config.defaultTraversalSitePageDirectory;
        }
        if (typeof config.allowImagesToExtendToFrontier === 'boolean') {
          siteAllowImagesToExtendToFrontier = config.allowImagesToExtendToFrontier;
        }
      }
    } catch {
      return next(new Error(`Failed to load site configuration for ${siteSlug}`));
    }
    if (!notesDir) {
      return res.status(500).json({ error: `Could not determine the notes directory for site ${siteSlug}. Ensure site_config.yaml exists and contains a 'sourceDirectory' property.` });
    }

    // Load and parse site_page_config.yaml (check draft first)
    let sitePageConfigs: SitePageConfig[] = [];
    let sitePageConfigPath: string | undefined = undefined;
    try {
      const draftPath = getSiteConfigPath(siteSlug, 'draft_site_page_config.yaml');
      const mainPath = getSiteConfigPath(siteSlug, 'site_page_config.yaml');
      
      let confContent = '';
      if (fs.existsSync(draftPath)) {
        sitePageConfigPath = draftPath;
        confContent = fs.readFileSync(draftPath, 'utf8');
      } else if (fs.existsSync(mainPath)) {
        sitePageConfigPath = mainPath;
        confContent = fs.readFileSync(mainPath, 'utf8');
      }
      
      if (confContent) {
        sitePageConfigs = parsePageConfig(confContent);
      }
    } catch {
      return next(new Error(`Failed to load or parse site_page_config.yaml for ${siteSlug}`));
    }

    if (!sitePageConfigPath) {
      return next(new Error(`site_page_config.yaml not found for ${siteSlug}`));
    }
    
    // Resolve allowImagesToExtendToFrontier: site config overrides app config, default true
    let allowImagesToExtendToFrontier = true;
    if (siteAllowImagesToExtendToFrontier !== undefined) {
      allowImagesToExtendToFrontier = siteAllowImagesToExtendToFrontier;
    } else {
      const appConfig = loadAppConfig();
      if (appConfig.allowImagesToExtendToFrontier !== undefined) {
        allowImagesToExtendToFrontier = appConfig.allowImagesToExtendToFrontier;
      }
    }

    const knownFileTypes: Set<string> = new Set(FILE_TYPES);
    function parsePageRef(raw: string): { title: string; directory: string; file_type?: string } {
      const trimmed = raw.trim();
      const withoutLeadingSlash = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
      const lastDot = withoutLeadingSlash.lastIndexOf('.');
      const lastSlash = withoutLeadingSlash.lastIndexOf('/');

      if (lastDot > -1 && lastDot > lastSlash) {
        const file_type = withoutLeadingSlash.slice(lastDot + 1);
        // Only treat as a file extension if it's a known file type;
        // otherwise the dot is part of the page title (e.g. "test.io something").
        if (knownFileTypes.has(file_type.toLowerCase())) {
          const beforeDot = withoutLeadingSlash.slice(0, lastDot);
          const slash = beforeDot.lastIndexOf('/');
          const directory = slash >= 0 ? beforeDot.slice(0, slash) : '';
          const title = slash >= 0 ? beforeDot.slice(slash + 1) : beforeDot;
          return { title, directory, file_type };
        }
      }

      if (lastSlash >= 0) {
        return { title: withoutLeadingSlash.slice(lastSlash + 1), directory: withoutLeadingSlash.slice(0, lastSlash) };
      }

      return { title: trimmed, directory: '' };
    }

    function inferFileType(title: string, directory: string): string {
      const conf = sitePageConfigs.find(c => c.title === title && (c.source_graph_subdirectory || '') === (directory || '') && c.file_type);
      return conf?.file_type ?? 'md';
    }

    const initialRefFromQuery = parsePageRef(initialPageTitle);
    const initialDirectory =
      initialRefFromQuery.directory ||
      (initialPageTitle === initialSitePageTitleFromYaml && initialSitePageDirectoryFromYaml !== undefined ? initialSitePageDirectoryFromYaml : '');
    const initialFileType = initialRefFromQuery.file_type ?? inferFileType(initialRefFromQuery.title, initialDirectory);

    const traversalTitleRaw = traversalPageTitleQuery && traversalPageTitleQuery.trim()
      ? traversalPageTitleQuery.trim()
      : defaultTraversalSitePageTitleFromYaml || initialRefFromQuery.title;
    const traversalRef = parsePageRef(traversalTitleRaw);
    const traversalDirectory =
      traversalRef.directory ||
      ((traversalRef.title === defaultTraversalSitePageTitleFromYaml && defaultTraversalSitePageDirectoryFromYaml !== undefined)
        ? defaultTraversalSitePageDirectoryFromYaml
        : initialDirectory);
    const traversalFileType = traversalRef.file_type ?? inferFileType(traversalRef.title, traversalDirectory);

    type RustLinkResolvedInfo = { link_resolved_target_directory: string; link_resolved_target_path: string | null };
    type RustPage = {
      id: string;
      title: string;
      sourceGraphSubdirectory: string;
      file_type: FileType;
      depth: number;
      remaining_depth: number;
      remaining_inlinks_depth: number;
      path: string[];
      traversal_details?: PageTraversalDetails;
      isFrontierPage?: boolean;
      isFrontierImageExtension?: boolean;
      is_sensitive: boolean;
      source_page_outlink_count?: number;
      source_page_inlink_count?: number;
    };
    type RustEdge = { source: string; target: string; isBidirectional: boolean };
    type RustOutput = {
      pages: RustPage[];
      edges: (RustEdge & { link_original_text: string })[];
      allLinkResolutionMaps: Record<string, Record<string, RustLinkResolvedInfo>>;
      allInlinkSources: Record<string, string[]>;
      allOutlinkTargets: Record<string, string[]>;
    };

    let rustOutput: RustOutput;
    try {
      const raw = await runWorkingGraphRaw({
        graphRoot: notesDir,
        sitePageConfigPath,
        initial: { title: initialRefFromQuery.title, directory: initialDirectory, file_type: initialFileType },
        traversal: { title: traversalRef.title, directory: traversalDirectory, file_type: traversalFileType },
        frontierDepth,
        allowImagesToExtendToFrontier,
        allowLowerDepths: false,
      });
      rustOutput = JSON.parse(raw) as RustOutput;
    } catch (err) {
      return next(new Error(`Failed to run working_graph for site ${siteSlug}: ${err instanceof Error ? err.message : String(err)}`));
    }

    const pageDepthMap = new Map<string, number>(rustOutput.pages.map(n => [n.id, n.depth]));
    const linkResolutionMaps = rustOutput.allLinkResolutionMaps || {};

    const pages: ISitePage[] = rustOutput.pages.map(n => ({
      id: n.id,
      label: n.title,
      title: n.title,
      sourceGraphSubdirectory: n.sourceGraphSubdirectory,
      file_type: n.file_type,

      depth: n.depth,
      remaining_depth: n.remaining_depth,
      remaining_inlinks_depth: n.remaining_inlinks_depth,
      path: n.path,
      traversal_details: n.traversal_details,
      linkResolutionMap: linkResolutionMaps[n.id],
      isFrontierPage: n.isFrontierPage,
      isFrontierImageExtension: n.isFrontierImageExtension,
      source_page_outlink_count: n.source_page_outlink_count,
      source_page_inlink_count: n.source_page_inlink_count,

      data: {
        title: n.title,
        sourceGraphSubdirectory: n.sourceGraphSubdirectory,
        file_type: n.file_type,
        is_sensitive: n.is_sensitive
      },
      getIdent: () => n.id
    }));

    // Deduplicate edges to match existing API: one edge per page pair, mark bidirectional if reverse exists.
    const edgeMap = new Map<string, { source: string; target: string; isBidirectional: boolean }>();
    for (const e of rustOutput.edges) {
      const forwardKey = `${e.source}->${e.target}`;
      const reverseKey = `${e.target}->${e.source}`;
      if (edgeMap.has(reverseKey)) {
        const existing = edgeMap.get(reverseKey)!;
        existing.isBidirectional = existing.isBidirectional || e.isBidirectional || true;
      } else if (edgeMap.has(forwardKey)) {
        const existing = edgeMap.get(forwardKey)!;
        existing.isBidirectional = existing.isBidirectional || e.isBidirectional;
      } else {
        edgeMap.set(forwardKey, { source: e.source, target: e.target, isBidirectional: e.isBidirectional });
      }
    }

    const resultEdges = Array.from(edgeMap.values())
      .map(e => ({
        source: e.source,
        target: e.target,
        isBidirectional: e.isBidirectional ?? false,
        data: { fromDepth: pageDepthMap.get(e.source) ?? 0, toDepth: pageDepthMap.get(e.target) ?? 0 }
      }))
      .sort((a, b) => (a.source + '->' + a.target).localeCompare(b.source + '->' + b.target));

    res.json({
      pages,
      edges: resultEdges,
      allInlinkSources: rustOutput.allInlinkSources || {},
      allOutlinkTargets: rustOutput.allOutlinkTargets || {},
    });
  })().catch(next);
});

// Preview site endpoint  
app.post('/api/site/:siteSlug/preview', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      
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
            traversalPageUrl = `http://localhost:${port}/api/site/${siteSlug}/published/${encodePathForUrl(foundPath)}`;
          }
        }

        // If no specific traversal page, look for any HTML file in root directory
        // (we don't pick alphabetically from subdirs to avoid unexpected behavior)
        if (!traversalPageUrl) {
          const htmlFiles = fs.readdirSync(previewHtmlDir).filter(file => file.endsWith('.html'));
          if (htmlFiles.length > 0) {
            // Use the first HTML file found, but log a warning since this is a fallback
            logger.warn(`No traversal page specified or found, falling back to first HTML file: ${htmlFiles[0]}`);
            traversalPageUrl = `http://localhost:${port}/api/site/${siteSlug}/published/${encodePathForUrl(htmlFiles[0])}`;
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
app.get('/api/site/:siteSlug/preview-stream', (req, res, _next) => {
  const { siteSlug } = req.params;
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
          const traversalPageUrl = `http://localhost:${port}/api/site/${siteSlug}/published/${encodePathForUrl(relativeHtmlPath)}`;
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
          traversalPageUrl = `http://localhost:${port}/api/site/${siteSlug}/published/${encodePathForUrl(foundPath)}`;
        }
      }

      // If no specific traversal page, look for any HTML file in root directory
      if (!traversalPageUrl) {
        const htmlFiles = fs.readdirSync(previewHtmlDir).filter(file => file.endsWith('.html'));
        if (htmlFiles.length > 0) {
          logger.warn(`No traversal page specified or found, falling back to first HTML file: ${htmlFiles[0]}`);
          traversalPageUrl = `http://localhost:${port}/api/site/${siteSlug}/published/${encodePathForUrl(htmlFiles[0])}`;
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

// Get preview changes (diff between preview and last published)
app.get('/api/site/:siteSlug/preview-changes', (req, res, next) => {
  try {
    const { siteSlug } = req.params;
    
    if (!siteSlug) {
      return res.status(400).json({ error: 'siteSlug is required' });
    }

    const siteDirectory = getSiteDirectory(siteSlug);
    
    if (!fs.existsSync(siteDirectory)) {
      return res.status(404).json({ error: `Site '${siteSlug}' not found` });
    }

    const changes = getPreviewChanges(siteDirectory);
    
    res.json({
      success: true,
      changedFiles: changes.changedFiles,
      fileDiffs: changes.fileDiffs
    });
    
  } catch (error) {
    logger.error('Error getting preview changes:', error);
    next(error);
  }
});

// Save preview changes to git (without publishing)
app.get('/api/site/:siteSlug/save-changes', (req, res, next) => {
  void (async () => {
    try {
      const { siteSlug } = req.params;

      if (!siteSlug) {
        return res.status(400).json({ error: 'siteSlug is required' });
      }

      const siteDirectory = getSiteDirectory(siteSlug);

      if (!fs.existsSync(siteDirectory)) {
        return res.status(404).json({ error: `Site '${siteSlug}' not found` });
      }

      // Check if git auto-management is enabled
      const appConfigForGit = loadAppConfig();
      if (appConfigForGit.manageGitAutomatically === false) {
        logSiteInfo(siteSlug, '[save-changes] Git commit skipped (manageGitAutomatically=false)');
        return res.json({ success: true, skipped: true, message: 'Git auto-management is disabled' });
      }

      logSiteInfo(siteSlug, '[save-changes] Committing changes to git...');
      const commitSha = await commitSiteChanges(siteDirectory, 'user saved changes to preview');

      if (commitSha) {
        logSiteInfo(siteSlug, `[save-changes] Git commit successful: ${commitSha}`);
        res.json({ success: true, commitSha });
      } else {
        logSiteInfo(siteSlug, '[save-changes] Git commit: no changes to commit');
        res.json({ success: true, noChanges: true, message: 'No changes to commit' });
      }
    } catch (error) {
      logger.error('Error saving changes:', error);
      next(error);
    }
  })();
});

// === Config File Explorer API ===

// Get file tree for app config directory (~/.config/meadow/app)
app.get('/api/app-config/tree', (req, res, next) => {
  (async () => {
    try {
      const changedOnly = req.query.changedOnly === 'true';
      const configDir = getConfigDirectory();
      const appConfigDir = join(configDir, 'app');

      // Ensure directory exists
      if (!fs.existsSync(appConfigDir)) {
        fs.mkdirSync(appConfigDir, { recursive: true });
      }

      const gitStatusMap = await getGitStatusMap(appConfigDir);
      const tree = changedOnly
        ? buildChangedFilesTree(appConfigDir, gitStatusMap)
        : buildFileTree(appConfigDir, gitStatusMap);

      res.json({ root: appConfigDir, tree });
    } catch (error) {
      logger.error('Error getting app config file tree:', error);
      next(error);
    }
  })().catch(next);
});

// Get file content for app config directory
app.get('/api/app-config/content', (req, res, next) => {
  try {
    const filePath = req.query.path as string;

    if (!filePath) {
      return res.status(400).json({ error: 'path query parameter is required' });
    }

    const configDir = getConfigDirectory();
    const appConfigDir = join(configDir, 'app');

    if (!fs.existsSync(appConfigDir)) {
      fs.mkdirSync(appConfigDir, { recursive: true });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'Cannot read directory content' });
    }

    // Security: ensure path is within app config directory
    const normalizedPath = fs.realpathSync(filePath);
    const normalizedAppDir = fs.realpathSync(appConfigDir);

    if (!(normalizedPath === normalizedAppDir || normalizedPath.startsWith(normalizedAppDir + path.sep))) {
      return res.status(403).json({ error: 'Access denied - path outside app config directory' });
    }

    const { content, fileType, mimeType } = readFileContent(filePath);
    res.json({ content, path: filePath, fileType, mimeType });
  } catch (error) {
    logger.error('Error reading app config file:', error);
    next(error);
  }
});

// Get original (committed) file content for app config directory (diff comparison)
app.get('/api/app-config/original', (req, res, next) => {
  (async () => {
    try {
      const filePath = req.query.path as string;

      if (!filePath) {
        return res.status(400).json({ error: 'path query parameter is required' });
      }

      const configDir = getConfigDirectory();
      const appConfigDir = join(configDir, 'app');

      if (!fs.existsSync(appConfigDir)) {
        fs.mkdirSync(appConfigDir, { recursive: true });
      }

      // Security: ensure path is within app config directory (handle non-existent files)
      const normalizedAppDir = fs.realpathSync(appConfigDir);
      const resolvedPath = path.resolve(filePath);

      if (!(resolvedPath === normalizedAppDir || resolvedPath.startsWith(normalizedAppDir + path.sep))) {
        return res.status(403).json({ error: 'Access denied - path outside app config directory' });
      }

      const { content, isNew, fileType, mimeType } = await getOriginalContent(filePath);
      res.json({ content, path: filePath, isNew, fileType, mimeType });
    } catch (error) {
      logger.error('Error reading original app config file:', error);
      next(error);
    }
  })().catch(next);
});

// Get file tree for site's conf directory
app.get('/api/site/:siteSlug/conf-files/tree', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      const changedOnly = req.query.changedOnly === 'true';
      
      if (!siteSlug) {
        return res.status(400).json({ error: 'siteSlug is required' });
      }

      const siteDirectory = getSiteDirectory(siteSlug);
      
      if (!fs.existsSync(siteDirectory)) {
        return res.status(404).json({ error: `Site '${siteSlug}' not found` });
      }

      const treeData = await getConfFileTree(siteDirectory, changedOnly);
      res.json(treeData);
      
    } catch (error) {
      logger.error('Error getting conf file tree:', error);
      next(error);
    }
  })().catch(next);
});

// Get file tree for site's preview directory
app.get('/api/site/:siteSlug/preview-files/tree', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      const changedOnly = req.query.changedOnly === 'true';
      
      if (!siteSlug) {
        return res.status(400).json({ error: 'siteSlug is required' });
      }

      const siteDirectory = getSiteDirectory(siteSlug);
      
      if (!fs.existsSync(siteDirectory)) {
        return res.status(404).json({ error: `Site '${siteSlug}' not found` });
      }

      const treeData = await getPreviewFileTree(siteDirectory, changedOnly);
      res.json(treeData);
      
    } catch (error) {
      logger.error('Error getting preview file tree:', error);
      next(error);
    }
  })().catch(next);
});

// Get HTML section changes for files under the site's preview directory (working tree vs index)
app.get('/api/site/:siteSlug/preview-files/html-section-changes', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      if (!siteSlug) return res.status(400).json({ error: 'siteSlug is required' });

      const siteDirectory = getSiteDirectory(siteSlug);
      if (!fs.existsSync(siteDirectory)) return res.status(404).json({ error: `Site '${siteSlug}' not found` });

      const previewDir = SiteConfigPaths.getPreviewDir(siteDirectory);
      if (!fs.existsSync(previewDir)) {
        return res.json({ files: [] });
      }

      const result = await runGitHtmlSectionDiffNative(previewDir);
      res.json(result);
    } catch (error) {
      logger.error('Error getting preview HTML section changes:', error);
      next(error);
    }
  })().catch(next);
});

// Get file content (works for both conf and preview directories)
app.get('/api/site/:siteSlug/file-content', (req, res, next) => {
  try {
    const { siteSlug } = req.params;
    const filePath = req.query.path as string;
    
    if (!siteSlug) {
      return res.status(400).json({ error: 'siteSlug is required' });
    }
    
    if (!filePath) {
      return res.status(400).json({ error: 'path query parameter is required' });
    }

    const siteDirectory = getSiteDirectory(siteSlug);
    
    if (!fs.existsSync(siteDirectory)) {
      return res.status(404).json({ error: `Site '${siteSlug}' not found` });
    }

    // Security: ensure path is within the site directory
    const normalizedPath = fs.realpathSync(filePath);
    const normalizedSiteDir = fs.realpathSync(siteDirectory);
    
    if (!normalizedPath.startsWith(normalizedSiteDir)) {
      return res.status(403).json({ error: 'Access denied - path outside site directory' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'Cannot read directory content' });
    }

    const { content, fileType, mimeType } = readFileContent(filePath);
    res.json({ content, path: filePath, fileType, mimeType });
    
  } catch (error) {
    logger.error('Error reading file:', error);
    next(error);
  }
});

// Get original (committed) file content for diff comparison
app.get('/api/site/:siteSlug/file-original', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      const filePath = req.query.path as string;
      
      if (!siteSlug) {
        return res.status(400).json({ error: 'siteSlug is required' });
      }
      
      if (!filePath) {
        return res.status(400).json({ error: 'path query parameter is required' });
      }

      const siteDirectory = getSiteDirectory(siteSlug);
      
      if (!fs.existsSync(siteDirectory)) {
        return res.status(404).json({ error: `Site '${siteSlug}' not found` });
      }

      // Security: ensure path is within the site directory (handle non-existent files)
      // Use realpathSync for both to handle macOS /var -> /private/var symlink consistently.
      // For the file path, resolve what exists (the parent dir) to handle deleted files.
      const normalizedSiteDir = fs.realpathSync(siteDirectory);
      const fileDir = path.dirname(filePath);
      const resolvedPath = fs.existsSync(filePath)
        ? fs.realpathSync(filePath)
        : fs.existsSync(fileDir)
          ? path.join(fs.realpathSync(fileDir), path.basename(filePath))
          : path.resolve(filePath);

      if (!resolvedPath.startsWith(normalizedSiteDir)) {
        return res.status(403).json({ error: 'Access denied - path outside site directory' });
      }

      const { content, isNew, fileType, mimeType } = await getOriginalContent(filePath);
      res.json({ content, path: filePath, isNew, fileType, mimeType });
      
    } catch (error) {
      logger.error('Error reading original file:', error);
      next(error);
    }
  })().catch(next);
});

// === Config File Explorer Git History API (fast_git_ops) ===

// Directory change log (like `git log -- <dir>`)
app.get('/api/site/:siteSlug/git/dir-log', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      const dir = req.query.dir as string;
      const limit = Number(req.query.limit ?? 50) || 50;

      if (!siteSlug) return res.status(400).json({ error: 'siteSlug is required' });
      if (!dir) return res.status(400).json({ error: 'dir query parameter is required' });

      const siteDirectory = getSiteDirectory(siteSlug);
      if (!fs.existsSync(siteDirectory)) return res.status(404).json({ error: `Site '${siteSlug}' not found` });

      const normalizedSiteDir = fs.realpathSync(siteDirectory);
      const normalizedDir = fs.realpathSync(dir);
      if (!normalizedDir.startsWith(normalizedSiteDir)) {
        return res.status(403).json({ error: 'Access denied - dir outside site directory' });
      }

      const result = await runGitDirLogNative(normalizedDir, limit);
      res.json(result);
    } catch (error) {
      logger.error('Error getting dir log:', error);
      next(error);
    }
  })().catch(next);
});

// Commit changed files (all files in commit)
app.get('/api/site/:siteSlug/git/commit-files', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      const sha = req.query.sha as string;
      const contextDir = req.query.contextDir as string;

      if (!siteSlug) return res.status(400).json({ error: 'siteSlug is required' });
      if (!sha) return res.status(400).json({ error: 'sha query parameter is required' });
      if (!contextDir) return res.status(400).json({ error: 'contextDir query parameter is required' });

      const siteDirectory = getSiteDirectory(siteSlug);
      if (!fs.existsSync(siteDirectory)) return res.status(404).json({ error: `Site '${siteSlug}' not found` });

      const normalizedSiteDir = fs.realpathSync(siteDirectory);
      const normalizedContextDir = fs.realpathSync(contextDir);
      if (!normalizedContextDir.startsWith(normalizedSiteDir)) {
        return res.status(403).json({ error: 'Access denied - contextDir outside site directory' });
      }

      const gitRoot = findGitRoot(normalizedContextDir);
      if (!gitRoot) return res.status(400).json({ error: 'Not in a git repository' });
      const normalizedGitRoot = fs.realpathSync(gitRoot);
      // It's valid for the git root to be an ancestor of the site directory (e.g. repo at ~/.config/meadow).
      // We still enforce that all requested paths remain within the site directory.
      if (!normalizedSiteDir.startsWith(normalizedGitRoot)) {
        return res.status(403).json({ error: 'Access denied - site directory outside git root' });
      }

      const result = await runGitCommitFilesNative(normalizedContextDir, sha);
      const files = (result.files || []).map((f) => {
        const absPath = path.join(normalizedGitRoot, f.path);
        const relFromContext = path.relative(normalizedContextDir, absPath);
        const outsideContextDir = relFromContext.startsWith('..' + path.sep) || relFromContext === '..';
        return {
          repoPath: f.path,
          path: absPath,
          status: f.status,
          relFromContext,
          outsideContextDir,
        };
      });

      res.json({ sha: result.sha, parent_sha: result.parent_sha, files });
    } catch (error) {
      logger.error('Error getting commit files:', error);
      next(error);
    }
  })().catch(next);
});

// Diff HTML sections for a specific commit vs its parent, scoped to a context directory
app.get('/api/site/:siteSlug/git/html-section-diff', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      const sha = req.query.sha as string;
      const contextDir = req.query.contextDir as string;

      if (!siteSlug) return res.status(400).json({ error: 'siteSlug is required' });
      if (!sha) return res.status(400).json({ error: 'sha query parameter is required' });
      if (!contextDir) return res.status(400).json({ error: 'contextDir query parameter is required' });

      const siteDirectory = getSiteDirectory(siteSlug);
      if (!fs.existsSync(siteDirectory)) return res.status(404).json({ error: `Site '${siteSlug}' not found` });

      const normalizedSiteDir = fs.realpathSync(siteDirectory);
      const normalizedContextDir = fs.realpathSync(contextDir);
      if (!normalizedContextDir.startsWith(normalizedSiteDir)) {
        return res.status(403).json({ error: 'Access denied - contextDir outside site directory' });
      }

      const result = await runGitHtmlSectionDiffNative(normalizedContextDir, sha);
      res.json(result);
    } catch (error) {
      logger.error('Error diffing HTML sections for commit:', error);
      next(error);
    }
  })().catch(next);
});

// File content at a specific commit (for commit viewer)
app.get('/api/site/:siteSlug/git/commit-file-content', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      const sha = req.query.sha as string;
      const filePath = req.query.path as string;
      const contextDir = (req.query.contextDir as string) || path.dirname(filePath || '');

      if (!siteSlug) return res.status(400).json({ error: 'siteSlug is required' });
      if (!sha) return res.status(400).json({ error: 'sha query parameter is required' });
      if (!filePath) return res.status(400).json({ error: 'path query parameter is required' });

      const siteDirectory = getSiteDirectory(siteSlug);
      if (!fs.existsSync(siteDirectory)) return res.status(404).json({ error: `Site '${siteSlug}' not found` });

      const normalizedSiteDir = fs.realpathSync(siteDirectory);
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(normalizedSiteDir)) {
        return res.status(403).json({ error: 'Access denied - path outside site directory' });
      }

      const gitRoot = findGitRoot(resolvedPath);
      if (!gitRoot) return res.status(400).json({ error: 'Not in a git repository' });
      const normalizedGitRoot = fs.realpathSync(gitRoot);
      if (!normalizedSiteDir.startsWith(normalizedGitRoot)) {
        return res.status(403).json({ error: 'Access denied - site directory outside git root' });
      }

      const repoRel = path.relative(normalizedGitRoot, resolvedPath).replace(/\\/g, '/');
      const cat = await runGitCatFileNative(contextDir, sha, repoRel);

      const fileType = detectFileType(resolvedPath);
      if (!cat.found) {
        return res.json({ content: '', path: resolvedPath, fileType });
      }

      if (fileType === 'binary') {
        return res.json({ content: '', path: resolvedPath, fileType: 'binary' });
      }

      if (fileType === 'image') {
        const mimeType = getMimeType(resolvedPath);
        const content = cat.data_base64 ? `data:${mimeType};base64,${cat.data_base64}` : '';
        return res.json({ content, path: resolvedPath, fileType: 'image', mimeType });
      }

      const content = cat.data_base64 ? Buffer.from(cat.data_base64, 'base64').toString('utf-8') : '';
      return res.json({ content, path: resolvedPath, fileType: 'text' });
    } catch (error) {
      logger.error('Error reading commit file content:', error);
      next(error);
    }
  })().catch(next);
});

// File content at parent of a commit (for commit viewer diffs)
app.get('/api/site/:siteSlug/git/commit-file-original', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      const sha = req.query.sha as string;
      const parentSha = (req.query.parentSha as string) || null;
      const filePath = req.query.path as string;
      const contextDir = (req.query.contextDir as string) || path.dirname(filePath || '');

      if (!siteSlug) return res.status(400).json({ error: 'siteSlug is required' });
      if (!sha) return res.status(400).json({ error: 'sha query parameter is required' });
      if (!filePath) return res.status(400).json({ error: 'path query parameter is required' });

      const siteDirectory = getSiteDirectory(siteSlug);
      if (!fs.existsSync(siteDirectory)) return res.status(404).json({ error: `Site '${siteSlug}' not found` });

      const normalizedSiteDir = fs.realpathSync(siteDirectory);
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(normalizedSiteDir)) {
        return res.status(403).json({ error: 'Access denied - path outside site directory' });
      }

      const gitRoot = findGitRoot(resolvedPath);
      if (!gitRoot) return res.status(400).json({ error: 'Not in a git repository' });
      const normalizedGitRoot = fs.realpathSync(gitRoot);
      if (!normalizedSiteDir.startsWith(normalizedGitRoot)) {
        return res.status(403).json({ error: 'Access denied - site directory outside git root' });
      }

      const resolvedParentSha =
        parentSha ||
        (await runGitCommitFilesNative(contextDir, sha)).parent_sha ||
        null;

      const fileType = detectFileType(resolvedPath);
      const mimeType = fileType === 'image' ? getMimeType(resolvedPath) : undefined;

      if (!resolvedParentSha) {
        return res.json({ content: null, path: resolvedPath, isNew: true, fileType, mimeType });
      }

      const repoRel = path.relative(normalizedGitRoot, resolvedPath).replace(/\\/g, '/');
      const cat = await runGitCatFileNative(contextDir, resolvedParentSha, repoRel);

      if (!cat.found) {
        return res.json({ content: null, path: resolvedPath, isNew: true, fileType, mimeType });
      }

      if (fileType === 'binary') {
        return res.json({ content: null, path: resolvedPath, isNew: false, fileType: 'binary' });
      }

      if (fileType === 'image') {
        const content = cat.data_base64 ? `data:${mimeType};base64,${cat.data_base64}` : null;
        return res.json({ content, path: resolvedPath, isNew: false, fileType: 'image', mimeType });
      }

      const content = cat.data_base64 ? Buffer.from(cat.data_base64, 'base64').toString('utf-8') : '';
      return res.json({ content, path: resolvedPath, isNew: false, fileType: 'text' });
    } catch (error) {
      logger.error('Error reading commit file original:', error);
      next(error);
    }
  })().catch(next);
});

// Single-file log (newest-first, no merges)
app.get('/api/site/:siteSlug/git/file-log', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      const filePath = req.query.path as string;
      const limit = Number(req.query.limit ?? 50) || 50;

      if (!siteSlug) return res.status(400).json({ error: 'siteSlug is required' });
      if (!filePath) return res.status(400).json({ error: 'path query parameter is required' });

      const siteDirectory = getSiteDirectory(siteSlug);
      if (!fs.existsSync(siteDirectory)) return res.status(404).json({ error: `Site '${siteSlug}' not found` });

      const normalizedSiteDir = fs.realpathSync(siteDirectory);
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(normalizedSiteDir)) {
        return res.status(403).json({ error: 'Access denied - path outside site directory' });
      }

      const gitRoot = findGitRoot(resolvedPath);
      if (!gitRoot) return res.status(400).json({ error: 'Not in a git repository' });
      const normalizedGitRoot = fs.realpathSync(gitRoot);
      if (!normalizedSiteDir.startsWith(normalizedGitRoot)) {
        return res.status(403).json({ error: 'Access denied - site directory outside git root' });
      }

      const repoRel = path.relative(normalizedGitRoot, resolvedPath).replace(/\\/g, '/');
      const result = await runGitFileLogNative(path.dirname(resolvedPath), repoRel, limit);
      res.json(result);
    } catch (error) {
      logger.error('Error getting file log:', error);
      next(error);
    }
  })().catch(next);
});

// Get normalized page name (applies user-defined hook transformations)
app.get('/api/site/:siteSlug/normalize-page-name', (req, res, next) => {
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
app.get('/api/site/:siteSlug/source-file/*', (req, res, next) => {
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

    const filePath = join(sourceDirectory, filename);
    
    if (!fs.existsSync(filePath)) {
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
app.get('/api/site/:siteSlug/published/*', (req, res, next) => {
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

    // Send the file
    res.sendFile(filePath);
    
  } catch (error) {
    next(error);
  }
});

// List all site slugs (folder names in data/sites)
app.get('/api/sites', (req, res, next) => {
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

// Get recent backend logs (optionally filtered by siteGuid)
app.get('/api/logs', (req, res) => {
  const sinceBytesRaw = typeof req.query.sinceBytes === 'string' ? req.query.sinceBytes : undefined;
  const limitLinesRaw = typeof req.query.limitLines === 'string' ? req.query.limitLines : undefined;
  const siteGuid = typeof req.query.siteGuid === 'string' ? req.query.siteGuid.trim() : undefined;
  const siteFilter = typeof req.query.siteFilter === 'string' ? req.query.siteFilter.trim() : undefined;

  const sinceBytes = sinceBytesRaw ? Number.parseInt(sinceBytesRaw, 10) : 0;
  const limitLines = limitLinesRaw ? Number.parseInt(limitLinesRaw, 10) : 500;

  const homedir = process.env.HOME || process.env.USERPROFILE || '';
  const logPath = join(homedir, 'Library', 'Logs', 'Meadow', 'meadow.log');

  if (!fs.existsSync(logPath)) {
    return res.json({
      lines: [],
      nextSinceBytes: 0,
      fileSize: 0,
      truncated: false,
      droppedLines: 0
    });
  }

  let fileSize = 0;
  try {
    fileSize = fs.statSync(logPath).size;
  } catch {
    return res.status(500).json({ error: 'Failed to stat meadow.log' });
  }

  const safeSince = Number.isFinite(sinceBytes) && sinceBytes >= 0 ? sinceBytes : 0;
  let start = safeSince > fileSize ? 0 : safeSince;

  const maxBytes = 2 * 1024 * 1024; // 2MB safety cap per request
  let truncated = false;
  if (fileSize - start > maxBytes) {
    truncated = true;
    start = Math.max(0, fileSize - maxBytes);
  }

  let chunk = '';
  try {
    const fd = fs.openSync(logPath, 'r');
    try {
      const bytesToRead = fileSize - start;
      const buffer = Buffer.alloc(bytesToRead);
      const bytesRead = fs.readSync(fd, buffer, 0, bytesToRead, start);
      chunk = buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return res.status(500).json({ error: 'Failed to read meadow.log' });
  }

  // If we started mid-file, drop the first partial line (until first newline)
  if (start > 0) {
    const firstNewline = chunk.indexOf('\n');
    if (firstNewline !== -1) {
      chunk = chunk.slice(firstNewline + 1);
    } else {
      chunk = '';
    }
  }

  const rawLines = chunk.split('\n').filter(l => l.trim().length > 0);
  const filterToken = siteFilter || (siteGuid ? `[site ${siteGuid}]` : undefined);
  const filteredLines = filterToken ? rawLines.filter(l => l.includes(filterToken)) : rawLines;

  const safeLimit = Number.isFinite(limitLines) ? Math.max(1, Math.min(limitLines, 5000)) : 500;
  let lines = filteredLines;
  let droppedLines = 0;
  if (lines.length > safeLimit) {
    droppedLines = lines.length - safeLimit;
    lines = lines.slice(lines.length - safeLimit);
  }

  res.json({
    lines,
    nextSinceBytes: fileSize,
    fileSize,
    truncated,
    droppedLines
  });
});

// Get site config from site_config.yaml. Provider-specific fields live
// under each provider's /api/publishing-providers/{id}/sites/{slug}/... —
// core deliberately doesn't merge them in.
app.get('/api/sites/:slug/config', (req, res, next) => {
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
app.get('/api/sites/:slug/obsidian-info', (req, res, next) => {
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
app.get('/api/sites-detailed', (req, res, next) => {
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
app.get('/api/sites/directories', (req, res, next) => {
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
app.get('/api/site/:siteSlug/tracks-page', (req, res, next) => {
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

// Search for pages in a source directory by name
// Returns all matching pages with their full paths (for handling duplicates)
app.get('/api/search-pages-in-source', (req, res, next) => {
  (async () => {
    const { sourceDirectory, pageName } = req.query;

    if (!sourceDirectory || typeof sourceDirectory !== 'string') {
      return res.status(400).json({ error: 'sourceDirectory is required' });
    }

    if (!pageName || typeof pageName !== 'string') {
      return res.status(400).json({ error: 'pageName is required' });
    }

    // Strip .md extension if present (users sometimes include it by mistake)
    const cleanPageName = pageName.replace(/\.md$/i, '');

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
app.get('/api/source-pages-in-source', (req, res, next) => {
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
app.get('/api/search-source-pages', (req, res, next) => {
  (async () => {
    const { sourceDirectory, query, limit } = req.query;

    if (!sourceDirectory || typeof sourceDirectory !== 'string') {
      return res.status(400).json({ error: 'sourceDirectory is required' });
    }

    const rawQuery = typeof query === 'string' ? query : '';
    // Strip .md extension if present (users sometimes include it by mistake).
    const cleanQuery = rawQuery.replace(/\.md$/i, '');

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
app.post('/api/sites/:slug/archive', (req, res, next) => {
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
app.post('/api/sites/:slug/unarchive', (req, res, next) => {
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
app.get('/api/sites/:slug/delete-site-stream', (req, res, _next) => {
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
app.delete('/api/sites/:slug', (req, res, next) => {
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
app.post('/api/sites/add-example', (req, res, next) => {
  try {
    // Find a unique slug: example-site, example-site-1, example-site-2, ...
    const slug = findUniqueName('example-site', (name) => fs.existsSync(getSiteDirectory(name)));

    // Resolve paths to bundled example data
    const isDev = process.env.MEADOW_IS_DEV === 'true';
    let sourceGraphSrc: string;
    let fixtureSrc: string;

    if (isDev) {
      // Dev: backend cwd is app/backend, so go up to find shared_data
      const projectRoot = join(__dirname, '..', '..');  // from backend/src → app/
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
app.post('/api/sites', (req, res, _next) => {
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
app.put('/api/sites/:slug', (req, res, next) => {
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
app.patch('/api/sites/:slug/notes', (req, res, next) => {
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

// Update publish options (breadcrumbs, backlinks, tags)
app.patch('/api/sites/:slug/generation-options', (req, res, next) => {
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
          logger.warn('[generation-options] Failed to commit config change:', commitError);
        }
      })();
    }

    res.json({ success: true, message: 'Publish options updated successfully' });
  } catch (error) {
    next(error);
  }
});

// Version management endpoints

// Get all versions for a site
app.get('/api/site/:siteSlug/versions', (req, res, next) => {
  try {
    const { siteSlug } = req.params;
    
    if (!siteSlug) {
      return res.status(400).json({ error: 'siteSlug is required' });
    }

    const versionsPath = getSiteConfigPath(siteSlug, 'generated_site_versions.yaml');
    
    if (!fs.existsSync(versionsPath)) {
      return res.json({ versions: [] });
    }

    const versionsData = loadYamlFromPath<{ versions: GeneratedSiteVersion[] }>(versionsPath);
    
    res.json(versionsData);
  } catch (error) {
    next(error);
  }
});

// Mark page as sensitive/non-sensitive
app.patch('/api/site/:siteSlug/page/:pageTitle/sensitive', (req, res, next) => {
  try {
    const { siteSlug, pageTitle } = req.params;
    const { isSensitive } = req.body as { isSensitive: boolean };

    if (!siteSlug || !pageTitle) {
      return res.status(400).json({ error: 'siteSlug and pageTitle are required' });
    }

    if (typeof isSensitive !== 'boolean') {
      return res.status(400).json({ error: 'isSensitive must be a boolean' });
    }

    // Get site configuration to find the source directory
    const siteDirectory = getSiteDirectory(siteSlug);
    if (!fs.existsSync(siteDirectory)) {
      return res.status(404).json({ error: `Site '${siteSlug}' not found` });
    }

    const configPath = getSiteConfigPath(siteSlug);
    let notesDir = '';
    try {
      if (!fs.existsSync(configPath)) {
        return res.status(500).json({ error: `site_config.yaml not found for slug ${siteSlug}` });
      }
      const yamlContent = fs.readFileSync(configPath, 'utf8');
      const config = YAML.parse(yamlContent) as { sourceDirectory?: string };
      if (config && typeof config.sourceDirectory === 'string') {
        notesDir = config.sourceDirectory;
      }
    } catch {
      return res.status(500).json({ error: `Failed to load site configuration for ${siteSlug}` });
    }

    if (!notesDir) {
      return res.status(500).json({ error: `Could not determine source directory for site ${siteSlug}` });
    }

    // Get sourceGraphDirectory from request body (frontend should provide this from page data)
    const { sourceGraphDirectory } = req.body as { isSensitive: boolean; sourceGraphDirectory?: string };

    // Construct the full path using the sourceGraphDirectory information
    let markdownPath = '';
    if (sourceGraphDirectory && sourceGraphDirectory.trim()) {
      markdownPath = join(notesDir, sourceGraphDirectory, `${pageTitle}.md`);
    } else {
      markdownPath = join(notesDir, `${pageTitle}.md`);
    }
    
    if (!fs.existsSync(markdownPath)) {
      return res.status(404).json({ error: `Page file not found: ${markdownPath}` });
    }

    // Update the sensitive property in the file
    try {
      FrontmatterUtils.updateSensitiveProperty(markdownPath, isSensitive);
      
      res.json({
        success: true,
        message: `Page '${pageTitle}' marked as ${isSensitive ? 'sensitive' : 'non-sensitive'}`,
        pageTitle,
        isSensitive
      });
    } catch (error) {
      logger.error('Error updating sensitive property:', error);
      return res.status(500).json({ 
        error: 'Failed to update sensitive property',
        details: error instanceof Error ? error.message : String(error)
      });
    }
    
  } catch (error) {
    next(error);
  }
});

// Update version notes
app.patch('/api/site/:siteSlug/versions/:versionId', (req, res, next) => {
  try {
    const { siteSlug, versionId } = req.params;
    const { notes } = req.body as { notes: string };
    
    if (!siteSlug || !versionId) {
      return res.status(400).json({ error: 'siteSlug and versionId are required' });
    }

    const versionsPath = getSiteConfigPath(siteSlug, 'generated_site_versions.yaml');
    
    if (!fs.existsSync(versionsPath)) {
      return res.status(404).json({ error: 'No versions found for this site' });
    }

    const versionsData = loadYamlFromPath<{ versions: GeneratedSiteVersion[] }>(versionsPath);
    
    const versionIndex = versionsData.versions.findIndex(v => v.versionId === versionId);
    if (versionIndex === -1) {
      return res.status(404).json({ error: 'Version not found' });
    }

    versionsData.versions[versionIndex].notes = notes;
    versionsData.versions[versionIndex].lastUpdatedAt = new Date().toISOString();

    saveYamlToPath(versionsPath, versionsData);

    res.json({ success: true, message: 'Version notes updated successfully' });
  } catch (error) {
    next(error);
  }
});

// Delete a version
app.delete('/api/site/:siteSlug/versions/:versionId', (req, res, next) => {
  try {
    const { siteSlug, versionId } = req.params;
    
    if (!siteSlug || !versionId) {
      return res.status(400).json({ error: 'siteSlug and versionId are required' });
    }

    const versionsPath = getSiteConfigPath(siteSlug, 'generated_site_versions.yaml');
    
    if (!fs.existsSync(versionsPath)) {
      return res.status(404).json({ error: 'No versions found for this site' });
    }

    const yamlContent = fs.readFileSync(versionsPath, 'utf8');
    const versionsData = YAML.parse(yamlContent) as { versions: GeneratedSiteVersion[] };
    
    const versionIndex = versionsData.versions.findIndex(v => v.versionId === versionId);
    if (versionIndex === -1) {
      return res.status(404).json({ error: 'Version not found' });
    }

    // Don't allow deleting the active version
    if (versionsData.versions[versionIndex].isActive) {
      return res.status(400).json({ error: 'Cannot delete the active version' });
    }

    // Remove the version from the array
    versionsData.versions.splice(versionIndex, 1);

    // Delete the published directory
    const publishedDir = join(getSiteHtmlDirectory(siteSlug), 'published', versionId);
    if (fs.existsSync(publishedDir)) {
      fs.rmSync(publishedDir, { recursive: true, force: true });
    }

    const updatedYaml = YAML.stringify(versionsData);
    fs.writeFileSync(versionsPath, updatedYaml, 'utf8');

    res.json({ success: true, message: 'Version deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Set active version
app.post('/api/site/:siteSlug/versions/:versionId/set-active', (req, res, next) => {
  try {
    const { siteSlug, versionId } = req.params;
    
    if (!siteSlug || !versionId) {
      return res.status(400).json({ error: 'siteSlug and versionId are required' });
    }

    const versionsPath = getSiteConfigPath(siteSlug, 'generated_site_versions.yaml');
    
    if (!fs.existsSync(versionsPath)) {
      return res.status(404).json({ error: 'No versions found for this site' });
    }

    const yamlContent = fs.readFileSync(versionsPath, 'utf8');
    const versionsData = YAML.parse(yamlContent) as { versions: GeneratedSiteVersion[] };
    
    const versionIndex = versionsData.versions.findIndex(v => v.versionId === versionId);
    if (versionIndex === -1) {
      return res.status(404).json({ error: 'Version not found' });
    }

    // Set all versions to inactive
    versionsData.versions.forEach(v => v.isActive = false);
    
    // Set the specified version as active
    versionsData.versions[versionIndex].isActive = true;

    const updatedYaml = YAML.stringify(versionsData);
    fs.writeFileSync(versionsPath, updatedYaml, 'utf8');

    res.json({ success: true, message: 'Active version updated successfully' });
  } catch (error) {
    next(error);
  }
});

// Centralized error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("Unhandled error:", err.stack || err.message);
  if (res.headersSent) {
    logger.error("Headers already sent, cannot send error response for:", req.path);
    return; 
  }
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    port: port,
    uptime: process.uptime()
  });
});

async function startServer(): Promise<void> {
  // Log app lifecycle startup message
  const appVersion = process.env.MEADOW_APP_VERSION || 'unknown';
  const isDev = process.env.MEADOW_IS_DEV === 'true';
  const buildType = isDev ? 'development' : 'production';
  logger.info(`[lifecycle] Meadow v${appVersion} starting (${buildType} build)`);

  // Ensure the config-dir git repo (and its .gitignore) exists BEFORE anything
  // commits. Migrations' pre-migration commit used to auto-init the repo on
  // demand via commitChangesNative, which did NOT create a .gitignore — so
  // per-instance files like app/resources.local.yaml and
  // app/secret_app_config.yaml were getting tracked in the initial commit and
  // then flagged as modified forever after. Calling initRepo() here is
  // idempotent (no-op when a repo already exists) and writes the .gitignore
  // on first init so those files are excluded from the very first commit.
  const configDir = getConfigDirectory();
  await new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, configDir).initRepo();

  await runMigrationsOnStartup();
  // Ensure app/app_config.yaml exists and contains defaults for new settings.
  // Commit any changes (either newly created OR patched with new defaults)
  // so git history reflects the real config state.
  const appConfigExistedBefore = appConfigFileExists(configDir);
  const { wasPatched: appConfigWasPatched } = ensureAppConfigInitialized(configDir, isDev);

  if (appConfigWasPatched && appConfigFileExists(configDir)) {
    const gitUtils = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, configDir);
    const message = appConfigExistedBefore
      ? 'patch app config with new defaults'
      : 'initial app config';
    await gitUtils.addAndCommit(AppConfigPaths.relative.appConfigFile(), message);
  }

  // Ensure default global filters are seeded (e.g., daily notes sensitive filter).
  // Commit any changes so the backend-created file doesn't linger as an
  // uncommitted-new entry in git from tick 1 onward.
  const globalFiltersPath = getGlobalCustomFiltersPath(configDir);
  const globalFiltersExistedBefore = fs.existsSync(globalFiltersPath);
  const { wasPatched: globalFiltersWasPatched } = ensureDefaultGlobalFiltersInitialized(configDir);

  if (globalFiltersWasPatched && fs.existsSync(globalFiltersPath)) {
    const gitUtils = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, configDir);
    const message = globalFiltersExistedBefore
      ? 'patch global custom filters with new defaults'
      : 'initial global custom filters';
    await gitUtils.addAndCommit('app/global_custom_filters.json', message);
  }

  // Ensure resources config exists and contains defaults
  const resourcesFilePath = AppConfigPaths.getResourcesFile(configDir);
  const resourcesExistedBefore = fs.existsSync(resourcesFilePath);
  const { wasPatched: resourcesWasPatched } = ensureResourcesConfigInitialized(configDir);

  if (resourcesWasPatched && fs.existsSync(resourcesFilePath)) {
    const gitUtils = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, configDir);
    const message = resourcesExistedBefore
      ? 'patch resources config with new defaults'
      : 'initial resources config';
    await gitUtils.addAndCommit(AppConfigPaths.relative.resourcesFile(), message);
  }

  // Let each publishing provider seed its own pp_resources.yaml (DNS names,
  // buckets, etc.) so provider-specific infra doesn't leak into core.
  ensureAllProviderResourcesInitialized(configDir, isDev);

  // Apply log directory override if configured in resources
  const resourcesConfig = loadResources();
  if (resourcesConfig.logDirectory) {
    setLogDirectoryOverride(resourcesConfig.logDirectory);
  }

  // Read port from resources config (written by Electron or defaulted by ensureResourcesConfigInitialized)
  if (!resourcesConfig.backendPort) {
    throw new Error('backendPort not found in resources config');
  }
  port = resourcesConfig.backendPort;

  // Apply log level override if configured
  const appConfig = loadAppConfigFromDisk(getConfigDirectory());
  if (appConfig.logLevelOverride) {
    logger.setLevel(appConfig.logLevelOverride);
    logger.info(`[lifecycle] Log level overridden to '${appConfig.logLevelOverride}'`);
  }

  // Start log rotation and cleanup service
  startLogMaintenance(getConfigDirectory());
  // Start the intermittent auto-commit background task
  // startIntermittentAutoCommit();
  app.listen(port, () => {
    logger.info(`Server running at http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

// Graceful shutdown handling
function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  stopLogMaintenance();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Orphan detection: exit if parent process dies (parent PID becomes 1 on Unix/macOS)
// This protects against cases where the Electron app crashes or is killed without cleanup
const originalPpid = process.ppid;
if (originalPpid && originalPpid !== 1) {
  const orphanCheckInterval = setInterval(() => {
    if (process.ppid === 1 || process.ppid !== originalPpid) {
      logger.warn(`Parent process died (was ${originalPpid}, now ${process.ppid}), exiting...`);
      clearInterval(orphanCheckInterval);
      shutdown('ORPHAN');
    }
  }, 5000); // Check every 5 seconds
}
