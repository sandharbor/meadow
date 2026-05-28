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

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  extractPagespecsBlock,
  getEffectivePagespecBlock,
  getPagespecForSite,
  getReferencedSites,
  getSidecarPagespecPath,
  hasPagespecsBlock,
  isExcalidrawMarkdown,
  isPagespecNotInWorkingGraph,
  parsePagespecSidecarContent,
  sourceFileForSidecarPath,
  validatePagespecsBlockStructure,
} from '../pagespecs/index.js';
import type { PagespecsBlock } from '../pagespecs/index.js';
import {
  findAllMarkdownFiles,
  findAllSidecarPagespecFiles,
  getAvailableSites,
  getPageTitle,
  pagespecSourceGraphDirs,
} from './support/pagespecTestHelpers.js';

describe('Pagespecs General System Tests', () => {
  describe('Pagespec Fixture Structure Tests', () => {
    it('should have valid source graph directories', () => {
      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        expect(fs.existsSync(sourceGraphDir)).toBe(true);
      }
    });

    it('all pagespecs blocks should parse into typed objects', () => {
      const errors: string[] = [];

      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const mdFiles = findAllMarkdownFiles(sourceGraphDir);

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          const { block, source, sourcePath } = getEffectivePagespecBlock(mdFile, content);
          if (source === 'none') continue;
          if (block === null) {
            errors.push(`Failed to parse pagespecs in ${sourcePath}`);
            continue;
          }

          const structureErrors = validatePagespecsBlockStructure(block, getPageTitle(mdFile));
          for (const err of structureErrors) {
            errors.push(`${sourcePath}: ${err.message}`);
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

      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const mdFiles = findAllMarkdownFiles(sourceGraphDir);

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          const block = getEffectivePagespecBlock(mdFile, content).block;
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
  });

  describe('Pagespec Completeness Tests', () => {
    it('should have at least one source page with pagespecs', () => {
      let pagesWithSpecs = 0;

      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const mdFiles = findAllMarkdownFiles(sourceGraphDir);

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          if (getEffectivePagespecBlock(mdFile, content).source !== 'none') {
            pagesWithSpecs++;
          }
        }
      }

      expect(pagesWithSpecs).toBeGreaterThan(0);
    });

    it('all pages should have pagespecs for every site that is used across any page', () => {
      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const mdFiles = findAllMarkdownFiles(sourceGraphDir);
        const allReferencedSites = new Set<string>();

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          const block = getEffectivePagespecBlock(mdFile, content).block;
          if (block) {
            for (const site of getReferencedSites(block)) {
              allReferencedSites.add(site);
            }
          }
        }

        if (allReferencedSites.size === 0) continue;

        const missingBySite = new Map<string, string[]>();
        for (const site of allReferencedSites) {
          missingBySite.set(site, []);
        }

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          const block = getEffectivePagespecBlock(mdFile, content).block;
          const relativePath = path.relative(sourceGraphDir, mdFile);

          if (!block) {
            for (const site of allReferencedSites) {
              missingBySite.get(site)!.push(relativePath);
            }
          } else {
            const sitesInFile = new Set(getReferencedSites(block));
            for (const site of allReferencedSites) {
              if (!sitesInFile.has(site)) {
                missingBySite.get(site)!.push(relativePath);
              }
            }
          }
        }

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

  describe('Parsing Utility Tests', () => {
    it('extractPagespecsBlock should parse valid YAML', () => {
      const content = `# Test

\`\`\`yaml
pagespecs:
  - site: meadow-test-site-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      filtersSelected:
        untracked-filter: false
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks: []
  - site: meadow-test-site-small
    curation:
      isTracked: false
      isInWorkingGraph: false
      frontierDepthOrNullForOrphan: 1
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks: []
\`\`\``;

      const block = extractPagespecsBlock(content);
      expect(block).not.toBeNull();
      expect(block!.pagespecs).toHaveLength(2);

      const bigSiteSpec = getPagespecForSite(block!, 'meadow-test-site-big');
      expect(bigSiteSpec).toBeDefined();
      expect(bigSiteSpec!.curation.isInWorkingGraph).toBe(true);

      const smallSiteSpec = getPagespecForSite(block!, 'meadow-test-site-small');
      expect(smallSiteSpec).toBeDefined();
      expect(smallSiteSpec!.curation.isInWorkingGraph).toBe(false);
      if (isPagespecNotInWorkingGraph(smallSiteSpec!)) {
        expect(smallSiteSpec.curation.frontierDepthOrNullForOrphan).toBe(1);
      }
    });

    it('getReferencedSites should return all site names', () => {
      const block: PagespecsBlock = {
        pagespecs: [
          {
            site: 'site-a',
            curation: { isTracked: true, isInWorkingGraph: true },
            generation: { htmlRenderedLinks: { mainSectionLinks: [], footerSectionBacklinks: [] } },
          },
          {
            site: 'site-b',
            curation: {
              isTracked: true,
              isInWorkingGraph: false,
              frontierDepthOrNullForOrphan: null,
            },
            generation: { htmlRenderedLinks: { mainSectionLinks: [], footerSectionBacklinks: [] } },
          },
        ],
      };

      const sites = getReferencedSites(block);
      expect(sites).toEqual(['site-a', 'site-b']);
    });

    it('hasPagespecsBlock should detect pagespecs blocks', () => {
      const withSpecs = `# Page

\`\`\`yaml
pagespecs:
  - site: test
    curation:
      isTracked: true
      isInWorkingGraph: true
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks: []
\`\`\``;
      const withoutSpecs = '# Page\n\nNo specs here.';

      expect(hasPagespecsBlock(withSpecs)).toBe(true);
      expect(hasPagespecsBlock(withoutSpecs)).toBe(false);
    });
  });

  describe('Sidecar Pagespec Tests', () => {
    it('every *.pagespec.yaml sidecar should parse and have a corresponding source file', () => {
      const errors: string[] = [];

      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const sidecars = findAllSidecarPagespecFiles(sourceGraphDir);

        for (const sidecarPath of sidecars) {
          const content = fs.readFileSync(sidecarPath, 'utf-8');
          const block = parsePagespecSidecarContent(content);
          if (block === null) {
            errors.push(`${sidecarPath}: failed to parse as YAML pagespecs block`);
            continue;
          }

          const expectedSourcePath = sourceFileForSidecarPath(sidecarPath);
          if (!expectedSourcePath) {
            errors.push(`${sidecarPath}: filename does not follow the <basename>.<file_type>.pagespec.yaml convention`);
            continue;
          }
          if (!fs.existsSync(expectedSourcePath)) {
            errors.push(`${sidecarPath}: orphan sidecar - expected source file ${expectedSourcePath} does not exist`);
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Sidecar pagespec validation errors:\n${errors.join('\n')}`);
      }
    });

    it('every Excalidraw markdown file should have a sidecar pagespec.yaml', () => {
      const errors: string[] = [];

      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const mdFiles = findAllMarkdownFiles(sourceGraphDir);

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          if (!isExcalidrawMarkdown(content)) continue;

          const sidecarPath = getSidecarPagespecPath(mdFile, content);
          if (!sidecarPath) {
            errors.push(`${mdFile}: Excalidraw file but could not derive sidecar path`);
            continue;
          }
          if (!fs.existsSync(sidecarPath)) {
            const relative = path.relative(sourceGraphDir, mdFile);
            errors.push(`${relative}: Excalidraw drawing is missing sidecar pagespec ${path.basename(sidecarPath)}`);
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Missing Excalidraw sidecars:\n${errors.join('\n')}`);
      }
    });

    it('Excalidraw markdown files should not contain inline pagespecs blocks', () => {
      const errors: string[] = [];

      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const mdFiles = findAllMarkdownFiles(sourceGraphDir);

        for (const mdFile of mdFiles) {
          const content = fs.readFileSync(mdFile, 'utf-8');
          if (!isExcalidrawMarkdown(content)) continue;
          if (hasPagespecsBlock(content)) {
            const relative = path.relative(sourceGraphDir, mdFile);
            errors.push(`${relative}: Excalidraw drawing has an inline pagespecs block (move it to the sidecar .pagespec.yaml)`);
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Inline pagespecs in Excalidraw drawings:\n${errors.join('\n')}`);
      }
    });
  });
});
