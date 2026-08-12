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
import { SiteConfigPaths } from '../../../../shared_code/paths/siteConfigPaths.js';
import { parseSiteNodeConfig } from '../../../../shared_code/utils/siteNodeConfigUtils.js';
import { planSiteRoutes, routeForSiteNode } from '../../areas/site/generation/html/siteRoutePlanner.js';
import { normalizePageTitle } from '../../areas/site/generation/html/shared.js';
import { loadSiteConfig } from './siteConfigUtils.js';
import { logger } from './logging/backendLoggingUtils.js';
import { getSiteDirectory } from '../site-config/siteConfigPaths.js';

/**
 * Get the HTML file path for a page by looking up its subdirectory from
 * site_node_config.yaml. Returns a relative path (e.g. "subdir/title.html"
 * or "title.html") or null if the page is not found.
 *
 * Provider-agnostic: any publishing provider that materializes pages as
 * HTML files can use this to compute the path within its published tree.
 */
export function getHtmlPathForPage(
  siteDirectory: string,
  title: string,
  pageDirectory?: string,
): string | null {
  try {
    const siteNodeConfPath = SiteConfigPaths.getSiteNodeConfigFile(siteDirectory);
    if (!fs.existsSync(siteNodeConfPath)) {
      return null;
    }

    const content = fs.readFileSync(siteNodeConfPath, 'utf8');
    const siteNodeConfigs = parseSiteNodeConfig(content);

    const matchingPageConfigs = siteNodeConfigs.filter(siteNodeConfig =>
      siteNodeConfig.siteNodeName === title &&
      (pageDirectory === undefined || (siteNodeConfig.sourceGraphSubdirectory || '') === (pageDirectory || ''))
    );
    const siteConfig = loadSiteConfig(siteDirectory);
    const roleMatch = matchingPageConfigs.find(config => config.siteNodeId === siteConfig.defaultTraversalSiteNodeId);
    const siteNodeConfig = roleMatch
      ?? matchingPageConfigs.find(config => config.siteNodeKind === 'file' && config.fileType === 'md')
      ?? matchingPageConfigs[0];

    if (!siteNodeConfig) {
      return null;
    }

    const inferredSiteSlug = path.basename(siteDirectory);
    const siteSlug = path.resolve(getSiteDirectory(inferredSiteSlug)) === path.resolve(siteDirectory)
      ? inferredSiteSlug
      : undefined;

    if (!siteConfig.entrySiteNodeId) {
      const normalizedTitle = normalizePageTitle(title, siteConfig, siteSlug);
      const subdir = siteNodeConfig.sourceGraphSubdirectory || '';
      return subdir ? `${subdir}/${normalizedTitle}.html` : `${normalizedTitle}.html`;
    }
    const plan = planSiteRoutes(siteNodeConfigs, siteConfig, siteSlug);
    return routeForSiteNode(siteNodeConfig, plan.routes);
  } catch (error) {
    logger.warn('Error looking up page path:', error);
    return null;
  }
}
