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
  getPagespecForBundle,
  getReferencedBundles,
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
  findAllPagespecSourceFiles,
  findAllSidecarPagespecFiles,
  getAvailableBundles,
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
        const pagespecSourceFiles = findAllPagespecSourceFiles(sourceGraphDir);

        for (const sourceFile of pagespecSourceFiles) {
          const content = fs.readFileSync(sourceFile, 'utf-8');
          const { block, source, sourcePath } = getEffectivePagespecBlock(sourceFile, content);
          if (source === 'none') continue;
          if (block === null) {
            errors.push(`Failed to parse pagespecs in ${sourcePath}`);
            continue;
          }

          const structureErrors = validatePagespecsBlockStructure(block, getPageTitle(sourceFile));
          for (const err of structureErrors) {
            errors.push(`${sourcePath}: ${err.message}`);
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Pagespecs parsing errors:\n${errors.join('\n')}`);
      }
    });

    it('all bundle references should exist in home_fixtures', () => {
      const availableBundles = getAvailableBundles();
      const errors: string[] = [];

      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const pagespecSourceFiles = findAllPagespecSourceFiles(sourceGraphDir);

        for (const sourceFile of pagespecSourceFiles) {
          const content = fs.readFileSync(sourceFile, 'utf-8');
          const block = getEffectivePagespecBlock(sourceFile, content).block;
          if (!block) continue;

          const referencedBundles = getReferencedBundles(block);
          for (const bundle of referencedBundles) {
            if (!availableBundles.has(bundle)) {
              errors.push(`${sourceFile}: references unknown bundle "${bundle}"`);
            }
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Bundle reference errors:\n${errors.join('\n')}`);
      }
    });
  });

  describe('Pagespec Completeness Tests', () => {
    it('should have at least one source page with pagespecs', () => {
      let pagesWithSpecs = 0;

      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const pagespecSourceFiles = findAllPagespecSourceFiles(sourceGraphDir);

        for (const sourceFile of pagespecSourceFiles) {
          const content = fs.readFileSync(sourceFile, 'utf-8');
          if (getEffectivePagespecBlock(sourceFile, content).source !== 'none') {
            pagesWithSpecs++;
          }
        }
      }

      expect(pagesWithSpecs).toBeGreaterThan(0);
    });

    it('all pages should have pagespecs for every bundle that is used across any page', () => {
      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const pagespecSourceFiles = findAllPagespecSourceFiles(sourceGraphDir);
        const allReferencedBundles = new Set<string>();

        for (const sourceFile of pagespecSourceFiles) {
          const content = fs.readFileSync(sourceFile, 'utf-8');
          const block = getEffectivePagespecBlock(sourceFile, content).block;
          if (block) {
            for (const bundle of getReferencedBundles(block)) {
              allReferencedBundles.add(bundle);
            }
          }
        }

        if (allReferencedBundles.size === 0) continue;

        const missingByBundle = new Map<string, string[]>();
        for (const bundle of allReferencedBundles) {
          missingByBundle.set(bundle, []);
        }

        for (const sourceFile of pagespecSourceFiles) {
          const content = fs.readFileSync(sourceFile, 'utf-8');
          const block = getEffectivePagespecBlock(sourceFile, content).block;
          const relativePath = path.relative(sourceGraphDir, sourceFile);

          if (!block) {
            for (const bundle of allReferencedBundles) {
              missingByBundle.get(bundle)!.push(relativePath);
            }
          } else {
            const bundlesInFile = new Set(getReferencedBundles(block));
            for (const bundle of allReferencedBundles) {
              if (!bundlesInFile.has(bundle)) {
                missingByBundle.get(bundle)!.push(relativePath);
              }
            }
          }
        }

        const errors: string[] = [];
        for (const [bundle, missingFiles] of missingByBundle) {
          if (missingFiles.length > 0) {
            errors.push(`\nBundle "${bundle}" is missing in ${missingFiles.length} file(s):`);
            for (const file of missingFiles) {
              errors.push(`  - ${file}`);
            }
          }
        }

        if (errors.length > 0) {
          throw new Error(`Pagespec bundle completeness errors (${path.basename(sourceGraphDir)}):${errors.join('\n')}`);
        }
      }
    });
  });

  describe('Parsing Utility Tests', () => {
    it('extractPagespecsBlock should parse valid YAML', () => {
      const content = `# Test

\`\`\`yaml
pagespecs:
  - bundle: meadow-test-bundle-big
    curation:
      isTracked: true
      isInWorkingGraph: true
      filtersSelected:
        untracked-filter: false
    generation:
      htmlRenderedLinks:
        mainSectionLinks: []
        footerSectionBacklinks: []
  - bundle: meadow-test-bundle-small
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

      const bigBundleSpec = getPagespecForBundle(block!, 'meadow-test-bundle-big');
      expect(bigBundleSpec).toBeDefined();
      expect(bigBundleSpec!.curation.isInWorkingGraph).toBe(true);

      const smallBundleSpec = getPagespecForBundle(block!, 'meadow-test-bundle-small');
      expect(smallBundleSpec).toBeDefined();
      expect(smallBundleSpec!.curation.isInWorkingGraph).toBe(false);
      if (isPagespecNotInWorkingGraph(smallBundleSpec!)) {
        expect(smallBundleSpec.curation.frontierDepthOrNullForOrphan).toBe(1);
      }
    });

    it('getReferencedBundles should return all bundle names', () => {
      const block: PagespecsBlock = {
        pagespecs: [
          {
            bundle: 'bundle-a',
            curation: { isTracked: true, isInWorkingGraph: true },
            generation: { htmlRenderedLinks: { mainSectionLinks: [], footerSectionBacklinks: [] } },
          },
          {
            bundle: 'bundle-b',
            curation: {
              isTracked: true,
              isInWorkingGraph: false,
              frontierDepthOrNullForOrphan: null,
            },
            generation: { htmlRenderedLinks: { mainSectionLinks: [], footerSectionBacklinks: [] } },
          },
        ],
      };

      const bundles = getReferencedBundles(block);
      expect(bundles).toEqual(['bundle-a', 'bundle-b']);
    });

    it('hasPagespecsBlock should detect pagespecs blocks', () => {
      const withSpecs = `# Page

\`\`\`yaml
pagespecs:
  - bundle: test
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
        const pagespecSourceFiles = findAllPagespecSourceFiles(sourceGraphDir);

        for (const sourceFile of pagespecSourceFiles) {
          const content = fs.readFileSync(sourceFile, 'utf-8');
          if (!isExcalidrawMarkdown(content)) continue;

          const sidecarPath = getSidecarPagespecPath(sourceFile, content);
          if (!sidecarPath) {
            errors.push(`${sourceFile}: Excalidraw file but could not derive sidecar path`);
            continue;
          }
          if (!fs.existsSync(sidecarPath)) {
            const relative = path.relative(sourceGraphDir, sourceFile);
            errors.push(`${relative}: Excalidraw drawing is missing sidecar pagespec ${path.basename(sidecarPath)}`);
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Missing Excalidraw sidecars:\n${errors.join('\n')}`);
      }
    });

    it('every HTML file should have a sidecar pagespec.yaml', () => {
      const errors: string[] = [];

      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const htmlFiles = findAllPagespecSourceFiles(sourceGraphDir)
          .filter(sourceFile => path.extname(sourceFile).toLowerCase() === '.html');

        for (const htmlFile of htmlFiles) {
          const content = fs.readFileSync(htmlFile, 'utf-8');
          const sidecarPath = getSidecarPagespecPath(htmlFile, content);
          if (!sidecarPath) {
            errors.push(`${htmlFile}: HTML file but could not derive sidecar path`);
            continue;
          }
          if (!fs.existsSync(sidecarPath)) {
            const relative = path.relative(sourceGraphDir, htmlFile);
            errors.push(`${relative}: HTML file is missing sidecar pagespec ${path.basename(sidecarPath)}`);
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Missing HTML sidecars:\n${errors.join('\n')}`);
      }
    });

    it('every SVG file should have a sidecar pagespec.yaml', () => {
      const errors: string[] = [];

      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const svgFiles = findAllPagespecSourceFiles(sourceGraphDir)
          .filter(sourceFile => path.extname(sourceFile).toLowerCase() === '.svg');

        for (const svgFile of svgFiles) {
          const content = fs.readFileSync(svgFile, 'utf-8');
          const sidecarPath = getSidecarPagespecPath(svgFile, content);
          if (!sidecarPath) {
            errors.push(`${svgFile}: SVG file but could not derive sidecar path`);
            continue;
          }
          if (!fs.existsSync(sidecarPath)) {
            const relative = path.relative(sourceGraphDir, svgFile);
            errors.push(`${relative}: SVG file is missing sidecar pagespec ${path.basename(sidecarPath)}`);
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Missing SVG sidecars:\n${errors.join('\n')}`);
      }
    });

    it('Excalidraw markdown files should not contain inline pagespecs blocks', () => {
      const errors: string[] = [];

      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const pagespecSourceFiles = findAllPagespecSourceFiles(sourceGraphDir);

        for (const sourceFile of pagespecSourceFiles) {
          const content = fs.readFileSync(sourceFile, 'utf-8');
          if (!isExcalidrawMarkdown(content)) continue;
          if (hasPagespecsBlock(content)) {
            const relative = path.relative(sourceGraphDir, sourceFile);
            errors.push(`${relative}: Excalidraw drawing has an inline pagespecs block (move it to the sidecar .pagespec.yaml)`);
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Inline pagespecs in Excalidraw drawings:\n${errors.join('\n')}`);
      }
    });

    it('HTML files should not contain inline pagespecs blocks', () => {
      const errors: string[] = [];

      for (const sourceGraphDir of pagespecSourceGraphDirs) {
        const htmlFiles = findAllPagespecSourceFiles(sourceGraphDir)
          .filter(sourceFile => path.extname(sourceFile).toLowerCase() === '.html');

        for (const htmlFile of htmlFiles) {
          const content = fs.readFileSync(htmlFile, 'utf-8');
          if (hasPagespecsBlock(content)) {
            const relative = path.relative(sourceGraphDir, htmlFile);
            errors.push(`${relative}: HTML file has an inline pagespecs block (move it to the sidecar .pagespec.yaml)`);
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Inline pagespecs in HTML files:\n${errors.join('\n')}`);
      }
    });
  });
});
