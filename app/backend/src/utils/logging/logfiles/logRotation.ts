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
import { loadAppConfig } from '../../../../../shared_code/utils/appConfigUtils.js';
import { getLogDirectory } from '../backendLoggingUtils.js';

const CURRENT_LOG_FILE = 'meadow.log';

export interface LogRotationConfig {
  logRotationIntervalSecs: number;
  logRetentionSecs: number;
}

/**
 * Get rotation config from app config, with defaults
 */
export function getRotationConfig(configDir?: string): LogRotationConfig {
  const appConfig = loadAppConfig(configDir);
  return {
    logRotationIntervalSecs: appConfig.logRotationIntervalSecs ?? 86400,
    logRetentionSecs: appConfig.logRetentionSecs ?? 1209600,
  };
}

/**
 * Generate rotated log filename with date and time
 * Format: meadow-YYYY-MM-DD_HH-MM-SS.log
 */
export function generateRotatedFilename(date: Date = new Date()): string {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
  return `meadow-${dateStr}_${timeStr}.log`;
}

/**
 * Check if rotation is needed based on file age (time since creation)
 */
export function shouldRotate(config: LogRotationConfig): boolean {
  const logDir = getLogDirectory();
  const logPath = path.join(logDir, CURRENT_LOG_FILE);

  if (!fs.existsSync(logPath)) {
    return false;
  }

  try {
    const stats = fs.statSync(logPath);
    // Use birthtime (creation time) for true time-based rotation
    // This rotates based on how long the file has existed, not last modification
    const ageSeconds = (Date.now() - stats.birthtime.getTime()) / 1000;
    return ageSeconds >= config.logRotationIntervalSecs;
  } catch {
    return false;
  }
}

/**
 * Rotate the current log file
 */
export function rotateCurrentLog(): string | null {
  const logDir = getLogDirectory();
  const currentPath = path.join(logDir, CURRENT_LOG_FILE);

  if (!fs.existsSync(currentPath)) {
    return null;
  }

  const newName = generateRotatedFilename();
  const newPath = path.join(logDir, newName);

  try {
    fs.renameSync(currentPath, newPath);
    return newName;
  } catch (error) {
    console.error('Error rotating log file:', error);
    return null;
  }
}

/**
 * Delete log files older than retention period
 */
export function cleanupOldLogs(config: LogRotationConfig): string[] {
  const logDir = getLogDirectory();
  const deleted: string[] = [];
  const retentionMs = config.logRetentionSecs * 1000;
  const now = Date.now();

  if (!fs.existsSync(logDir)) {
    return deleted;
  }

  try {
    const files = fs.readdirSync(logDir);

    for (const file of files) {
      // Only process rotated log files (meadow-YYYY-MM-DD_HH-MM-SS.log pattern)
      if (!file.match(/^meadow-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.log$/)) {
        continue;
      }

      const filePath = path.join(logDir, file);
      const stats = fs.statSync(filePath);
      const fileAge = now - stats.mtime.getTime();

      if (fileAge > retentionMs) {
        fs.unlinkSync(filePath);
        deleted.push(file);
      }
    }
  } catch (error) {
    console.error('Error cleaning up old logs:', error);
  }

  return deleted;
}

/**
 * Perform rotation check and cleanup
 * Call this at startup and periodically
 */
export function performRotationMaintenance(configDir?: string): void {
  const config = getRotationConfig(configDir);

  if (shouldRotate(config)) {
    rotateCurrentLog();
  }

  cleanupOldLogs(config);
}
