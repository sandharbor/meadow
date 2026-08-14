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
import { BundleConfig, GeneratedBundleVersion } from '../../../../../../shared_code/types/bundleConfig.js';
import { loadBundleConfig, saveBundleConfig } from '../../../../shared/utils/bundleConfigUtils.js';

export function generateVersionId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'v';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

interface GeneratedBundleVersionsData {
  versions: GeneratedBundleVersion[];
}

export function createOrUpdateGeneratedBundleVersions(
  bundleDirectory: string,
  versionId: string,
  notes: string = '',
  isNewVersion: boolean = false
): void {
  const versionsPath = path.join(bundleDirectory, 'config', 'generated_bundle_versions.yaml');
  let versionsData: GeneratedBundleVersionsData = { versions: [] };

  // Load existing versions if file exists
  if (fs.existsSync(versionsPath)) {
    const yamlContent = fs.readFileSync(versionsPath, 'utf8');
    versionsData = yaml.load(yamlContent) as GeneratedBundleVersionsData || { versions: [] };
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

      // Add the first generated version record
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
 * Central function for recording a generated bundle version. Ensures the versionId is
 * tracked in bundle_config.yaml's generatedBundleVersions and updates generated_bundle_versions.yaml.
 *
 * When `bundleConfig` is provided (the in-memory object), it is mutated in place
 * and saved — this preserves the existing behaviour of publishToVersionedDirectory
 * and publishToNewVersion which already hold a loaded config.
 *
 * When `bundleConfig` is omitted the function loads, updates, and saves the config
 * itself (load-update-save pattern for callers like publish-from-cache-stream).
 */
export function recordGeneratedBundleVersion(
  bundleDirectory: string,
  versionId: string,
  options: {
    isNewVersion?: boolean;
    notes?: string;
    bundleConfig?: BundleConfig;
  } = {}
): void {
  const { isNewVersion = false, notes = '', bundleConfig: providedConfig } = options;

  if (providedConfig) {
    // Mutate the provided config and save it (existing behaviour)
    if (!providedConfig.generatedBundleVersions) {
      providedConfig.generatedBundleVersions = [];
    }
    if (isNewVersion) {
      providedConfig.generatedBundleVersions.push(versionId);
    } else if (!providedConfig.generatedBundleVersions.includes(versionId)) {
      providedConfig.generatedBundleVersions.push(versionId);
    }
    saveBundleConfig(bundleDirectory, providedConfig);
  } else {
    // Load-update-save pattern
    const config = loadBundleConfig(bundleDirectory);
    const currentVersions = config.generatedBundleVersions || [];
    if (!currentVersions.includes(versionId)) {
      config.generatedBundleVersions = [...currentVersions, versionId];
      saveBundleConfig(bundleDirectory, config);
    }
  }

  createOrUpdateGeneratedBundleVersions(bundleDirectory, versionId, notes, isNewVersion);
}
