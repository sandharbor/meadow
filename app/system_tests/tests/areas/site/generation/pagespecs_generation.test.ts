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
import { SystemTestSiteSetup } from '../../../../helpers/testSetup.js';
import {
  extractContentWithoutPagespecs,
  getEffectivePagespecBlock,
  getPagespecForSite,
  validatePagespecsBlock,
  isPagespecNotInWorkingGraph,
} from '../../../../pagespecs/index.js';
import {
  extractMainSectionLinkPaths,
  extractFooterBacklinkPaths,
  extractBacklinkDetails,
} from '../../../../helpers/htmlLinkExtractor.js';
import {
  findAllMarkdownFiles,
  getAvailableSites,
  getPagespecSitesToCheck,
  getPageTitle,
  pagespecSourceGraphDirs,
} from '../../../support/pagespecTestHelpers.js';

describe('Pagespecs Generation System Tests', () => {
  describe('Generation YAML Validation Tests', () => {
    it('all pagespecs should have generation.htmlRenderedLinks with mainSectionLinks and footerSectionBacklinks', () => {
      const availableSites = getAvailableSites();
      const errors: string[] = [];

      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const mdFiles = findAllMarkdownFiles(sourceGraphDir);

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          const block = getEffectivePagespecBlock(mdFile, content).block;
          if (!block) continue;

          const pageTitle = getPageTitle(mdFile);
          const validationErrors = validatePagespecsBlock(
            block,
            [],
            availableSites,
            pageTitle,
            { requireLinksWhenInWorkingGraph: false, requireHtmlRenderedLinks: true }
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
  });

  describe('Content Stripping Tests', () => {
    it('extractContentWithoutPagespecs should remove pagespecs block', () => {
      const contentWithSpecs = `# Test Page

Some content here.

\`\`\`yaml
pagespecs:
  - site: test-site
    curation:
      isTracked: true
      isInWorkingGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks: []
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

  describe('Non-Working-Graph htmlRenderedLinks Tests', () => {
    it('pages not in working graph should have empty htmlRenderedLinks arrays', () => {
      const errors: string[] = [];
      let pagesChecked = 0;

      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const mdFiles = findAllMarkdownFiles(sourceGraphDir);

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          const block = getEffectivePagespecBlock(mdFile, content).block;
          if (!block) continue;

          for (const spec of block.pagespecs) {
            if (!isPagespecNotInWorkingGraph(spec)) continue;

            pagesChecked++;
            const mainLinks = spec.generation.htmlRenderedLinks?.mainSectionLinks ?? [];
            const backlinks = spec.generation.htmlRenderedLinks?.footerSectionBacklinks ?? [];

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
});

describe('Runtime Pagespec Generation Validation', () => {
  let bigSiteSetup: SystemTestSiteSetup | undefined;
  let smallSiteSetup: SystemTestSiteSetup | undefined;
  let exampleSiteSetup: SystemTestSiteSetup | undefined;
  let folderStructureSingleSetup: SystemTestSiteSetup | undefined;
  let folderStructureMultipleSetup: SystemTestSiteSetup | undefined;

  beforeAll(async () => {
    await startServer();
  });

  afterAll(() => {
    stopServer();
  });

  beforeEach(() => {
    bigSiteSetup = new SystemTestSiteSetup(
      'home_fixture_big_and_small',
      'pagespec-generation-validation-big',
      { siteFolderName: 'meadow-test-site-big' }
    );
    bigSiteSetup.setUp();

    smallSiteSetup = new SystemTestSiteSetup(
      'home_fixture_big_and_small',
      'pagespec-generation-validation-small',
      { siteFolderName: 'meadow-test-site-small' }
    );
    smallSiteSetup.setUp();

    exampleSiteSetup = new SystemTestSiteSetup(
      'home_fixture_example',
      'pagespec-generation-validation-example',
      { siteFolderName: 'example-site' }
    );
    exampleSiteSetup.setUp();

    folderStructureSingleSetup = new SystemTestSiteSetup(
      'home_fixture_folder_structure_single',
      'pagespec-generation-validation-folder-single',
      { siteFolderName: 'single-folder-site' }
    );
    folderStructureSingleSetup.setUp();

    folderStructureMultipleSetup = new SystemTestSiteSetup(
      'home_fixture_folder_structure_multiple',
      'pagespec-generation-validation-folder-multiple',
      { siteFolderName: 'ordered-folders' }
    );
    folderStructureMultipleSetup.setUp();
  });

  afterEach(() => {
    bigSiteSetup?.tearDown();
    smallSiteSetup?.tearDown();
    exampleSiteSetup?.tearDown();
    folderStructureSingleSetup?.tearDown();
    folderStructureMultipleSetup?.tearDown();
  });

  it('should validate htmlRenderedLinks match actual rendered HTML', async () => {
    const sitesToCheck = getPagespecSitesToCheck({
      big: bigSiteSetup!,
      small: smallSiteSetup!,
      example: exampleSiteSetup!,
      folderStructureSingle: folderStructureSingleSetup!,
      folderStructureMultiple: folderStructureMultipleSetup!,
    });

    await Promise.all(
      sitesToCheck.map(async ({ setup }) => {
        const siteSlug = setup.getSiteSlug();
        const response = await fetch(`${TEST_BASE_URL}/api/sites/${siteSlug}/generation/preview`, {
          method: 'POST',
        });
        expect(response.ok).toBe(true);
      })
    );

    const errors: string[] = [];
    let pagesValidated = 0;

    for (const { name: siteName, setup: siteSetup, sourceGraphDir } of sitesToCheck) {
      const generatedHtmlFolderPath = siteSetup.getPathInSite('html/generated');
      const mdFiles = findAllMarkdownFiles(sourceGraphDir);

      for (const mdFile of mdFiles) {
        const content = fs.readFileSync(mdFile, 'utf-8');
        const block = getEffectivePagespecBlock(mdFile, content).block;
        if (!block) continue;

        const siteSpec = getPagespecForSite(block, siteName);
        if (!siteSpec || !siteSpec.curation.isInWorkingGraph) continue;

        const relativePath = path.relative(sourceGraphDir, mdFile).replace(/\.md$/, '.html');
        const htmlPath = path.join(generatedHtmlFolderPath, relativePath);

        if (!fs.existsSync(htmlPath)) {
          const mainLinks = siteSpec.generation.htmlRenderedLinks?.mainSectionLinks ?? [];
          const backlinks = siteSpec.generation.htmlRenderedLinks?.footerSectionBacklinks ?? [];
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

        const actualMainLinks = extractMainSectionLinkPaths(htmlContent).sort();
        const expectedMainLinks = (siteSpec.generation.htmlRenderedLinks?.mainSectionLinks ?? [])
          .map((link) => link.relativeLinkPath)
          .sort();

        if (JSON.stringify(actualMainLinks) !== JSON.stringify(expectedMainLinks)) {
          errors.push(
            `[${siteName}] Main section link mismatch in ${relativePath}:\n` +
            `  Expected: ${JSON.stringify(expectedMainLinks)}\n` +
            `  Actual:   ${JSON.stringify(actualMainLinks)}`
          );
        }

        const actualBacklinks = extractFooterBacklinkPaths(htmlContent).sort();
        const expectedBacklinks = (siteSpec.generation.htmlRenderedLinks?.footerSectionBacklinks ?? [])
          .map((link) => link.relativeLinkPath)
          .sort();

        if (JSON.stringify(actualBacklinks) !== JSON.stringify(expectedBacklinks)) {
          errors.push(
            `[${siteName}] Footer backlink mismatch in ${relativePath}:\n` +
            `  Expected: ${JSON.stringify(expectedBacklinks)}\n` +
            `  Actual:   ${JSON.stringify(actualBacklinks)}`
          );
        }

        const backlinkDetails = extractBacklinkDetails(htmlContent);
        const expectedBacklinkSpecs = siteSpec.generation.htmlRenderedLinks?.footerSectionBacklinks ?? [];
        for (const spec of expectedBacklinkSpecs) {
          if (!spec.backlinkContexts) {
            errors.push(
              `[${siteName}] ${relativePath}: Missing backlinkContexts for backlink "${spec.relativeLinkPath}" - pagespec needs updating`
            );
            continue;
          }

          const actual = backlinkDetails.find((detail) => detail.relativeLinkPath === spec.relativeLinkPath);
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
                  `[${siteName}] ${relativePath}: Backlink "${spec.relativeLinkPath}" context[${ci}] embeddedLinks[${li}] mismatch: ` +
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
