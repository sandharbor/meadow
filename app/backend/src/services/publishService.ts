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
import { loadSiteConfig, saveSiteConfig } from '../utils/siteConfigUtils.js';

export function generateVersionId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'v';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

interface GeneratedSiteVersionsData {
  versions: GeneratedSiteVersion[];
}

export function createOrUpdateGeneratedSiteVersions(
  siteDirectory: string,
  versionId: string,
  notes: string = '',
  isNewVersion: boolean = false
): void {
  const versionsPath = path.join(siteDirectory, 'conf', 'generated_site_versions.yaml');
  let versionsData: GeneratedSiteVersionsData = { versions: [] };

  // Load existing versions if file exists
  if (fs.existsSync(versionsPath)) {
    const yamlContent = fs.readFileSync(versionsPath, 'utf8');
    versionsData = yaml.load(yamlContent) as GeneratedSiteVersionsData || { versions: [] };
  }

  const now = new Date().toISOString();

  if (isNewVersion) {
    // Set all existing versions to inactive when creating a new version
    versionsData.versions.forEach(v => v.isActive = false);

    // Add the new version
    versionsData.versions.push({
      versionId,
      firstPublishedAt: now,
      lastUpdatedAt: now,
      notes,
      isActive: true
    });
  } else {
    // Check if version already exists
    const existingVersionIndex = versionsData.versions.findIndex(v => v.versionId === versionId);

    if (existingVersionIndex >= 0) {
      // Update existing version
      versionsData.versions[existingVersionIndex].lastUpdatedAt = now;
      versionsData.versions[existingVersionIndex].notes = notes;
    } else {
      // Set all existing versions to inactive
      versionsData.versions.forEach(v => v.isActive = false);

      // Add new version (this is the first publish)
      versionsData.versions.push({
        versionId,
        firstPublishedAt: now,
        lastUpdatedAt: now,
        notes,
        isActive: true
      });
    }
  }

  const updatedYaml = yaml.dump(versionsData);
  fs.writeFileSync(versionsPath, updatedYaml, 'utf8');
}

/**
 * Central function for recording a publish version. Ensures the versionId is
 * tracked in site_config.yaml's generatedSiteVersions and updates generated_site_versions.yaml.
 *
 * When `siteConfig` is provided (the in-memory object), it is mutated in place
 * and saved — this preserves the existing behaviour of publishToVersionedDirectory
 * and publishToNewVersion which already hold a loaded config.
 *
 * When `siteConfig` is omitted the function loads, updates, and saves the config
 * itself (load-update-save pattern for callers like publish-from-cache-stream).
 */
export function recordGeneratedSiteVersion(
  siteDirectory: string,
  versionId: string,
  options: {
    isNewVersion?: boolean;
    notes?: string;
    siteConfig?: SiteConfig;
  } = {}
): void {
  const { isNewVersion = false, notes = '', siteConfig: providedConfig } = options;

  if (providedConfig) {
    // Mutate the provided config and save it (existing behaviour)
    if (!providedConfig.generatedSiteVersions) {
      providedConfig.generatedSiteVersions = [];
    }
    if (isNewVersion) {
      providedConfig.generatedSiteVersions.push(versionId);
    } else if (!providedConfig.generatedSiteVersions.includes(versionId)) {
      providedConfig.generatedSiteVersions.push(versionId);
    }
    saveSiteConfig(siteDirectory, providedConfig);
  } else {
    // Load-update-save pattern
    const config = loadSiteConfig(siteDirectory);
    const currentVersions = config.generatedSiteVersions || [];
    if (!currentVersions.includes(versionId)) {
      config.generatedSiteVersions = [...currentVersions, versionId];
      saveSiteConfig(siteDirectory, config);
    }
  }

  createOrUpdateGeneratedSiteVersions(siteDirectory, versionId, notes, isNewVersion);
}
