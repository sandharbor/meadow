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
import { getConfigDirectory } from '../../../bundle-config/bundleConfigPaths.js';
import { BundleConfigPaths } from '../../../../../../../shared_code/paths/bundleConfigPaths.js';
import { logger } from '../../logging/backendLoggingUtils.js';
import { timeAsync } from '../../../telemetry/timingMetrics.js';

interface CommitOptions {
  /** Include the config directory (contains generated_bundle_versions.yaml). Default: false */
  includeConfigDir?: boolean;
  /** Extra directories to include in the same commit (e.g. provider-owned caches). */
  additionalDirs?: string[];
  /**
   * Include generated version directories with their local generation
   * records. Default: true. Callers coordinating a commit that must not save
   * an invalid current result exclude them.
   */
  includeGeneratedResults?: boolean;
}

/**
 * Commit bundle changes to git.
 * Uses the native fast_git_ops binary for fast commits of multiple directories.
 * Commits html/generated_bundle_versions, raw/tracked_page_content,
 * generated build intermediates, and cleanup paths. Optionally includes the config
 * directory for publish operations. Callers (typically publishing providers)
 * can pass `additionalDirs` to include provider-scoped caches in the same commit.
 */
export async function commitBundleChanges(
  bundleDirectory: string,
  commitMessage: string,
  options: CommitOptions = {}
): Promise<string | null> {
  const { includeConfigDir = false, additionalDirs = [], includeGeneratedResults = true } = options;

  const publishedDir = BundleConfigPaths.getGeneratedBundleVersionsDir(bundleDirectory);
  const trackedPageContentDir = BundleConfigPaths.getTrackedPageContentDir(bundleDirectory);
  const buildDir = BundleConfigPaths.getBuildDir(bundleDirectory);
  const configDir = BundleConfigPaths.getConfigDir(bundleDirectory);

  // Check if at least one directory exists
  const publishedExists = includeGeneratedResults && fs.existsSync(publishedDir);
  const trackedPageContentExists = fs.existsSync(trackedPageContentDir);
  const buildExists = fs.existsSync(buildDir);
  const configExists = includeConfigDir && fs.existsSync(configDir);
  const generationInputsDirectory = path.join(bundleDirectory, 'raw/generation_inputs');
  const existingAdditionalDirs = [...additionalDirs, ...(includeGeneratedResults ? [generationInputsDirectory] : [])]
    .filter(d => fs.existsSync(d));

  if (
    !publishedExists &&
    !trackedPageContentExists &&
    !buildExists &&
    !configExists &&
    existingAdditionalDirs.length === 0
  ) {
    logger.warn(`[commitBundleChanges] No directories found to commit`);
    logger.warn(`  Published: ${publishedDir}`);
    logger.warn(`  Tracked Page Content: ${trackedPageContentDir}`);
    logger.warn(`  Build: ${buildDir}`);
    if (includeConfigDir) {
      logger.warn(`  Config: ${configDir}`);
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
    logger.info(`[commitBundleChanges] Will commit published dir: ${publishedDir}`);
  }
  if (trackedPageContentExists) {
    directoriesToCommit.push(trackedPageContentDir);
    logger.info(`[commitBundleChanges] Will commit tracked_page_content dir: ${trackedPageContentDir}`);
  }
  if (buildExists) {
    directoriesToCommit.push(buildDir);
    logger.info(`[commitBundleChanges] Will commit build dir: ${buildDir}`);
  }
  if (configExists) {
    directoriesToCommit.push(configDir);
    logger.info(`[commitBundleChanges] Will commit config dir: ${configDir}`);
  }
  for (const dir of existingAdditionalDirs) {
    directoriesToCommit.push(dir);
    logger.info(`[commitBundleChanges] Will commit additional dir: ${dir}`);
  }

  try {
    // Use native fast_git_ops for fast commit
    const sha = await timeAsync(
      'bundle.git.stage',
      {
        stage: 'commit_bundle_changes',
        directory_count: directoriesToCommit.length,
        include_config_dir: includeConfigDir,
        additional_dir_count: existingAdditionalDirs.length,
      },
      () => commitChangesNative(
        directoriesToCommit,
        commitMessage,
        { configDir: getConfigDirectory() }
      )
    );

    if (sha) {
      logger.info(`[commitBundleChanges] Committed bundle changes: ${sha}`);
    } else {
      logger.info('[commitBundleChanges] No changes to commit');
    }

    return sha;
  } catch (error) {
    logger.error('[commitBundleChanges] Error committing bundle changes:', error);
    return null;
  }
}
