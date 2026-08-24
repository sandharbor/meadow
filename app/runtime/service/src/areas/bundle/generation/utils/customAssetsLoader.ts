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
import { getConfigDirectory, getBundleDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { AppConfigPaths } from '../../../../../../../shared_code/paths/appConfigPaths.js';
import { BundleConfigPaths } from '../../../../../../../shared_code/paths/bundleConfigPaths.js';
import type { CustomAssetType, CustomAssetMetadata } from '../../../../../../../contracts/types/customAssets.js';

const ASSET_TYPE_TO_FILENAME: Record<CustomAssetType, string> = {
  style_css: 'style.css',
  javascript_js: 'javascript.js',
};

export interface ResolvedCustomAssets {
  globalStyleCssPath?: string;
  bundleStyleCssPath?: string;
  globalJavascriptJsPath?: string;
  bundleJavascriptJsPath?: string;
  globalExtraFilesDir?: string;
  bundleExtraFilesDir?: string;
}

/**
 * Resolve which custom asset files to use.
 * Global and bundle assets are returned independently so both can be included (append mode).
 */
export function resolveCustomAssets(configDir: string, bundleDir: string): ResolvedCustomAssets {
  const globalDir = AppConfigPaths.getGlobalCustomAssetsDir(configDir);
  const bundleCustomDir = BundleConfigPaths.getBundleCustomAssetsDir(bundleDir);

  const result: ResolvedCustomAssets = {};

  // Resolve style.css: both global and bundle can coexist (global loads first, bundle appends)
  const globalStylePath = AppConfigPaths.getGlobalCustomAssetFile(configDir, 'style.css');
  const bundleStylePath = BundleConfigPaths.getBundleCustomAssetFile(bundleDir, 'style.css');
  if (fs.existsSync(globalStylePath)) {
    result.globalStyleCssPath = globalStylePath;
  }
  if (fs.existsSync(bundleStylePath)) {
    result.bundleStyleCssPath = bundleStylePath;
  }

  // Resolve javascript.js: both global and bundle can coexist (global loads first, bundle appends)
  const globalJsPath = AppConfigPaths.getGlobalCustomAssetFile(configDir, 'javascript.js');
  const bundleJsPath = BundleConfigPaths.getBundleCustomAssetFile(bundleDir, 'javascript.js');
  if (fs.existsSync(globalJsPath)) {
    result.globalJavascriptJsPath = globalJsPath;
  }
  if (fs.existsSync(bundleJsPath)) {
    result.bundleJavascriptJsPath = bundleJsPath;
  }

  // Extra files dirs (for merge strategy: global first, bundle overlay)
  if (fs.existsSync(globalDir)) {
    result.globalExtraFilesDir = globalDir;
  }
  if (fs.existsSync(bundleCustomDir)) {
    result.bundleExtraFilesDir = bundleCustomDir;
  }

  return result;
}

/**
 * Get metadata for a custom asset file in a given scope.
 */
export function getCustomAssetMetadata(
  scope: 'global' | 'bundle',
  assetType: CustomAssetType,
  bundleSlug?: string
): CustomAssetMetadata {
  const filename = ASSET_TYPE_TO_FILENAME[assetType];
  let filePath: string;

  if (scope === 'global') {
    filePath = AppConfigPaths.getGlobalCustomAssetFile(getConfigDirectory(), filename);
  } else {
    filePath = BundleConfigPaths.getBundleCustomAssetFile(getBundleDirectory(bundleSlug!), filename);
  }

  const exists = fs.existsSync(filePath);
  const content = exists ? fs.readFileSync(filePath, 'utf8') : undefined;

  return { assetType, scope, exists, content, filePath };
}

/**
 * Get the directory path for custom assets in a given scope.
 */
export function getCustomAssetsDir(scope: 'global' | 'bundle', bundleSlug?: string): string {
  if (scope === 'global') {
    return AppConfigPaths.getGlobalCustomAssetsDir(getConfigDirectory());
  }
  return BundleConfigPaths.getBundleCustomAssetsDir(getBundleDirectory(bundleSlug!));
}
