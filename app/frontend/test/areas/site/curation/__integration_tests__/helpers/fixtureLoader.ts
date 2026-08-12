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
import { Graph } from '../../../../../../../shared_code/types/graph';
import { ISiteNode } from '../../../../../../../shared_code/types/ISiteNode';
import {
  SiteNodeConfig,
  SiteNodeId,
  SiteNodeKey,
} from '../../../../../../../shared_code/types/siteNodeConfig';
import { FileType } from '../../../../../../../shared_code/types/FileType';

// Path to the fixture directory - use process.cwd() which is the frontend directory when running Jest
// The cwd is app/frontend, so we go up to app then into shared_data/home_fixtures
// eslint-disable-next-line no-undef
const FIXTURE_BASE_PATH = path.resolve(process.cwd(), '../shared_data/home_fixtures');

export interface FixtureLoadResult {
  graph: Graph;
  siteNodeConfigs: SiteNodeConfig[];
}

/**
 * Simple YAML parser for site_node_config.yaml format.
 * This avoids the ESM/CommonJS compatibility issues with the yaml package in Jest.
 */
function parseSimpleYaml(content: string): SiteNodeConfig[] {
  const configs: SiteNodeConfig[] = [];
  const lines = content.split('\n');

  let currentNode: Partial<{
    siteNodeName: string;
    sourceGraphSubdirectory: string;
    siteNodeKind: 'file';
    fileType: FileType;
    siteNodeId: SiteNodeId;
    listType: 'blacklist' | 'whitelist';
    outlinksDepth: number;
    inlinksDepth: number;
  }> | null = null;

  const saveCurrentNode = (): void => {
    if (!currentNode?.siteNodeName || !currentNode.fileType || !currentNode.siteNodeId) return;
    configs.push({
      siteNodeName: currentNode.siteNodeName,
      ...(currentNode.sourceGraphSubdirectory !== undefined && {
        sourceGraphSubdirectory: currentNode.sourceGraphSubdirectory,
      }),
      siteNodeKind: 'file',
      fileType: currentNode.fileType,
      siteNodeId: currentNode.siteNodeId,
      listType: currentNode.listType ?? 'whitelist',
      ...(currentNode.outlinksDepth !== undefined && { outlinksDepth: currentNode.outlinksDepth }),
      ...(currentNode.inlinksDepth !== undefined && { inlinksDepth: currentNode.inlinksDepth }),
    });
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and the 'nodes:' header
    if (!trimmed || trimmed === 'nodes:') continue;

    // New page entry starts with '- '
    if (trimmed.startsWith('- ')) {
      saveCurrentNode();
      currentNode = {};

      // Parse the first key-value on the same line as '-'
      const firstKv = trimmed.substring(2).trim();
      if (firstKv) {
        parseKeyValue(firstKv, currentNode);
      }
    } else if (currentNode) {
      parseKeyValue(trimmed, currentNode);
    }
  }

  saveCurrentNode();

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
    case 'siteNodeName':
      page.siteNodeName = value as string;
      break;
    case 'sourceGraphSubdirectory':
      page.sourceGraphSubdirectory = value as string;
      break;
    case 'siteNodeKind':
      page.siteNodeKind = value as 'file';
      break;
    case 'fileType':
      page.fileType = value as FileType;
      break;
    case 'siteNodeId':
      page.siteNodeId = value as SiteNodeId;
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
  }
}

/**
 * Helper function to check if a config matches a page by title, subdirectory, and fileType.
 * Inlined from siteNodeConfigUtils to avoid yaml dependency.
 */
function nodeConfigMatchesNode(
  config: SiteNodeConfig,
  pageTitle: string,
  sourceGraphSubdirectory?: string,
  fileType?: FileType
): boolean {
  const titleMatches = config.siteNodeName === pageTitle;
  const subdirectoryMatches = (config.sourceGraphSubdirectory || '') === (sourceGraphSubdirectory || '');
  const fileTypeMatches = config.fileType === fileType;
  return titleMatches && subdirectoryMatches && fileTypeMatches;
}

/**
 * Applies site page configuration to pages.
 * Inlined from siteNodeConfigUtils to avoid yaml dependency.
 */
function applyNodeConfigsToNodes(
  pages: ISiteNode[],
  siteNodeConfigs: SiteNodeConfig[]
): ISiteNode[] {
  siteNodeConfigs.forEach(cfg => {
    const page = pages.find(n =>
      nodeConfigMatchesNode(cfg, n.siteNodeName, n.sourceGraphSubdirectory, n.fileType)
    );
    if (!page) return;
    page.conf = cfg;
    page.siteNodeId = cfg.siteNodeId;
    page.tracked = true;
    page.blacklisted = cfg.listType === 'blacklist';
  });
  return pages;
}

/**
 * Loads site_node_config.yaml from a fixture directory and parses it.
 * @param fixtureName - The name of the fixture (e.g., 'home_fixture_big_and_small')
 * @param siteFolderName - The site folder within the fixture (e.g., 'meadow-test-site-big')
 * @returns Parsed SiteNodeConfig array
 */
export function loadSiteNodeConfig(fixtureName: string, siteFolderName: string): SiteNodeConfig[] {
  const configPath = path.join(
    FIXTURE_BASE_PATH,
    fixtureName,
    'sites',
    siteFolderName,
    'conf',
    'site_node_config.yaml'
  );

  if (!fs.existsSync(configPath)) {
    return [];
  }

  const content = fs.readFileSync(configPath, 'utf8');
  return parseSimpleYaml(content);
}

/**
 * Creates a mock ISiteNode from a SiteNodeConfig.
 * @param config - The site page configuration
 * @param id - Unique ID for the page
 * @param label - Label for the page
 * @returns A mock ISiteNode object
 */
export function createMockPage(config: SiteNodeConfig, id: string, label: string): ISiteNode {
  if (config.siteNodeKind !== 'file') {
    throw new Error('The legacy curation fixture loader accepts file nodes only');
  }
  const page: ISiteNode = {
    siteNodeKey: id as SiteNodeKey,
    siteNodeId: config.siteNodeId,
    siteNodeKind: 'file',
    label,
    siteNodeName: config.siteNodeName,
    sourceGraphSubdirectory: config.sourceGraphSubdirectory || '',
    fileType: config.fileType,
    depth: 0,
    remaining_depth: 0,
    tracked: false, // Will be set by applyNodeConfigsToNodes
    blacklisted: false, // Will be set by applyNodeConfigsToNodes
    sensitive: false,
    getIdent: function() {
      return `${this.sourceGraphSubdirectory}---${this.siteNodeName}---${this.fileType}`;
    }
  };
  return page;
}

/**
 * Creates additional mock pages to simulate specific scenarios.
 * @returns Array of additional mock pages for testing edge cases
 */
export function createAdditionalTestPages(): ISiteNode[] {
  // Create a page with sensitive flag (simulating frontmatter meadow-sensitive: true)
  const sensitivePage: ISiteNode = {
    siteNodeKey: 'sensitive-test-page' as SiteNodeKey,
    siteNodeKind: 'file',
    label: 'SENS',
    siteNodeName: 't004 ---- sensitive page',
    sourceGraphSubdirectory: '',
    fileType: 'md',
    depth: 1,
    remaining_depth: 0,
    tracked: true,
    blacklisted: false,
    sensitive: true, // This simulates meadow-sensitive: true in frontmatter
    getIdent: function() {
      return `${this.sourceGraphSubdirectory}---${this.siteNodeName}---${this.fileType}`;
    }
  };

  // Create a frontier page
  const frontierPage: ISiteNode = {
    siteNodeKey: 'frontier-test-page' as SiteNodeKey,
    siteNodeKind: 'file',
    label: 'FRONT',
    siteNodeName: 'frontier test page',
    sourceGraphSubdirectory: '',
    fileType: 'md',
    depth: 5,
    remaining_depth: 0,
    tracked: false,
    blacklisted: false,
    sensitive: false,
    isFrontierNode: true,
    getIdent: function() {
      return `${this.sourceGraphSubdirectory}---${this.siteNodeName}---${this.fileType}`;
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
 * Creates mock nodes based on site_node_config and applies the configs.
 *
 * @param fixtureName - The name of the fixture
 * @param siteFolderName - The site folder within the fixture
 * @returns FixtureLoadResult with graph and configs
 */
export function loadFixtureGraph(fixtureName: string, siteFolderName: string): FixtureLoadResult {
  const siteNodeConfigs = loadSiteNodeConfig(fixtureName, siteFolderName);

  // Create mock pages from configs
  const pages: ISiteNode[] = siteNodeConfigs.map((config, index) =>
    createMockPage(config, `page-${index}`, generateLabel(index))
  );

  // Add additional test pages for edge cases
  const additionalPages = createAdditionalTestPages();
  pages.push(...additionalPages);

  // Apply configurations to pages (sets tracked, blacklisted, etc.)
  applyNodeConfigsToNodes(pages, siteNodeConfigs);

  // Build the graph
  const graph = new Graph();
  pages.forEach(page => graph.addNode(page));

  return {
    graph,
    siteNodeConfigs
  };
}
