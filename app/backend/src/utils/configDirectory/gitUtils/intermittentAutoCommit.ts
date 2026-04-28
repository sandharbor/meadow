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

import { commitChangesNative, runGitStatusNative } from './gitStatusUtils.js';
import { getLastGitOperationTime } from './gitOperationTracker.js';
import { getConfigDirectory } from '../../../routes/siteConfigRoutes.js';
import { loadAppConfig } from '../../../../../shared_code/utils/appConfigUtils.js';
import { logger } from '../../logging/backendLoggingUtils.js';

const COMMIT_INTERVAL_MS = 30_000; // 30 seconds
const MIN_TIME_SINCE_LAST_GIT_OP_MS = 30_000; // 30 seconds

let intervalId: NodeJS.Timeout | null = null;

/**
 * Check if there are uncommitted changes in the config directory.
 */
async function hasUncommittedChanges(configDir: string): Promise<boolean> {
  try {
    const statusMap = await runGitStatusNative(configDir);
    return statusMap.size > 0;
  } catch (error) {
    logger.warn('[intermittentAutoCommit] Error checking git status:', error);
    return false;
  }
}

/**
 * Perform the intermittent auto-commit check and commit if appropriate.
 */
async function performAutoCommitCheck(): Promise<void> {
  const configDir = getConfigDirectory();
  const appConfig = loadAppConfig(configDir);

  // Check if automatic git management is enabled
  if (appConfig.manageGitAutomatically === false) {
    // Don't log on every interval - would be too noisy
    return;
  }

  const now = Date.now();
  const lastGitOpTime = getLastGitOperationTime();
  const timeSinceLastGitOp = now - lastGitOpTime;

  // Skip if a git operation happened recently
  if (lastGitOpTime > 0 && timeSinceLastGitOp < MIN_TIME_SINCE_LAST_GIT_OP_MS) {
    logger.debug(`[intermittentAutoCommit] Skipping - git operation occurred ${Math.round(timeSinceLastGitOp / 1000)}s ago`);
    return;
  }

  // Check for uncommitted changes
  const hasChanges = await hasUncommittedChanges(configDir);

  if (!hasChanges) {
    logger.debug('[intermittentAutoCommit] Checked but no uncommitted changes found');
    return;
  }

  try {
    const sha = await commitChangesNative(
      [configDir],
      'intermittent automatic commit',
      { configDir }
    );

    if (sha) {
      logger.info(`[intermittentAutoCommit] Committed changes: ${sha}`);
    }
  } catch (error) {
    logger.error('[intermittentAutoCommit] Error during auto-commit:', error);
  }
}

/**
 * Start the intermittent auto-commit interval.
 * Should be called once during server startup.
 */
export function startIntermittentAutoCommit(): void {
  if (intervalId !== null) {
    logger.warn('[intermittentAutoCommit] Already started, ignoring duplicate call');
    return;
  }

  logger.info('[intermittentAutoCommit] Starting intermittent auto-commit (every 30s)');

  intervalId = setInterval(() => {
    performAutoCommitCheck().catch((error) => {
      logger.error('[intermittentAutoCommit] Unexpected error in auto-commit check:', error);
    });
  }, COMMIT_INTERVAL_MS);
}

/**
 * Stop the intermittent auto-commit interval.
 * Useful for graceful shutdown or testing.
 */
export function stopIntermittentAutoCommit(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('[intermittentAutoCommit] Stopped intermittent auto-commit');
  }
}
