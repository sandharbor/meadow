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

import type { SitePageConfig, SitePageConfigConfig } from '../types/sitePageConfig.js';
import type { FileType } from '../types/FileType.js';
import { ISitePage } from '../types/ISitePage.js';
import YAML from 'yaml';

interface SitePageConfigYamlItem {
  title: string;
  sourceGraphSubdirectory?: string;
  fileType?: FileType;
  listType: 'blacklist' | 'whitelist';
  outlinksDepth?: number;
  inlinksDepth?: number;
  tracked?: boolean;
}

export interface SitePageConfigYaml {
  pages?: SitePageConfigYamlItem[];
}

export function parsePageConfig(content: string): SitePageConfig[] {
  const parsed = YAML.parse(content) as SitePageConfigYaml | null;
  if (!parsed) {
    return [];
  }

  const items = parsed.pages
  if (!items || !Array.isArray(items)) {
    return [];
  }

  return items.map(page => ({
    title: page.title,
    ...(page.sourceGraphSubdirectory !== undefined && { source_graph_subdirectory: page.sourceGraphSubdirectory }),
    ...(page.fileType !== undefined && { file_type: page.fileType }),
    config: {
      list_type: page.listType,
      ...(page.outlinksDepth !== undefined && { outlinks_depth: page.outlinksDepth }),
      ...(page.inlinksDepth !== undefined && { inlinks_depth: page.inlinksDepth }),
      ...(page.tracked !== undefined && { tracked: page.tracked }),
    } as SitePageConfigConfig
  }));
}

export function stringifyPageConfig(configs: SitePageConfig[]): string {
  // Sort by title first, then by source_graph_subdirectory, then by file_type
  // This ensures deterministic ordering for meaningful diffs
  const sortedConfigs = [...configs].sort((a, b) => {
    // First, compare by title
    const titleCompare = a.title.localeCompare(b.title);
    if (titleCompare !== 0) return titleCompare;

    // If titles are the same, compare by source_graph_subdirectory
    const dirA = a.source_graph_subdirectory || '';
    const dirB = b.source_graph_subdirectory || '';
    const dirCompare = dirA.localeCompare(dirB);
    if (dirCompare !== 0) return dirCompare;

    // If directories are also the same, compare by file_type
    const fileTypeA = a.file_type || '';
    const fileTypeB = b.file_type || '';
    return fileTypeA.localeCompare(fileTypeB);
  });
  const yamlData: SitePageConfigYaml = {
    pages: sortedConfigs.map(config => ({
      title: config.title,
      ...(config.source_graph_subdirectory !== undefined && { sourceGraphSubdirectory: config.source_graph_subdirectory }),
      ...(config.file_type !== undefined && { fileType: config.file_type }),
      listType: config.config.list_type,
      ...(config.config.outlinks_depth !== undefined && { outlinksDepth: config.config.outlinks_depth }),
      ...(config.config.inlinks_depth !== undefined && { inlinksDepth: config.config.inlinks_depth }),
      ...(config.config.tracked !== undefined && { tracked: config.config.tracked }),
    }))
  };
  // Sort keys alphabetically within each page for consistent diffs
  return YAML.stringify(yamlData, { sortMapEntries: true });
}

/**
 * Helper function to create a unique key for a page based on title, subdirectory, and file_type.
 * Pages are uniquely identified by title, source_graph_subdirectory, and file_type.
 */
export function getPageKey(title: string, sourceGraphSubdirectory?: string, fileType?: FileType): string {
  return `${sourceGraphSubdirectory || ''}:${title}:${fileType || ''}`;
}

/**
 * Helper function to check if a config matches a page by title, subdirectory, and file_type.
 * If the config doesn't have a file_type, it matches any file_type (for backward compatibility).
 */
export function configMatchesPage(
  config: SitePageConfig,
  pageTitle: string,
  sourceGraphSubdirectory?: string,
  fileType?: FileType
): boolean {
  const titleMatches = config.title === pageTitle;
  const subdirectoryMatches = (config.source_graph_subdirectory || '') === (sourceGraphSubdirectory || '');
  // If config doesn't have file_type, match any file_type (backward compatibility)
  // If config has file_type, it must match exactly
  const fileTypeMatches = config.file_type === undefined || config.file_type === fileType;

  return titleMatches && subdirectoryMatches && fileTypeMatches;
}

/**
 * Applies the sensitive property from API data to pages.
 * The working-graph API returns `data.is_sensitive` which should be
 * mapped to the top-level `sensitive` property on the page.
 *
 * @param pages Array of pages from the working-graph API
 * @returns The same pages with `sensitive` property set
 */
export function applySensitiveFromApiData(pages: ISitePage[]): ISitePage[] {
  pages.forEach(page => {
    if (page.data && typeof page.data.is_sensitive === 'boolean') {
      page.sensitive = page.data.is_sensitive;
    }
  });
  return pages;
}

/**
 * Applies site page configuration to pages.
 * Sets tracked, blacklisted, and conf properties based on the site_page_config.
 *
 * @param pages Array of pages to apply config to
 * @param sitePageConfigs Array of site page configurations
 * @returns The same pages with config-based properties applied
 */
export function applyPageConfigsToPages(
  pages: ISitePage[],
  sitePageConfigs: SitePageConfig[]
): ISitePage[] {
  sitePageConfigs.forEach(cfg => {
    const page = pages.find(n =>
      configMatchesPage(cfg, n.title, n.sourceGraphSubdirectory, n.file_type)
    );
    if (page && cfg.config) {
      // Ensure conf and conf.config objects exist
      page.conf = page.conf || { title: cfg.title, config: { list_type: 'whitelist' } };
      page.conf.config = page.conf.config || { list_type: 'whitelist' };

      if (cfg.config.list_type === 'blacklist' || cfg.config.list_type === 'whitelist') {
        page.conf.config.list_type = cfg.config.list_type;

        // Respect explicit tracking state from configuration
        if (typeof cfg.config.tracked === 'boolean') {
          page.tracked = cfg.config.tracked;
        } else {
          // Only auto-track if no explicit tracking state is set and it has meaningful config
          page.tracked = true;
        }
      }
      if (cfg.config.list_type === 'blacklist') {
        page.blacklisted = true;
      } else {
        page.blacklisted = false; // Ensure unblacklisted if whitelist
      }

      if (typeof cfg.config.outlinks_depth === 'number') {
        page.conf.config.outlinks_depth = cfg.config.outlinks_depth;
      } else {
        delete page.conf.config.outlinks_depth;
      }
      if (typeof cfg.config.inlinks_depth === 'number') {
        page.conf.config.inlinks_depth = cfg.config.inlinks_depth;
      } else {
        delete page.conf.config.inlinks_depth;
      }
      // Store the tracked state in the config for persistence
      if (typeof cfg.config.tracked === 'boolean') {
        page.conf.config.tracked = cfg.config.tracked;
      }
    }
  });
  return pages;
}

/**
 * Builds SitePageConfig objects from pages that have conf set.
 * This is the inverse of applyPageConfigsToPages — it reads current page state
 * and produces the config array for persistence.
 *
 * @param pages Array of pages to extract config from (only pages with conf are included)
 * @returns Array of SitePageConfig objects ready to be persisted
 */
export function buildPageConfigs(pages: ISitePage[]): SitePageConfig[] {
  return pages.filter(p => p.conf).map(page => {
    const config = page.conf!.config;
    return {
      title: page.title,
      ...(page.sourceGraphSubdirectory !== undefined && { source_graph_subdirectory: page.sourceGraphSubdirectory }),
      ...(page.file_type !== undefined && { file_type: page.file_type }),
      config: {
        list_type: page.blacklisted ? 'blacklist' : 'whitelist',
        ...(typeof config.outlinks_depth === 'number' ? { outlinks_depth: config.outlinks_depth } : {}),
        ...(typeof config.inlinks_depth === 'number' ? { inlinks_depth: config.inlinks_depth } : {}),
        tracked: page.tracked
      }
    };
  });
}

/**
 * Prepares pages for use with filters by applying both API data transformations
 * and site page configuration.
 *
 * @param pages Array of pages from the working-graph API
 * @param sitePageConfigs Array of site page configurations
 * @returns The same pages with all config-based properties applied
 */
export function preparePagesForFiltering(
  pages: ISitePage[],
  sitePageConfigs: SitePageConfig[]
): ISitePage[] {
  applySensitiveFromApiData(pages);
  applyPageConfigsToPages(pages, sitePageConfigs);
  return pages;
}