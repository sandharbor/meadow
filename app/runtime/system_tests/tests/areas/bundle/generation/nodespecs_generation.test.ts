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
  getNodespecBlock,
  getNodespecForBundle,
  validateNodespecsBlock,
  isNodespecNotInWorkingGraph,
} from '../../../../nodespecs/index.js';
import {
  extractMainSectionLinkPaths,
  extractFooterBacklinkPaths,
  extractBacklinkDetails,
} from '../../../../helpers/htmlLinkExtractor.js';
import {
  findAllNodespecSourceFiles,
  getAvailableBundles,
  getNodespecBundlesToCheck,
  getPageTitle,
  nodespecSourceGraphDirs,
} from '../../../support/nodespecTestHelpers.js';

describe('Nodespecs Generation System Tests', () => {
  describe('Generation YAML Validation Tests', () => {
    it('all nodespecs should have generation.htmlRenderedLinks with mainSectionLinks and footerSectionBacklinks', () => {
      const availableBundles = getAvailableBundles();
      const errors: string[] = [];

      for (const sourceGraphDir of nodespecSourceGraphDirs) {
        const nodespecSourceFiles = findAllNodespecSourceFiles(sourceGraphDir);

        for (const sourceFile of nodespecSourceFiles) {
          const block = getNodespecBlock(sourceFile).block;
          if (!block) continue;

          const pageTitle = getPageTitle(sourceFile);
          const validationErrors = validateNodespecsBlock(
            block,
            [],
            availableBundles,
            pageTitle,
            { requireLinksWhenInWorkingGraph: false, requireHtmlRenderedLinks: true }
          );

          for (const err of validationErrors) {
            if (err.field === 'htmlRenderedLinks') {
              errors.push(`${sourceFile}: ${err.message}`);
            }
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`htmlRenderedLinks validation errors:\n${errors.join('\n')}`);
      }
    });
  });

  describe('Non-Working-Graph htmlRenderedLinks Tests', () => {
    it('pages not in working graph should have empty htmlRenderedLinks arrays', () => {
      const errors: string[] = [];
      let pagesChecked = 0;

      for (const sourceGraphDir of nodespecSourceGraphDirs) {
        const nodespecSourceFiles = findAllNodespecSourceFiles(sourceGraphDir);

        for (const sourceFile of nodespecSourceFiles) {
          const block = getNodespecBlock(sourceFile).block;
          if (!block) continue;

          for (const spec of block.nodespecs) {
            if (!isNodespecNotInWorkingGraph(spec)) continue;

            pagesChecked++;
            const mainLinks = spec.generation.htmlRenderedLinks?.mainSectionLinks ?? [];
            const backlinks = spec.generation.htmlRenderedLinks?.footerSectionBacklinks ?? [];

            if (mainLinks.length > 0 || backlinks.length > 0) {
              const relativePath = path.relative(sourceGraphDir, sourceFile);
              errors.push(
                `[${spec.bundle}] ${relativePath}: page is not in working graph but has non-empty htmlRenderedLinks (mainSectionLinks: ${mainLinks.length}, footerSectionBacklinks: ${backlinks.length})`
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
});

describe('Runtime Nodespec Generation Validation', () => {
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
      'nodespec-generation-validation-big',
      { bundleFolderName: 'meadow-test-bundle-big' }
    );
    bigBundleSetup.setUp();

    smallBundleSetup = new SystemTestBundleSetup(
      'home_fixture_big_and_small',
      'nodespec-generation-validation-small',
      { bundleFolderName: 'meadow-test-bundle-small' }
    );
    smallBundleSetup.setUp();

    exampleBundleSetup = new SystemTestBundleSetup(
      'home_fixture_example',
      'nodespec-generation-validation-example',
      { bundleFolderName: 'example-bundle' }
    );
    exampleBundleSetup.setUp();

    folderStructureSingleSetup = new SystemTestBundleSetup(
      'home_fixture_folder_structure_single',
      'nodespec-generation-validation-folder-single',
      { bundleFolderName: 'single-folder-bundle' }
    );
    folderStructureSingleSetup.setUp();

    folderStructureMultipleSetup = new SystemTestBundleSetup(
      'home_fixture_folder_structure_multiple',
      'nodespec-generation-validation-folder-multiple',
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

  it('should validate htmlRenderedLinks match actual rendered HTML', async () => {
    const bundlesToCheck = getNodespecBundlesToCheck({
      big: bigBundleSetup!,
      small: smallBundleSetup!,
      example: exampleBundleSetup!,
      folderStructureSingle: folderStructureSingleSetup!,
      folderStructureMultiple: folderStructureMultipleSetup!,
    });

    await Promise.all(
      bundlesToCheck.map(async ({ setup }) => {
        await setup.captureInitialSourceSnapshot();
        const bundleSlug = setup.getBundleSlug();
        const response = await fetch(`${TEST_BASE_URL}/api/bundles/${bundleSlug}/generation/preview`, {
          method: 'POST',
        });
        expect(response.ok).toBe(true);
      })
    );

    const errors: string[] = [];
    let pagesValidated = 0;

    for (const { name: bundleName, setup: bundleSetup, sourceGraphDir } of bundlesToCheck) {
      const generatedHtmlFolderPath = bundleSetup.getCurrentGeneratedHtmlPath();
      const nodespecSourceFiles = findAllNodespecSourceFiles(sourceGraphDir);

      for (const sourceFile of nodespecSourceFiles) {
        const block = getNodespecBlock(sourceFile).block;
        if (!block) continue;

        const bundleSpec = getNodespecForBundle(block, bundleName);
        if (!bundleSpec || !bundleSpec.curation.isInWorkingGraph) continue;

        const relativePath = path.relative(sourceGraphDir, sourceFile).replace(/\.md$/, '.html');
        const htmlPath = path.join(generatedHtmlFolderPath, relativePath);

        // Images, PDFs, and web assets have no rendered HTML link sections.
        // SVG is markup and can contain links; binary assets must not be decoded as text.
        const hasRenderedMarkup = /\.(?:md|html|svg)$/i.test(sourceFile);
        if (!hasRenderedMarkup || !fs.existsSync(htmlPath)) {
          const mainLinks = bundleSpec.generation.htmlRenderedLinks?.mainSectionLinks ?? [];
          const backlinks = bundleSpec.generation.htmlRenderedLinks?.footerSectionBacklinks ?? [];
          if (mainLinks.length > 0 || backlinks.length > 0) {
            errors.push(
              `[${bundleName}] ${relativePath}: page has no HTML but htmlRenderedLinks is non-empty`
            );
          }
          pagesValidated++;
          continue;
        }

        pagesValidated++;
        const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

        const actualMainLinks = extractMainSectionLinkPaths(htmlContent).sort();
        const expectedMainLinks = (bundleSpec.generation.htmlRenderedLinks?.mainSectionLinks ?? [])
          .map((link) => link.relativeLinkPath)
          .sort();

        if (JSON.stringify(actualMainLinks) !== JSON.stringify(expectedMainLinks)) {
          errors.push(
            `[${bundleName}] Main section link mismatch in ${relativePath}:\n` +
            `  Expected: ${JSON.stringify(expectedMainLinks)}\n` +
            `  Actual:   ${JSON.stringify(actualMainLinks)}`
          );
        }

        const actualBacklinks = extractFooterBacklinkPaths(htmlContent).sort();
        const expectedBacklinks = (bundleSpec.generation.htmlRenderedLinks?.footerSectionBacklinks ?? [])
          .map((link) => link.relativeLinkPath)
          .sort();

        if (JSON.stringify(actualBacklinks) !== JSON.stringify(expectedBacklinks)) {
          errors.push(
            `[${bundleName}] Footer backlink mismatch in ${relativePath}:\n` +
            `  Expected: ${JSON.stringify(expectedBacklinks)}\n` +
            `  Actual:   ${JSON.stringify(actualBacklinks)}`
          );
        }

        const backlinkDetails = extractBacklinkDetails(htmlContent);
        const expectedBacklinkSpecs = bundleSpec.generation.htmlRenderedLinks?.footerSectionBacklinks ?? [];
        for (const spec of expectedBacklinkSpecs) {
          if (!spec.backlinkContexts) {
            errors.push(
              `[${bundleName}] ${relativePath}: Missing backlinkContexts for backlink "${spec.relativeLinkPath}" - nodespec needs updating`
            );
            continue;
          }

          const actual = backlinkDetails.find((detail) => detail.relativeLinkPath === spec.relativeLinkPath);
          if (!actual) {
            errors.push(
              `[${bundleName}] ${relativePath}: Could not find backlink "${spec.relativeLinkPath}" in HTML for context validation`
            );
            continue;
          }

          if (spec.backlinkContexts.length !== actual.contexts.length) {
            errors.push(
              `[${bundleName}] ${relativePath}: Backlink "${spec.relativeLinkPath}" context count mismatch: ` +
              `expected ${spec.backlinkContexts.length}, got ${actual.contexts.length}`
            );
            continue;
          }

          for (let ci = 0; ci < spec.backlinkContexts.length; ci++) {
            const expectedCtx = spec.backlinkContexts[ci];
            const actualCtx = actual.contexts[ci];

            if (expectedCtx.seeInContextLinkRelativePath !== actualCtx.seeInContextLinkRelativePath) {
              errors.push(
                `[${bundleName}] ${relativePath}: Backlink "${spec.relativeLinkPath}" context[${ci}] seeInContextLinkRelativePath mismatch: ` +
                `expected "${expectedCtx.seeInContextLinkRelativePath}", got "${actualCtx.seeInContextLinkRelativePath}"`
              );
            }

            if (expectedCtx.embeddedLinks.length !== actualCtx.embeddedLinks.length) {
              errors.push(
                `[${bundleName}] ${relativePath}: Backlink "${spec.relativeLinkPath}" context[${ci}] embeddedLinks count mismatch: ` +
                `expected ${expectedCtx.embeddedLinks.length}, got ${actualCtx.embeddedLinks.length}`
              );
              continue;
            }

            for (let li = 0; li < expectedCtx.embeddedLinks.length; li++) {
              const expectedLink = expectedCtx.embeddedLinks[li];
              const actualLink = actualCtx.embeddedLinks[li];
              if (
                expectedLink.linkName !== actualLink.linkName ||
                expectedLink.linkRelativePath !== actualLink.linkRelativePath
              ) {
                errors.push(
                  `[${bundleName}] ${relativePath}: Backlink "${spec.relativeLinkPath}" context[${ci}] embeddedLinks[${li}] mismatch: ` +
                  `expected {name: "${expectedLink.linkName}", path: "${expectedLink.linkRelativePath}"}, ` +
                  `got {name: "${actualLink.linkName}", path: "${actualLink.linkRelativePath}"}`
                );
              }
            }
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
