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
import { BundleConfig, GeneratedBundleVersion } from '../../../../shared_code/types/bundleConfig.js';
import { BundleConfigPaths } from '../../../../shared_code/paths/bundleConfigPaths.js';
import { logger } from './logging/backendLoggingUtils.js';

export function loadBundleConfig(bundleDirectory: string): BundleConfig {
  const configPath = BundleConfigPaths.getBundleConfigFile(bundleDirectory);
  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    return yaml.load(configContent) as BundleConfig || {};
  }
  return {};
}

export function saveBundleConfig(bundleDirectory: string, config: BundleConfig): void {
  const configPath = BundleConfigPaths.getBundleConfigFile(bundleDirectory);
  const configContent = yaml.dump(config, { quotingType: '"' });
  fs.writeFileSync(configPath, configContent);
}

export function loadBundleConfigFromPath(configPath: string): BundleConfig {
  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    return yaml.load(configContent) as BundleConfig || {};
  }
  return {};
}

export function saveBundleConfigToPath(configPath: string, config: BundleConfig): void {
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

export function updateBundleConfig(bundleDirectory: string, updates: Partial<BundleConfig>): BundleConfig {
  const config = loadBundleConfig(bundleDirectory);
  const updatedConfig = { ...config, ...updates };
  saveBundleConfig(bundleDirectory, updatedConfig);
  return updatedConfig;
}

export function getLatestVersion(bundleConfig: BundleConfig): string | null {
  const versions = bundleConfig.generatedBundleVersions || [];
  return versions.length > 0 ? versions[versions.length - 1] : null;
}

/**
 * Gets all published versions for a bundle, with fallback to generated_bundle_versions.yaml
 */
export function getGeneratedBundleVersionsWithFallback(bundleDirectory: string, bundleConfig: BundleConfig): string[] {
  let versions = bundleConfig.generatedBundleVersions || [];
  
  if (versions.length === 0) {
    const versionsPath = path.join(BundleConfigPaths.getConfigDir(bundleDirectory), 'generated_bundle_versions.yaml');
    if (fs.existsSync(versionsPath)) {
      try {
        const versionsData = loadYamlFromPath<{ versions: GeneratedBundleVersion[] }>(versionsPath);
        if (versionsData.versions && versionsData.versions.length > 0) {
          versions = versionsData.versions.map(v => v.versionId);
        }
      } catch (error) {
        logger.error(`Could not read generated_bundle_versions.yaml in ${bundleDirectory}:`, error);
      }
    }
  }
  
  return versions;
}

/**
 * Gets the latest published version for a bundle, with fallback to generated_bundle_versions.yaml
 */
export function getLatestGeneratedBundleVersionWithFallback(bundleDirectory: string, bundleConfig: BundleConfig): string | null {
  const versions = bundleConfig.generatedBundleVersions || [];
  
  if (versions.length > 0) {
    return versions[versions.length - 1];
  }
  
  const versionsPath = path.join(BundleConfigPaths.getConfigDir(bundleDirectory), 'generated_bundle_versions.yaml');
  if (fs.existsSync(versionsPath)) {
    try {
      const versionsData = loadYamlFromPath<{ versions: GeneratedBundleVersion[] }>(versionsPath);
      if (versionsData.versions && versionsData.versions.length > 0) {
        // Get the last active version, or just the last version if none are explicitly active
        const activeVersion = versionsData.versions.find(v => v.isActive);
        return activeVersion ? activeVersion.versionId : versionsData.versions[versionsData.versions.length - 1].versionId;
      }
    } catch (error) {
      logger.error(`Could not read generated_bundle_versions.yaml in ${bundleDirectory}:`, error);
    }
  }
  
  return null;
}
