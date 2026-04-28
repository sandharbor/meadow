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
import { getSiteConfigPath } from '../../routes/siteConfigRoutes.js';
import { isValidSiteGuid } from '../../../../shared_code/utils/siteGuidUtils.js';
import { logger, LogLevel } from './backendLoggingUtils.js';

const guidCache = new Map<string, string>();

function _loadSiteGuid(siteSlug: string): string {
  const cached = guidCache.get(siteSlug);
  if (cached) return cached;

  try {
    const configPath = getSiteConfigPath(siteSlug, 'site_config.yaml');
    if (!fs.existsSync(configPath)) {
      guidCache.set(siteSlug, 'unknown');
      return 'unknown';
    }
    const yamlContent = fs.readFileSync(configPath, 'utf8');
    const parsed = (YAML.parse(yamlContent) || {}) as { siteGuid?: unknown };
    const guid = isValidSiteGuid(parsed.siteGuid) ? parsed.siteGuid : 'unknown';
    guidCache.set(siteSlug, guid);
    return guid;
  } catch {
    guidCache.set(siteSlug, 'unknown');
    return 'unknown';
  }
}

export function clearSiteGuidCache(siteSlug?: string): void {
  if (siteSlug) guidCache.delete(siteSlug);
  else guidCache.clear();
}

/** Internal: Adds [site GUID] prefix and delegates to main logger. */
function _logSite(siteSlug: string, message: string, level: LogLevel): void {
  const siteGuid = _loadSiteGuid(siteSlug);
  logger.log(level, `[site ${siteGuid}] ${message}`);
}

export function logSiteInfo(siteSlug: string, message: string): void {
  _logSite(siteSlug, message, LogLevel.Info);
}

export function logSiteWarn(siteSlug: string, message: string): void {
  _logSite(siteSlug, message, LogLevel.Warn);
}

export function logSiteError(siteSlug: string, message: string): void {
  _logSite(siteSlug, message, LogLevel.Error);
}

export function logSiteDebug(siteSlug: string, message: string): void {
  _logSite(siteSlug, message, LogLevel.Debug);
}
