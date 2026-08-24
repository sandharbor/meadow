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
import { parseBundleNodeConfig, resolveBundleNodeRoles } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { canonicalPageFilename, sourceFileCandidateFilenames } from '../../../../../../../shared_code/utils/fileTypeUtils.js';
import { FileBundleNodeConfig, BundleNodeConfig } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import type { BundleNodeId } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import { stringifyBundleNodeConfig } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { BundleConfigPaths } from '../../../../../../../shared_code/paths/bundleConfigPaths.js';
import { loadBundleConfig } from '../../../../shared/utils/bundleConfigUtils.js';
import { loadAppConfig } from '../../../../../../../shared_code/utils/appConfigUtils.js';
import { resolveEffectiveGenerationOptions } from '../../../../../../../shared_code/utils/generationOptionsUtils.js';
import { getConfigDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';
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
import { copySourceFileToTrackedSnapshot } from '../../../../shared/bundle-node/trackedSourceContentSync.js';
import {
  textDocumentCodec,
  writeDurableDocument,
} from '../../../../../../../shared_code/utils/durableDocument.js';

export interface PreparedGenerationSourceMaterial {
  sourceContentDirectory: string;
  bundleNodeConfigPath: string;
  tagPageCount: number;
}

function generatedTagBundleNodeId(
  bundleIdentity: string,
  bundleNodeName: string,
  assignedIds: Set<string>,
): BundleNodeId {
  for (let salt = 0; ; salt += 1) {
    const candidate = crypto.createHash('sha256')
      .update(`${bundleIdentity}\0${BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR}\0${bundleNodeName}\0${salt}`)
      .digest('hex')
      .slice(0, 12);
    if (!assignedIds.has(candidate)) return candidate as BundleNodeId;
  }
}

type FolderGenerationNode = {
  bundleNodeKey: string;
  bundleNodeId?: string;
  bundleNodeKind: 'file' | 'folder' | 'collection';
  bundleNodeName: string;
  sourceGraphSubdirectory?: string;
  fileType?: FileBundleNodeConfig['fileType'];
  effectiveBlacklistingBundleNodeId?: string;
  remaining_depth: number;
  remaining_inlinks_depth?: number;
};

type FolderGenerationOutput = {
  nodes: FolderGenerationNode[];
};

function generatedFolderBundleNodeId(
  bundleIdentity: string,
  bundleNodeKey: string,
  assignedIds: Set<string>,
): BundleNodeId {
  for (let salt = 0; ; salt += 1) {
    const candidate = crypto.createHash('sha256')
      .update(`${bundleIdentity}\0folder-generation\0${bundleNodeKey}\0${salt}`)
      .digest('hex')
      .slice(0, 12);
    if (!assignedIds.has(candidate)) return candidate as BundleNodeId;
  }
}

async function materializeFolderGenerationConfigs(options: {
  bundleDirectory: string;
  sourceDirectory: string;
  bundleNodeConfigPath: string;
  bundleNodeConfigs: BundleNodeConfig[];
}): Promise<BundleNodeConfig[]> {
  const { bundleDirectory, sourceDirectory, bundleNodeConfigPath, bundleNodeConfigs } = options;
  const bundleConfig = loadBundleConfig(bundleDirectory);
  const { entryNode, defaultTraversalNode } = resolveBundleNodeRoles(
    bundleNodeConfigs,
    bundleConfig,
    BundleConfigPaths.getBundleConfigFile(bundleDirectory),
  );
  if (entryNode.bundleNodeKind === 'file') return bundleNodeConfigs;

  const raw = await runWorkingGraphRaw({
    graphRoot: sourceDirectory,
    bundleNodeConfigPath,
    entryBundleNodeId: entryNode.bundleNodeId,
    defaultTraversalBundleNodeId: defaultTraversalNode.bundleNodeId,
    defaultOutlinksDepth: bundleConfig.defaultOutlinksDepth,
    defaultInlinksDepth: bundleConfig.defaultInlinksDepth,
    frontierDepth: 0,
    allowImagesToExtendToFrontier: true,
    allowLowerDepths: false,
  });
  const output = JSON.parse(raw) as FolderGenerationOutput;
  const assignedIds = new Set<string>(bundleNodeConfigs.map(config => config.bundleNodeId));
  const bundleIdentity = bundleConfig.bundleGuid || path.basename(bundleDirectory);
  const derivedConfigs: BundleNodeConfig[] = [];
  const derivedNodes = output.nodes
    .filter(node => !node.bundleNodeId && !node.effectiveBlacklistingBundleNodeId)
    .sort((left, right) => left.bundleNodeKey.localeCompare(right.bundleNodeKey));
  for (const node of derivedNodes) {
    const bundleNodeId = generatedFolderBundleNodeId(bundleIdentity, node.bundleNodeKey, assignedIds);
    assignedIds.add(bundleNodeId);
    if (node.bundleNodeKind === 'file' && node.fileType) {
      derivedConfigs.push({
        bundleNodeName: node.bundleNodeName,
        ...(node.sourceGraphSubdirectory && { sourceGraphSubdirectory: node.sourceGraphSubdirectory }),
        bundleNodeKind: 'file',
        fileType: node.fileType,
        bundleNodeId,
        listType: 'whitelist',
        outlinksDepth: node.remaining_depth,
        inlinksDepth: node.remaining_inlinks_depth ?? 0,
      });
    } else if (node.bundleNodeKind === 'folder') {
      derivedConfigs.push({
        bundleNodeName: node.bundleNodeName,
        sourceGraphSubdirectory: node.sourceGraphSubdirectory ?? '',
        bundleNodeKind: 'folder',
        bundleNodeId,
        listType: 'whitelist',
        outlinksDepth: 0,
        inlinksDepth: 0,
      });
    }
  }
  return [...bundleNodeConfigs, ...derivedConfigs];
}

/**
 * Ensures the tracked_page_content directory is populated with files from the source directory.
 * This copies tracked pages (based on bundle_node_config.yaml) from the source directory to
 * the bundle's raw/tracked_page_content folder, preserving the directory structure.
 *
 * @param bundleDirectory - The bundle's directory (e.g., /path/to/bundles/my-bundle)
 * @param sourceDirectory - The source graph directory (from bundle_config.yaml sourceDirectory)
 */
export async function ensureTrackedPageContent(
  bundleDirectory: string,
  sourceDirectory: string
): Promise<void> {
  // This function is intentionally `async` (callers `await` it), but it performs synchronous
  // filesystem operations. Keep an `await` to satisfy @typescript-eslint/require-await.
  await Promise.resolve();
  const targetDir = BundleConfigPaths.getTrackedPageContentDir(bundleDirectory);
  const trackedBundleNodeConfigPath = BundleConfigPaths.getTrackedBundleNodeConfigFile(bundleDirectory);
  const tagPagesSubdirName = BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR;
  const bundleConfig = loadBundleConfig(bundleDirectory);
  const appConfig = loadAppConfig(getConfigDirectory());
  const generationOptions = resolveEffectiveGenerationOptions(appConfig, bundleConfig);

  // Read bundle_node_config.yaml to get tracked page titles
  const bundleNodeConfPath = BundleConfigPaths.getBundleNodeConfigFile(bundleDirectory);
  if (!fs.existsSync(bundleNodeConfPath)) {
    fs.rmSync(trackedBundleNodeConfigPath, { force: true });
    logger.warn('bundle_node_config.yaml not found, skipping tracked page content sync');
    return;
  }

  const confContent = fs.readFileSync(bundleNodeConfPath, 'utf8');
  const persistedBundleNodeConfigs = parseBundleNodeConfig(confContent);
  const bundleNodeConfigs = await materializeFolderGenerationConfigs({
    bundleDirectory,
    sourceDirectory,
    bundleNodeConfigPath: bundleNodeConfPath,
    bundleNodeConfigs: persistedBundleNodeConfigs,
  });

  if (bundleNodeConfigs.length > persistedBundleNodeConfigs.length) {
    fs.mkdirSync(path.dirname(trackedBundleNodeConfigPath), { recursive: true });
    fs.writeFileSync(trackedBundleNodeConfigPath, stringifyBundleNodeConfig(bundleNodeConfigs), 'utf8');
  } else {
    fs.rmSync(trackedBundleNodeConfigPath, { force: true });
  }

  // Canonical record presence is the sole tracking/registration signal.
  const trackedPages = bundleNodeConfigs;

  if (trackedPages.length === 0) {
    logger.warn('No tracked pages found in bundle_node_config.yaml');
    return;
  }

  // Build expected file paths with subdirectories (excluding generated tag pages, which do not exist in sourceDirectory)
  const expectedFilePaths = new Map<string, FileBundleNodeConfig>();
  const sourceBackedTrackedPages = trackedPages.filter(
    (config): config is FileBundleNodeConfig => config.bundleNodeKind === 'file'
      && config.sourceGraphSubdirectory !== tagPagesSubdirName
  );
  for (const bundleNodeConfig of sourceBackedTrackedPages) {
    const subdir = bundleNodeConfig.sourceGraphSubdirectory || '';
    const filename = canonicalPageFilename(bundleNodeConfig.bundleNodeName, bundleNodeConfig.fileType);
    const relativePath = subdir ? path.join(subdir, filename) : filename;
    expectedFilePaths.set(relativePath, bundleNodeConfig);
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

        writeDurableDocument({
          path: sourcePath,
          value: withGuids.markdown,
          codec: textDocumentCodec,
          mode: fs.statSync(sourcePath).mode & 0o777,
        });
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
    if (config.bundleNodeKind !== 'folder') continue;
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
    const sourcePath = sourceFileCandidateFilenames(conf.bundleNodeName, fileType)
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
        copySourceFileToTrackedSnapshot(sourcePath, targetPath);
        copiedCount++;
      } catch (err) {
        logger.error(`Failed to copy "${conf.bundleNodeName}": ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      logger.warn(`Tracked page "${conf.bundleNodeName}" (${fileType}) not found at: ${path.join(sourceDirectory, relativePath)}`);
    }
  }

  logger.info(`Synced ${copiedCount} tracked pages to ${targetDir}`);
}

function cleanupPreparedGenerationSourceMaterial(bundleDirectory: string): void {
  const preparedSourceContentDir = BundleConfigPaths.getPreparedSourceContentDir(bundleDirectory);
  const preparedBundleNodeConfigPath = BundleConfigPaths.getPreparedBundleNodeConfigFile(bundleDirectory);

  if (fs.existsSync(preparedSourceContentDir)) {
    fs.rmSync(preparedSourceContentDir, { recursive: true, force: true });
  }
  if (fs.existsSync(preparedBundleNodeConfigPath)) {
    fs.rmSync(preparedBundleNodeConfigPath, { force: true });
  }
}

/**
 * Builds the generation-only source material used after tracked content has
 * been synced. When tag pages are needed, this creates a prepared copy of the
 * tracked source tree plus a prepared page config snapshot that includes the
 * generated tag pages. The persisted page config remains curation input.
 */
export function prepareGenerationSourceMaterial(
  bundleDirectory: string,
  options: { tagsEnabled: boolean }
): PreparedGenerationSourceMaterial {
  const trackedPageContentDir = BundleConfigPaths.getTrackedPageContentDir(bundleDirectory);
  const persistedBundleNodeConfigPath = BundleConfigPaths.getBundleNodeConfigFile(bundleDirectory);
  const trackedBundleNodeConfigPath = BundleConfigPaths.getTrackedBundleNodeConfigFile(bundleDirectory);
  const baseBundleNodeConfigPath = fs.existsSync(trackedBundleNodeConfigPath)
    ? trackedBundleNodeConfigPath
    : persistedBundleNodeConfigPath;
  const preparedSourceContentDir = BundleConfigPaths.getPreparedSourceContentDir(bundleDirectory);
  const preparedBundleNodeConfigPath = BundleConfigPaths.getPreparedBundleNodeConfigFile(bundleDirectory);
  const tagPagesSubdirName = BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR;
  const tagPagesDir = path.join(preparedSourceContentDir, tagPagesSubdirName);

  const fallback: PreparedGenerationSourceMaterial = {
    sourceContentDirectory: trackedPageContentDir,
    bundleNodeConfigPath: baseBundleNodeConfigPath,
    tagPageCount: 0,
  };

  if (!options.tagsEnabled) {
    cleanupPreparedGenerationSourceMaterial(bundleDirectory);
    return fallback;
  }

  if (!fs.existsSync(baseBundleNodeConfigPath) || !fs.existsSync(trackedPageContentDir)) {
    cleanupPreparedGenerationSourceMaterial(bundleDirectory);
    return fallback;
  }

  try {
    const bundleNodeConfigs = parseBundleNodeConfig(fs.readFileSync(baseBundleNodeConfigPath, 'utf8'));
    const nonTagConfigs = bundleNodeConfigs.filter(c => (c.sourceGraphSubdirectory || '') !== tagPagesSubdirName);

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
      cleanupPreparedGenerationSourceMaterial(bundleDirectory);
      return fallback;
    }

    const assignedIds = new Set<string>(bundleNodeConfigs.map(config => config.bundleNodeId));
    const bundleIdentity = loadBundleConfig(bundleDirectory).bundleGuid || path.basename(bundleDirectory);
    const desiredTagPageConfigs: BundleNodeConfig[] = desiredTagPageTitles.map(bundleNodeName => {
      const bundleNodeId = generatedTagBundleNodeId(bundleIdentity, bundleNodeName, assignedIds);
      assignedIds.add(bundleNodeId);
      return {
        bundleNodeName,
        sourceGraphSubdirectory: tagPagesSubdirName,
        bundleNodeKind: 'file',
        fileType: 'md',
        bundleNodeId,
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
    fs.mkdirSync(path.dirname(preparedBundleNodeConfigPath), { recursive: true });
    fs.writeFileSync(
      preparedBundleNodeConfigPath,
      stringifyBundleNodeConfig([...nonTagConfigs, ...desiredTagPageConfigs]),
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
      bundleNodeConfigPath: preparedBundleNodeConfigPath,
      tagPageCount: desiredTagPageTitles.length,
    };
  } catch (err) {
    cleanupPreparedGenerationSourceMaterial(bundleDirectory);
    logger.warn(`Tag page source preparation failed (continuing without tags): ${err instanceof Error ? err.message : String(err)}`);
    return fallback;
  }
}
