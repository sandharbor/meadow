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
import { getConfigDirectory, getSiteDirectory } from '../routes/siteConfigRoutes.js';
import { AppConfigPaths } from '../../../shared_code/paths/appConfigPaths.js';
import { SiteConfigPaths } from '../../../shared_code/paths/siteConfigPaths.js';
import type { CustomAssetType, CustomAssetMetadata } from '../../../shared_code/types/customAssets.js';

const ASSET_TYPE_TO_FILENAME: Record<CustomAssetType, string> = {
  style_css: 'style.css',
  javascript_js: 'javascript.js',
};

export interface ResolvedCustomAssets {
  globalStyleCssPath?: string;
  siteStyleCssPath?: string;
  globalJavascriptJsPath?: string;
  siteJavascriptJsPath?: string;
  globalExtraFilesDir?: string;
  siteExtraFilesDir?: string;
}

/**
 * Resolve which custom asset files to use.
 * Global and site assets are returned independently so both can be included (append mode).
 */
export function resolveCustomAssets(configDir: string, siteDir: string): ResolvedCustomAssets {
  const globalDir = AppConfigPaths.getGlobalCustomAssetsDir(configDir);
  const siteCustomDir = SiteConfigPaths.getSiteCustomAssetsDir(siteDir);

  const result: ResolvedCustomAssets = {};

  // Resolve style.css: both global and site can coexist (global loads first, site appends)
  const globalStylePath = AppConfigPaths.getGlobalCustomAssetFile(configDir, 'style.css');
  const siteStylePath = SiteConfigPaths.getSiteCustomAssetFile(siteDir, 'style.css');
  if (fs.existsSync(globalStylePath)) {
    result.globalStyleCssPath = globalStylePath;
  }
  if (fs.existsSync(siteStylePath)) {
    result.siteStyleCssPath = siteStylePath;
  }

  // Resolve javascript.js: both global and site can coexist (global loads first, site appends)
  const globalJsPath = AppConfigPaths.getGlobalCustomAssetFile(configDir, 'javascript.js');
  const siteJsPath = SiteConfigPaths.getSiteCustomAssetFile(siteDir, 'javascript.js');
  if (fs.existsSync(globalJsPath)) {
    result.globalJavascriptJsPath = globalJsPath;
  }
  if (fs.existsSync(siteJsPath)) {
    result.siteJavascriptJsPath = siteJsPath;
  }

  // Extra files dirs (for merge strategy: global first, site overlay)
  if (fs.existsSync(globalDir)) {
    result.globalExtraFilesDir = globalDir;
  }
  if (fs.existsSync(siteCustomDir)) {
    result.siteExtraFilesDir = siteCustomDir;
  }

  return result;
}

/**
 * Get metadata for a custom asset file in a given scope.
 */
export function getCustomAssetMetadata(
  scope: 'global' | 'site',
  assetType: CustomAssetType,
  siteSlug?: string
): CustomAssetMetadata {
  const filename = ASSET_TYPE_TO_FILENAME[assetType];
  let filePath: string;

  if (scope === 'global') {
    filePath = AppConfigPaths.getGlobalCustomAssetFile(getConfigDirectory(), filename);
  } else {
    filePath = SiteConfigPaths.getSiteCustomAssetFile(getSiteDirectory(siteSlug!), filename);
  }

  const exists = fs.existsSync(filePath);
  const content = exists ? fs.readFileSync(filePath, 'utf8') : undefined;

  return { assetType, scope, exists, content, filePath };
}

/**
 * Get the directory path for custom assets in a given scope.
 */
export function getCustomAssetsDir(scope: 'global' | 'site', siteSlug?: string): string {
  if (scope === 'global') {
    return AppConfigPaths.getGlobalCustomAssetsDir(getConfigDirectory());
  }
  return SiteConfigPaths.getSiteCustomAssetsDir(getSiteDirectory(siteSlug!));
}
