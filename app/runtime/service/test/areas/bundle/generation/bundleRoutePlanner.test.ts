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

import { describe, expect, it } from 'vitest';
import type { BundleNodeConfig, BundleNodeId } from '../../../../../../shared_code/types/bundleNodeConfig.js';
import { planBundleRoutes } from '../../../../src/areas/bundle/generation/html/bundleRoutePlanner.js';

const id = (value: string) => value as BundleNodeId;

describe('bundle route planning', () => {
  it('keeps the folder-derived entry at index and isolates non-entry structural pages', () => {
    const configs: BundleNodeConfig[] = [
      { bundleNodeKind: 'collection', bundleNodeId: id('cccccc000000'), bundleNodeName: 'Home', memberBundleNodeIds: [id('aaaaaa000000'), id('bbbbbb000000')], listType: 'whitelist' },
      { bundleNodeKind: 'folder', bundleNodeId: id('aaaaaa000000'), bundleNodeName: 'A', sourceGraphSubdirectory: 'A', listType: 'whitelist' },
      { bundleNodeKind: 'folder', bundleNodeId: id('bbbbbb000000'), bundleNodeName: 'Docs', sourceGraphSubdirectory: 'Docs', listType: 'whitelist' },
      { bundleNodeKind: 'file', bundleNodeId: id('ffffff000000'), bundleNodeName: 'index', sourceGraphSubdirectory: '', fileType: 'md', listType: 'whitelist' },
      { bundleNodeKind: 'file', bundleNodeId: id('111111000000'), bundleNodeName: 'index', sourceGraphSubdirectory: 'Docs', fileType: 'md', listType: 'whitelist' },
      { bundleNodeKind: 'file', bundleNodeId: id('222222000000'), bundleNodeName: 'INDEX', sourceGraphSubdirectory: 'docs', fileType: 'md', listType: 'whitelist' },
    ];
    const plan = planBundleRoutes(configs, { entryBundleNodeId: id('cccccc000000') });
    expect(plan.routes.get(id('cccccc000000'))).toBe('index.html');
    expect(plan.routes.get(id('ffffff000000'))).toBe('index--file-ffffff.html');
    expect(plan.routes.get(id('111111000000'))).toBe('Docs/index.html');
    expect(plan.routes.get(id('aaaaaa000000'))).toBe('_mw_gen/folderpages/a-aaaaaa000000.html');
    expect(plan.routes.get(id('bbbbbb000000'))).toBe('_mw_gen/folderpages/docs-bbbbbb000000.html');
    expect(new Set([...plan.routes.values()].map(route => route.toLowerCase())).size).toBe(plan.routes.size);
  });

  it('leaves page-derived preferred routes and existing same-path behavior unchanged', () => {
    const entry = { bundleNodeKind: 'file', bundleNodeId: id('eeeeee000000'), bundleNodeName: 'Entry', sourceGraphSubdirectory: 'Notes', fileType: 'md', listType: 'whitelist' } as const;
    const duplicateA = { bundleNodeKind: 'file', bundleNodeId: id('aaaaaa000000'), bundleNodeName: 'Same', sourceGraphSubdirectory: '', fileType: 'md', listType: 'whitelist' } as const;
    const duplicateB = { bundleNodeKind: 'file', bundleNodeId: id('bbbbbb000000'), bundleNodeName: 'Same', sourceGraphSubdirectory: '', fileType: 'md', listType: 'whitelist' } as const;
    const plan = planBundleRoutes([entry, duplicateA, duplicateB], { entryBundleNodeId: entry.bundleNodeId });
    expect(plan.folderDerived).toBe(false);
    expect(plan.routes.get(entry.bundleNodeId)).toBe('Notes/Entry.html');
    expect(plan.routes.get(duplicateA.bundleNodeId)).toBe('Same.html');
    expect(plan.routes.get(duplicateB.bundleNodeId)).toBe('Same.html');
  });

  it('uses source-file routes for interactive SVG documents', () => {
    const entry = { bundleNodeKind: 'file', bundleNodeId: id('eeeeee000000'), bundleNodeName: 'Entry', sourceGraphSubdirectory: '', fileType: 'md', listType: 'whitelist' } as const;
    const svg = { bundleNodeKind: 'file', bundleNodeId: id('ssssss000000'), bundleNodeName: 'Linked diagram', sourceGraphSubdirectory: 'images', fileType: 'svg', listType: 'whitelist' } as const;

    const plan = planBundleRoutes([entry, svg], { entryBundleNodeId: entry.bundleNodeId });

    expect(plan.routes.get(svg.bundleNodeId)).toBe('images/Linked diagram.svg');
  });

  it('uses reserved routes for generated tag pages and relocates colliding source content', () => {
    const entry = { bundleNodeKind: 'file', bundleNodeId: id('eeeeee000000'), bundleNodeName: 'Entry', sourceGraphSubdirectory: '', fileType: 'md', listType: 'whitelist' } as const;
    const generatedTag = { bundleNodeKind: 'file', bundleNodeId: id('tttttt000000'), bundleNodeName: 'tag--ideas', sourceGraphSubdirectory: 'x-tagpages', fileType: 'md', listType: 'whitelist' } as const;
    const reservedSource = { bundleNodeKind: 'file', bundleNodeId: id('ssssss000000'), bundleNodeName: 'tag--ideas', sourceGraphSubdirectory: '_mw_gen/tagpages', fileType: 'md', listType: 'whitelist' } as const;

    const plan = planBundleRoutes(
      [entry, generatedTag, reservedSource],
      { entryBundleNodeId: entry.bundleNodeId },
    );

    expect(plan.routes.get(generatedTag.bundleNodeId)).toBe('_mw_gen/tagpages/tag--ideas.html');
    expect(plan.routes.get(reservedSource.bundleNodeId))
      .toBe('_mw_gen/sourcepages/tagpages/tag--ideas.html');
  });
});
