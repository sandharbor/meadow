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
import YAML from 'yaml';
import { getBundleConfigPath } from '../../bundle-config/bundleConfigPaths.js';
import { isValidBundleGuid } from '../../../../../../shared_code/utils/bundleGuidUtils.js';
import { logger, LogLevel } from './backendLoggingUtils.js';

const guidCache = new Map<string, string>();

function _loadBundleGuid(bundleSlug: string): string {
  const cached = guidCache.get(bundleSlug);
  if (cached) return cached;

  try {
    const configPath = getBundleConfigPath(bundleSlug, 'bundle_config.yaml');
    if (!fs.existsSync(configPath)) {
      guidCache.set(bundleSlug, 'unknown');
      return 'unknown';
    }
    const yamlContent = fs.readFileSync(configPath, 'utf8');
    const parsed = (YAML.parse(yamlContent) || {}) as { bundleGuid?: unknown };
    const guid = isValidBundleGuid(parsed.bundleGuid) ? parsed.bundleGuid : 'unknown';
    guidCache.set(bundleSlug, guid);
    return guid;
  } catch {
    guidCache.set(bundleSlug, 'unknown');
    return 'unknown';
  }
}

export function clearBundleGuidCache(bundleSlug?: string): void {
  if (bundleSlug) guidCache.delete(bundleSlug);
  else guidCache.clear();
}

/** Internal: Adds [bundle GUID] prefix and delegates to main logger. */
function _logBundle(bundleSlug: string, message: string, level: LogLevel): void {
  const bundleGuid = _loadBundleGuid(bundleSlug);
  logger.log(level, `[bundle ${bundleGuid}] ${message}`);
}

export function logBundleInfo(bundleSlug: string, message: string): void {
  _logBundle(bundleSlug, message, LogLevel.Info);
}

export function logBundleWarn(bundleSlug: string, message: string): void {
  _logBundle(bundleSlug, message, LogLevel.Warn);
}

export function logBundleError(bundleSlug: string, message: string): void {
  _logBundle(bundleSlug, message, LogLevel.Error);
}

export function logBundleDebug(bundleSlug: string, message: string): void {
  _logBundle(bundleSlug, message, LogLevel.Debug);
}
