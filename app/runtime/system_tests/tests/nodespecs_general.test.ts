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
import os from 'os';
import {
  getNodespecBlock,
  getNodespecForBundle,
  getReferencedBundles,
  getSidecarNodespecPath,
  isNodespecNotInWorkingGraph,
  parseNodespecSidecarContent,
  sourceFileForSidecarPath,
  validateNodespecsBlockStructure,
} from '../nodespecs/index.js';
import type { NodespecsBlock } from '../nodespecs/index.js';
import {
  findAllNodespecSourceFiles,
  findAllSidecarNodespecFiles,
  findNodespecCompletenessErrors,
  getAvailableBundles,
  getPageTitle,
  nodespecSourceGraphDirs,
} from './support/nodespecTestHelpers.js';

describe('Nodespecs General System Tests', () => {
  describe('Nodespec Fixture Structure Tests', () => {
    it('should have valid source graph directories', () => {
      for (const sourceGraphDir of nodespecSourceGraphDirs) {
        expect(fs.existsSync(sourceGraphDir)).toBe(true);
      }
    });

    it('all nodespecs blocks should parse into typed objects', () => {
      const errors: string[] = [];

      for (const sourceGraphDir of nodespecSourceGraphDirs) {
        const nodespecSourceFiles = findAllNodespecSourceFiles(sourceGraphDir);

        for (const sourceFile of nodespecSourceFiles) {
          const { block, source, sourcePath } = getNodespecBlock(sourceFile);
          if (source === 'none') continue;
          if (block === null) {
            errors.push(`Failed to parse nodespecs in ${sourcePath}`);
            continue;
          }

          const structureErrors = validateNodespecsBlockStructure(block, getPageTitle(sourceFile));
          for (const err of structureErrors) {
            errors.push(`${sourcePath}: ${err.message}`);
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Nodespecs parsing errors:\n${errors.join('\n')}`);
      }
    });

    it('all bundle references should exist in home_fixtures', () => {
      const availableBundles = getAvailableBundles();
      const errors: string[] = [];

      for (const sourceGraphDir of nodespecSourceGraphDirs) {
        const nodespecSourceFiles = findAllNodespecSourceFiles(sourceGraphDir);

        for (const sourceFile of nodespecSourceFiles) {
          const block = getNodespecBlock(sourceFile).block;
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

  describe('Nodespec Completeness Tests', () => {
    it('should have at least one source node with node specs', () => {
      let nodesWithSpecs = 0;

      for (const sourceGraphDir of nodespecSourceGraphDirs) {
        const nodespecSourceFiles = findAllNodespecSourceFiles(sourceGraphDir);

        for (const sourceFile of nodespecSourceFiles) {
          if (getNodespecBlock(sourceFile).source !== 'none') {
            nodesWithSpecs++;
          }
        }
      }

      expect(nodesWithSpecs).toBeGreaterThan(0);
    });

    it('a source graph with any node spec must cover every source node type and referenced bundle', () => {
      const errors = nodespecSourceGraphDirs.flatMap(directory =>
        findNodespecCompletenessErrors(directory).map(error => `${path.basename(directory)}/${error}`)
      );
      expect(errors, `Node spec completeness errors:\n${errors.join('\n')}`).toEqual([]);
    });

    it('allows graphs without specs, then requires all node types when an image opts in', () => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-nodespec-coverage-'));
      try {
        const filenames = [
          'note.md', 'page.html', 'style.css', 'script.js', 'photo.jpg', 'photo.jpeg',
          'image.png', 'animation.gif', 'diagram.svg', 'image.webp', 'document.pdf',
          'drawing.excalidraw', 'drawing.excalidraw.md', 'nested/IMAGE.PNG',
        ];
        for (const filename of [...filenames, '.hidden.png', '.cache/hidden.md', 'unsupported.xyz', 'placeholder']) {
          const file = path.join(directory, filename);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, '');
        }
        expect(findAllNodespecSourceFiles(directory).map(file => path.relative(directory, file)).sort())
          .toEqual([...filenames].sort());
        expect(findNodespecCompletenessErrors(directory)).toEqual([]);

        const spec = 'nodespecs:\n  - bundle: first-bundle\n';
        fs.writeFileSync(getSidecarNodespecPath(path.join(directory, 'image.png')), spec);
        const missing = findNodespecCompletenessErrors(directory);
        expect(missing).toHaveLength(filenames.length - 1);
        expect(missing).toContain('note.md: missing paired node spec');
        expect(missing).toContain('nested/IMAGE.PNG: missing paired node spec');
        for (const filename of filenames) {
          fs.writeFileSync(getSidecarNodespecPath(path.join(directory, filename)), spec);
        }
        expect(findNodespecCompletenessErrors(directory)).toEqual([]);

        fs.appendFileSync(getSidecarNodespecPath(path.join(directory, 'image.png')), '  - bundle: second-bundle\n');
        const missingBundles = findNodespecCompletenessErrors(directory);
        expect(missingBundles).toHaveLength(filenames.length - 1);
        expect(missingBundles).toContain('note.md: missing node spec for bundle "second-bundle"');
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
  });

  describe('Parsing Utility Tests', () => {
    it('parseNodespecSidecarContent should parse valid YAML', () => {
      const content = `nodespecs:
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
`;

      const block = parseNodespecSidecarContent(content);
      expect(block).not.toBeNull();
      expect(block!.nodespecs).toHaveLength(2);

      const bigBundleSpec = getNodespecForBundle(block!, 'meadow-test-bundle-big');
      expect(bigBundleSpec).toBeDefined();
      expect(bigBundleSpec!.curation.isInWorkingGraph).toBe(true);

      const smallBundleSpec = getNodespecForBundle(block!, 'meadow-test-bundle-small');
      expect(smallBundleSpec).toBeDefined();
      expect(smallBundleSpec!.curation.isInWorkingGraph).toBe(false);
      if (isNodespecNotInWorkingGraph(smallBundleSpec!)) {
        expect(smallBundleSpec.curation.frontierDepthOrNullForOrphan).toBe(1);
      }
    });

    it('getReferencedBundles should return all bundle names', () => {
      const block: NodespecsBlock = {
        nodespecs: [
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

  });

  describe('Sidecar Nodespec Tests', () => {
    it('every *.nodespec.yaml sidecar should parse and have a corresponding source file', () => {
      const errors: string[] = [];

      for (const sourceGraphDir of nodespecSourceGraphDirs) {
        const sidecars = findAllSidecarNodespecFiles(sourceGraphDir);

        for (const sidecarPath of sidecars) {
          const content = fs.readFileSync(sidecarPath, 'utf-8');
          const block = parseNodespecSidecarContent(content);
          if (block === null) {
            errors.push(`${sidecarPath}: failed to parse as YAML nodespecs block`);
            continue;
          }

          const expectedSourcePath = sourceFileForSidecarPath(sidecarPath);
          if (!expectedSourcePath) {
            errors.push(`${sidecarPath}: filename does not follow the <full-source-filename>.nodespec.yaml convention`);
            continue;
          }
          if (!fs.existsSync(expectedSourcePath)) {
            errors.push(`${sidecarPath}: orphan sidecar - expected source file ${expectedSourcePath} does not exist`);
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Sidecar nodespec validation errors:\n${errors.join('\n')}`);
      }
    });

    it('text source nodes contain no embedded spec block', () => {
      for (const directory of nodespecSourceGraphDirs) {
        for (const sourceFile of findAllNodespecSourceFiles(directory)) {
          if (!/\.(?:md|html|svg|css|js)$/i.test(sourceFile)) continue;
          expect(fs.readFileSync(sourceFile, 'utf8'), sourceFile)
            .not.toMatch(/(?:^|\n)(?:pagespecs|nodespecs):\s*(?:\n|$)/);
        }
      }
    });

    it.each(['note.md', 'note.html', 'diagram.svg', 'image.png', 'drawing.excalidraw.md', 'drawing.md', 'drawing.excalidraw'])(
      'loads %s specs from its full filename without reading or rewriting the source', filename => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-nodespec-'));
        try {
          const source = path.join(directory, filename);
          const sidecar = `${source}.nodespec.yaml`;
          const contents = Buffer.from('Untouched source bytes.  \r\n\r\n');
          fs.writeFileSync(source, contents);
          expect(getSidecarNodespecPath(source)).toBe(sidecar);
          expect(sourceFileForSidecarPath(sidecar)).toBe(source);
          expect(getNodespecBlock(source)).toEqual({ block: null, source: 'none', sourcePath: sidecar });

          fs.writeFileSync(sidecar, 'nodespecs: []\n');
          expect(getNodespecBlock(source)).toEqual({ block: { nodespecs: [] }, source: 'sidecar', sourcePath: sidecar });
          expect(fs.readFileSync(source)).toEqual(contents);
          // Reading specs does not require reading the source file at all.
          fs.unlinkSync(source);
          expect(getNodespecBlock(source).block).toEqual({ nodespecs: [] });

          fs.writeFileSync(sidecar, 'nodespecs: [invalid');
          expect(getNodespecBlock(source)).toEqual({ block: null, source: 'sidecar', sourcePath: sidecar });
        } finally {
          fs.rmSync(directory, { recursive: true, force: true });
        }
      },
    );

    it.each(['', 'nodespecs: nope', 'pagespecs: []', 'nodespecs: [invalid'])(
      'rejects invalid node spec documents: %s', content => {
        expect(parseNodespecSidecarContent(content)).toBeNull();
      },
    );

    it('does not interpret an embedded spec as metadata', () => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-nodespec-'));
      try {
        const source = path.join(directory, 'note.md');
        fs.writeFileSync(source, '# Content\n\n```yaml\nnodespecs: []\n```\n');
        expect(getNodespecBlock(source).source).toBe('none');
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
  });
});
