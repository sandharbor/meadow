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

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parseSiteNodeConfig, resolveSiteNodeRoles } from '../../../../../../shared_code/utils/siteNodeConfigUtils.js';
import { canonicalPageFilename, sourceFileCandidateFilenames } from '../../../../../../shared_code/utils/fileTypeUtils.js';
import { FileSiteNodeConfig, SiteNodeConfig } from '../../../../../../shared_code/types/siteNodeConfig.js';
import type { SiteNodeId } from '../../../../../../shared_code/types/siteNodeConfig.js';
import { stringifySiteNodeConfig } from '../../../../../../shared_code/utils/siteNodeConfigUtils.js';
import { SiteConfigPaths } from '../../../../../../shared_code/paths/siteConfigPaths.js';
import { loadSiteConfig } from '../../../../shared/utils/siteConfigUtils.js';
import { loadAppConfig } from '../../../../../../shared_code/utils/appConfigUtils.js';
import { resolveEffectiveGenerationOptions } from '../../../../../../shared_code/utils/generationOptionsUtils.js';
import { getConfigDirectory } from '../../../../shared/site-config/siteConfigPaths.js';
import {
  extractObsidianTagsFromMarkdown,
  listMarkdownFilesRecursive,
  normalizeTagToKey,
  rewriteObsidianTagsToWikiLinks,
  tagKeyToPageTitle
} from './tagPages.js';
import {
  ensureSrsCardGuidsInMarkdown,
  pageMatchesConfiguredSrsTags,
} from '../render-source/srsMarkdown.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';
import { runWorkingGraphRaw } from '../../../../shared/utils/workingGraphUtils.js';

export interface PreparedGenerationSourceMaterial {
  sourceContentDirectory: string;
  siteNodeConfigPath: string;
  tagPageCount: number;
}

function generatedTagSiteNodeId(
  siteIdentity: string,
  siteNodeName: string,
  assignedIds: Set<string>,
): SiteNodeId {
  for (let salt = 0; ; salt += 1) {
    const candidate = crypto.createHash('sha256')
      .update(`${siteIdentity}\0${SiteConfigPaths.TAGPAGE_SOURCE_STAGING_DIR}\0${siteNodeName}\0${salt}`)
      .digest('hex')
      .slice(0, 12);
    if (!assignedIds.has(candidate)) return candidate as SiteNodeId;
  }
}

type FolderGenerationNode = {
  siteNodeKey: string;
  siteNodeId?: string;
  siteNodeKind: 'file' | 'folder' | 'collection';
  siteNodeName: string;
  sourceGraphSubdirectory?: string;
  fileType?: FileSiteNodeConfig['fileType'];
  effectiveBlacklistingSiteNodeId?: string;
  remaining_depth: number;
  remaining_inlinks_depth?: number;
};

type FolderGenerationOutput = {
  nodes: FolderGenerationNode[];
};

function generatedFolderSiteNodeId(
  siteIdentity: string,
  siteNodeKey: string,
  assignedIds: Set<string>,
): SiteNodeId {
  for (let salt = 0; ; salt += 1) {
    const candidate = crypto.createHash('sha256')
      .update(`${siteIdentity}\0folder-generation\0${siteNodeKey}\0${salt}`)
      .digest('hex')
      .slice(0, 12);
    if (!assignedIds.has(candidate)) return candidate as SiteNodeId;
  }
}

async function materializeFolderGenerationConfigs(options: {
  siteDirectory: string;
  sourceDirectory: string;
  siteNodeConfigPath: string;
  siteNodeConfigs: SiteNodeConfig[];
}): Promise<SiteNodeConfig[]> {
  const { siteDirectory, sourceDirectory, siteNodeConfigPath, siteNodeConfigs } = options;
  const siteConfig = loadSiteConfig(siteDirectory);
  const { entryNode, defaultTraversalNode } = resolveSiteNodeRoles(
    siteNodeConfigs,
    siteConfig,
    SiteConfigPaths.getSiteConfigFile(siteDirectory),
  );
  if (entryNode.siteNodeKind === 'file') return siteNodeConfigs;

  const raw = await runWorkingGraphRaw({
    graphRoot: sourceDirectory,
    siteNodeConfigPath,
    entrySiteNodeId: entryNode.siteNodeId,
    defaultTraversalSiteNodeId: defaultTraversalNode.siteNodeId,
    defaultOutlinksDepth: siteConfig.defaultOutlinksDepth,
    defaultInlinksDepth: siteConfig.defaultInlinksDepth,
    frontierDepth: 0,
    allowImagesToExtendToFrontier: true,
    allowLowerDepths: false,
  });
  const output = JSON.parse(raw) as FolderGenerationOutput;
  const assignedIds = new Set<string>(siteNodeConfigs.map(config => config.siteNodeId));
  const siteIdentity = siteConfig.siteGuid || path.basename(siteDirectory);
  const derivedConfigs: SiteNodeConfig[] = [];
  const derivedNodes = output.nodes
    .filter(node => !node.siteNodeId && !node.effectiveBlacklistingSiteNodeId)
    .sort((left, right) => left.siteNodeKey.localeCompare(right.siteNodeKey));
  for (const node of derivedNodes) {
    const siteNodeId = generatedFolderSiteNodeId(siteIdentity, node.siteNodeKey, assignedIds);
    assignedIds.add(siteNodeId);
    if (node.siteNodeKind === 'file' && node.fileType) {
      derivedConfigs.push({
        siteNodeName: node.siteNodeName,
        ...(node.sourceGraphSubdirectory && { sourceGraphSubdirectory: node.sourceGraphSubdirectory }),
        siteNodeKind: 'file',
        fileType: node.fileType,
        siteNodeId,
        listType: 'whitelist',
        outlinksDepth: node.remaining_depth,
        inlinksDepth: node.remaining_inlinks_depth ?? 0,
      });
    } else if (node.siteNodeKind === 'folder') {
      derivedConfigs.push({
        siteNodeName: node.siteNodeName,
        sourceGraphSubdirectory: node.sourceGraphSubdirectory ?? '',
        siteNodeKind: 'folder',
        siteNodeId,
        listType: 'whitelist',
        outlinksDepth: 0,
        inlinksDepth: 0,
      });
    }
  }
  return [...siteNodeConfigs, ...derivedConfigs];
}

/**
 * Ensures the tracked_page_content directory is populated with files from the source directory.
 * This copies tracked pages (based on site_node_config.yaml) from the source directory to
 * the site's raw/tracked_page_content folder, preserving the directory structure.
 *
 * @param siteDirectory - The site's directory (e.g., /path/to/sites/my-site)
 * @param sourceDirectory - The source graph directory (from site_config.yaml sourceDirectory)
 */
export async function ensureTrackedPageContent(
  siteDirectory: string,
  sourceDirectory: string
): Promise<void> {
  // This function is intentionally `async` (callers `await` it), but it performs synchronous
  // filesystem operations. Keep an `await` to satisfy @typescript-eslint/require-await.
  await Promise.resolve();
  const targetDir = SiteConfigPaths.getTrackedPageContentDir(siteDirectory);
  const trackedSiteNodeConfigPath = SiteConfigPaths.getTrackedSiteNodeConfigFile(siteDirectory);
  const tagPagesSubdirName = SiteConfigPaths.TAGPAGE_SOURCE_STAGING_DIR;
  const siteConfig = loadSiteConfig(siteDirectory);
  const appConfig = loadAppConfig(getConfigDirectory());
  const generationOptions = resolveEffectiveGenerationOptions(appConfig, siteConfig);

  // Read site_node_config.yaml to get tracked page titles
  const siteNodeConfPath = SiteConfigPaths.getSiteNodeConfigFile(siteDirectory);
  if (!fs.existsSync(siteNodeConfPath)) {
    fs.rmSync(trackedSiteNodeConfigPath, { force: true });
    logger.warn('site_node_config.yaml not found, skipping tracked page content sync');
    return;
  }

  const confContent = fs.readFileSync(siteNodeConfPath, 'utf8');
  const persistedSiteNodeConfigs = parseSiteNodeConfig(confContent);
  const siteNodeConfigs = await materializeFolderGenerationConfigs({
    siteDirectory,
    sourceDirectory,
    siteNodeConfigPath: siteNodeConfPath,
    siteNodeConfigs: persistedSiteNodeConfigs,
  });

  if (siteNodeConfigs.length > persistedSiteNodeConfigs.length) {
    fs.mkdirSync(path.dirname(trackedSiteNodeConfigPath), { recursive: true });
    fs.writeFileSync(trackedSiteNodeConfigPath, stringifySiteNodeConfig(siteNodeConfigs), 'utf8');
  } else {
    fs.rmSync(trackedSiteNodeConfigPath, { force: true });
  }

  // Canonical record presence is the sole tracking/registration signal.
  const trackedPages = siteNodeConfigs;

  if (trackedPages.length === 0) {
    logger.warn('No tracked pages found in site_node_config.yaml');
    return;
  }

  // Build expected file paths with subdirectories (excluding generated tag pages, which do not exist in sourceDirectory)
  const expectedFilePaths = new Map<string, FileSiteNodeConfig>();
  const sourceBackedTrackedPages = trackedPages.filter(
    (config): config is FileSiteNodeConfig => config.siteNodeKind === 'file'
      && config.sourceGraphSubdirectory !== tagPagesSubdirName
  );
  for (const siteNodeConfig of sourceBackedTrackedPages) {
    const subdir = siteNodeConfig.sourceGraphSubdirectory || '';
    const filename = canonicalPageFilename(siteNodeConfig.siteNodeName, siteNodeConfig.fileType);
    const relativePath = subdir ? path.join(subdir, filename) : filename;
    expectedFilePaths.set(relativePath, siteNodeConfig);
  }

  if (generationOptions.spacedRepetitionEnabled && generationOptions.spacedRepetitionTags.length > 0) {
    let updatedSourceFileCount = 0;

    for (const [relativePath, conf] of expectedFilePaths) {
      const fileType = conf.fileType || 'md';
      if (fileType !== 'md') {
        continue;
      }

      const sourcePath = path.join(sourceDirectory, relativePath);
      if (!fs.existsSync(sourcePath)) {
        continue;
      }

      try {
        const originalMarkdown = fs.readFileSync(sourcePath, 'utf8');
        if (!pageMatchesConfiguredSrsTags(originalMarkdown, generationOptions.spacedRepetitionTags)) {
          continue;
        }

        const normalizedRelativePath = relativePath.split(path.sep).join('/');
        const withGuids = ensureSrsCardGuidsInMarkdown(originalMarkdown, normalizedRelativePath);
        if (!withGuids.changed) {
          continue;
        }

        fs.writeFileSync(sourcePath, withGuids.markdown, 'utf8');
        updatedSourceFileCount += 1;
      } catch (err) {
        logger.error(
          `Failed to backfill SRS GUIDs into source file "${sourcePath}": ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    if (updatedSourceFileCount > 0) {
      logger.info(`Backfilled SRS GUIDs into ${updatedSourceFileCount} source graph file(s) before syncing tracked content`);
    }
  }

  // Clear the target directory completely to ensure clean state
  // (handles renamed/moved pages that would otherwise leave stale copies)
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true });
  }

  logger.info(`Syncing ${expectedFilePaths.size} tracked pages...`);

  // Create target directory if needed
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Folder nodes have no source body. Recreate only their directory shape so
  // selected/configured empty folders remain materialized for graph building.
  for (const config of trackedPages) {
    if (config.siteNodeKind !== 'folder') continue;
    const sourceFolder = config.sourceGraphSubdirectory
      ? path.join(sourceDirectory, ...config.sourceGraphSubdirectory.split('/'))
      : sourceDirectory;
    if (!fs.existsSync(sourceFolder) || !fs.statSync(sourceFolder).isDirectory()) continue;
    const targetFolder = config.sourceGraphSubdirectory
      ? path.join(targetDir, ...config.sourceGraphSubdirectory.split('/'))
      : targetDir;
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  // Copy tracked pages from source to target, preserving directory structure
  let copiedCount = 0;
  for (const [relativePath, conf] of expectedFilePaths) {
    const fileType = conf.fileType || 'md';

    const subdir = conf.sourceGraphSubdirectory || '';
    const sourcePath = sourceFileCandidateFilenames(conf.siteNodeName, fileType)
      .map(filename => subdir ? path.join(sourceDirectory, subdir, filename) : path.join(sourceDirectory, filename))
      .find(candidatePath => fs.existsSync(candidatePath));

    const targetPath = path.join(targetDir, relativePath);
    const targetSubdir = path.dirname(targetPath);

    // Create subdirectory if needed
    if (targetSubdir !== targetDir && !fs.existsSync(targetSubdir)) {
      fs.mkdirSync(targetSubdir, { recursive: true });
    }

    // Only copy if source exists
    if (sourcePath) {
      try {
        fs.copyFileSync(sourcePath, targetPath);
        copiedCount++;
      } catch (err) {
        logger.error(`Failed to copy "${conf.siteNodeName}": ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      logger.warn(`Tracked page "${conf.siteNodeName}" (${fileType}) not found at: ${path.join(sourceDirectory, relativePath)}`);
    }
  }

  logger.info(`Synced ${copiedCount} tracked pages to ${targetDir}`);
}

function cleanupPreparedGenerationSourceMaterial(siteDirectory: string): void {
  const preparedSourceContentDir = SiteConfigPaths.getPreparedSourceContentDir(siteDirectory);
  const preparedSiteNodeConfigPath = SiteConfigPaths.getPreparedSiteNodeConfigFile(siteDirectory);

  if (fs.existsSync(preparedSourceContentDir)) {
    fs.rmSync(preparedSourceContentDir, { recursive: true, force: true });
  }
  if (fs.existsSync(preparedSiteNodeConfigPath)) {
    fs.rmSync(preparedSiteNodeConfigPath, { force: true });
  }
}

/**
 * Builds the generation-only source material used after tracked content has
 * been synced. When tag pages are needed, this creates a prepared copy of the
 * tracked source tree plus a prepared page config snapshot that includes the
 * generated tag pages. The persisted page config remains curation input.
 */
export function prepareGenerationSourceMaterial(
  siteDirectory: string,
  options: { tagsEnabled: boolean }
): PreparedGenerationSourceMaterial {
  const trackedPageContentDir = SiteConfigPaths.getTrackedPageContentDir(siteDirectory);
  const persistedSiteNodeConfigPath = SiteConfigPaths.getSiteNodeConfigFile(siteDirectory);
  const trackedSiteNodeConfigPath = SiteConfigPaths.getTrackedSiteNodeConfigFile(siteDirectory);
  const baseSiteNodeConfigPath = fs.existsSync(trackedSiteNodeConfigPath)
    ? trackedSiteNodeConfigPath
    : persistedSiteNodeConfigPath;
  const preparedSourceContentDir = SiteConfigPaths.getPreparedSourceContentDir(siteDirectory);
  const preparedSiteNodeConfigPath = SiteConfigPaths.getPreparedSiteNodeConfigFile(siteDirectory);
  const tagPagesSubdirName = SiteConfigPaths.TAGPAGE_SOURCE_STAGING_DIR;
  const tagPagesDir = path.join(preparedSourceContentDir, tagPagesSubdirName);

  const fallback: PreparedGenerationSourceMaterial = {
    sourceContentDirectory: trackedPageContentDir,
    siteNodeConfigPath: baseSiteNodeConfigPath,
    tagPageCount: 0,
  };

  if (!options.tagsEnabled) {
    cleanupPreparedGenerationSourceMaterial(siteDirectory);
    return fallback;
  }

  if (!fs.existsSync(baseSiteNodeConfigPath) || !fs.existsSync(trackedPageContentDir)) {
    cleanupPreparedGenerationSourceMaterial(siteDirectory);
    return fallback;
  }

  try {
    const siteNodeConfigs = parseSiteNodeConfig(fs.readFileSync(baseSiteNodeConfigPath, 'utf8'));
    const nonTagConfigs = siteNodeConfigs.filter(c => (c.sourceGraphSubdirectory || '') !== tagPagesSubdirName);

    // 1) Scan tracked markdown for Obsidian-style #tags
    const trackedMarkdownFiles = listMarkdownFilesRecursive(trackedPageContentDir, { excludeDirNames: new Set([tagPagesSubdirName]) });
    const tagKeyToExampleBody = new Map<string, string>();

    for (const filePath of trackedMarkdownFiles) {
      const md = fs.readFileSync(filePath, 'utf8');
      const found = extractObsidianTagsFromMarkdown(md);
      for (const [key, exampleBody] of found.entries()) {
        if (!tagKeyToExampleBody.has(key)) tagKeyToExampleBody.set(key, exampleBody);
      }
    }

    // 2) Compute desired tag page configs
    const desiredTagPageTitles = [...tagKeyToExampleBody.keys()]
      .sort()
      .map(tagKey => tagKeyToPageTitle(tagKey));

    if (desiredTagPageTitles.length === 0) {
      cleanupPreparedGenerationSourceMaterial(siteDirectory);
      return fallback;
    }

    const assignedIds = new Set<string>(siteNodeConfigs.map(config => config.siteNodeId));
    const siteIdentity = loadSiteConfig(siteDirectory).siteGuid || path.basename(siteDirectory);
    const desiredTagPageConfigs: SiteNodeConfig[] = desiredTagPageTitles.map(siteNodeName => {
      const siteNodeId = generatedTagSiteNodeId(siteIdentity, siteNodeName, assignedIds);
      assignedIds.add(siteNodeId);
      return {
        siteNodeName,
        sourceGraphSubdirectory: tagPagesSubdirName,
        siteNodeKind: 'file',
        fileType: 'md',
        siteNodeId,
        listType: 'whitelist',
      };
    });

    // 3) Copy tracked content into the generation-prepared source tree
    if (fs.existsSync(preparedSourceContentDir)) {
      fs.rmSync(preparedSourceContentDir, { recursive: true, force: true });
    }
    fs.cpSync(trackedPageContentDir, preparedSourceContentDir, { recursive: true });
    if (fs.existsSync(tagPagesDir)) {
      fs.rmSync(tagPagesDir, { recursive: true, force: true });
    }

    // 4) Write the prepared page config snapshot with only current tag pages
    fs.mkdirSync(path.dirname(preparedSiteNodeConfigPath), { recursive: true });
    fs.writeFileSync(
      preparedSiteNodeConfigPath,
      stringifySiteNodeConfig([...nonTagConfigs, ...desiredTagPageConfigs]),
      'utf8'
    );

    // 5) Write tag page markdown files into prepared_source_content/x-tagpages
    fs.mkdirSync(tagPagesDir, { recursive: true });
    for (const [tagKey, exampleBody] of tagKeyToExampleBody.entries()) {
      const title = tagKeyToPageTitle(tagKey);
      const filePath = path.join(tagPagesDir, `${title}.md`);
      const display = `#${exampleBody || tagKey}`;
      const content = `<!-- auto-generated tag page for ${display} -->\n`;
      fs.writeFileSync(filePath, content, 'utf8');
    }

    // 6) Rewrite tags in prepared markdown to wikilinks pointing at tag pages
    const preparedMarkdownFiles = listMarkdownFilesRecursive(preparedSourceContentDir, { excludeDirNames: new Set([tagPagesSubdirName]) });
    const tagBodyToPageTitle = (tagBody: string) => tagKeyToPageTitle(normalizeTagToKey(tagBody));
    for (const filePath of preparedMarkdownFiles) {
      const original = fs.readFileSync(filePath, 'utf8');
      const rewritten = rewriteObsidianTagsToWikiLinks(original, tagBodyToPageTitle);
      if (rewritten !== original) {
        fs.writeFileSync(filePath, rewritten, 'utf8');
      }
    }

    return {
      sourceContentDirectory: preparedSourceContentDir,
      siteNodeConfigPath: preparedSiteNodeConfigPath,
      tagPageCount: desiredTagPageTitles.length,
    };
  } catch (err) {
    cleanupPreparedGenerationSourceMaterial(siteDirectory);
    logger.warn(`Tag page source preparation failed (continuing without tags): ${err instanceof Error ? err.message : String(err)}`);
    return fallback;
  }
}
