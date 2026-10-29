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
import { parseBundleNodeConfig } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { FileBundleNodeConfig, BundleNodeConfig } from '../../../../../../../contracts/types/shared/bundle-graph/bundleNodeConfig.js';
import type { BundleNodeId } from '../../../../../../../contracts/types/shared/bundle-graph/bundleNodeConfig.js';
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
import { invalidateWorkingGraphCache } from '../../../../shared/utils/workingGraphUtils.js';
import { DirectoryRebuild, discardDirectory } from '../../../../shared/utils/dirOperations.js';
import { copySourceFileToTrackedSnapshot } from '../../../../shared/bundle-node/trackedSourceContentSync.js';
import { sourceFilenameIn } from '../../../../shared/bundle-node/sourceFileNames.js';
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
  const tagPagesSubdirName = BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR;
  const bundleConfig = loadBundleConfig(bundleDirectory);
  const appConfig = loadAppConfig(getConfigDirectory());
  const generationOptions = resolveEffectiveGenerationOptions(appConfig, bundleConfig);

  // Generation reads only the canonical tracked configuration. Remove a derived
  // configuration written by earlier versions so it can never admit untracked pages.
  fs.rmSync(BundleConfigPaths.getTrackedBundleNodeConfigFile(bundleDirectory), { force: true });

  // Read bundle_node_config.yaml to get tracked page titles
  const bundleNodeConfPath = BundleConfigPaths.getBundleNodeConfigFile(bundleDirectory);
  if (!fs.existsSync(bundleNodeConfPath)) {
    logger.warn('bundle_node_config.yaml not found, skipping tracked page content sync');
    return;
  }

  const confContent = fs.readFileSync(bundleNodeConfPath, 'utf8');
  const bundleNodeConfigs = parseBundleNodeConfig(confContent);

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
    // Each copy keeps its source's own name (a drawing may be plain `.md`), so
    // links resolve in the copies as they do in the source. Orphan
    // configuration is retained for source review, but its absent bytes are
    // not generation inputs in a scoped snapshot.
    const filename = sourceFilenameIn(path.join(sourceDirectory, subdir), bundleNodeConfig);
    if (filename) expectedFilePaths.set(subdir ? path.join(subdir, filename) : filename, bundleNodeConfig);
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

    const sourcePath = path.join(sourceDirectory, relativePath);
    const targetPath = path.join(targetDir, relativePath);
    const targetSubdir = path.dirname(targetPath);

    // Create subdirectory if needed
    if (targetSubdir !== targetDir && !fs.existsSync(targetSubdir)) {
      fs.mkdirSync(targetSubdir, { recursive: true });
    }

    // Only copy if source exists
    if (fs.existsSync(sourcePath)) {
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

  discardDirectory(preparedSourceContentDir);
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
  const baseBundleNodeConfigPath = persistedBundleNodeConfigPath;
  const preparedSourceContentDir = BundleConfigPaths.getPreparedSourceContentDir(bundleDirectory);
  const preparedBundleNodeConfigPath = BundleConfigPaths.getPreparedBundleNodeConfigFile(bundleDirectory);
  const tagPagesSubdirName = BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR;
  const tagPagesDir = path.join(preparedSourceContentDir, tagPagesSubdirName);

  let fallback: PreparedGenerationSourceMaterial = {
    sourceContentDirectory: trackedPageContentDir,
    bundleNodeConfigPath: baseBundleNodeConfigPath,
    tagPageCount: 0,
  };

  if (!fs.existsSync(baseBundleNodeConfigPath) || !fs.existsSync(trackedPageContentDir)) {
    cleanupPreparedGenerationSourceMaterial(bundleDirectory);
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
  // A single source's tag pages rebuild the prepared copy in place below.
  const rebuildInPlace = options.tagsEnabled && !bundleConfig.sources;
  const bundleNodeConfigs = rebuildInPlace ? storedNodes : prepareBase();
  if (!options.tagsEnabled) return fallback;

  try {
    const nonTagConfigs = bundleNodeConfigs.filter(c => (c.sourceGraphSubdirectory || '') !== tagPagesSubdirName);

    // 1) Scan tracked markdown for Obsidian-style #tags
    const trackedMarkdownFiles = listMarkdownFilesRecursive(fallback.sourceContentDirectory, { excludeDirNames: new Set([tagPagesSubdirName]) });
    const tagKeyToExampleBody = new Map<string, string>();
    const trackedMarkdown = new Map<string, string>();

    for (const filePath of trackedMarkdownFiles) {
      const md = fs.readFileSync(filePath, 'utf8');
      trackedMarkdown.set(path.relative(fallback.sourceContentDirectory, filePath), md);
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
      if (rebuildInPlace) cleanupPreparedGenerationSourceMaterial(bundleDirectory);
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

    const tagBodyToPageTitle = (tagBody: string) => {
      const title = tagKeyToPageTitle(normalizeTagToKey(tagBody));
      return bundleConfig.sources ? `${tagPagesSubdirName}/${title}::${bundleConfig.sources[0].name}` : title;
    };
    const tagPageContent = (tagKey: string, exampleBody: string) =>
      `<!-- auto-generated tag page for #${exampleBody || tagKey} -->\n`;

    // 3) Write the prepared page config snapshot with only current tag pages
    fs.mkdirSync(path.dirname(preparedBundleNodeConfigPath), { recursive: true });
    fs.writeFileSync(
      preparedBundleNodeConfigPath,
      stringifyBundleNodeConfig(projectBundleNodeConfigsForGeneration([
        ...nonTagConfigs,
        ...desiredTagPageConfigs,
      ])),
      'utf8'
    );

    if (rebuildInPlace) {
      // 4) Copy tracked content into the generation-prepared source tree, with
      // tags in its markdown rewritten to wikilinks pointing at tag pages, and
      // the tag pages written into prepared_source_content/x-tagpages.
      const prepared = new DirectoryRebuild(preparedSourceContentDir);
      const copyTree = (relativeDirectory: string) => {
        prepared.mkdir(path.join(preparedSourceContentDir, relativeDirectory));
        for (const entry of fs.readdirSync(path.join(trackedPageContentDir, relativeDirectory), { withFileTypes: true })) {
          const relativePath = path.join(relativeDirectory, entry.name);
          if (relativePath === tagPagesSubdirName) continue;
          const source = path.join(trackedPageContentDir, relativePath);
          const destination = path.join(preparedSourceContentDir, relativePath);
          const markdown = trackedMarkdown.get(relativePath);
          if (entry.isDirectory()) copyTree(relativePath);
          else if (markdown !== undefined) prepared.writeFile(destination, rewriteObsidianTagsToWikiLinks(markdown, tagBodyToPageTitle));
          else if (entry.isFile()) prepared.copyFile(source, destination);
          else prepared.copyOther(source, destination);
        }
      };
      copyTree('');
      prepared.mkdir(tagPagesDir);
      for (const [tagKey, exampleBody] of tagKeyToExampleBody.entries()) {
        prepared.writeFile(path.join(tagPagesDir, `${tagKeyToPageTitle(tagKey)}.md`), tagPageContent(tagKey, exampleBody));
      }
      prepared.finish();
    } else {
      // 4) Write tag page markdown files into prepared_source_content/x-tagpages
      if (fs.existsSync(tagPagesDir)) {
        fs.rmSync(tagPagesDir, { recursive: true, force: true });
      }
      fs.mkdirSync(tagPagesDir, { recursive: true });
      for (const [tagKey, exampleBody] of tagKeyToExampleBody.entries()) {
        fs.writeFileSync(path.join(tagPagesDir, `${tagKeyToPageTitle(tagKey)}.md`), tagPageContent(tagKey, exampleBody), 'utf8');
      }

      // 5) Rewrite tags in prepared markdown to wikilinks pointing at tag pages
      for (const [relativePath, original] of trackedMarkdown) {
        const rewritten = rewriteObsidianTagsToWikiLinks(original, tagBodyToPageTitle);
        if (rewritten !== original) {
          fs.writeFileSync(path.join(preparedSourceContentDir, relativePath), rewritten, 'utf8');
        }
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
