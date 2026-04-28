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

/**
 * Helper functions for loading fixture data in integration tests.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Graph } from '../../../../shared_code/types/graph';
import { ISitePage } from '../../../../shared_code/types/ISitePage';
import { SitePageConfig, SitePageConfigConfig } from '../../../../shared_code/types/sitePageConfig';
import { FileType } from '../../../../shared_code/types/FileType';

// Path to the fixture directory - use process.cwd() which is the frontend directory when running Jest
// The cwd is app/frontend, so we go up to app then into shared_data/home_fixtures
// eslint-disable-next-line no-undef
const FIXTURE_BASE_PATH = path.resolve(process.cwd(), '../shared_data/home_fixtures');

export interface FixtureLoadResult {
  graph: Graph;
  sitePageConfigs: SitePageConfig[];
}

/**
 * Simple YAML parser for site_page_config.yaml format.
 * This avoids the ESM/CommonJS compatibility issues with the yaml package in Jest.
 */
function parseSimpleYaml(content: string): SitePageConfig[] {
  const configs: SitePageConfig[] = [];
  const lines = content.split('\n');

  let currentPage: Partial<{
    title: string;
    sourceGraphSubdirectory: string;
    fileType: FileType;
    listType: 'blacklist' | 'whitelist';
    outlinksDepth: number;
    inlinksDepth: number;
    tracked: boolean;
  }> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and the 'pages:' header
    if (!trimmed || trimmed === 'pages:') continue;

    // New page entry starts with '- '
    if (trimmed.startsWith('- ')) {
      // Save previous page if exists
      if (currentPage && currentPage.title !== undefined) {
        configs.push({
          title: currentPage.title,
          ...(currentPage.sourceGraphSubdirectory !== undefined && { source_graph_subdirectory: currentPage.sourceGraphSubdirectory }),
          ...(currentPage.fileType !== undefined && { file_type: currentPage.fileType }),
          config: {
            list_type: currentPage.listType || 'whitelist',
            ...(currentPage.outlinksDepth !== undefined && { outlinks_depth: currentPage.outlinksDepth }),
            ...(currentPage.inlinksDepth !== undefined && { inlinks_depth: currentPage.inlinksDepth }),
            ...(currentPage.tracked !== undefined && { tracked: currentPage.tracked }),
          } as SitePageConfigConfig
        });
      }
      currentPage = {};

      // Parse the first key-value on the same line as '-'
      const firstKv = trimmed.substring(2).trim();
      if (firstKv) {
        parseKeyValue(firstKv, currentPage);
      }
    } else if (currentPage) {
      // Continuation of current page
      parseKeyValue(trimmed, currentPage);
    }
  }

  // Don't forget the last page
  if (currentPage && currentPage.title !== undefined) {
    configs.push({
      title: currentPage.title,
      ...(currentPage.sourceGraphSubdirectory !== undefined && { source_graph_subdirectory: currentPage.sourceGraphSubdirectory }),
      ...(currentPage.fileType !== undefined && { file_type: currentPage.fileType }),
      config: {
        list_type: currentPage.listType || 'whitelist',
        ...(currentPage.outlinksDepth !== undefined && { outlinks_depth: currentPage.outlinksDepth }),
        ...(currentPage.inlinksDepth !== undefined && { inlinks_depth: currentPage.inlinksDepth }),
        ...(currentPage.tracked !== undefined && { tracked: currentPage.tracked }),
      } as SitePageConfigConfig
    });
  }

  return configs;
}

function parseKeyValue(line: string, page: Record<string, unknown>): void {
  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) return;

  const key = line.substring(0, colonIndex).trim();
  let value: string | number | boolean = line.substring(colonIndex + 1).trim();

  // Remove quotes if present
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  // Parse booleans and numbers
  if (value === 'true') value = true;
  else if (value === 'false') value = false;
  else if (/^\d+$/.test(value)) value = parseInt(value, 10);

  // Map YAML keys to our expected format
  switch (key) {
    case 'title':
      page.title = value as string;
      break;
    case 'sourceGraphSubdirectory':
      page.sourceGraphSubdirectory = value as string;
      break;
    case 'fileType':
      page.fileType = value as FileType;
      break;
    case 'listType':
      page.listType = value as 'blacklist' | 'whitelist';
      break;
    case 'outlinksDepth':
      page.outlinksDepth = value as number;
      break;
    case 'inlinksDepth':
      page.inlinksDepth = value as number;
      break;
    case 'tracked':
      page.tracked = value as boolean;
      break;
  }
}

/**
 * Helper function to check if a config matches a page by title, subdirectory, and file_type.
 * Inlined from sitePageConfigUtils to avoid yaml dependency.
 */
function configMatchesPage(
  config: SitePageConfig,
  pageTitle: string,
  sourceGraphSubdirectory?: string,
  fileType?: FileType
): boolean {
  const titleMatches = config.title === pageTitle;
  const subdirectoryMatches = (config.source_graph_subdirectory || '') === (sourceGraphSubdirectory || '');
  const fileTypeMatches = config.file_type === undefined || config.file_type === fileType;
  return titleMatches && subdirectoryMatches && fileTypeMatches;
}

/**
 * Applies site page configuration to pages.
 * Inlined from sitePageConfigUtils to avoid yaml dependency.
 */
function applyPageConfigsToPages(
  pages: ISitePage[],
  sitePageConfigs: SitePageConfig[]
): ISitePage[] {
  sitePageConfigs.forEach(cfg => {
    const page = pages.find(n =>
      configMatchesPage(cfg, n.title, n.sourceGraphSubdirectory, n.file_type)
    );
    if (page && cfg.config) {
      page.conf = page.conf || { title: cfg.title, config: { list_type: 'whitelist' } };
      page.conf.config = page.conf.config || { list_type: 'whitelist' };

      if (cfg.config.list_type === 'blacklist' || cfg.config.list_type === 'whitelist') {
        page.conf.config.list_type = cfg.config.list_type;

        if (typeof cfg.config.tracked === 'boolean') {
          page.tracked = cfg.config.tracked;
        } else {
          page.tracked = true;
        }
      }
      if (cfg.config.list_type === 'blacklist') {
        page.blacklisted = true;
      } else {
        page.blacklisted = false;
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
      if (typeof cfg.config.tracked === 'boolean') {
        page.conf.config.tracked = cfg.config.tracked;
      }
    }
  });
  return pages;
}

/**
 * Loads site_page_config.yaml from a fixture directory and parses it.
 * @param fixtureName - The name of the fixture (e.g., 'home_fixture_big_and_small')
 * @param siteFolderName - The site folder within the fixture (e.g., 'meadow-test-site-big')
 * @returns Parsed SitePageConfig array
 */
export function loadSitePageConfig(fixtureName: string, siteFolderName: string): SitePageConfig[] {
  const configPath = path.join(
    FIXTURE_BASE_PATH,
    fixtureName,
    'sites',
    siteFolderName,
    'conf',
    'site_page_config.yaml'
  );

  if (!fs.existsSync(configPath)) {
    return [];
  }

  const content = fs.readFileSync(configPath, 'utf8');
  return parseSimpleYaml(content);
}

/**
 * Creates a mock ISitePage from a SitePageConfig.
 * @param config - The site page configuration
 * @param id - Unique ID for the page
 * @param label - Label for the page
 * @returns A mock ISitePage object
 */
export function createMockPage(config: SitePageConfig, id: string, label: string): ISitePage {
  const page: ISitePage = {
    id,
    label,
    title: config.title,
    sourceGraphSubdirectory: config.source_graph_subdirectory || '',
    file_type: config.file_type || 'md',
    depth: 0,
    remaining_depth: 0,
    tracked: false, // Will be set by applyPageConfigsToPages
    blacklisted: false, // Will be set by applyPageConfigsToPages
    sensitive: false,
    getIdent: function() {
      return `${this.sourceGraphSubdirectory}---${this.title}---${this.file_type}`;
    }
  };
  return page;
}

/**
 * Creates additional mock pages to simulate specific scenarios.
 * @returns Array of additional mock pages for testing edge cases
 */
export function createAdditionalTestPages(): ISitePage[] {
  // Create a page with sensitive flag (simulating frontmatter meadow-sensitive: true)
  const sensitivePage: ISitePage = {
    id: 'sensitive-test-page',
    label: 'SENS',
    title: 't004 ---- sensitive page',
    sourceGraphSubdirectory: '',
    file_type: 'md',
    depth: 1,
    remaining_depth: 0,
    tracked: true,
    blacklisted: false,
    sensitive: true, // This simulates meadow-sensitive: true in frontmatter
    getIdent: function() {
      return `${this.sourceGraphSubdirectory}---${this.title}---${this.file_type}`;
    }
  };

  // Create a frontier page
  const frontierPage: ISitePage = {
    id: 'frontier-test-page',
    label: 'FRONT',
    title: 'frontier test page',
    sourceGraphSubdirectory: '',
    file_type: 'md',
    depth: 5,
    remaining_depth: 0,
    tracked: false,
    blacklisted: false,
    sensitive: false,
    isFrontierPage: true,
    getIdent: function() {
      return `${this.sourceGraphSubdirectory}---${this.title}---${this.file_type}`;
    }
  };

  return [sensitivePage, frontierPage];
}

/**
 * Generates a label from an index (A, B, C, ..., Z, AA, AB, ...).
 * @param index - Zero-based index
 * @returns The label string
 */
function generateLabel(index: number): string {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/**
 * Builds a Graph from fixture configuration.
 * Creates mock pages based on the site_page_config and applies configs.
 *
 * @param fixtureName - The name of the fixture
 * @param siteFolderName - The site folder within the fixture
 * @returns FixtureLoadResult with graph and configs
 */
export function loadFixtureGraph(fixtureName: string, siteFolderName: string): FixtureLoadResult {
  const sitePageConfigs = loadSitePageConfig(fixtureName, siteFolderName);

  // Create mock pages from configs
  const pages: ISitePage[] = sitePageConfigs.map((config, index) =>
    createMockPage(config, `page-${index}`, generateLabel(index))
  );

  // Add additional test pages for edge cases
  const additionalPages = createAdditionalTestPages();
  pages.push(...additionalPages);

  // Apply configurations to pages (sets tracked, blacklisted, etc.)
  applyPageConfigsToPages(pages, sitePageConfigs);

  // Build the graph
  const graph = new Graph();
  pages.forEach(page => graph.addPage(page));

  return {
    graph,
    sitePageConfigs
  };
}
