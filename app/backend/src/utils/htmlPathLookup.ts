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
import { SiteConfigPaths } from '../../../shared_code/paths/siteConfigPaths.js';
import { parsePageConfig } from '../../../shared_code/utils/sitePageConfigUtils.js';
import { normalizePageTitle } from '../html/shared.js';
import { loadSiteConfig } from './siteConfigUtils.js';
import { logger } from './logging/backendLoggingUtils.js';

/**
 * Get the HTML file path for a page by looking up its subdirectory from
 * site_page_config.yaml. Returns a relative path (e.g. "subdir/title.html"
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
    const sitePageConfPath = SiteConfigPaths.getSitePageConfigFile(siteDirectory);
    if (!fs.existsSync(sitePageConfPath)) {
      return null;
    }

    const content = fs.readFileSync(sitePageConfPath, 'utf8');
    const sitePageConfigs = parsePageConfig(content);

    const sitePageConfig = sitePageConfigs.find(sitePageConfig =>
      sitePageConfig.title === title &&
      (sitePageConfig.file_type === 'md' || !sitePageConfig.file_type) &&
      (pageDirectory === undefined || (sitePageConfig.source_graph_subdirectory || '') === (pageDirectory || ''))
    );

    if (!sitePageConfig) {
      return null;
    }

    const siteConfig = loadSiteConfig(siteDirectory);
    const siteSlug = path.basename(siteDirectory);

    const normalizedTitle = normalizePageTitle(title, siteConfig, siteSlug);

    const subdir = sitePageConfig.source_graph_subdirectory || '';
    return subdir ? `${subdir}/${normalizedTitle}.html` : `${normalizedTitle}.html`;
  } catch (error) {
    logger.warn('Error looking up page path:', error);
    return null;
  }
}
