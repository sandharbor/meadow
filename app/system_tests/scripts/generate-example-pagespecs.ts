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
 * Generates correct pagespecs for all markdown files in example-site-data
 * (SVG files are skipped — they don't get pagespecs blocks).
 *
 * Usage:  npx tsx system_tests/scripts/generate-example-pagespecs.ts
 *
 * This script:
 *  1. Starts the test server
 *  2. Sets up the example-site fixture
 *  3. Calls the working graph API (normal + frontier)
 *  4. Generates preview HTML
 *  5. Computes correct pagespecs for every markdown file
 *  6. Updates each file in-place
 *  7. Tears down and stops the server
 */

import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import {
  startServer,
  forceStopServer,
  TEST_BASE_URL,
  getSourceGraphsPath,
} from '../helpers/serverManager.js';
import { SystemTestSiteSetup } from '../helpers/testSetup.js';
import { parsePageConfig } from '../../shared_code/utils/sitePageConfigUtils.js';
import {
  extractMainSectionLinkPaths,
  extractBacklinkDetails,
} from '../helpers/htmlLinkExtractor.js';
import { linkPathToPageId, pageIdToLinkPath } from '../../shared_code/test/pagespecLinkChecker.js';

const SITE_NAME = 'example-site';
const INITIAL_PAGE = 'Notable Mental Models';
const SOURCE_GRAPH_DIR = path.join(getSourceGraphsPath(), 'example-site-data');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findAllMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      results.push(...findAllMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

function getPageIdFromPath(filePath: string, sourceGraphDir: string): string {
  const rel = path.relative(sourceGraphDir, filePath);
  return rel.slice(0, -3); // strip .md extension
}

/** The pagespecs YAML regex (same as in pagespecUtils.ts). */
const PAGESPECS_BLOCK_PATTERN = /```(?:yaml|pagespecs)\s*\n[\s\S]*?pagespecs:[\s\S]*?```\s*$/;

function stripPagespecsBlock(content: string): string {
  return content.replace(PAGESPECS_BLOCK_PATTERN, '').trimEnd();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Starting server…');
  await startServer();

  const setup = new SystemTestSiteSetup('home_fixture_example', 'generate-pagespecs', {
    siteFolderName: 'example-site',
  });
  setup.setUp();

  const slug = setup.getSiteSlug();

  try {
    // 1. Fetch normal working graph (no frontier)
    console.log('Fetching working graph (normal)…');
    const normalResp = await fetch(
      `${TEST_BASE_URL}/api/site/${slug}/working-graph?initialPageTitle=${encodeURIComponent(INITIAL_PAGE)}&traversalPageTitle=${encodeURIComponent(INITIAL_PAGE)}`
    );
    if (!normalResp.ok) throw new Error(`Working graph API failed: ${normalResp.status}`);
    const normalGraph = (await normalResp.json()) as {
      pages: { id: string; remaining_depth: number }[];
      allOutlinkTargets: Record<string, string[]>;
      allInlinkSources: Record<string, string[]>;
    };

    // 2. Fetch frontier working graph
    console.log('Fetching working graph (frontier depth=10)…');
    const frontierResp = await fetch(
      `${TEST_BASE_URL}/api/site/${slug}/working-graph?initialPageTitle=${encodeURIComponent(INITIAL_PAGE)}&traversalPageTitle=${encodeURIComponent(INITIAL_PAGE)}&frontierDepth=10`
    );
    if (!frontierResp.ok) throw new Error(`Working graph frontier API failed: ${frontierResp.status}`);
    const frontierGraph = (await frontierResp.json()) as {
      pages: { id: string; remaining_depth: number }[];
    };

    // 3. Generate preview HTML
    console.log('Generating preview…');
    const previewResp = await fetch(`${TEST_BASE_URL}/api/site/${slug}/preview`, { method: 'POST' });
    if (!previewResp.ok) throw new Error(`Preview API failed: ${previewResp.status}`);

    // 4. Load site_page_config
    const siteConfigPath = path.join(setup.getSitePath(), 'conf', 'site_page_config.yaml');
    const sitePageConfigs = fs.existsSync(siteConfigPath)
      ? parsePageConfig(fs.readFileSync(siteConfigPath, 'utf-8'))
      : [];

    // 5. Build lookup structures
    const normalPageIds = new Set(normalGraph.pages.map(p => linkPathToPageId(p.id)));

    const outlinkMap = new Map<string, string[]>();
    for (const [pathKey, targets] of Object.entries(normalGraph.allOutlinkTargets)) {
      outlinkMap.set(linkPathToPageId(pathKey), targets.map(t => linkPathToPageId(t)));
    }

    const inlinkMap = new Map<string, string[]>();
    for (const [pathKey, sources] of Object.entries(normalGraph.allInlinkSources)) {
      inlinkMap.set(linkPathToPageId(pathKey), sources.map(s => linkPathToPageId(s)));
    }

    // Frontier page remaining-depth map (only pages NOT in normal graph)
    const frontierRemainingDepth = new Map<string, number>();
    for (const page of frontierGraph.pages) {
      const pageId = linkPathToPageId(page.id);
      if (!normalPageIds.has(pageId)) {
        frontierRemainingDepth.set(pageId, page.remaining_depth);
      }
    }

    // Preview folder
    const previewDir = setup.getPathInSite('html/preview');

    // 6. Process each source file
    const sourceFiles = findAllMarkdownFiles(SOURCE_GRAPH_DIR);
    console.log(`Processing ${sourceFiles.length} source files…`);

    for (const srcFile of sourceFiles) {
      const pageId = getPageIdFromPath(srcFile, SOURCE_GRAPH_DIR);

      // Determine isTracked from site_page_config
      const isTracked = computeIsTracked(pageId, sitePageConfigs, 'md');

      const isInWorkingGraph = normalPageIds.has(pageId);

      // Build the pagespec entry
      let entry: Record<string, unknown>;

      if (isInWorkingGraph) {
        // Build links
        const outlinks = (outlinkMap.get(pageId) || []).map(targetId => ({
          linkPath: pageIdToLinkPath(targetId),
          isInGraph: normalPageIds.has(targetId),
        }));
        const inlinks = (inlinkMap.get(pageId) || []).map(sourceId => ({
          linkPath: pageIdToLinkPath(sourceId),
          isInGraph: normalPageIds.has(sourceId),
        }));

        // Build htmlRenderedLinks from preview HTML
        const htmlRenderedLinks = buildHtmlRenderedLinks(pageId, previewDir);

        entry = {
          site: SITE_NAME,
          isTracked,
          isInWorkingGraph: true,
          links: { outlinks, inlinks },
          htmlRenderedLinks,
        };
      } else {
        // Not in working graph — determine frontier depth or orphan
        const rd = frontierRemainingDepth.get(pageId);
        const frontierDepthOrNullForOrphan =
          rd !== undefined ? -rd : null; // remaining_depth is negative for frontier pages

        const htmlRenderedLinks = { mainSectionLinks: [] as unknown[], footerSectionBacklinks: [] as unknown[] };

        entry = {
          site: SITE_NAME,
          isTracked,
          isInWorkingGraph: false,
          frontierDepthOrNullForOrphan,
          htmlRenderedLinks,
        };
      }

      // Write back to file
      const originalContent = fs.readFileSync(srcFile, 'utf-8');
      const contentWithout = stripPagespecsBlock(originalContent);

      const yamlStr = YAML.stringify({ pagespecs: [entry] }, {
        lineWidth: 0,        // no line wrapping
        defaultKeyType: 'PLAIN',
        defaultStringType: 'PLAIN',
      }).trimEnd();

      const newContent = contentWithout + '\n\n```yaml\n' + yamlStr + '\n```\n';
      fs.writeFileSync(srcFile, newContent, 'utf-8');
    }

    console.log('Done! All pagespecs updated.');
  } finally {
    setup.tearDown();
    forceStopServer();
  }
}

function computeIsTracked(
  pageId: string,
  sitePageConfigs: ReturnType<typeof parsePageConfig>,
  fileType: string
): boolean {
  const lastSlashIndex = pageId.lastIndexOf('/');
  const title = lastSlashIndex >= 0 ? pageId.slice(lastSlashIndex + 1) : pageId;
  // For image files the title might include extension — strip it for matching
  // Actually the config stores title without extension for SVG too (e.g. "Mental Models Diagram")
  const titleForMatch = fileType !== 'md' ? title.replace(/\.\w+$/, '') : title;
  const subdirectory = lastSlashIndex >= 0 ? pageId.slice(0, lastSlashIndex) : '';

  for (const config of sitePageConfigs) {
    const configSubdir = config.source_graph_subdirectory || '';
    const configFileType = config.file_type || 'md';

    if (
      config.title === titleForMatch &&
      configSubdir === subdirectory &&
      configFileType === fileType
    ) {
      // Blacklisted pages are NOT considered tracked for pagespec purposes
      if (config.config.list_type === 'blacklist') return false;
      return config.config.tracked === true;
    }
  }
  return false;
}

function buildHtmlRenderedLinks(
  pageId: string,
  previewDir: string,
): Record<string, unknown> {
  const htmlPath = path.join(previewDir, pageId + '.html');
  if (!fs.existsSync(htmlPath)) {
    return { mainSectionLinks: [], footerSectionBacklinks: [] };
  }

  const html = fs.readFileSync(htmlPath, 'utf-8');

  // Main section links
  const mainLinkPaths = extractMainSectionLinkPaths(html);
  const mainSectionLinks = mainLinkPaths.map(p => ({ relativeLinkPath: p }));

  // Footer backlinks with contexts
  const backlinkDetailsList = extractBacklinkDetails(html);
  const footerSectionBacklinks = backlinkDetailsList.map(bd => ({
    relativeLinkPath: bd.relativeLinkPath,
    backlinkContexts: bd.contexts.map(ctx => ({
      seeInContextLinkRelativePath: ctx.seeInContextLinkRelativePath,
      embeddedLinks: ctx.embeddedLinks.map(el => ({
        linkName: el.linkName,
        linkRelativePath: el.linkRelativePath,
      })),
    })),
  }));

  return { mainSectionLinks, footerSectionBacklinks };
}

main().catch(err => {
  console.error('Fatal error:', err);
  forceStopServer();
  process.exit(1);
});
