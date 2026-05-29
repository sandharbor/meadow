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
import { join } from 'path';
import YAML from 'yaml';
import fs from 'fs';
import { parsePageConfig } from '../../../../../../shared_code/utils/sitePageConfigUtils.js';
import { canonicalPageFilename, sourceFileCandidateFilenames } from '../../../../../../shared_code/utils/fileTypeUtils.js';
import { SitePageConfig } from '../../../../../../shared_code/types/sitePageConfig.js';
import { FileType, FILE_TYPES } from '../../../../../../shared_code/types/FileType.js';
import { ISitePage } from '../../../../../../shared_code/types/ISitePage.js';
import { loadAppConfig as loadAppConfigFromDisk } from '../../../../../../shared_code/utils/appConfigUtils.js';
import type { PageTraversalDetails } from '../../../../../types/pageFileGraph.js';
import { getConfigDirectory, getSiteDirectory, getSiteConfigPath, getSiteRawDirectory } from '../../../../shared/site-config/siteConfigPaths.js';
import { runWorkingGraphRaw } from '../../../../shared/utils/workingGraphUtils.js';
import { commitChangesNative } from '../../../../shared/utils/configDirectory/gitUtils/gitStatusUtils.js';
import { FrontmatterUtils } from '../../../../shared/utils/frontmatterUtils.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';

const router = express.Router();

const loadAppConfig = () => loadAppConfigFromDisk(getConfigDirectory());

// Copy tracked pages to site's tracked_page_content directory
router.post('/sites/:siteSlug/curation/copy-tracked-pages', (req, res, next) => {
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
        const filename = canonicalPageFilename(page.title, page.file_type);
        const sourceFile = sourceFileCandidateFilenames(page.title, page.file_type)
          .map(candidateFilename => join(notesDir, page.sourceGraphSubdirectory, candidateFilename))
          .find(candidatePath => fs.existsSync(candidatePath));
        const targetFile = join(targetDir, filename);

        if (sourceFile) {
          fs.copyFileSync(sourceFile, targetFile);
          copiedFiles.push(page.title);
        } else {
          errors.push(`Source file not found: ${join(notesDir, page.sourceGraphSubdirectory, filename)}`);
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

router.get('/sites/:siteSlug/curation/working-graph', (req, res, next) => {
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

// Mark page as sensitive/non-sensitive
router.patch('/sites/:siteSlug/curation/page/:pageTitle/sensitive', (req, res, next) => {
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

export default router;
