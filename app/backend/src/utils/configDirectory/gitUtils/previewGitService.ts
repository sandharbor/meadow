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

import * as fs from 'fs';
import * as path from 'path';
import { commitChangesNative } from './gitStatusUtils.js';
import { getConfigDirectory } from '../../../routes/siteConfigRoutes.js';
import { SiteConfigPaths } from '../../../../../shared_code/paths/siteConfigPaths.js';
import { logger } from '../../logging/backendLoggingUtils.js';

interface DiffResult {
  filepath: string;
  type: 'A' | 'M' | 'D';  // Added, Modified, Deleted
}

interface FileDiff {
  filepath: string;
  type: 'A' | 'M' | 'D';
  oldContent: string;
  newContent: string;
  unifiedDiff: string;
}

interface PreviewChanges {
  changedFiles: DiffResult[];
  fileDiffs: Record<string, FileDiff>;
}

interface CommitOptions {
  /** Include the conf directory (contains generated_site_versions.yaml). Default: false */
  includeConfDir?: boolean;
  /** Extra directories to include in the same commit (e.g. provider-owned caches). */
  additionalDirs?: string[];
}

/**
 * Commit site changes to git.
 * Uses the native fast_git_ops binary for fast commits of multiple directories.
 * Commits html/generated_site_versions, html/preview, raw/tracked_page_content,
 * and generated build intermediates (when they exist). Optionally includes conf
 * directory for publish operations. Callers (typically publishing providers)
 * can pass `additionalDirs` to include provider-scoped caches in the same commit.
 */
export async function commitSiteChanges(
  siteDirectory: string,
  commitMessage: string,
  options: CommitOptions = {}
): Promise<string | null> {
  const { includeConfDir = false, additionalDirs = [] } = options;

  const publishedDir = SiteConfigPaths.getGeneratedSiteVersionsDir(siteDirectory);
  const previewDir = SiteConfigPaths.getPreviewDir(siteDirectory);
  const trackedPageContentDir = SiteConfigPaths.getTrackedPageContentDir(siteDirectory);
  const modifiedPageContentDir = SiteConfigPaths.getModifiedPageContentDir(siteDirectory);
  const scrubbedSourceContentDir = SiteConfigPaths.getScrubbedSourceContentDir(siteDirectory);
  const markdownExportDir = SiteConfigPaths.getMarkdownExportDir(siteDirectory);
  const confDir = SiteConfigPaths.getConfDir(siteDirectory);

  // Check if at least one directory exists
  const publishedExists = fs.existsSync(publishedDir);
  const previewExists = fs.existsSync(previewDir);
  const trackedPageContentExists = fs.existsSync(trackedPageContentDir);
  const modifiedPageContentExists = fs.existsSync(modifiedPageContentDir);
  const scrubbedSourceContentExists = fs.existsSync(scrubbedSourceContentDir);
  const markdownExportExists = fs.existsSync(markdownExportDir);
  const confExists = includeConfDir && fs.existsSync(confDir);
  const existingAdditionalDirs = additionalDirs.filter(d => fs.existsSync(d));

  if (
    !publishedExists &&
    !previewExists &&
    !trackedPageContentExists &&
    !modifiedPageContentExists &&
    !scrubbedSourceContentExists &&
    !markdownExportExists &&
    !confExists &&
    existingAdditionalDirs.length === 0
  ) {
    logger.warn(`[commitSiteChanges] No directories found to commit`);
    logger.warn(`  Published: ${publishedDir}`);
    logger.warn(`  Preview: ${previewDir}`);
    logger.warn(`  Tracked Page Content: ${trackedPageContentDir}`);
    logger.warn(`  Modified Page Content: ${modifiedPageContentDir}`);
    logger.warn(`  Scrubbed Source Content: ${scrubbedSourceContentDir}`);
    logger.warn(`  Markdown Export: ${markdownExportDir}`);
    if (includeConfDir) {
      logger.warn(`  Conf: ${confDir}`);
    }
    for (const dir of additionalDirs) {
      logger.warn(`  Additional: ${dir}`);
    }
    return null;
  }

  // Collect directories that exist
  const directoriesToCommit: string[] = [];
  if (publishedExists) {
    directoriesToCommit.push(publishedDir);
    logger.info(`[commitSiteChanges] Will commit published dir: ${publishedDir}`);
  }
  if (previewExists) {
    directoriesToCommit.push(previewDir);
    logger.info(`[commitSiteChanges] Will commit preview dir: ${previewDir}`);
  }
  if (trackedPageContentExists) {
    directoriesToCommit.push(trackedPageContentDir);
    logger.info(`[commitSiteChanges] Will commit tracked_page_content dir: ${trackedPageContentDir}`);
  }
  if (modifiedPageContentExists) {
    directoriesToCommit.push(modifiedPageContentDir);
    logger.info(`[commitSiteChanges] Will commit modified_page_content dir: ${modifiedPageContentDir}`);
  }
  if (scrubbedSourceContentExists) {
    directoriesToCommit.push(scrubbedSourceContentDir);
    logger.info(`[commitSiteChanges] Will commit scrubbed_source_content dir: ${scrubbedSourceContentDir}`);
  }
  if (markdownExportExists) {
    directoriesToCommit.push(markdownExportDir);
    logger.info(`[commitSiteChanges] Will commit markdown_export dir: ${markdownExportDir}`);
  }
  if (confExists) {
    directoriesToCommit.push(confDir);
    logger.info(`[commitSiteChanges] Will commit conf dir: ${confDir}`);
  }
  for (const dir of existingAdditionalDirs) {
    directoriesToCommit.push(dir);
    logger.info(`[commitSiteChanges] Will commit additional dir: ${dir}`);
  }

  try {
    // Use native fast_git_ops for fast commit
    const sha = await commitChangesNative(
      directoriesToCommit,
      commitMessage,
      { configDir: getConfigDirectory() }
    );

    if (sha) {
      logger.info(`[commitSiteChanges] Committed site changes: ${sha}`);
    } else {
      logger.info('[commitSiteChanges] No changes to commit');
    }

    return sha;
  } catch (error) {
    logger.error('[commitSiteChanges] Error committing site changes:', error);
    return null;
  }
}

/**
 * Get all files in a directory recursively.
 */
function getAllFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    return fileList;
  }

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      // Skip .git directories
      if (file !== '.git') {
        getAllFiles(filePath, fileList);
      }
    } else {
      fileList.push(filePath);
    }
  }
  return fileList;
}

/**
 * Generate a unified diff between two strings.
 */
function generateUnifiedDiff(
  oldContent: string,
  newContent: string,
  filepath: string
): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  // Simple unified diff generation
  const diff: string[] = [];
  diff.push(`--- a/${filepath}`);
  diff.push(`+++ b/${filepath}`);

  // Use a simple line-by-line diff algorithm
  const changes = computeLineDiff(oldLines, newLines);

  // Group changes into hunks
  const hunks = groupIntoHunks(changes, oldLines, newLines);

  for (const hunk of hunks) {
    diff.push(hunk);
  }

  return diff.join('\n');
}

interface Change {
  type: 'same' | 'add' | 'remove';
  oldIndex: number;
  newIndex: number;
  line: string;
}

/**
 * Compute line-by-line differences using a simple LCS-based algorithm.
 */
function computeLineDiff(oldLines: string[], newLines: string[]): Change[] {
  // Build LCS matrix
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find diff
  const changes: Change[] = [];
  let i = m, j = n;
  const tempChanges: Change[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      tempChanges.push({ type: 'same', oldIndex: i - 1, newIndex: j - 1, line: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      tempChanges.push({ type: 'add', oldIndex: -1, newIndex: j - 1, line: newLines[j - 1] });
      j--;
    } else {
      tempChanges.push({ type: 'remove', oldIndex: i - 1, newIndex: -1, line: oldLines[i - 1] });
      i--;
    }
  }

  // Reverse to get correct order
  for (let k = tempChanges.length - 1; k >= 0; k--) {
    changes.push(tempChanges[k]);
  }

  return changes;
}

/**
 * Group changes into unified diff hunks.
 */
function groupIntoHunks(changes: Change[], oldLines: string[], newLines: string[]): string[] {
  const hunks: string[] = [];
  const contextLines = 3;

  let hunkStart = -1;
  let hunkChanges: Change[] = [];

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];

    if (change.type !== 'same') {
      // Start or extend a hunk
      if (hunkStart === -1) {
        // Start new hunk with context
        hunkStart = Math.max(0, i - contextLines);
        for (let j = hunkStart; j < i; j++) {
          hunkChanges.push(changes[j]);
        }
      }
      hunkChanges.push(change);
    } else {
      // Check if we should end the current hunk
      if (hunkStart !== -1) {
        // Look ahead for more changes
        let moreChanges = false;
        for (let j = i + 1; j < Math.min(i + contextLines * 2 + 1, changes.length); j++) {
          if (changes[j].type !== 'same') {
            moreChanges = true;
            break;
          }
        }

        if (moreChanges) {
          hunkChanges.push(change);
        } else {
          // Add trailing context and close hunk
          for (let j = i; j < Math.min(i + contextLines, changes.length); j++) {
            hunkChanges.push(changes[j]);
          }

          // Generate hunk header and content
          const hunk = generateHunk(hunkChanges, oldLines.length, newLines.length);
          hunks.push(hunk);

          hunkStart = -1;
          hunkChanges = [];
        }
      }
    }
  }

  // Handle remaining hunk
  if (hunkChanges.length > 0) {
    const hunk = generateHunk(hunkChanges, oldLines.length, newLines.length);
    hunks.push(hunk);
  }

  return hunks;
}

/**
 * Generate a single hunk from changes.
 */
function generateHunk(changes: Change[], _totalOldLines: number, _totalNewLines: number): string {
  if (changes.length === 0) return '';

  const lines: string[] = [];

  // Calculate hunk bounds
  let oldStart = -1, oldCount = 0;
  let newStart = -1, newCount = 0;

  for (const change of changes) {
    if (change.type === 'same' || change.type === 'remove') {
      if (oldStart === -1) oldStart = change.oldIndex + 1;
      oldCount++;
    }
    if (change.type === 'same' || change.type === 'add') {
      if (newStart === -1) newStart = change.newIndex + 1;
      newCount++;
    }
  }

  // Default to 1 if not set
  if (oldStart === -1) oldStart = 1;
  if (newStart === -1) newStart = 1;

  lines.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);

  for (const change of changes) {
    switch (change.type) {
      case 'same':
        lines.push(` ${change.line}`);
        break;
      case 'add':
        lines.push(`+${change.line}`);
        break;
      case 'remove':
        lines.push(`-${change.line}`);
        break;
    }
  }

  return lines.join('\n');
}

/**
 * Get the differences between the current preview and the last published version.
 * Compares the preview directory against the current published directory on disk.
 * (Git is used for committing after publish, not for the diff comparison itself)
 */
export function getPreviewChanges(siteDirectory: string): PreviewChanges {
  const previewDir = SiteConfigPaths.getPreviewDir(siteDirectory);
  const publishedDir = SiteConfigPaths.getGeneratedSiteVersionsDir(siteDirectory);

  const changedFiles: DiffResult[] = [];
  const fileDiffs: Record<string, FileDiff> = {};

  // If no preview dir, return empty
  if (!fs.existsSync(previewDir)) {
    return { changedFiles, fileDiffs };
  }

  // Get all current preview files
  const previewFiles = new Map<string, string>();
  const previewFileList = getAllFiles(previewDir);
  for (const file of previewFileList) {
    const relativePath = path.relative(previewDir, file);
    try {
      const content = fs.readFileSync(file, 'utf8');
      previewFiles.set(relativePath, content);
    } catch {
      // Binary file or unreadable
    }
  }

  // Get published files content from the latest version directory
  const publishedFiles = new Map<string, string>();

  if (fs.existsSync(publishedDir)) {
    // Find version directories
    const versionDirs = fs.readdirSync(publishedDir).filter(f => {
      const fullPath = path.join(publishedDir, f);
      return fs.statSync(fullPath).isDirectory();
    });

    if (versionDirs.length > 0) {
      // Use the most recent version directory
      const latestVersion = versionDirs.sort().pop();
      if (latestVersion) {
        const latestVersionDir = path.join(publishedDir, latestVersion);
        const publishedFileList = getAllFiles(latestVersionDir);

        for (const file of publishedFileList) {
          const relativePath = path.relative(latestVersionDir, file);
          try {
            const content = fs.readFileSync(file, 'utf8');
            publishedFiles.set(relativePath, content);
          } catch {
            // Binary file or unreadable
          }
        }
      }
    }
  }

  // If no published files, all preview files are new
  if (publishedFiles.size === 0) {
    for (const [filepath, content] of previewFiles.entries()) {
      // Skip non-HTML files for the diff view
      if (!filepath.endsWith('.html')) continue;

      changedFiles.push({ filepath, type: 'A' });
      fileDiffs[filepath] = {
        filepath,
        type: 'A',
        oldContent: '',
        newContent: content,
        unifiedDiff: generateUnifiedDiff('', content, filepath)
      };
    }

    changedFiles.sort((a, b) => a.filepath.localeCompare(b.filepath));
    return { changedFiles, fileDiffs };
  }

  // Compare files
  const allPaths = new Set([...publishedFiles.keys(), ...previewFiles.keys()]);

  for (const filepath of allPaths) {
    // Skip non-HTML files
    if (!filepath.endsWith('.html')) continue;

    const oldContent = publishedFiles.get(filepath) || '';
    const newContent = previewFiles.get(filepath) || '';

    if (!publishedFiles.has(filepath)) {
      // New file
      changedFiles.push({ filepath, type: 'A' });
      fileDiffs[filepath] = {
        filepath,
        type: 'A',
        oldContent: '',
        newContent,
        unifiedDiff: generateUnifiedDiff('', newContent, filepath)
      };
    } else if (!previewFiles.has(filepath)) {
      // Deleted file
      changedFiles.push({ filepath, type: 'D' });
      fileDiffs[filepath] = {
        filepath,
        type: 'D',
        oldContent,
        newContent: '',
        unifiedDiff: generateUnifiedDiff(oldContent, '', filepath)
      };
    } else if (oldContent !== newContent) {
      // Modified file
      changedFiles.push({ filepath, type: 'M' });
      fileDiffs[filepath] = {
        filepath,
        type: 'M',
        oldContent,
        newContent,
        unifiedDiff: generateUnifiedDiff(oldContent, newContent, filepath)
      };
    }
  }

  // Sort changed files alphabetically
  changedFiles.sort((a, b) => a.filepath.localeCompare(b.filepath));

  return { changedFiles, fileDiffs };
}
