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

import { performRotationMaintenance, getRotationConfig } from './logRotation.js';
import { logger } from '../backendLoggingUtils.js';

const DEFAULT_MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000; // Default: check every hour
const MIN_MAINTENANCE_INTERVAL_MS = 5 * 1000; // Minimum: 5 seconds

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Calculate maintenance interval based on rotation config
 * Check at least as often as the rotation interval, but not more than once per 5 seconds
 */
function getMaintenanceIntervalMs(configDir?: string): number {
  const config = getRotationConfig(configDir);
  const rotationIntervalMs = config.logRotationIntervalSecs * 1000;

  // Use rotation interval if it's shorter than the default, but respect minimum
  const interval = Math.min(rotationIntervalMs, DEFAULT_MAINTENANCE_INTERVAL_MS);
  return Math.max(interval, MIN_MAINTENANCE_INTERVAL_MS);
}

/**
 * Start the log maintenance service
 * Performs rotation and cleanup checks periodically
 */
export function startLogMaintenance(configDir?: string): void {
  if (intervalId !== null) {
    logger.warn('[logMaintenance] Already started, ignoring duplicate call');
    return;
  }

  const intervalMs = getMaintenanceIntervalMs(configDir);
  logger.info(`[logMaintenance] Starting log maintenance service (interval: ${intervalMs / 1000}s)`);

  // Run immediately at startup
  try {
    performRotationMaintenance(configDir);
    logger.info('[logMaintenance] Initial rotation/cleanup check complete');
  } catch (error) {
    logger.error('[logMaintenance] Error during initial check', error);
  }

  // Set up periodic checks
  intervalId = setInterval(() => {
    try {
      performRotationMaintenance(configDir);
    } catch (error) {
      logger.error('[logMaintenance] Error during periodic check', error);
    }
  }, intervalMs);
}

/**
 * Stop the log maintenance service
 */
export function stopLogMaintenance(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('[logMaintenance] Stopped log maintenance service');
  }
}
