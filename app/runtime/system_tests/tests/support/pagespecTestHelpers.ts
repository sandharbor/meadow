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
import path from 'path';
import {
  getFixturesPath,
  getSourceGraphsPath,
} from '../../helpers/serverManager.js';
import type { SystemTestBundleSetup } from '../../helpers/testSetup.js';
import type { BundleNodeConfig } from '../../../../shared_code/types/bundleNodeConfig.js';
import { FILE_TYPES } from '../../../../shared_code/types/FileType.js';

export const pagespecSourceGraphDirs = [
  path.join(getSourceGraphsPath(), 'meadow-test-bundles-data'),
  path.join(getSourceGraphsPath(), 'example-bundle-data'),
  path.join(getSourceGraphsPath(), 'folder-structure-test'),
];

/**
 * Recursively finds source files whose PageSpecs are validated. Ordinary
 * Markdown embeds PageSpecs; HTML, SVG, and Excalidraw use sidecars.
 */
export function findAllPagespecSourceFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      results.push(...findAllPagespecSourceFiles(fullPath));
    } else if (entry.isFile() && /\.(?:md|html|svg)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Recursively finds all sidecar pagespec.yaml files in a directory.
 */
export function findAllSidecarPagespecFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      results.push(...findAllSidecarPagespecFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.pagespec.yaml')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Gets page title from file path.
 */
export function getPageTitle(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

/**
 * Gets page ID from file path relative to source graph directory.
 * This includes the directory path for disambiguation.
 */
export function getPageIdFromPath(
  filePath: string,
  sourceGraphDir: string,
  content?: string,
  isExcalidrawMarkdown?: (content: string) => boolean
): string {
  const relativePath = path.relative(sourceGraphDir, filePath);
  let pageId = relativePath.endsWith('.md')
    ? relativePath.slice(0, -3)
    : relativePath;
  if (
    content !== undefined &&
    isExcalidrawMarkdown?.(content) &&
    !pageId.endsWith('.excalidraw')
  ) {
    pageId = `${pageId}.excalidraw`;
  }
  return pageId;
}

/**
 * Gets whether a page is tracked according to bundle_node_config.yaml.
 * Returns true if the page has a config entry with tracked: true.
 * Returns false if no matching config entry exists or tracked is not set/false.
 */
export function isPageTracked(
  pageId: string,
  bundleNodeConfigs: BundleNodeConfig[],
  fileType: string = 'md'
): boolean {
  // pageId is like "t002/extra nested/t002 ---- dup" for md pages, or
  // "t006/t006 --- meadow-flower.excalidraw" for non-md typed pages.
  const lastSlashIndex = pageId.lastIndexOf('/');
  let title = lastSlashIndex >= 0 ? pageId.slice(lastSlashIndex + 1) : pageId;
  const subdirectory = lastSlashIndex >= 0 ? pageId.slice(0, lastSlashIndex) : '';

  // If the title carries a native file extension (e.g. `.html`, `.excalidraw`,
  // `.svg`), prefer that over the caller's default `fileType` and strip it
  // from the title; that's how `bundle_node_config.yaml` stores typed entries.
  let effectiveFileType = fileType;
  for (const candidateFileType of FILE_TYPES) {
    if (candidateFileType === 'md') continue;
    const suffix = `.${candidateFileType}`;
    if (title.endsWith(suffix)) {
      effectiveFileType = candidateFileType;
      title = title.slice(0, -suffix.length);
      break;
    }
  }

  for (const config of bundleNodeConfigs) {
    const configSubdir = config.sourceGraphSubdirectory || '';
    const configFileType = config.fileType;

    if (
      config.bundleNodeName === title &&
      configSubdir === subdirectory &&
      configFileType === effectiveFileType
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Gets the available bundles from home_fixtures.
 */
export function getAvailableBundles(): Set<string> {
  const fixturesPath = getFixturesPath();
  const bundles = new Set<string>();

  const fixturesDirs = fs.readdirSync(fixturesPath, { withFileTypes: true });
  for (const fixtureDir of fixturesDirs) {
    if (!fixtureDir.isDirectory() || fixtureDir.name.startsWith('.')) continue;

    const bundlesDir = path.join(fixturesPath, fixtureDir.name, 'bundles');
    if (!fs.existsSync(bundlesDir)) continue;

    const bundleDirs = fs.readdirSync(bundlesDir, { withFileTypes: true });
    for (const bundleDir of bundleDirs) {
      if (bundleDir.isDirectory() && !bundleDir.name.startsWith('.')) {
        bundles.add(bundleDir.name);
      }
    }
  }

  return bundles;
}

export interface PagespecBundleToCheck {
  name: string;
  setup: SystemTestBundleSetup;
  initialPage: string;
  sourceGraphDir: string;
}

export interface PagespecBundleSetups {
  big: SystemTestBundleSetup;
  small: SystemTestBundleSetup;
  example: SystemTestBundleSetup;
  folderStructureSingle: SystemTestBundleSetup;
  folderStructureMultiple: SystemTestBundleSetup;
}

export function getPagespecBundlesToCheck(
  setups: PagespecBundleSetups,
): PagespecBundleToCheck[] {
  return [
    {
      name: 'meadow-test-bundle-big',
      setup: setups.big,
      initialPage: 'main page',
      sourceGraphDir: path.join(getSourceGraphsPath(), 'meadow-test-bundles-data'),
    },
    {
      name: 'meadow-test-bundle-small',
      setup: setups.small,
      initialPage: 't001 - deeply nested',
      sourceGraphDir: path.join(getSourceGraphsPath(), 'meadow-test-bundles-data'),
    },
    {
      name: 'example-bundle',
      setup: setups.example,
      initialPage: 'Notable Mental Models',
      sourceGraphDir: path.join(getSourceGraphsPath(), 'example-bundle-data'),
    },
    {
      name: 'single-folder-bundle',
      setup: setups.folderStructureSingle,
      initialPage: 'Alpha note',
      sourceGraphDir: path.join(getSourceGraphsPath(), 'folder-structure-test'),
    },
    {
      name: 'ordered-folders',
      setup: setups.folderStructureMultiple,
      initialPage: 'Alpha note',
      sourceGraphDir: path.join(getSourceGraphsPath(), 'folder-structure-test'),
    },
  ];
}
