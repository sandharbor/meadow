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
  startServer,
  stopServer,
  TEST_BASE_URL,
} from '../../../../helpers/serverManager.js';
import { SystemTestBundleSetup } from '../../../../helpers/testSetup.js';
import {
  getPagespecForBundle,
  getReferencedBundles,
  getEffectivePagespecBlock,
  isExcalidrawMarkdown,
  validatePagespecsBlock,
  validatePagespecEntry,
  isValidLinkPath,
  validateLinkSpec,
  validateLinksSection,
  linkPathToPageId,
  pageIdToLinkPath,
  validateOutlinks,
  validateInlinks,
  checkPagespecLinks,
  isPagespecNotInWorkingGraph,
} from '../../../../pagespecs/index.js';
import type { WorkingGraphData, PagespecInWorkingGraph } from '../../../../pagespecs/index.js';
import { parseBundleNodeConfig } from '../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import {
  findAllPagespecSourceFiles,
  getAvailableBundles,
  getPageIdFromPath,
  getPageTitle,
  getPagespecBundlesToCheck,
  isPageTracked,
  pagespecSourceGraphDirs,
} from '../../../support/pagespecTestHelpers.js';

describe('Pagespecs Curation System Tests', () => {
  describe('Curation YAML Validation Tests', () => {
    it('all curation filter IDs should be valid', () => {
      const availableBundles = getAvailableBundles();
      const errors: string[] = [];

      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const pagespecSourceFiles = findAllPagespecSourceFiles(sourceGraphDir);

        for (const sourceFile of pagespecSourceFiles) {
          const content = fs.readFileSync(sourceFile, 'utf-8');
          const block = getEffectivePagespecBlock(sourceFile, content).block;
          if (!block) continue;

          const pageTitle = getPageTitle(sourceFile);
          const validationErrors = validatePagespecsBlock(
            block,
            [],
            availableBundles,
            pageTitle,
            { requireLinksWhenInWorkingGraph: true, requireHtmlRenderedLinks: false }
          );

          for (const err of validationErrors) {
            if (err.field === 'filtersSelected') {
              errors.push(`${sourceFile}: ${err.message}`);
            }
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Filter ID validation errors:\n${errors.join('\n')}`);
      }
    });

    it('all curation specs with isInWorkingGraph should have links', () => {
      const availableBundles = getAvailableBundles();
      const errors: string[] = [];

      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const pagespecSourceFiles = findAllPagespecSourceFiles(sourceGraphDir);

        for (const sourceFile of pagespecSourceFiles) {
          const content = fs.readFileSync(sourceFile, 'utf-8');
          const block = getEffectivePagespecBlock(sourceFile, content).block;
          if (!block) continue;

          const pageTitle = getPageTitle(sourceFile);
          const validationErrors = validatePagespecsBlock(
            block,
            [],
            availableBundles,
            pageTitle,
            { requireLinksWhenInWorkingGraph: true, requireHtmlRenderedLinks: false }
          );

          for (const err of validationErrors) {
            if (err.field === 'links') {
              errors.push(`${sourceFile}: ${err.message}`);
            }
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Links validation errors:\n${errors.join('\n')}`);
      }
    });

    it('all curation pagespecs should pass validation with no curation errors', () => {
      const availableBundles = getAvailableBundles();
      const errors: string[] = [];

      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const pagespecSourceFiles = findAllPagespecSourceFiles(sourceGraphDir);
        const allReferencedBundles: string[] = [];

        for (const sourceFile of pagespecSourceFiles) {
          const content = fs.readFileSync(sourceFile, 'utf-8');
          const block = getEffectivePagespecBlock(sourceFile, content).block;
          if (block) {
            for (const bundle of getReferencedBundles(block)) {
              if (!allReferencedBundles.includes(bundle)) {
                allReferencedBundles.push(bundle);
              }
            }
          }
        }

        for (const sourceFile of pagespecSourceFiles) {
          const content = fs.readFileSync(sourceFile, 'utf-8');
          const block = getEffectivePagespecBlock(sourceFile, content).block;
          if (!block) continue;

          const pageTitle = getPageTitle(sourceFile);
          const validationErrors = validatePagespecsBlock(
            block,
            allReferencedBundles,
            availableBundles,
            pageTitle,
            { requireLinksWhenInWorkingGraph: true, requireHtmlRenderedLinks: false }
          );

          for (const err of validationErrors) {
            errors.push(`${sourceFile}: [${err.field ?? 'general'}] ${err.message}`);
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Curation pagespec validation errors:\n${errors.join('\n')}`);
      }
    });
  });

  describe('Frontier/Orphan Specification Tests', () => {
    it('should correctly identify orphan pages (frontierDepthOrNullForOrphan is null)', () => {
      let orphanPagesFound = 0;

      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const pagespecSourceFiles = findAllPagespecSourceFiles(sourceGraphDir);

        for (const sourceFile of pagespecSourceFiles) {
          const content = fs.readFileSync(sourceFile, 'utf-8');
          const block = getEffectivePagespecBlock(sourceFile, content).block;
          if (!block) continue;

          for (const spec of block.pagespecs) {
            if (isPagespecNotInWorkingGraph(spec)) {
              if (spec.curation.frontierDepthOrNullForOrphan === null) {
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

      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const pagespecSourceFiles = findAllPagespecSourceFiles(sourceGraphDir);

        for (const sourceFile of pagespecSourceFiles) {
          const content = fs.readFileSync(sourceFile, 'utf-8');
          const block = getEffectivePagespecBlock(sourceFile, content).block;
          if (!block) continue;

          for (const spec of block.pagespecs) {
            if (isPagespecNotInWorkingGraph(spec)) {
              if (typeof spec.curation.frontierDepthOrNullForOrphan === 'number') {
                frontierPagesFound++;
              }
            }
          }
        }
      }

      expect(frontierPagesFound).toBeGreaterThan(0);
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
      expect(isValidLinkPath('/folder/page.html')).toBe(true);
      expect(isValidLinkPath('/assets/shared.css')).toBe(true);
      expect(isValidLinkPath('/assets/behavior.js')).toBe(true);
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
      expect(linkPathToPageId('/folder/page.html')).toBe('folder/page.html');
      expect(linkPathToPageId('/assets/shared.css')).toBe('assets/shared.css');
      expect(linkPathToPageId('/assets/behavior.js')).toBe('assets/behavior.js');
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
      expect(pageIdToLinkPath('folder/page.html')).toBe('/folder/page.html');
      expect(pageIdToLinkPath('assets/shared.css')).toBe('/assets/shared.css');
      expect(pageIdToLinkPath('assets/behavior.js')).toBe('/assets/behavior.js');
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
      const errors = validateLinkSpec(validSpec, 'test', 'testPage', 'testBundle');
      expect(errors).toHaveLength(0);
    });

    it('validateLinkSpec should accept valid image link specs', () => {
      const imageSpec = { linkPath: '/folder/image.png', isInGraph: true };
      const errors = validateLinkSpec(imageSpec, 'test', 'testPage', 'testBundle');
      expect(errors).toHaveLength(0);
    });

    it('validateLinkSpec should reject invalid link specs', () => {
      expect(validateLinkSpec({ isInGraph: true }, 'test', 'testPage', 'testBundle').length).toBeGreaterThan(0);
      expect(validateLinkSpec({ linkPath: 'invalid', isInGraph: true }, 'test', 'testPage', 'testBundle').length).toBeGreaterThan(0);
      expect(validateLinkSpec({ linkPath: '/page.md' }, 'test', 'testPage', 'testBundle').length).toBeGreaterThan(0);
      expect(validateLinkSpec(null, 'test', 'testPage', 'testBundle').length).toBeGreaterThan(0);
      expect(validateLinkSpec('string', 'test', 'testPage', 'testBundle').length).toBeGreaterThan(0);
    });
  });

  describe('Links Section Validation Tests', () => {
    it('validateLinksSection should accept valid links sections', () => {
      expect(validateLinksSection({
        outlinks: [{ linkPath: '/page1.md', isInGraph: true }],
        inlinks: [{ linkPath: '/page2.md', isInGraph: false }],
      }, 'testPage', 'testBundle')).toHaveLength(0);

      expect(validateLinksSection({
        outlinks: [{ linkPath: '/page1.md', isInGraph: true }],
      }, 'testPage', 'testBundle')).toHaveLength(0);

      expect(validateLinksSection({
        inlinks: [{ linkPath: '/page1.md', isInGraph: true }],
      }, 'testPage', 'testBundle')).toHaveLength(0);

      expect(validateLinksSection({
        outlinks: [],
        inlinks: [],
      }, 'testPage', 'testBundle')).toHaveLength(0);
    });

    it('validateLinksSection should reject invalid links sections', () => {
      expect(validateLinksSection(null, 'testPage', 'testBundle').length).toBeGreaterThan(0);
      expect(validateLinksSection({ outlinks: 'not an array' }, 'testPage', 'testBundle').length).toBeGreaterThan(0);
      expect(validateLinksSection({ inlinks: 'not an array' }, 'testPage', 'testBundle').length).toBeGreaterThan(0);
    });
  });

  describe('Mandatory Links When In Working Graph Tests', () => {
    const availableBundles = new Set(['test-bundle']);

    it('should require links section when isInWorkingGraph is true (default option)', () => {
      const specWithoutLinks: PagespecInWorkingGraph = {
        bundle: 'test-bundle',
        curation: {
          isTracked: true,
          isInWorkingGraph: true,
        },
        generation: {
          htmlRenderedLinks: { mainSectionLinks: [], footerSectionBacklinks: [] },
        },
      };

      const errors = validatePagespecEntry(specWithoutLinks, availableBundles, 'testPage');
      expect(errors.some((e) => e.field === 'links')).toBe(true);
    });

    it('should accept links section when isInWorkingGraph is true', () => {
      const specWithLinks: PagespecInWorkingGraph = {
        bundle: 'test-bundle',
        curation: {
          isTracked: true,
          isInWorkingGraph: true,
          links: {
            outlinks: [],
            inlinks: [],
          },
        },
        generation: {
          htmlRenderedLinks: { mainSectionLinks: [], footerSectionBacklinks: [] },
        },
      };

      const errors = validatePagespecEntry(specWithLinks, availableBundles, 'testPage');
      expect(errors.filter((e) => e.field === 'links')).toHaveLength(0);
    });

    it('should allow disabling links requirement via option', () => {
      const specWithoutLinks: PagespecInWorkingGraph = {
        bundle: 'test-bundle',
        curation: {
          isTracked: true,
          isInWorkingGraph: true,
        },
        generation: {
          htmlRenderedLinks: { mainSectionLinks: [], footerSectionBacklinks: [] },
        },
      };

      const errors = validatePagespecEntry(specWithoutLinks, availableBundles, 'testPage', {
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
      expect(errors.some((e) => e.type === 'missing_in_spec' && e.linkPath === '/page2.md')).toBe(true);
    });

    it('validateOutlinks should detect missing links in actual', () => {
      const specifiedLinks = [
        { linkPath: '/page1.md', isInGraph: true },
        { linkPath: '/page2.md', isInGraph: true },
      ];
      const actualLinks = ['page1'];
      const workingGraphPageIds = new Set(['page1', 'page2']);

      const errors = validateOutlinks(specifiedLinks, actualLinks, workingGraphPageIds, 'test');
      expect(errors.some((e) => e.type === 'missing_in_actual' && e.linkPath === '/page2.md')).toBe(true);
    });

    it('validateOutlinks should detect wrong isInGraph values', () => {
      const specifiedLinks = [{ linkPath: '/page1.md', isInGraph: false }];
      const actualLinks = ['page1'];
      const workingGraphPageIds = new Set(['page1']);

      const errors = validateOutlinks(specifiedLinks, actualLinks, workingGraphPageIds, 'test');
      expect(errors.some((e) => e.type === 'wrong_is_in_graph')).toBe(true);
    });

    it('validateInlinks should work similarly to validateOutlinks', () => {
      const specifiedLinks = [{ linkPath: '/page1.md', isInGraph: true }];
      const actualLinks = ['page1', 'page2'];
      const workingGraphPageIds = new Set(['page1', 'page2']);

      const errors = validateInlinks(specifiedLinks, actualLinks, workingGraphPageIds, 'test');
      expect(errors.some((e) => e.type === 'missing_in_spec' && e.linkPath === '/page2.md')).toBe(true);
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
        outlinks: new Map([['testPage', ['out1', 'out2']]]),
        inlinks: new Map([['testPage', ['in1']]]),
      };

      const result = checkPagespecLinks(links, 'testPage', workingGraph, 'Test Page');
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

});

async function validatePagespecLinksForBundle(
  bundleSlug: string,
  bundleName: string,
  sourceGraphDir: string,
  initialPageTitle: string
): Promise<{ errors: string[]; pagesValidated: number }> {
  const response = await fetch(
    `${TEST_BASE_URL}/api/bundles/${bundleSlug}/curation/working-graph?initialPageTitle=${encodeURIComponent(initialPageTitle)}`
  );

  expect(response.ok).toBe(true);

  const graphData = (await response.json()) as {
    allOutlinkTargets: Record<string, string[]>;
    allInlinkSources: Record<string, string[]>;
    nodes: { bundleNodeKey: string }[];
  };

  const workingGraphPageIds = new Set(graphData.nodes.map((node) => linkPathToPageId(node.bundleNodeKey)));

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

  const pagespecSourceFiles = findAllPagespecSourceFiles(sourceGraphDir);
  const errors: string[] = [];
  let pagesValidated = 0;

  for (const sourceFile of pagespecSourceFiles) {
    const content = fs.readFileSync(sourceFile, 'utf-8');
    const block = getEffectivePagespecBlock(sourceFile, content).block;
    if (!block) continue;

    const pageTitle = getPageIdFromPath(sourceFile, sourceGraphDir, content, isExcalidrawMarkdown);
    const bundleSpec = getPagespecForBundle(block, bundleName);

    if (!bundleSpec || !bundleSpec.curation.isInWorkingGraph) continue;

    pagesValidated++;

    if (!workingGraphPageIds.has(pageTitle)) {
      errors.push(
        `[${bundleName}] ${path.basename(sourceFile)}: claims isInWorkingGraph: true but is NOT in working graph`
      );
      continue;
    }

    if (!bundleSpec.curation.links) continue;

    const result = checkPagespecLinks(
      bundleSpec.curation.links,
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
        errors.push(`[${bundleName}] ${path.basename(sourceFile)}: ${err.message}`);
      }
    }
  }

  return { errors, pagesValidated };
}

describe('Runtime Pagespec Curation Validation', () => {
  let bigBundleSetup: SystemTestBundleSetup | undefined;
  let smallBundleSetup: SystemTestBundleSetup | undefined;
  let exampleBundleSetup: SystemTestBundleSetup | undefined;
  let folderStructureSingleSetup: SystemTestBundleSetup | undefined;
  let folderStructureMultipleSetup: SystemTestBundleSetup | undefined;

  beforeAll(async () => {
    await startServer();
  });

  afterAll(() => {
    stopServer();
  });

  beforeEach(() => {
    bigBundleSetup = new SystemTestBundleSetup(
      'home_fixture_big_and_small',
      'pagespec-curation-validation-big',
      { bundleFolderName: 'meadow-test-bundle-big' }
    );
    bigBundleSetup.setUp();

    smallBundleSetup = new SystemTestBundleSetup(
      'home_fixture_big_and_small',
      'pagespec-curation-validation-small',
      { bundleFolderName: 'meadow-test-bundle-small' }
    );
    smallBundleSetup.setUp();

    exampleBundleSetup = new SystemTestBundleSetup(
      'home_fixture_example',
      'pagespec-curation-validation-example',
      { bundleFolderName: 'example-bundle' }
    );
    exampleBundleSetup.setUp();

    folderStructureSingleSetup = new SystemTestBundleSetup(
      'home_fixture_folder_structure_single',
      'pagespec-curation-validation-folder-single',
      { bundleFolderName: 'single-folder-bundle' }
    );
    folderStructureSingleSetup.setUp();

    folderStructureMultipleSetup = new SystemTestBundleSetup(
      'home_fixture_folder_structure_multiple',
      'pagespec-curation-validation-folder-multiple',
      { bundleFolderName: 'ordered-folders' }
    );
    folderStructureMultipleSetup.setUp();
  });

  afterEach(() => {
    bigBundleSetup?.tearDown();
    smallBundleSetup?.tearDown();
    exampleBundleSetup?.tearDown();
    folderStructureSingleSetup?.tearDown();
    folderStructureMultipleSetup?.tearDown();
  });

  const bundlesToCheck = () => getPagespecBundlesToCheck({
    big: bigBundleSetup!,
    small: smallBundleSetup!,
    example: exampleBundleSetup!,
    folderStructureSingle: folderStructureSingleSetup!,
    folderStructureMultiple: folderStructureMultipleSetup!,
  });

  it('should validate pagespec curation links match actual working graph links', async () => {
    const configuredBundles = bundlesToCheck();

    const results = await Promise.all(
      configuredBundles.map(({ name, setup, initialPage, sourceGraphDir }) =>
        validatePagespecLinksForBundle(setup.getBundleSlug(), name, sourceGraphDir, initialPage)
      )
    );

    const allErrors = results.flatMap((r) => r.errors);
    const totalValidated = results.reduce((sum, r) => sum + r.pagesValidated, 0);

    expect(totalValidated).toBeGreaterThan(0);

    if (allErrors.length > 0) {
      throw new Error(`Pagespec link validation errors:\n${allErrors.join('\n')}`);
    }
  });

  it('should validate isInWorkingGraph claims for pages declaring false', async () => {
    const configuredBundles = bundlesToCheck();
    const allErrors: string[] = [];
    let totalValidated = 0;

    for (const { name: bundleName, setup: bundleSetup, initialPage, sourceGraphDir } of configuredBundles) {
      const response = await fetch(
        `${TEST_BASE_URL}/api/bundles/${bundleSetup.getBundleSlug()}/curation/working-graph?initialPageTitle=${encodeURIComponent(initialPage)}`
      );

      expect(response.ok).toBe(true);

      const graphData = (await response.json()) as {
        nodes: { bundleNodeKey: string }[];
      };

      const workingGraphPageIds = new Set(graphData.nodes.map((node) => linkPathToPageId(node.bundleNodeKey)));
      const pagespecSourceFiles = findAllPagespecSourceFiles(sourceGraphDir);

      for (const sourceFile of pagespecSourceFiles) {
        const content = fs.readFileSync(sourceFile, 'utf-8');
        const block = getEffectivePagespecBlock(sourceFile, content).block;
        if (!block) continue;

        const pageId = getPageIdFromPath(sourceFile, sourceGraphDir, content, isExcalidrawMarkdown);
        const bundleSpec = getPagespecForBundle(block, bundleName);
        if (!bundleSpec || bundleSpec.curation.isInWorkingGraph !== false) continue;

        totalValidated++;

        if (workingGraphPageIds.has(pageId)) {
          allErrors.push(
            `[${bundleName}] ${pageId}: claims isInWorkingGraph: false but IS in working graph`
          );
        }
      }
    }

    expect(totalValidated).toBeGreaterThan(0);

    if (allErrors.length > 0) {
      throw new Error(`isInWorkingGraph validation errors:\n${allErrors.join('\n')}`);
    }
  });

  it('should validate isTracked matches bundle_node_config.yaml', () => {
    const configuredBundles = bundlesToCheck();
    const errors: string[] = [];
    let pagesValidated = 0;

    for (const { name: bundleName, setup: bundleSetup, sourceGraphDir } of configuredBundles) {
      const bundleConfigPath = path.join(bundleSetup.getBundlePath(), 'config', 'bundle_node_config.yaml');
      const bundleNodeConfigs = fs.existsSync(bundleConfigPath)
        ? parseBundleNodeConfig(fs.readFileSync(bundleConfigPath, 'utf-8'))
        : [];

      const pagespecSourceFiles = findAllPagespecSourceFiles(sourceGraphDir);

      for (const sourceFile of pagespecSourceFiles) {
        const content = fs.readFileSync(sourceFile, 'utf-8');
        const block = getEffectivePagespecBlock(sourceFile, content).block;
        if (!block) continue;

        const pageId = getPageIdFromPath(sourceFile, sourceGraphDir, content, isExcalidrawMarkdown);
        const bundleSpec = getPagespecForBundle(block, bundleName);
        if (!bundleSpec) continue;

        pagesValidated++;

        const actualTracked = isPageTracked(pageId, bundleNodeConfigs, 'md');
        if (bundleSpec.curation.isTracked !== actualTracked) {
          errors.push(
            `[${bundleName}] ${pageId}: isTracked mismatch - spec says ${bundleSpec.curation.isTracked}, actual is ${actualTracked}`
          );
        }
      }
    }

    expect(pagesValidated).toBeGreaterThan(0);

    if (errors.length > 0) {
      throw new Error(`isTracked validation errors:\n${errors.join('\n')}`);
    }
  });

  it('should validate frontierDepthOrNullForOrphan matches actual frontier depth', async () => {
    const configuredBundles = bundlesToCheck();
    const allErrors: string[] = [];
    let totalValidated = 0;

    for (const { name: bundleName, setup: bundleSetup, initialPage, sourceGraphDir } of configuredBundles) {
      const response = await fetch(
        `${TEST_BASE_URL}/api/bundles/${bundleSetup.getBundleSlug()}/curation/working-graph?initialPageTitle=${encodeURIComponent(initialPage)}&frontierDepth=10`
      );

      expect(response.ok).toBe(true);

      const graphData = (await response.json()) as {
        nodes: { bundleNodeKey: string; remaining_depth: number }[];
      };

      const pageRemainingDepthMap = new Map<string, number>();
      for (const node of graphData.nodes) {
        const pageId = linkPathToPageId(node.bundleNodeKey);
        pageRemainingDepthMap.set(pageId, node.remaining_depth);
      }

      const pagespecSourceFiles = findAllPagespecSourceFiles(sourceGraphDir);

      for (const sourceFile of pagespecSourceFiles) {
        const content = fs.readFileSync(sourceFile, 'utf-8');
        const block = getEffectivePagespecBlock(sourceFile, content).block;
        if (!block) continue;

        const pageId = getPageIdFromPath(sourceFile, sourceGraphDir, content, isExcalidrawMarkdown);
        const bundleSpec = getPagespecForBundle(block, bundleName);
        if (!bundleSpec || bundleSpec.curation.isInWorkingGraph !== false) continue;
        if (!isPagespecNotInWorkingGraph(bundleSpec)) continue;

        totalValidated++;

        const expectedFrontierDepth = bundleSpec.curation.frontierDepthOrNullForOrphan;
        const remainingDepth = pageRemainingDepthMap.get(pageId);

        if (expectedFrontierDepth === null) {
          if (remainingDepth !== undefined) {
            allErrors.push(
              `[${bundleName}] ${pageId}: claims to be orphan (frontierDepthOrNullForOrphan: null) but appears in extended working graph with remaining_depth=${remainingDepth}`
            );
          }
        } else if (remainingDepth === undefined) {
          allErrors.push(
            `[${bundleName}] ${pageId}: claims frontierDepthOrNullForOrphan: ${expectedFrontierDepth} but does not appear in extended working graph (frontierDepth=10)`
          );
        } else {
          const actualFrontierDepth = -remainingDepth;
          if (actualFrontierDepth !== expectedFrontierDepth) {
            allErrors.push(
              `[${bundleName}] ${pageId}: frontierDepthOrNullForOrphan mismatch - spec says ${expectedFrontierDepth}, actual is ${actualFrontierDepth} (remaining_depth=${remainingDepth})`
            );
          }
        }
      }
    }

    expect(totalValidated).toBeGreaterThan(0);

    if (allErrors.length > 0) {
      throw new Error(`frontierDepthOrNullForOrphan validation errors:\n${allErrors.join('\n')}`);
    }
  });
});
