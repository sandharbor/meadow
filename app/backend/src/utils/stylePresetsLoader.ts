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
import { fileURLToPath } from 'url';
import type { StylePreset } from '../../../shared_code/types/stylePresets.js';
import { loadAppConfig } from '../../../shared_code/utils/appConfigUtils.js';
import { getConfigDirectory } from '../routes/siteConfigRoutes.js';
import { loadSiteConfig } from './siteConfigUtils.js';
import { getSitesDirectory } from '../routes/siteConfigRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_PRESET_ID = 'classic';

interface PresetsRegistry {
  presets: StylePreset[];
}

/**
 * Gets the path to the presets directory based on environment
 */
export function getPresetsDirectory(): string {
  // Check if running in Electron production mode
  if (process.env.NODE_ENV === 'production' && __dirname.includes('Resources')) {
    return path.join(__dirname, '..', 'html', 'presets');
  }
  // Development mode
  return path.join(__dirname, '..', 'html', 'presets');
}

/**
 * Loads the presets registry from presets.json
 */
export function loadPresetsRegistry(): StylePreset[] {
  const presetsDir = getPresetsDirectory();
  const registryPath = path.join(presetsDir, 'presets.json');

  if (!fs.existsSync(registryPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(registryPath, 'utf-8');
    const registry = JSON.parse(content) as PresetsRegistry;
    return registry.presets || [];
  } catch {
    return [];
  }
}

/**
 * Gets a preset by its ID
 */
export function getPresetById(presetId: string): StylePreset | undefined {
  const presets = loadPresetsRegistry();
  return presets.find(p => p.id === presetId);
}

/**
 * Gets the absolute path to a preset's directory
 */
export function getPresetAssetsPath(presetId: string): string {
  const presetsDir = getPresetsDirectory();
  return path.join(presetsDir, presetId);
}

/**
 * Resolves the effective preset ID for a site.
 * Priority: site config > global config > default ('classic')
 */
export function getEffectivePresetId(siteSlug: string): string {
  // First check site-specific preset
  const sitesDir = getSitesDirectory();
  const siteDir = path.join(sitesDir, siteSlug);

  if (fs.existsSync(siteDir)) {
    const siteConfig = loadSiteConfig(siteDir);
    if (siteConfig.stylePresetId) {
      // Validate the preset exists
      const preset = getPresetById(siteConfig.stylePresetId);
      if (preset) {
        return siteConfig.stylePresetId;
      }
    }
  }

  // Fall back to global preset
  const appConfig = loadAppConfig(getConfigDirectory());
  if (appConfig.globalStylePresetId) {
    // Validate the preset exists
    const preset = getPresetById(appConfig.globalStylePresetId);
    if (preset) {
      return appConfig.globalStylePresetId;
    }
  }

  // Default to classic
  return DEFAULT_PRESET_ID;
}

/**
 * Gets the effective preset ID for a site directory (full path)
 */
export function getEffectivePresetIdForSiteDirectory(siteDirectory: string): string {
  // Extract site slug from directory
  const sitesDir = getSitesDirectory();
  if (siteDirectory.startsWith(sitesDir + path.sep)) {
    const relativePath = siteDirectory.substring(sitesDir.length + 1);
    const parts = relativePath.split(path.sep);
    const siteSlug = parts[0];
    if (siteSlug) {
      return getEffectivePresetId(siteSlug);
    }
  }

  // If we can't extract slug, try loading site config directly
  const siteConfig = loadSiteConfig(siteDirectory);
  if (siteConfig.stylePresetId) {
    const preset = getPresetById(siteConfig.stylePresetId);
    if (preset) {
      return siteConfig.stylePresetId;
    }
  }

  // Fall back to global preset
  const appConfig = loadAppConfig(getConfigDirectory());
  if (appConfig.globalStylePresetId) {
    const preset = getPresetById(appConfig.globalStylePresetId);
    if (preset) {
      return appConfig.globalStylePresetId;
    }
  }

  return DEFAULT_PRESET_ID;
}

/**
 * Gets the global preset ID (from app config)
 */
export function getGlobalPresetId(): string {
  const appConfig = loadAppConfig(getConfigDirectory());
  if (appConfig.globalStylePresetId) {
    const preset = getPresetById(appConfig.globalStylePresetId);
    if (preset) {
      return appConfig.globalStylePresetId;
    }
  }
  return DEFAULT_PRESET_ID;
}

/**
 * Gets the site-specific preset ID (or undefined if inheriting from global)
 */
export function getSitePresetId(siteSlug: string): string | undefined {
  const sitesDir = getSitesDirectory();
  const siteDir = path.join(sitesDir, siteSlug);

  if (fs.existsSync(siteDir)) {
    const siteConfig = loadSiteConfig(siteDir);
    return siteConfig.stylePresetId;
  }

  return undefined;
}
