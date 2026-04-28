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

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  getSourceGraphsPath,
  getFixturesPath,
  startServer,
  stopServer,
  TEST_BASE_URL,
} from '../helpers/serverManager.js';
import { SystemTestSiteSetup } from '../helpers/testSetup.js';
import {
  extractPagespecsBlock,
  getPagespecForSite,
  getReferencedSites,
  extractContentWithoutPagespecs,
  hasPagespecsBlock,
  validatePagespecsBlock,
  validatePagespecsBlockStructure,
  validatePagespecEntry,
  isValidLinkPath,
  validateLinkSpec,
  validateLinksSection,
  linkPathToPageId,
  pageIdToLinkPath,
  validateOutlinks,
  validateInlinks,
  checkPagespecLinks,
} from '../../shared_code/test/index.js';
import {
  extractMainSectionLinkPaths,
  extractFooterBacklinkPaths,
  extractBacklinkDetails,
} from '../helpers/htmlLinkExtractor.js';
import type { PagespecsBlock, PagespecInWorkingGraph } from '../../shared_code/types/test/index.js';
import { isPagespecNotInWorkingGraph } from '../../shared_code/types/test/index.js';
import type { WorkingGraphData } from '../../shared_code/test/index.js';
import { parsePageConfig } from '../../shared_code/utils/sitePageConfigUtils.js';
import type { SitePageConfig } from '../../shared_code/types/sitePageConfig.js';

/**
 * Recursively finds all markdown files in a directory.
 */
function findAllMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      results.push(...findAllMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Gets page title from file path.
 */
function getPageTitle(filePath: string): string {
  return path.basename(filePath, '.md');
}

/**
 * Gets page ID from file path relative to source graph directory.
 * This includes the directory path for disambiguation.
 */
function getPageIdFromPath(filePath: string, sourceGraphDir: string): string {
  const relativePath = path.relative(sourceGraphDir, filePath);
  return relativePath.endsWith('.md')
    ? relativePath.slice(0, -3)
    : relativePath;
}

/**
 * Gets whether a page is tracked according to site_page_config.yaml.
 * Returns true if the page has a config entry with tracked: true.
 * Returns false if no matching config entry exists or tracked is not set/false.
 */
function isPageTracked(
  pageId: string,
  sitePageConfigs: SitePageConfig[],
  fileType: 'md' | 'png' = 'md'
): boolean {
  // pageId is like "t002/extra nested/t002 ---- dup"
  // We need to extract subdirectory and title
  const lastSlashIndex = pageId.lastIndexOf('/');
  const title = lastSlashIndex >= 0 ? pageId.slice(lastSlashIndex + 1) : pageId;
  const subdirectory = lastSlashIndex >= 0 ? pageId.slice(0, lastSlashIndex) : '';

  // Find a matching config
  for (const config of sitePageConfigs) {
    const configSubdir = config.source_graph_subdirectory || '';
    const configFileType = config.file_type || 'md';

    if (
      config.title === title &&
      configSubdir === subdirectory &&
      configFileType === fileType
    ) {
      return config.config.tracked === true;
    }
  }

  // No matching config found - page is not tracked
  return false;
}

/**
 * Gets the available sites from home_fixtures.
 */
function getAvailableSites(): Set<string> {
  const fixturesPath = getFixturesPath();
  const sites = new Set<string>();

  const fixturesDirs = fs.readdirSync(fixturesPath, { withFileTypes: true });
  for (const fixtureDir of fixturesDirs) {
    if (!fixtureDir.isDirectory() || fixtureDir.name.startsWith('.')) continue;

    const sitesDir = path.join(fixturesPath, fixtureDir.name, 'sites');
    if (!fs.existsSync(sitesDir)) continue;

    const siteDirs = fs.readdirSync(sitesDir, { withFileTypes: true });
    for (const siteDir of siteDirs) {
      if (siteDir.isDirectory() && !siteDir.name.startsWith('.')) {
        sites.add(siteDir.name);
      }
    }
  }

  return sites;
}

describe('Pagespecs System Tests', () => {
  const sourceGraphDirs = [
    path.join(getSourceGraphsPath(), 'meadow-test-sites-data'),
    path.join(getSourceGraphsPath(), 'example-site-data'),
  ];

  describe('YAML Validation Tests', () => {
    it('should have valid source graph directories', () => {
      for (const sourceGraphDir of sourceGraphDirs) {
        expect(fs.existsSync(sourceGraphDir)).toBe(true);
      }
    });

    it('all pagespecs blocks should parse into typed objects', () => {
      const errors: string[] = [];

      for (const sourceGraphDir of sourceGraphDirs) {
        const mdFiles = findAllMarkdownFiles(sourceGraphDir);

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          if (!hasPagespecsBlock(content)) {
            continue;
          }

          const block = extractPagespecsBlock(content);
          if (block === null) {
            errors.push(`Failed to parse pagespecs block in ${mdFile}`);
            continue;
          }

          const structureErrors = validatePagespecsBlockStructure(block, getPageTitle(mdFile));
          for (const err of structureErrors) {
            errors.push(`${mdFile}: ${err.message}`);
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Pagespecs parsing errors:\n${errors.join('\n')}`);
      }
    });

    it('all site references should exist in home_fixtures', () => {
      const availableSites = getAvailableSites();
      const errors: string[] = [];

      for (const sourceGraphDir of sourceGraphDirs) {
        const mdFiles = findAllMarkdownFiles(sourceGraphDir);

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          const block = extractPagespecsBlock(content);
          if (!block) continue;

          const referencedSites = getReferencedSites(block);
          for (const site of referencedSites) {
            if (!availableSites.has(site)) {
              errors.push(`${mdFile}: references unknown site "${site}"`);
            }
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Site reference errors:\n${errors.join('\n')}`);
      }
    });

    it('all filter IDs should be valid', () => {
      const availableSites = getAvailableSites();
      const errors: string[] = [];

      for (const sourceGraphDir of sourceGraphDirs) {
        const mdFiles = findAllMarkdownFiles(sourceGraphDir);

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          const block = extractPagespecsBlock(content);
          if (!block) continue;

          const pageTitle = getPageTitle(mdFile);
          const validationErrors = validatePagespecsBlock(
            block,
            [], // No required sites for this validation
            availableSites,
            pageTitle,
            { requireLinksWhenInWorkingGraph: true }
          );

          for (const err of validationErrors) {
            if (err.field === 'filtersSelected') {
              errors.push(`${mdFile}: ${err.message}`);
            }
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Filter ID validation errors:\n${errors.join('\n')}`);
      }
    });

    it('all pagespecs with isInWorkingGraph should have links', () => {
      const availableSites = getAvailableSites();
      const errors: string[] = [];

      for (const sourceGraphDir of sourceGraphDirs) {
        const mdFiles = findAllMarkdownFiles(sourceGraphDir);

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          const block = extractPagespecsBlock(content);
          if (!block) continue;

          const pageTitle = getPageTitle(mdFile);
          const validationErrors = validatePagespecsBlock(
            block,
            [], // No required sites for this validation
            availableSites,
            pageTitle,
            { requireLinksWhenInWorkingGraph: true }
          );

          for (const err of validationErrors) {
            if (err.field === 'links') {
              errors.push(`${mdFile}: ${err.message}`);
            }
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Links validation errors:\n${errors.join('\n')}`);
      }
    });

    it('all pagespecs should have htmlRenderedLinks with mainSectionLinks and footerSectionBacklinks', () => {
      const availableSites = getAvailableSites();
      const errors: string[] = [];

      for (const sourceGraphDir of sourceGraphDirs) {
        const mdFiles = findAllMarkdownFiles(sourceGraphDir);

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          const block = extractPagespecsBlock(content);
          if (!block) continue;

          const pageTitle = getPageTitle(mdFile);
          const validationErrors = validatePagespecsBlock(
            block,
            [], // No required sites for this validation
            availableSites,
            pageTitle,
            { requireHtmlRenderedLinks: true }
          );

          for (const err of validationErrors) {
            if (err.field === 'htmlRenderedLinks') {
              errors.push(`${mdFile}: ${err.message}`);
            }
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`htmlRenderedLinks validation errors:\n${errors.join('\n')}`);
      }
    });

    it('all pagespecs should pass full validation with no errors of any field type', () => {
      const availableSites = getAvailableSites();
      const errors: string[] = [];

      for (const sourceGraphDir of sourceGraphDirs) {
        const mdFiles = findAllMarkdownFiles(sourceGraphDir);

        // Collect all referenced sites within this source graph dir
        const allReferencedSites: string[] = [];
        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          const block = extractPagespecsBlock(content);
          if (block) {
            for (const site of getReferencedSites(block)) {
              if (!allReferencedSites.includes(site)) {
                allReferencedSites.push(site);
              }
            }
          }
        }

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          const block = extractPagespecsBlock(content);
          if (!block) continue;

          const pageTitle = getPageTitle(mdFile);
          const validationErrors = validatePagespecsBlock(
            block,
            allReferencedSites,
            availableSites,
            pageTitle,
            { requireLinksWhenInWorkingGraph: true, requireHtmlRenderedLinks: true }
          );

          for (const err of validationErrors) {
            errors.push(`${mdFile}: [${err.field ?? 'general'}] ${err.message}`);
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Full pagespec validation errors:\n${errors.join('\n')}`);
      }
    });
  });

  describe('Completeness Tests', () => {
    it('should have at least one source page with pagespecs', () => {
      let pagesWithSpecs = 0;

      for (const sourceGraphDir of sourceGraphDirs) {
        const mdFiles = findAllMarkdownFiles(sourceGraphDir);

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          if (hasPagespecsBlock(content)) {
            pagesWithSpecs++;
          }
        }
      }

      expect(pagesWithSpecs).toBeGreaterThan(0);
    });

    it('all pages should have pagespecs for every site that is used across any page', () => {
      for (const sourceGraphDir of sourceGraphDirs) {
        const mdFiles = findAllMarkdownFiles(sourceGraphDir);

        // First pass: collect all sites that are referenced in any pagespec
        const allReferencedSites = new Set<string>();
        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          const block = extractPagespecsBlock(content);
          if (block) {
            for (const site of getReferencedSites(block)) {
              allReferencedSites.add(site);
            }
          }
        }

        // If no sites are referenced anywhere, nothing to check
        if (allReferencedSites.size === 0) {
          continue;
        }

        // Second pass: for each file, check that it has all referenced sites
        const missingBySite = new Map<string, string[]>();
        for (const site of allReferencedSites) {
          missingBySite.set(site, []);
        }

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          const block = extractPagespecsBlock(content);
          const relativePath = path.relative(sourceGraphDir, mdFile);

          if (!block) {
            // File has no pagespecs at all - missing all sites
            for (const site of allReferencedSites) {
              missingBySite.get(site)!.push(relativePath);
            }
          } else {
            // File has pagespecs - check which sites are missing
            const sitesInFile = new Set(getReferencedSites(block));
            for (const site of allReferencedSites) {
              if (!sitesInFile.has(site)) {
                missingBySite.get(site)!.push(relativePath);
              }
            }
          }
        }

        // Build error message listing missing pages per site
        const errors: string[] = [];
        for (const [site, missingFiles] of missingBySite) {
          if (missingFiles.length > 0) {
            errors.push(`\nSite "${site}" is missing in ${missingFiles.length} file(s):`);
            for (const file of missingFiles) {
              errors.push(`  - ${file}`);
            }
          }
        }

        if (errors.length > 0) {
          throw new Error(`Pagespec site completeness errors (${path.basename(sourceGraphDir)}):${errors.join('\n')}`);
        }
      }
    });
  });

  describe('Content Stripping Tests', () => {
    it('extractContentWithoutPagespecs should remove pagespecs block', () => {
      const contentWithSpecs = `# Test Page

Some content here.

\`\`\`yaml
pagespecs:
  - site: test-site
    isInWorkingGraph: true
\`\`\``;

      const contentWithoutSpecs = extractContentWithoutPagespecs(contentWithSpecs);
      expect(contentWithoutSpecs).not.toContain('pagespecs:');
      expect(contentWithoutSpecs).toContain('# Test Page');
      expect(contentWithoutSpecs).toContain('Some content here.');
    });

    it('extractContentWithoutPagespecs should preserve content without pagespecs', () => {
      const content = `# Regular Page

Just normal content.`;

      const result = extractContentWithoutPagespecs(content);
      expect(result).toBe(content);
    });
  });

  describe('Parsing Utility Tests', () => {
    it('extractPagespecsBlock should parse valid YAML', () => {
      const content = `# Test

\`\`\`yaml
pagespecs:
  - site: meadow-test-site-big
    isInWorkingGraph: true
    filtersSelected:
      untracked-filter: false
  - site: meadow-test-site-small
    isInWorkingGraph: false
    frontierDepthOrNullForOrphan: 1
\`\`\``;

      const block = extractPagespecsBlock(content);
      expect(block).not.toBeNull();
      expect(block!.pagespecs).toHaveLength(2);

      const bigSiteSpec = getPagespecForSite(block!, 'meadow-test-site-big');
      expect(bigSiteSpec).toBeDefined();
      expect(bigSiteSpec!.isInWorkingGraph).toBe(true);

      const smallSiteSpec = getPagespecForSite(block!, 'meadow-test-site-small');
      expect(smallSiteSpec).toBeDefined();
      expect(smallSiteSpec!.isInWorkingGraph).toBe(false);
      if (isPagespecNotInWorkingGraph(smallSiteSpec!)) {
        expect(smallSiteSpec.frontierDepthOrNullForOrphan).toBe(1);
      }
    });

    it('getReferencedSites should return all site names', () => {
      const block: PagespecsBlock = {
        pagespecs: [
          { site: 'site-a', isTracked: true, isInWorkingGraph: true, htmlRenderedLinks: { mainSectionLinks: [], footerSectionBacklinks: [] } },
          { site: 'site-b', isTracked: true, isInWorkingGraph: false, frontierDepthOrNullForOrphan: null, htmlRenderedLinks: { mainSectionLinks: [], footerSectionBacklinks: [] } },
        ],
      };

      const sites = getReferencedSites(block);
      expect(sites).toEqual(['site-a', 'site-b']);
    });

    it('hasPagespecsBlock should detect pagespecs blocks', () => {
      const withSpecs = `# Page\n\n\`\`\`yaml\npagespecs:\n  - site: test\n    isInWorkingGraph: true\n\`\`\``;
      const withoutSpecs = '# Page\n\nNo specs here.';

      expect(hasPagespecsBlock(withSpecs)).toBe(true);
      expect(hasPagespecsBlock(withoutSpecs)).toBe(false);
    });
  });

  describe('Frontier/Orphan Specification Tests', () => {
    it('should correctly identify orphan pages (frontierDepthOrNullForOrphan is null)', () => {
      let orphanPagesFound = 0;

      for (const sourceGraphDir of sourceGraphDirs) {
        const mdFiles = findAllMarkdownFiles(sourceGraphDir);

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          const block = extractPagespecsBlock(content);
          if (!block) continue;

          for (const spec of block.pagespecs) {
            if (isPagespecNotInWorkingGraph(spec)) {
              if (spec.frontierDepthOrNullForOrphan === null) {
                orphanPagesFound++;
              }
            }
          }
        }
      }

      expect(orphanPagesFound).toBeGreaterThan(0);
    });

    it('should correctly identify frontier pages (frontierDepthOrNullForOrphan is a number)', () => {
      let frontierPagesFound = 0;

      for (const sourceGraphDir of sourceGraphDirs) {
        const mdFiles = findAllMarkdownFiles(sourceGraphDir);

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          const block = extractPagespecsBlock(content);
          if (!block) continue;

          for (const spec of block.pagespecs) {
            if (isPagespecNotInWorkingGraph(spec)) {
              if (typeof spec.frontierDepthOrNullForOrphan === 'number') {
                frontierPagesFound++;
              }
            }
          }
        }
      }

      expect(frontierPagesFound).toBeGreaterThan(0);
    });
  });

  describe('Non-Working-Graph htmlRenderedLinks Tests', () => {
    it('pages not in working graph should have empty htmlRenderedLinks arrays', () => {
      const errors: string[] = [];
      let pagesChecked = 0;

      for (const sourceGraphDir of sourceGraphDirs) {
        const mdFiles = findAllMarkdownFiles(sourceGraphDir);

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          const block = extractPagespecsBlock(content);
          if (!block) continue;

          for (const spec of block.pagespecs) {
            if (!isPagespecNotInWorkingGraph(spec)) continue;

            pagesChecked++;
            const mainLinks = spec.htmlRenderedLinks?.mainSectionLinks ?? [];
            const backlinks = spec.htmlRenderedLinks?.footerSectionBacklinks ?? [];

            if (mainLinks.length > 0 || backlinks.length > 0) {
              const relativePath = path.relative(sourceGraphDir, mdFile);
              errors.push(
                `[${spec.site}] ${relativePath}: page is not in working graph but has non-empty htmlRenderedLinks (mainSectionLinks: ${mainLinks.length}, footerSectionBacklinks: ${backlinks.length})`
              );
            }
          }
        }
      }

      expect(pagesChecked).toBeGreaterThan(0);
      if (errors.length > 0) {
        throw new Error(`Non-working-graph pages with non-empty htmlRenderedLinks:\n${errors.join('\n')}`);
      }
    });
  });

  describe('Link Path Validation Tests', () => {
    it('isValidLinkPath should accept valid link paths', () => {
      expect(isValidLinkPath('/main page.md')).toBe(true);
      expect(isValidLinkPath('/folder/page.md')).toBe(true);
      expect(isValidLinkPath('/deep/nested/folder/page.md')).toBe(true);
      expect(isValidLinkPath('page.md')).toBe(true);
      expect(isValidLinkPath('folder/page.md')).toBe(true);
      expect(isValidLinkPath('/page with spaces.md')).toBe(true);
      expect(isValidLinkPath('/page-with-dashes.md')).toBe(true);
      expect(isValidLinkPath('/page_with_underscores.md')).toBe(true);
      expect(isValidLinkPath('/page.with.dots.md')).toBe(true);
      expect(isValidLinkPath('/t001 ---- child 1.md')).toBe(true);
    });

    it('isValidLinkPath should accept valid image link paths', () => {
      expect(isValidLinkPath('/image.png')).toBe(true);
      expect(isValidLinkPath('/folder/image.png')).toBe(true);
      expect(isValidLinkPath('/deep/nested/image.jpg')).toBe(true);
      expect(isValidLinkPath('image.gif')).toBe(true);
      expect(isValidLinkPath('/image with spaces.jpeg')).toBe(true);
      expect(isValidLinkPath('/image.svg')).toBe(true);
      expect(isValidLinkPath('/image.webp')).toBe(true);
      expect(isValidLinkPath('/t002/t002 ---- dup 2.png')).toBe(true);
    });

    it('isValidLinkPath should reject invalid link paths', () => {
      expect(isValidLinkPath('')).toBe(false);
      expect(isValidLinkPath('page')).toBe(false);
      expect(isValidLinkPath('/page')).toBe(false);
      expect(isValidLinkPath('/page.txt')).toBe(false);
      expect(isValidLinkPath('.md')).toBe(false);
      expect(isValidLinkPath('/.md')).toBe(false);
      expect(isValidLinkPath('/folder//page.md')).toBe(false);
      expect(isValidLinkPath('/./page.md')).toBe(false);
      expect(isValidLinkPath('/../page.md')).toBe(false);
    });

    it('linkPathToPageId should convert correctly', () => {
      expect(linkPathToPageId('/main page.md')).toBe('main page');
      expect(linkPathToPageId('/folder/page.md')).toBe('folder/page');
      expect(linkPathToPageId('page.md')).toBe('page');
      expect(linkPathToPageId('folder/page.md')).toBe('folder/page');
    });

    it('linkPathToPageId should handle image paths', () => {
      expect(linkPathToPageId('/image.png')).toBe('image.png');
      expect(linkPathToPageId('/folder/image.png')).toBe('folder/image.png');
      expect(linkPathToPageId('/t002/t002 ---- dup 2.png')).toBe('t002/t002 ---- dup 2.png');
      expect(linkPathToPageId('image.jpg')).toBe('image.jpg');
      expect(linkPathToPageId('/nested/deep/image.gif')).toBe('nested/deep/image.gif');
    });

    it('pageIdToLinkPath should convert correctly', () => {
      expect(pageIdToLinkPath('main page')).toBe('/main page.md');
      expect(pageIdToLinkPath('folder/page')).toBe('/folder/page.md');
    });

    it('pageIdToLinkPath should handle image page IDs', () => {
      expect(pageIdToLinkPath('image.png')).toBe('/image.png');
      expect(pageIdToLinkPath('folder/image.png')).toBe('/folder/image.png');
      expect(pageIdToLinkPath('t002/t002 ---- dup 2.png')).toBe('/t002/t002 ---- dup 2.png');
      expect(pageIdToLinkPath('nested/deep/image.jpg')).toBe('/nested/deep/image.jpg');
    });
  });

  describe('Link Spec Validation Tests', () => {
    it('validateLinkSpec should accept valid link specs', () => {
      const validSpec = { linkPath: '/page.md', isInGraph: true };
      const errors = validateLinkSpec(validSpec, 'test', 'testPage', 'testSite');
      expect(errors).toHaveLength(0);
    });

    it('validateLinkSpec should accept valid image link specs', () => {
      const imageSpec = { linkPath: '/folder/image.png', isInGraph: true };
      const errors = validateLinkSpec(imageSpec, 'test', 'testPage', 'testSite');
      expect(errors).toHaveLength(0);
    });

    it('validateLinkSpec should reject invalid link specs', () => {
      // Missing linkPath
      const noPath = { isInGraph: true };
      expect(validateLinkSpec(noPath, 'test', 'testPage', 'testSite').length).toBeGreaterThan(0);

      // Invalid linkPath
      const badPath = { linkPath: 'invalid', isInGraph: true };
      expect(validateLinkSpec(badPath, 'test', 'testPage', 'testSite').length).toBeGreaterThan(0);

      // Missing isInGraph
      const noIsInGraph = { linkPath: '/page.md' };
      expect(validateLinkSpec(noIsInGraph, 'test', 'testPage', 'testSite').length).toBeGreaterThan(0);

      // Non-object
      expect(validateLinkSpec(null, 'test', 'testPage', 'testSite').length).toBeGreaterThan(0);
      expect(validateLinkSpec('string', 'test', 'testPage', 'testSite').length).toBeGreaterThan(0);
    });
  });

  describe('Links Section Validation Tests', () => {
    it('validateLinksSection should accept valid links sections', () => {
      // With both outlinks and inlinks
      const fullLinks = {
        outlinks: [{ linkPath: '/page1.md', isInGraph: true }],
        inlinks: [{ linkPath: '/page2.md', isInGraph: false }],
      };
      expect(validateLinksSection(fullLinks, 'testPage', 'testSite')).toHaveLength(0);

      // With only outlinks
      const outlinksOnly = {
        outlinks: [{ linkPath: '/page1.md', isInGraph: true }],
      };
      expect(validateLinksSection(outlinksOnly, 'testPage', 'testSite')).toHaveLength(0);

      // With only inlinks
      const inlinksOnly = {
        inlinks: [{ linkPath: '/page1.md', isInGraph: true }],
      };
      expect(validateLinksSection(inlinksOnly, 'testPage', 'testSite')).toHaveLength(0);

      // Empty arrays are valid
      const emptyArrays = {
        outlinks: [],
        inlinks: [],
      };
      expect(validateLinksSection(emptyArrays, 'testPage', 'testSite')).toHaveLength(0);
    });

    it('validateLinksSection should reject invalid links sections', () => {
      // Non-object
      expect(validateLinksSection(null, 'testPage', 'testSite').length).toBeGreaterThan(0);

      // outlinks not an array
      const badOutlinks = { outlinks: 'not an array' };
      expect(validateLinksSection(badOutlinks, 'testPage', 'testSite').length).toBeGreaterThan(0);

      // inlinks not an array
      const badInlinks = { inlinks: 'not an array' };
      expect(validateLinksSection(badInlinks, 'testPage', 'testSite').length).toBeGreaterThan(0);
    });
  });

  describe('Mandatory Links When In Working Graph Tests', () => {
    const availableSites = new Set(['test-site']);

    it('should require links section when isInWorkingGraph is true (default option)', () => {
      const specWithoutLinks: PagespecInWorkingGraph = {
        site: 'test-site',
        isTracked: true,
        isInWorkingGraph: true,
        htmlRenderedLinks: { mainSectionLinks: [], footerSectionBacklinks: [] },
      };

      const errors = validatePagespecEntry(specWithoutLinks, availableSites, 'testPage');
      expect(errors.some((e) => e.field === 'links')).toBe(true);
    });

    it('should accept links section when isInWorkingGraph is true', () => {
      const specWithLinks: PagespecInWorkingGraph = {
        site: 'test-site',
        isTracked: true,
        isInWorkingGraph: true,
        links: {
          outlinks: [],
          inlinks: [],
        },
        htmlRenderedLinks: { mainSectionLinks: [], footerSectionBacklinks: [] },
      };

      const errors = validatePagespecEntry(specWithLinks, availableSites, 'testPage');
      expect(errors.filter((e) => e.field === 'links')).toHaveLength(0);
    });

    it('should allow disabling links requirement via option', () => {
      const specWithoutLinks: PagespecInWorkingGraph = {
        site: 'test-site',
        isTracked: true,
        isInWorkingGraph: true,
        htmlRenderedLinks: { mainSectionLinks: [], footerSectionBacklinks: [] },
      };

      const errors = validatePagespecEntry(specWithoutLinks, availableSites, 'testPage', {
        requireLinksWhenInWorkingGraph: false,
      });
      expect(errors.filter((e) => e.field === 'links')).toHaveLength(0);
    });
  });

  describe('Runtime Link Checking Tests', () => {
    it('validateOutlinks should detect missing links in spec', () => {
      const specifiedLinks = [{ linkPath: '/page1.md', isInGraph: true }];
      const actualLinks = ['page1', 'page2'];
      const workingGraphPageIds = new Set(['page1', 'page2']);

      const errors = validateOutlinks(specifiedLinks, actualLinks, workingGraphPageIds, 'test');
      expect(errors.some((e) => e.type === 'missing_in_spec' && e.linkPath === '/page2.md')).toBe(
        true
      );
    });

    it('validateOutlinks should detect missing links in actual', () => {
      const specifiedLinks = [
        { linkPath: '/page1.md', isInGraph: true },
        { linkPath: '/page2.md', isInGraph: true },
      ];
      const actualLinks = ['page1'];
      const workingGraphPageIds = new Set(['page1', 'page2']);

      const errors = validateOutlinks(specifiedLinks, actualLinks, workingGraphPageIds, 'test');
      expect(
        errors.some((e) => e.type === 'missing_in_actual' && e.linkPath === '/page2.md')
      ).toBe(true);
    });

    it('validateOutlinks should detect wrong isInGraph values', () => {
      const specifiedLinks = [{ linkPath: '/page1.md', isInGraph: false }];
      const actualLinks = ['page1'];
      const workingGraphPageIds = new Set(['page1']); // page1 IS in working graph

      const errors = validateOutlinks(specifiedLinks, actualLinks, workingGraphPageIds, 'test');
      expect(errors.some((e) => e.type === 'wrong_is_in_graph')).toBe(true);
    });

    it('validateInlinks should work similarly to validateOutlinks', () => {
      const specifiedLinks = [{ linkPath: '/page1.md', isInGraph: true }];
      const actualLinks = ['page1', 'page2'];
      const workingGraphPageIds = new Set(['page1', 'page2']);

      const errors = validateInlinks(specifiedLinks, actualLinks, workingGraphPageIds, 'test');
      expect(errors.some((e) => e.type === 'missing_in_spec' && e.linkPath === '/page2.md')).toBe(
        true
      );
    });

    it('checkPagespecLinks should validate full links section', () => {
      const links = {
        outlinks: [{ linkPath: '/out1.md', isInGraph: true }],
        inlinks: [{ linkPath: '/in1.md', isInGraph: true }],
      };

      const workingGraph: WorkingGraphData = {
        pageIds: new Set(['testPage', 'out1', 'in1']),
        outlinks: new Map([['testPage', ['out1']]]),
        inlinks: new Map([['testPage', ['in1']]]),
      };

      const result = checkPagespecLinks(links, 'testPage', workingGraph, 'Test Page');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('checkPagespecLinks should detect mismatches', () => {
      const links = {
        outlinks: [{ linkPath: '/out1.md', isInGraph: true }],
        inlinks: [],
      };

      const workingGraph: WorkingGraphData = {
        pageIds: new Set(['testPage', 'out1', 'out2', 'in1']),
        outlinks: new Map([['testPage', ['out1', 'out2']]]), // has extra out2
        inlinks: new Map([['testPage', ['in1']]]), // has in1 but spec says none
      };

      const result = checkPagespecLinks(links, 'testPage', workingGraph, 'Test Page');
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

/**
 * Integration tests that validate pagespecs against the actual working graph API.
 * These tests catch mismatches between declared links in pagespecs and actual links
 * in the working graph that unit tests with mock data would miss.
 */
/**
 * Fetches the working graph for a site and validates all pagespec link isInGraph values.
 */
async function validatePagespecLinksForSite(
  siteSlug: string,
  siteName: string,
  sourceGraphDir: string,
  initialPageTitle: string
): Promise<{ errors: string[]; pagesValidated: number }> {
  const response = await fetch(
    `${TEST_BASE_URL}/api/site/${siteSlug}/working-graph?initialPageTitle=${encodeURIComponent(initialPageTitle)}`
  );

  expect(response.ok).toBe(true);

  const graphData = (await response.json()) as {
    allOutlinkTargets: Record<string, string[]>;
    allInlinkSources: Record<string, string[]>;
    pages: { id: string }[];
  };

  // Build WorkingGraphData for checkPagespecLinks
  const workingGraphPageIds = new Set(graphData.pages.map((p) => linkPathToPageId(p.id)));

  // Build outlink and inlink maps with page title keys
  const outlinkMap = new Map<string, string[]>();
  for (const [pathKey, targets] of Object.entries(graphData.allOutlinkTargets)) {
    const pageTitle = linkPathToPageId(pathKey);
    const targetTitles = targets.map((t) => linkPathToPageId(t));
    outlinkMap.set(pageTitle, targetTitles);
  }

  const inlinkMap = new Map<string, string[]>();
  for (const [pathKey, sources] of Object.entries(graphData.allInlinkSources)) {
    const pageTitle = linkPathToPageId(pathKey);
    const sourceTitles = sources.map((s) => linkPathToPageId(s));
    inlinkMap.set(pageTitle, sourceTitles);
  }

  const mdFiles = findAllMarkdownFiles(sourceGraphDir);
  const errors: string[] = [];
  let pagesValidated = 0;

  for (const mdFile of mdFiles) {
    const content = fs.readFileSync(mdFile, 'utf-8');
    const block = extractPagespecsBlock(content);
    if (!block) continue;

    const relativePath = path.relative(sourceGraphDir, mdFile);
    const pageTitle = relativePath.endsWith('.md')
      ? relativePath.slice(0, -3)
      : relativePath;
    const siteSpec = getPagespecForSite(block, siteName);

    if (!siteSpec || !siteSpec.isInWorkingGraph) continue;

    pagesValidated++;

    if (!workingGraphPageIds.has(pageTitle)) {
      errors.push(
        `[${siteName}] ${path.basename(mdFile)}: claims isInWorkingGraph: true but is NOT in working graph`
      );
      continue;
    }

    if (!siteSpec.links) continue;

    const result = checkPagespecLinks(
      siteSpec.links,
      pageTitle,
      {
        pageIds: workingGraphPageIds,
        outlinks: outlinkMap,
        inlinks: inlinkMap,
      },
      pageTitle
    );

    if (!result.isValid) {
      for (const err of result.errors) {
        errors.push(`[${siteName}] ${path.basename(mdFile)}: ${err.message}`);
      }
    }
  }

  return { errors, pagesValidated };
}

describe('Runtime Pagespec Link Validation', () => {
  let bigSiteSetup: SystemTestSiteSetup | undefined;
  let smallSiteSetup: SystemTestSiteSetup | undefined;
  let exampleSiteSetup: SystemTestSiteSetup | undefined;

  beforeAll(async () => {
    await startServer();
  });

  afterAll(() => {
    stopServer();
  });

  beforeEach(() => {
    bigSiteSetup = new SystemTestSiteSetup(
      'home_fixture_big_and_small',
      'pagespec-link-validation-big',
      { siteFolderName: 'meadow-test-site-big' }
    );
    bigSiteSetup.setUp();

    smallSiteSetup = new SystemTestSiteSetup(
      'home_fixture_big_and_small',
      'pagespec-link-validation-small',
      { siteFolderName: 'meadow-test-site-small' }
    );
    smallSiteSetup.setUp();

    exampleSiteSetup = new SystemTestSiteSetup(
      'home_fixture_example',
      'pagespec-link-validation-example',
      { siteFolderName: 'example-site' }
    );
    exampleSiteSetup.setUp();
  });

  afterEach(() => {
    bigSiteSetup?.tearDown();
    smallSiteSetup?.tearDown();
    exampleSiteSetup?.tearDown();
  });

  function getSitesToCheck() {
    return [
      { name: 'meadow-test-site-big', setup: bigSiteSetup!, initialPage: 'main page', sourceGraphDir: path.join(getSourceGraphsPath(), 'meadow-test-sites-data') },
      { name: 'meadow-test-site-small', setup: smallSiteSetup!, initialPage: 't001 - deeply nested', sourceGraphDir: path.join(getSourceGraphsPath(), 'meadow-test-sites-data') },
      { name: 'example-site', setup: exampleSiteSetup!, initialPage: 'Notable Mental Models', sourceGraphDir: path.join(getSourceGraphsPath(), 'example-site-data') },
    ];
  }

  it('should validate pagespec links match actual working graph links', async () => {
    const sitesToCheck = getSitesToCheck();

    const results = await Promise.all(
      sitesToCheck.map(({ name, setup, initialPage, sourceGraphDir }) =>
        validatePagespecLinksForSite(setup.getSiteSlug(), name, sourceGraphDir, initialPage)
      )
    );

    const allErrors = results.flatMap(r => r.errors);
    const totalValidated = results.reduce((sum, r) => sum + r.pagesValidated, 0);

    expect(totalValidated).toBeGreaterThan(0);

    if (allErrors.length > 0) {
      throw new Error(`Pagespec link validation errors:\n${allErrors.join('\n')}`);
    }
  });

  it('should validate isInWorkingGraph claims for pages declaring false', async () => {
    // This test catches the inverse case: pages that claim isInWorkingGraph: false
    // but are actually IN the working graph. Validates ALL sites, not just big.
    const sitesToCheck = getSitesToCheck();

    const allErrors: string[] = [];
    let totalValidated = 0;

    for (const { name: siteName, setup: siteSetup, initialPage, sourceGraphDir } of sitesToCheck) {
      const siteSlug = siteSetup.getSiteSlug();

      const response = await fetch(
        `${TEST_BASE_URL}/api/site/${siteSlug}/working-graph?initialPageTitle=${encodeURIComponent(initialPage)}`
      );

      expect(response.ok).toBe(true);

      const graphData = (await response.json()) as {
        allOutlinkTargets: Record<string, string[]>;
        allInlinkSources: Record<string, string[]>;
        pages: { id: string }[];
      };

      const workingGraphPageIds = new Set(graphData.pages.map((p) => linkPathToPageId(p.id)));

      const mdFiles = findAllMarkdownFiles(sourceGraphDir);

      for (const mdFile of mdFiles) {
        const content = fs.readFileSync(mdFile, 'utf-8');
        const block = extractPagespecsBlock(content);
        if (!block) continue;

        const pageId = getPageIdFromPath(mdFile, sourceGraphDir);
        const siteSpec = getPagespecForSite(block, siteName);
        if (!siteSpec) continue;

        // Only check pages that claim to NOT be in the working graph
        if (siteSpec.isInWorkingGraph !== false) continue;

        totalValidated++;

        // Validate isInWorkingGraph: spec says false, check that it's actually false
        const actuallyInGraph = workingGraphPageIds.has(pageId);
        if (actuallyInGraph) {
          allErrors.push(
            `[${siteName}] ${pageId}: claims isInWorkingGraph: false but IS in working graph`
          );
        }
      }
    }

    // Ensure we validated at least some pages
    expect(totalValidated).toBeGreaterThan(0);

    if (allErrors.length > 0) {
      throw new Error(`isInWorkingGraph validation errors:\n${allErrors.join('\n')}`);
    }
  });

  it('should validate isTracked matches site_page_config.yaml', () => {
    // This test validates that isTracked in pagespecs matches the actual
    // tracked status in site_page_config.yaml for ALL sites
    const sitesToCheck = getSitesToCheck();
    const errors: string[] = [];
    let pagesValidated = 0;

    for (const { name: siteName, setup: siteSetup, sourceGraphDir } of sitesToCheck) {
      const sitePath = siteSetup.getSitePath();
      const siteConfigPath = path.join(sitePath, 'conf', 'site_page_config.yaml');

      // Load site_page_config.yaml to get tracked status
      const sitePageConfigs = fs.existsSync(siteConfigPath)
        ? parsePageConfig(fs.readFileSync(siteConfigPath, 'utf-8'))
        : [];

      const mdFiles = findAllMarkdownFiles(sourceGraphDir);

      for (const mdFile of mdFiles) {
        const content = fs.readFileSync(mdFile, 'utf-8');
        const block = extractPagespecsBlock(content);
        if (!block) continue;

        const pageId = getPageIdFromPath(mdFile, sourceGraphDir);
        const siteSpec = getPagespecForSite(block, siteName);
        if (!siteSpec) continue;

        pagesValidated++;

        // Validate isTracked
        const actualTracked = isPageTracked(pageId, sitePageConfigs, 'md');
        if (siteSpec.isTracked !== actualTracked) {
          errors.push(
            `[${siteName}] ${pageId}: isTracked mismatch - spec says ${siteSpec.isTracked}, actual is ${actualTracked}`
          );
        }
      }
    }

    // Ensure we validated at least some pages
    expect(pagesValidated).toBeGreaterThan(0);

    if (errors.length > 0) {
      throw new Error(`isTracked validation errors:\n${errors.join('\n')}`);
    }
  });

  it('should validate frontierDepthOrNullForOrphan matches actual frontier depth', async () => {
    // This test validates that frontierDepthOrNullForOrphan values match the actual
    // frontier depth computed by the working graph.
    // For frontier pages, frontierDepth = -remaining_depth (since remaining_depth is negative)
    // For orphan pages, frontierDepthOrNullForOrphan should be null
    // Validates ALL sites, not just big.
    const sitesToCheck = getSitesToCheck();

    const allErrors: string[] = [];
    let totalValidated = 0;

    for (const { name: siteName, setup: siteSetup, initialPage, sourceGraphDir } of sitesToCheck) {
      const siteSlug = siteSetup.getSiteSlug();

      // Fetch working graph with a large frontier depth to include frontier pages
      // Use frontierDepth=10 to capture several layers of frontier pages
      const response = await fetch(
        `${TEST_BASE_URL}/api/site/${siteSlug}/working-graph?initialPageTitle=${encodeURIComponent(initialPage)}&frontierDepth=10`
      );

      expect(response.ok).toBe(true);

      const graphData = (await response.json()) as {
        pages: { id: string; remaining_depth: number; isFrontierPage?: boolean }[];
      };

      // Build a map of page ID to remaining_depth for pages in the extended graph
      const pageRemainingDepthMap = new Map<string, number>();
      for (const page of graphData.pages) {
        const pageId = linkPathToPageId(page.id);
        pageRemainingDepthMap.set(pageId, page.remaining_depth);
      }

      const mdFiles = findAllMarkdownFiles(sourceGraphDir);

      for (const mdFile of mdFiles) {
        const content = fs.readFileSync(mdFile, 'utf-8');
        const block = extractPagespecsBlock(content);
        if (!block) continue;

        const pageId = getPageIdFromPath(mdFile, sourceGraphDir);
        const siteSpec = getPagespecForSite(block, siteName);
        if (!siteSpec) continue;

        // Only check pages that claim to NOT be in the working graph
        if (siteSpec.isInWorkingGraph !== false) continue;
        if (!isPagespecNotInWorkingGraph(siteSpec)) continue;

        totalValidated++;

        const expectedFrontierDepth = siteSpec.frontierDepthOrNullForOrphan;
        const remainingDepth = pageRemainingDepthMap.get(pageId);

        if (expectedFrontierDepth === null) {
          // Orphan page: should not appear in the graph even with large frontier depth
          if (remainingDepth !== undefined) {
            allErrors.push(
              `[${siteName}] ${pageId}: claims to be orphan (frontierDepthOrNullForOrphan: null) but appears in extended working graph with remaining_depth=${remainingDepth}`
            );
          }
        } else {
          // Frontier page: should appear in the extended graph with matching frontier depth
          if (remainingDepth === undefined) {
            allErrors.push(
              `[${siteName}] ${pageId}: claims frontierDepthOrNullForOrphan: ${expectedFrontierDepth} but does not appear in extended working graph (frontierDepth=10)`
            );
          } else {
            // Frontier depth is the absolute value of negative remaining_depth
            // remaining_depth = -1 means 1 hop into frontier
            const actualFrontierDepth = -remainingDepth;
            if (actualFrontierDepth !== expectedFrontierDepth) {
              allErrors.push(
                `[${siteName}] ${pageId}: frontierDepthOrNullForOrphan mismatch - spec says ${expectedFrontierDepth}, actual is ${actualFrontierDepth} (remaining_depth=${remainingDepth})`
              );
            }
          }
        }
      }
    }

    // Ensure we validated at least some pages
    expect(totalValidated).toBeGreaterThan(0);

    if (allErrors.length > 0) {
      throw new Error(`frontierDepthOrNullForOrphan validation errors:\n${allErrors.join('\n')}`);
    }
  });

  it('should validate htmlRenderedLinks match actual rendered HTML', async () => {
    const sitesToCheck = getSitesToCheck();

    // Generate previews for all sites in parallel
    await Promise.all(
      sitesToCheck.map(async ({ setup }) => {
        const siteSlug = setup.getSiteSlug();
        const response = await fetch(`${TEST_BASE_URL}/api/site/${siteSlug}/preview`, {
          method: 'POST'
        });
        expect(response.ok).toBe(true);
      })
    );

    const errors: string[] = [];
    let pagesValidated = 0;

    for (const { name: siteName, setup: siteSetup, sourceGraphDir } of sitesToCheck) {
      const previewFolderPath = siteSetup.getPathInSite('html/preview');
      const mdFiles = findAllMarkdownFiles(sourceGraphDir);

      for (const mdFile of mdFiles) {
        const content = fs.readFileSync(mdFile, 'utf-8');
        const block = extractPagespecsBlock(content);
        if (!block) continue;

        const siteSpec = getPagespecForSite(block, siteName);
        if (!siteSpec || !siteSpec.isInWorkingGraph) continue;

        // Calculate relative path from source graph dir, changing .md to .html
        const relativePath = path.relative(sourceGraphDir, mdFile).replace(/\.md$/, '.html');
        const htmlPath = path.join(previewFolderPath, relativePath);

        if (!fs.existsSync(htmlPath)) {
          // Page is in working graph but not rendered (filtered/sensitive/blacklisted)
          // Verify its htmlRenderedLinks has empty arrays
          const mainLinks = siteSpec.htmlRenderedLinks?.mainSectionLinks ?? [];
          const backlinks = siteSpec.htmlRenderedLinks?.footerSectionBacklinks ?? [];
          if (mainLinks.length > 0 || backlinks.length > 0) {
            errors.push(
              `[${siteName}] ${relativePath}: page has no HTML but htmlRenderedLinks is non-empty`
            );
          }
          pagesValidated++;
          continue;
        }

        pagesValidated++;
        const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

        // Validate main section links
        const actualMainLinks = extractMainSectionLinkPaths(htmlContent).sort();
        const expectedMainLinks = (siteSpec.htmlRenderedLinks?.mainSectionLinks ?? [])
          .map(l => l.relativeLinkPath)
          .sort();

        if (JSON.stringify(actualMainLinks) !== JSON.stringify(expectedMainLinks)) {
          errors.push(
            `[${siteName}] Main section link mismatch in ${relativePath}:\n` +
            `  Expected: ${JSON.stringify(expectedMainLinks)}\n` +
            `  Actual:   ${JSON.stringify(actualMainLinks)}`
          );
        }

        // Validate footer backlinks
        const actualBacklinks = extractFooterBacklinkPaths(htmlContent).sort();
        const expectedBacklinks = (siteSpec.htmlRenderedLinks?.footerSectionBacklinks ?? [])
          .map(l => l.relativeLinkPath)
          .sort();

        if (JSON.stringify(actualBacklinks) !== JSON.stringify(expectedBacklinks)) {
          errors.push(
            `[${siteName}] Footer backlink mismatch in ${relativePath}:\n` +
            `  Expected: ${JSON.stringify(expectedBacklinks)}\n` +
            `  Actual:   ${JSON.stringify(actualBacklinks)}`
          );
        }

        // Validate backlinkContexts for each backlink
        const backlinkDetails = extractBacklinkDetails(htmlContent);
        const expectedBacklinkSpecs = siteSpec.htmlRenderedLinks?.footerSectionBacklinks ?? [];
        for (const spec of expectedBacklinkSpecs) {
          if (spec.backlinkContexts) {
            const actual = backlinkDetails.find(d => d.relativeLinkPath === spec.relativeLinkPath);
            if (!actual) {
              errors.push(
                `[${siteName}] ${relativePath}: Could not find backlink "${spec.relativeLinkPath}" in HTML for context validation`
              );
              continue;
            }

            if (spec.backlinkContexts.length !== actual.contexts.length) {
              errors.push(
                `[${siteName}] ${relativePath}: Backlink "${spec.relativeLinkPath}" context count mismatch: ` +
                `expected ${spec.backlinkContexts.length}, got ${actual.contexts.length}`
              );
              continue;
            }

            for (let ci = 0; ci < spec.backlinkContexts.length; ci++) {
              const expectedCtx = spec.backlinkContexts[ci];
              const actualCtx = actual.contexts[ci];

              if (expectedCtx.seeInContextLinkRelativePath !== actualCtx.seeInContextLinkRelativePath) {
                errors.push(
                  `[${siteName}] ${relativePath}: Backlink "${spec.relativeLinkPath}" context[${ci}] seeInContextLinkRelativePath mismatch: ` +
                  `expected "${expectedCtx.seeInContextLinkRelativePath}", got "${actualCtx.seeInContextLinkRelativePath}"`
                );
              }

              if (expectedCtx.embeddedLinks.length !== actualCtx.embeddedLinks.length) {
                errors.push(
                  `[${siteName}] ${relativePath}: Backlink "${spec.relativeLinkPath}" context[${ci}] embeddedLinks count mismatch: ` +
                  `expected ${expectedCtx.embeddedLinks.length}, got ${actualCtx.embeddedLinks.length}`
                );
              } else {
                for (let li = 0; li < expectedCtx.embeddedLinks.length; li++) {
                  const expectedLink = expectedCtx.embeddedLinks[li];
                  const actualLink = actualCtx.embeddedLinks[li];
                  if (expectedLink.linkName !== actualLink.linkName || expectedLink.linkRelativePath !== actualLink.linkRelativePath) {
                    errors.push(
                      `[${siteName}] ${relativePath}: Backlink "${spec.relativeLinkPath}" context[${ci}] embeddedLinks[${li}] mismatch: ` +
                      `expected {name: "${expectedLink.linkName}", path: "${expectedLink.linkRelativePath}"}, ` +
                      `got {name: "${actualLink.linkName}", path: "${actualLink.linkRelativePath}"}`
                    );
                  }
                }
              }
            }
          } else {
            errors.push(
              `[${siteName}] ${relativePath}: Missing backlinkContexts for backlink "${spec.relativeLinkPath}" — pagespec needs updating`
            );
          }
        }
      }
    }

    expect(pagesValidated).toBeGreaterThan(0);

    if (errors.length > 0) {
      throw new Error(`htmlRenderedLinks validation errors:\n${errors.join('\n')}`);
    }
  });
});
