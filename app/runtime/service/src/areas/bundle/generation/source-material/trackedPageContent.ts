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
import { sourceGraphPath } from '../../../../../../../shared_code/utils/bundleSourceUtils.js';
import { projectTrackedSourceOutput } from './sourceOutputProjection.js';
import {
  nodeConfigMatchesNode,
  parseBundleNodeConfig,
  resolveBundleNodeRoles,
} from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { canonicalPageFilename, sourceFileCandidateFilenames } from '../../../../../../../shared_code/utils/fileTypeUtils.js';
import { FileBundleNodeConfig, BundleNodeConfig } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import type { BundleNodeId } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import {
  projectBundleNodeConfigsForGeneration,
  stringifyBundleNodeConfig,
} from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
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
import {
  invalidateWorkingGraphCache,
  runWorkingGraphRaw,
} from '../../../../shared/utils/workingGraphUtils.js';
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
  sourceId?: string;
  bundleNodeKey: string;
  bundleNodeId?: string;
  bundleNodeKind: 'file' | 'folder' | 'collection';
  bundleNodeName: string;
  sourceGraphSubdirectory?: string;
  fileType?: FileBundleNodeConfig['fileType'];
  effectiveBlacklistingBundleNodeId?: string;
  remaining_depth: number;
  remaining_inlinks_depth?: number;
  isFrontierNode?: boolean;
  isFrontierImageExtension?: boolean;
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
    sources: bundleConfig.sources?.map(source => ({ ...source, directory: path.join(sourceDirectory, sourceGraphPath(source.id, '')) })),
    immutableSource: true,
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
    .filter(node => (
      !node.bundleNodeId
      && !bundleNodeConfigs.some(config => nodeConfigMatchesNode(
        config,
        node.bundleNodeName,
        node.sourceGraphSubdirectory,
        node.fileType,
        node.bundleNodeKind,
        undefined,
        node.sourceId,
      ))
      && !node.effectiveBlacklistingBundleNodeId
      && (!node.isFrontierNode || node.isFrontierImageExtension)
    ))
    .sort((left, right) => left.bundleNodeKey.localeCompare(right.bundleNodeKey));
  for (const node of derivedNodes) {
    const bundleNodeId = generatedFolderBundleNodeId(bundleIdentity, node.bundleNodeKey, assignedIds);
    assignedIds.add(bundleNodeId);
    if (node.bundleNodeKind === 'file' && node.fileType) {
      derivedConfigs.push({
        bundleNodeName: node.bundleNodeName,
        ...(node.sourceId && { sourceId: node.sourceId }),
        ...(node.sourceGraphSubdirectory && { sourceGraphSubdirectory: node.sourceGraphSubdirectory }),
        bundleNodeKind: 'file',
        fileType: node.fileType,
        bundleNodeId,
        listType: 'whitelist',
        // Frontier-preserving images use -1 as an internal traversal sentinel.
        // A materialized canonical config seeds generation rather than describing
        // traversal state, so clamp that sentinel to the terminal depth of zero.
        outlinksDepth: Math.max(0, node.remaining_depth),
        inlinksDepth: Math.max(0, node.remaining_inlinks_depth ?? 0),
      });
    } else if (node.bundleNodeKind === 'folder') {
      derivedConfigs.push({
        bundleNodeName: node.bundleNodeName,
        ...(node.sourceId && { sourceId: node.sourceId }),
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
 * @param sourceDirectory - The accepted source snapshot directory supplied by Sourcing
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
    fs.writeFileSync(
      trackedBundleNodeConfigPath,
      stringifyBundleNodeConfig(projectBundleNodeConfigsForGeneration(bundleNodeConfigs)),
      'utf8',
    );
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
    const subdir = sourceGraphPath(bundleNodeConfig.sourceId, bundleNodeConfig.sourceGraphSubdirectory || '');
    const filename = canonicalPageFilename(bundleNodeConfig.bundleNodeName, bundleNodeConfig.fileType);
    const relativePath = subdir ? path.join(subdir, filename) : filename;
    // Orphan configuration is retained for source review, but its absent bytes
    // are not generation inputs in a scoped snapshot.
    if (sourceFileCandidateFilenames(bundleNodeConfig.bundleNodeName, bundleNodeConfig.fileType).some(candidate => fs.existsSync(path.join(sourceDirectory, subdir, candidate)))) {
      expectedFilePaths.set(relativePath, bundleNodeConfig);
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
  for (const source of bundleConfig.sources ?? []) fs.mkdirSync(path.join(targetDir, sourceGraphPath(source.id, '')), { recursive: true });

  // Folder nodes have no source body. Recreate only their directory shape so
  // selected/configured empty folders remain materialized for graph building.
  for (const config of trackedPages) {
    if (config.bundleNodeKind !== 'folder') continue;
    const subdirectory = sourceGraphPath(config.sourceId, config.sourceGraphSubdirectory ?? '');
    const sourceFolder = path.join(sourceDirectory, subdirectory);
    if (!fs.existsSync(sourceFolder) || !fs.statSync(sourceFolder).isDirectory()) continue;
    const targetFolder = path.join(targetDir, subdirectory);
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  // Copy tracked pages from source to target, preserving directory structure
  let copiedCount = 0;
  for (const [relativePath, conf] of expectedFilePaths) {
    const fileType = conf.fileType || 'md';

    const subdir = sourceGraphPath(conf.sourceId, conf.sourceGraphSubdirectory || '');
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
        if (fileType === 'md' && generationOptions.spacedRepetitionEnabled && generationOptions.spacedRepetitionTags.length > 0) {
          const markdown = fs.readFileSync(targetPath, 'utf8');
          if (pageMatchesConfiguredSrsTags(markdown, generationOptions.spacedRepetitionTags)) {
            const withGuids = ensureSrsCardGuidsInMarkdown(markdown, relativePath.split(path.sep).join('/'));
            if (withGuids.changed) writeDurableDocument({ path: targetPath, value: withGuids.markdown, codec: textDocumentCodec });
          }
        }
        copiedCount++;
      } catch (err) {
        logger.error(`Failed to copy "${conf.bundleNodeName}": ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      logger.warn(`Tracked page "${conf.bundleNodeName}" (${fileType}) not found at: ${path.join(sourceDirectory, relativePath)}`);
    }
  }

  logger.info(`Synced ${copiedCount} tracked pages to ${targetDir}`);
  invalidateWorkingGraphCache(targetDir);
}

function cleanupPreparedGenerationSourceMaterial(bundleDirectory: string): void {
  const preparedSourceContentDir = BundleConfigPaths.getPreparedSourceContentDir(bundleDirectory);
  const preparedBundleNodeConfigPath = BundleConfigPaths.getPreparedBundleNodeConfigFile(bundleDirectory);

  invalidateWorkingGraphCache(preparedSourceContentDir);

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

  let fallback: PreparedGenerationSourceMaterial = {
    sourceContentDirectory: trackedPageContentDir,
    bundleNodeConfigPath: baseBundleNodeConfigPath,
    tagPageCount: 0,
  };

  cleanupPreparedGenerationSourceMaterial(bundleDirectory);
  if (!fs.existsSync(baseBundleNodeConfigPath) || !fs.existsSync(trackedPageContentDir)) {
    return fallback;
  }

  const bundleConfig = loadBundleConfig(bundleDirectory);
  const storedNodes = parseBundleNodeConfig(fs.readFileSync(baseBundleNodeConfigPath, 'utf8'));
  const prepareBase = () => {
    cleanupPreparedGenerationSourceMaterial(bundleDirectory);
    if (!bundleConfig.sources) return storedNodes;
    const projected = projectTrackedSourceOutput(bundleConfig, storedNodes, trackedPageContentDir, preparedSourceContentDir);
    fs.mkdirSync(path.dirname(preparedBundleNodeConfigPath), { recursive: true });
    fs.writeFileSync(preparedBundleNodeConfigPath, stringifyBundleNodeConfig(projectBundleNodeConfigsForGeneration(projected)));
    fallback = { sourceContentDirectory: preparedSourceContentDir, bundleNodeConfigPath: preparedBundleNodeConfigPath, tagPageCount: 0 };
    return projected;
  };
  const bundleNodeConfigs = prepareBase();
  if (!options.tagsEnabled) return fallback;

  try {
    const nonTagConfigs = bundleNodeConfigs.filter(c => (c.sourceGraphSubdirectory || '') !== tagPagesSubdirName);

    // 1) Scan tracked markdown for Obsidian-style #tags
    const trackedMarkdownFiles = listMarkdownFilesRecursive(fallback.sourceContentDirectory, { excludeDirNames: new Set([tagPagesSubdirName]) });
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
    if (!bundleConfig.sources) {
      fs.cpSync(trackedPageContentDir, preparedSourceContentDir, { recursive: true });
    }
    if (fs.existsSync(tagPagesDir)) {
      fs.rmSync(tagPagesDir, { recursive: true, force: true });
    }

    // 4) Write the prepared page config snapshot with only current tag pages
    fs.mkdirSync(path.dirname(preparedBundleNodeConfigPath), { recursive: true });
    fs.writeFileSync(
      preparedBundleNodeConfigPath,
      stringifyBundleNodeConfig(projectBundleNodeConfigsForGeneration([
        ...nonTagConfigs,
        ...desiredTagPageConfigs,
      ])),
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
    const tagBodyToPageTitle = (tagBody: string) => {
      const title = tagKeyToPageTitle(normalizeTagToKey(tagBody));
      return bundleConfig.sources ? `${tagPagesSubdirName}/${title}::${bundleConfig.sources[0].name}` : title;
    };
    for (const filePath of preparedMarkdownFiles) {
      const original = fs.readFileSync(filePath, 'utf8');
      const rewritten = rewriteObsidianTagsToWikiLinks(original, tagBodyToPageTitle);
      if (rewritten !== original) {
        fs.writeFileSync(filePath, rewritten, 'utf8');
      }
    }

    invalidateWorkingGraphCache(preparedSourceContentDir);

    return {
      sourceContentDirectory: preparedSourceContentDir,
      bundleNodeConfigPath: preparedBundleNodeConfigPath,
      tagPageCount: desiredTagPageTitles.length,
    };
  } catch (err) {
    prepareBase();
    logger.warn(`Tag page source preparation failed (continuing without tags): ${err instanceof Error ? err.message : String(err)}`);
    return fallback;
  }
}
