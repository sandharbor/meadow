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
import { BundleConfigPaths } from '../../../../../shared_code/paths/bundleConfigPaths.js';
import { parseBundleNodeConfig } from '../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { planBundleRoutes, routeForBundleNode } from '../../areas/bundle/generation/html/bundleRoutePlanner.js';
import { normalizePageTitle } from '../../areas/bundle/generation/html/shared.js';
import { loadBundleConfig } from './bundleConfigUtils.js';
import { logger } from './logging/backendLoggingUtils.js';
import { getBundleDirectory } from '../bundle-config/bundleConfigPaths.js';

/**
 * Get the HTML file path for a page by looking up its subdirectory from
 * bundle_node_config.yaml. Returns a relative path (e.g. "subdir/title.html"
 * or "title.html") or null if the page is not found.
 *
 * Provider-agnostic: any publishing provider that materializes pages as
 * HTML files can use this to compute the path within its published tree.
 */
export function getHtmlPathForPage(
  bundleDirectory: string,
  title: string,
  pageDirectory?: string,
): string | null {
  try {
    const bundleNodeConfPath = BundleConfigPaths.getBundleNodeConfigFile(bundleDirectory);
    if (!fs.existsSync(bundleNodeConfPath)) {
      return null;
    }

    const content = fs.readFileSync(bundleNodeConfPath, 'utf8');
    const bundleNodeConfigs = parseBundleNodeConfig(content);

    const matchingPageConfigs = bundleNodeConfigs.filter(bundleNodeConfig =>
      bundleNodeConfig.bundleNodeName === title &&
      (pageDirectory === undefined || (bundleNodeConfig.sourceGraphSubdirectory || '') === (pageDirectory || ''))
    );
    const bundleConfig = loadBundleConfig(bundleDirectory);
    const roleMatch = matchingPageConfigs.find(config => config.bundleNodeId === bundleConfig.defaultTraversalBundleNodeId);
    const bundleNodeConfig = roleMatch
      ?? matchingPageConfigs.find(config => config.bundleNodeKind === 'file' && config.fileType === 'md')
      ?? matchingPageConfigs[0];

    if (!bundleNodeConfig) {
      return null;
    }

    const inferredBundleSlug = path.basename(bundleDirectory);
    const bundleSlug = path.resolve(getBundleDirectory(inferredBundleSlug)) === path.resolve(bundleDirectory)
      ? inferredBundleSlug
      : undefined;

    if (!bundleConfig.entryBundleNodeId) {
      const normalizedTitle = normalizePageTitle(title, bundleConfig, bundleSlug);
      const subdir = bundleNodeConfig.sourceGraphSubdirectory || '';
      return subdir ? `${subdir}/${normalizedTitle}.html` : `${normalizedTitle}.html`;
    }
    const plan = planBundleRoutes(bundleNodeConfigs, bundleConfig, bundleSlug);
    return routeForBundleNode(bundleNodeConfig, plan.routes);
  } catch (error) {
    logger.warn('Error looking up page path:', error);
    return null;
  }
}
