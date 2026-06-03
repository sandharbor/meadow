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
import { parsePageConfig } from '../../../../../../shared_code/utils/sitePageConfigUtils.js';
import { canonicalPageFilename, sourceFileCandidateFilenames } from '../../../../../../shared_code/utils/fileTypeUtils.js';
import { SitePageConfig } from '../../../../../../shared_code/types/sitePageConfig.js';
import { stringifyPageConfig } from '../../../../../../shared_code/utils/sitePageConfigUtils.js';
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

export interface PreparedGenerationSourceMaterial {
  sourceContentDirectory: string;
  sitePageConfigPath: string;
  tagPageCount: number;
}

/**
 * Ensures the tracked_page_content directory is populated with files from the source directory.
 * This copies tracked pages (based on site_page_config.yaml) from the source directory to
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
  const tagPagesSubdirName = SiteConfigPaths.TAGPAGES_DIR;
  const siteConfig = loadSiteConfig(siteDirectory);
  const appConfig = loadAppConfig(getConfigDirectory());
  const generationOptions = resolveEffectiveGenerationOptions(appConfig, siteConfig);

  // Read site_page_config.yaml to get tracked page titles
  const sitePageConfPath = SiteConfigPaths.getSitePageConfigFile(siteDirectory);
  if (!fs.existsSync(sitePageConfPath)) {
    logger.warn('site_page_config.yaml not found, skipping tracked page content sync');
    return;
  }

  const confContent = fs.readFileSync(sitePageConfPath, 'utf8');
  const sitePageConfigs = parsePageConfig(confContent);

  // Get tracked pages (whitelist with tracked:true or tracked not explicitly false)
  const trackedPages = sitePageConfigs
    .filter(sitePageConfig =>
      sitePageConfig.config.tracked === true ||
      (sitePageConfig.config.list_type === 'whitelist' && sitePageConfig.config.tracked !== false)
    );

  if (trackedPages.length === 0) {
    logger.warn('No tracked pages found in site_page_config.yaml');
    return;
  }

  // Build expected file paths with subdirectories (excluding generated tag pages, which do not exist in sourceDirectory)
  const expectedFilePaths = new Map<string, SitePageConfig>();
  const sourceBackedTrackedPages = trackedPages.filter(c => (c.source_graph_subdirectory || '') !== tagPagesSubdirName);
  for (const sitePageConfig of sourceBackedTrackedPages) {
    const subdir = sitePageConfig.source_graph_subdirectory || '';
    const filename = canonicalPageFilename(sitePageConfig.title, sitePageConfig.file_type);
    const relativePath = subdir ? path.join(subdir, filename) : filename;
    expectedFilePaths.set(relativePath, sitePageConfig);
  }

  if (generationOptions.spacedRepetitionEnabled && generationOptions.spacedRepetitionTags.length > 0) {
    let updatedSourceFileCount = 0;

    for (const [relativePath, conf] of expectedFilePaths) {
      const fileType = conf.file_type || 'md';
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

  // Copy tracked pages from source to target, preserving directory structure
  let copiedCount = 0;
  for (const [relativePath, conf] of expectedFilePaths) {
    const fileType = conf.file_type || 'md';

    const subdir = conf.source_graph_subdirectory || '';
    const sourcePath = sourceFileCandidateFilenames(conf.title, fileType)
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
        logger.error(`Failed to copy "${conf.title}": ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      logger.warn(`Tracked page "${conf.title}" (${fileType}) not found at: ${path.join(sourceDirectory, relativePath)}`);
    }
  }

  logger.info(`Synced ${copiedCount} tracked pages to ${targetDir}`);
}

function cleanupPreparedGenerationSourceMaterial(siteDirectory: string): void {
  const preparedSourceContentDir = SiteConfigPaths.getPreparedSourceContentDir(siteDirectory);
  const preparedSitePageConfigPath = SiteConfigPaths.getPreparedSitePageConfigFile(siteDirectory);

  if (fs.existsSync(preparedSourceContentDir)) {
    fs.rmSync(preparedSourceContentDir, { recursive: true, force: true });
  }
  if (fs.existsSync(preparedSitePageConfigPath)) {
    fs.rmSync(preparedSitePageConfigPath, { force: true });
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
  const persistedSitePageConfigPath = SiteConfigPaths.getSitePageConfigFile(siteDirectory);
  const preparedSourceContentDir = SiteConfigPaths.getPreparedSourceContentDir(siteDirectory);
  const preparedSitePageConfigPath = SiteConfigPaths.getPreparedSitePageConfigFile(siteDirectory);
  const tagPagesSubdirName = SiteConfigPaths.TAGPAGES_DIR;
  const tagPagesDir = path.join(preparedSourceContentDir, tagPagesSubdirName);

  const fallback: PreparedGenerationSourceMaterial = {
    sourceContentDirectory: trackedPageContentDir,
    sitePageConfigPath: persistedSitePageConfigPath,
    tagPageCount: 0,
  };

  if (!options.tagsEnabled) {
    cleanupPreparedGenerationSourceMaterial(siteDirectory);
    return fallback;
  }

  if (!fs.existsSync(persistedSitePageConfigPath) || !fs.existsSync(trackedPageContentDir)) {
    cleanupPreparedGenerationSourceMaterial(siteDirectory);
    return fallback;
  }

  try {
    const sitePageConfigs = parsePageConfig(fs.readFileSync(persistedSitePageConfigPath, 'utf8'));
    const nonTagConfigs = sitePageConfigs.filter(c => (c.source_graph_subdirectory || '') !== tagPagesSubdirName);

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

    const desiredTagPageConfigs: SitePageConfig[] = desiredTagPageTitles.map(title => ({
      title,
      source_graph_subdirectory: tagPagesSubdirName,
      file_type: 'md',
      config: { list_type: 'whitelist', tracked: true }
    }));

    // 3) Copy tracked content into the generation-prepared source tree
    if (fs.existsSync(preparedSourceContentDir)) {
      fs.rmSync(preparedSourceContentDir, { recursive: true, force: true });
    }
    fs.cpSync(trackedPageContentDir, preparedSourceContentDir, { recursive: true });
    if (fs.existsSync(tagPagesDir)) {
      fs.rmSync(tagPagesDir, { recursive: true, force: true });
    }

    // 4) Write the prepared page config snapshot with only current tag pages
    fs.mkdirSync(path.dirname(preparedSitePageConfigPath), { recursive: true });
    fs.writeFileSync(
      preparedSitePageConfigPath,
      stringifyPageConfig([...nonTagConfigs, ...desiredTagPageConfigs]),
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
      sitePageConfigPath: preparedSitePageConfigPath,
      tagPageCount: desiredTagPageTitles.length,
    };
  } catch (err) {
    cleanupPreparedGenerationSourceMaterial(siteDirectory);
    logger.warn(`Tag page source preparation failed (continuing without tags): ${err instanceof Error ? err.message : String(err)}`);
    return fallback;
  }
}
