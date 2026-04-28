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
import * as yaml from 'js-yaml';
import { SiteConfig, GeneratedSiteVersion } from '../../../shared_code/types/siteConfig.js';
import { SiteConfigPaths } from '../../../shared_code/paths/siteConfigPaths.js';
import { logger } from './logging/backendLoggingUtils.js';

export function loadSiteConfig(siteDirectory: string): SiteConfig {
  const configPath = SiteConfigPaths.getSiteConfigFile(siteDirectory);
  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    return yaml.load(configContent) as SiteConfig || {};
  }
  return {};
}

export function saveSiteConfig(siteDirectory: string, config: SiteConfig): void {
  const configPath = SiteConfigPaths.getSiteConfigFile(siteDirectory);
  const configContent = yaml.dump(config, { quotingType: '"' });
  fs.writeFileSync(configPath, configContent);
}

export function loadSiteConfigFromPath(configPath: string): SiteConfig {
  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    return yaml.load(configContent) as SiteConfig || {};
  }
  return {};
}

export function saveSiteConfigToPath(configPath: string, config: SiteConfig): void {
  const configContent = yaml.dump(config, { quotingType: '"' });
  fs.writeFileSync(configPath, configContent);
}

export function loadYamlFromPath<T = Record<string, unknown>>(configPath: string): T {
  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    return yaml.load(configContent) as T || {} as T;
  }
  return {} as T;
}

export function saveYamlToPath<T = Record<string, unknown>>(configPath: string, data: T): void {
  const configContent = yaml.dump(data, { quotingType: '"' });
  fs.writeFileSync(configPath, configContent);
}

export function updateSiteConfig(siteDirectory: string, updates: Partial<SiteConfig>): SiteConfig {
  const config = loadSiteConfig(siteDirectory);
  const updatedConfig = { ...config, ...updates };
  saveSiteConfig(siteDirectory, updatedConfig);
  return updatedConfig;
}

export function getLatestVersion(siteConfig: SiteConfig): string | null {
  const versions = siteConfig.generatedSiteVersions || [];
  return versions.length > 0 ? versions[versions.length - 1] : null;
}

/**
 * Gets all published versions for a site, with fallback to generated_site_versions.yaml
 */
export function getGeneratedSiteVersionsWithFallback(siteDirectory: string, siteConfig: SiteConfig): string[] {
  let versions = siteConfig.generatedSiteVersions || [];
  
  if (versions.length === 0) {
    const versionsPath = path.join(SiteConfigPaths.getConfDir(siteDirectory), 'generated_site_versions.yaml');
    if (fs.existsSync(versionsPath)) {
      try {
        const versionsData = loadYamlFromPath<{ versions: GeneratedSiteVersion[] }>(versionsPath);
        if (versionsData.versions && versionsData.versions.length > 0) {
          versions = versionsData.versions.map(v => v.versionId);
        }
      } catch (error) {
        logger.error(`Could not read generated_site_versions.yaml in ${siteDirectory}:`, error);
      }
    }
  }
  
  return versions;
}

/**
 * Gets the latest published version for a site, with fallback to generated_site_versions.yaml
 */
export function getLatestGeneratedSiteVersionWithFallback(siteDirectory: string, siteConfig: SiteConfig): string | null {
  const versions = siteConfig.generatedSiteVersions || [];
  
  if (versions.length > 0) {
    return versions[versions.length - 1];
  }
  
  const versionsPath = path.join(SiteConfigPaths.getConfDir(siteDirectory), 'generated_site_versions.yaml');
  if (fs.existsSync(versionsPath)) {
    try {
      const versionsData = loadYamlFromPath<{ versions: GeneratedSiteVersion[] }>(versionsPath);
      if (versionsData.versions && versionsData.versions.length > 0) {
        // Get the last active version, or just the last version if none are explicitly active
        const activeVersion = versionsData.versions.find(v => v.isActive);
        return activeVersion ? activeVersion.versionId : versionsData.versions[versionsData.versions.length - 1].versionId;
      }
    } catch (error) {
      logger.error(`Could not read generated_site_versions.yaml in ${siteDirectory}:`, error);
    }
  }
  
  return null;
}
