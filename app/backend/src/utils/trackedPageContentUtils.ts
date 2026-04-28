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
import { parsePageConfig } from '../../../shared_code/utils/sitePageConfigUtils.js';
import { SitePageConfig } from '../../../shared_code/types/sitePageConfig.js';
import { stringifyPageConfig } from '../../../shared_code/utils/sitePageConfigUtils.js';
import { SiteConfigPaths } from '../../../shared_code/paths/siteConfigPaths.js';
import { loadSiteConfig } from './siteConfigUtils.js';
import { loadAppConfig } from '../../../shared_code/utils/appConfigUtils.js';
import { resolveEffectiveGenerationOptions } from '../../../shared_code/utils/generationOptionsUtils.js';
import { getConfigDirectory } from '../routes/siteConfigRoutes.js';
import {
  extractObsidianTagsFromMarkdown,
  listMarkdownFilesRecursive,
  normalizeTagToKey,
  rewriteObsidianTagsToWikiLinks,
  tagKeyToPageTitle
} from './tagPagesUtils.js';
import {
  ensureSrsCardGuidsInMarkdown,
  pageMatchesConfiguredSrsTags,
} from './srsMarkdownUtils.js';
import { logger } from './logging/backendLoggingUtils.js';

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
  const tagPagesRelativeDir = path.join(tagPagesSubdirName);
  const tagPagesDir = path.join(targetDir, tagPagesRelativeDir);
  const siteConfig = loadSiteConfig(siteDirectory);
  const appConfig = loadAppConfig(getConfigDirectory());
  const generationOptions = resolveEffectiveGenerationOptions(appConfig, siteConfig);
  const tagsEnabled = generationOptions.tagsEnabled;

  // Read site_page_config.yaml to get tracked page titles
  const sitePageConfPath = SiteConfigPaths.getSitePageConfigFile(siteDirectory);
  if (!fs.existsSync(sitePageConfPath)) {
    logger.warn('site_page_config.yaml not found, skipping tracked page content sync');
    return;
  }

  const confContent = fs.readFileSync(sitePageConfPath, 'utf8');
  let sitePageConfigs = parsePageConfig(confContent);

  // If tags are disabled (or backlinks are disabled), remove tag pages from site_page_config.yaml.
  if (!tagsEnabled) {
    const withoutTagPages = sitePageConfigs.filter(c => (c.source_graph_subdirectory || '') !== tagPagesSubdirName);
    if (withoutTagPages.length !== sitePageConfigs.length) {
      fs.writeFileSync(sitePageConfPath, stringifyPageConfig(withoutTagPages), 'utf8');
      sitePageConfigs = withoutTagPages;
    }
  }

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
    const fileType = sitePageConfig.file_type || 'md';
    const relativePath = subdir
      ? path.join(subdir, `${sitePageConfig.title}.${fileType}`)
      : `${sitePageConfig.title}.${fileType}`;
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

    // Compute the expected path directly from the config (no directory scan needed).
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
        fs.copyFileSync(sourcePath, targetPath);
        copiedCount++;
      } catch (err) {
        logger.error(`Failed to copy "${conf.title}": ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      logger.warn(`Tracked page "${conf.title}" (${fileType}) not found at: ${sourcePath}`);
    }
  }

  logger.info(`Synced ${copiedCount} tracked pages to ${targetDir}`);

  // Tag support: generate tag pages + rewrite #tags -> wikilinks in tracked_page_content
  if (!tagsEnabled) {
    // Ensure no stale tag pages directory remains (targetDir was cleared, but be safe if behavior changes)
    if (fs.existsSync(tagPagesDir)) {
      fs.rmSync(tagPagesDir, { recursive: true, force: true });
    }
    return;
  }

  try {
    // 1) Scan copied markdown for Obsidian-style #tags
    const mdFiles = listMarkdownFilesRecursive(targetDir, { excludeDirNames: new Set([tagPagesSubdirName]) });
    const tagKeyToExampleBody = new Map<string, string>();

    for (const filePath of mdFiles) {
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

    const desiredTagPageConfigs: SitePageConfig[] = desiredTagPageTitles.map(title => ({
      title,
      source_graph_subdirectory: tagPagesSubdirName,
      file_type: 'md',
      config: { list_type: 'whitelist', tracked: true }
    }));

    // 3) Update site_page_config.yaml to include *only* current tag pages
    const nonTagConfigs = sitePageConfigs.filter(c => (c.source_graph_subdirectory || '') !== tagPagesSubdirName);
    const updatedConfigs = [...nonTagConfigs, ...desiredTagPageConfigs];
    fs.writeFileSync(sitePageConfPath, stringifyPageConfig(updatedConfigs), 'utf8');

    // 4) Write tag page markdown files into tracked_page_content/x-tagpages
    if (desiredTagPageTitles.length === 0) {
      if (fs.existsSync(tagPagesDir)) fs.rmSync(tagPagesDir, { recursive: true, force: true });
    } else {
      fs.mkdirSync(tagPagesDir, { recursive: true });

      // Remove stale tag page files
      const desiredFilenames = new Set(desiredTagPageTitles.map(t => `${t}.md`));
      for (const ent of fs.readdirSync(tagPagesDir, { withFileTypes: true })) {
        if (ent.isFile() && ent.name.toLowerCase().endsWith('.md') && !desiredFilenames.has(ent.name)) {
          fs.rmSync(path.join(tagPagesDir, ent.name), { force: true });
        }
      }

      // Write/update current tag pages
      for (const [tagKey, exampleBody] of tagKeyToExampleBody.entries()) {
        const title = tagKeyToPageTitle(tagKey);
        const filePath = path.join(tagPagesDir, `${title}.md`);
        const display = `#${exampleBody || tagKey}`;
        // Keep tag pages visually empty; backlinks section provides all useful info.
        // We leave a small HTML comment for debugging without affecting rendered output.
        const content = `<!-- auto-generated tag page for ${display} -->\n`;
        fs.writeFileSync(filePath, content, 'utf8');
      }
    }

    // 5) Rewrite tags in copied markdown to wikilinks pointing at tag pages
    const tagBodyToPageTitle = (tagBody: string) => tagKeyToPageTitle(normalizeTagToKey(tagBody));
    for (const filePath of mdFiles) {
      const original = fs.readFileSync(filePath, 'utf8');
      const rewritten = rewriteObsidianTagsToWikiLinks(original, tagBodyToPageTitle);
      if (rewritten !== original) {
        fs.writeFileSync(filePath, rewritten, 'utf8');
      }
    }
  } catch (err) {
    logger.warn(`Tag page generation failed (continuing without tags): ${err instanceof Error ? err.message : String(err)}`);
  }
}
