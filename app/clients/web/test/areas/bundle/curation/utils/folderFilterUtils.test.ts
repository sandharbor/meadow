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
import { IBundleNode } from '../../../../../../../contracts/types/IBundleNode';
import {
  buildFolderTree,
  hasNodesInMultipleFolders,
  normalizeFolderPath,
  nodeIsInFolder, nodeMatchesFolderState
} from '../../../../../src/areas/bundle/curation/utils/folderFilterUtils';

const page = (id: string, sourceGraphSubdirectory: string): IBundleNode => ({
  bundleNodeKey: id as IBundleNode['bundleNodeKey'],
  bundleNodeKind: 'file',
  label: id,
  bundleNodeName: id,
  sourceGraphSubdirectory,
  fileType: 'md',
  depth: 0,
  remaining_depth: 0,
  getIdent: () => `${sourceGraphSubdirectory}/${id}.md`
});

describe('folderFilterUtils', () => {
  it('builds recursively counted, sorted folder nodes and a root row', () => {
    const tree = buildFolderTree([
      page('root', ''),
      page('nested-b', 'Projects/Notes'),
      page('direct', 'Projects'),
      page('nested-a', 'Projects/Notes'),
      page('archive', 'Archive')
    ]);

    expect(tree.map(node => [node.path, node.nodeCount])).toEqual([
      ['', 1],
      ['Archive', 1],
      ['Projects', 3]
    ]);
    expect(tree[2].directNodeCount).toBe(1);
    expect(tree[2].children.map(node => [node.path, node.nodeCount])).toEqual([
      ['Projects/Notes', 2]
    ]);
  });

  it('normalizes separators and only enables the filter for multiple occupied folders', () => {
    expect(normalizeFolderPath('\\Projects//Notes/')).toBe('Projects/Notes');
    expect(hasNodesInMultipleFolders([page('one', 'Projects'), page('two', 'Projects')])).toBe(false);
    expect(hasNodesInMultipleFolders([page('one', 'Projects'), page('two', 'Projects/Notes')])).toBe(true);
  });

  it('matches a folder subtree while keeping the synthetic root exact', () => {
    expect(nodeIsInFolder('Projects', 'Projects')).toBe(true);
    expect(nodeIsInFolder('Projects/Notes', 'Projects')).toBe(true);
    expect(nodeIsInFolder('Projects-Old', 'Projects')).toBe(false);
    expect(nodeIsInFolder('', '')).toBe(true);
    expect(nodeIsInFolder('Projects', '')).toBe(false);
  });
});


it('groups all configured sources and keeps equal folder controls independent across rename', () => {
  const sources = [
    { id: 'source000001', name: 'notes', directory: '/notes' },
    { id: 'source000002', name: 'research', directory: '/research' },
    { id: 'source000003', name: 'reference', directory: '/reference' },
  ];
  const notes = { ...page('notes-page', 'Same'), sourceId: 'source000001' } as IBundleNode;
  const research = { ...page('research-page', 'Same'), sourceId: 'source000002' } as IBundleNode;
  const tree = buildFolderTree([notes, research], sources);
  expect(tree.map(row => [row.name, row.nodeCount, row.sourceRow])).toEqual([['notes://', 1, true], ['research://', 1, true], ['reference://', 0, true]]);
  expect(tree[0].children[0].displayPath).toBe('notes://Same');
  const key = tree[0].children[0].path;
  expect(nodeMatchesFolderState(notes, key)).toBe(true);
  expect(nodeMatchesFolderState(research, key)).toBe(false);
  expect(nodeMatchesFolderState(notes, tree[0].path)).toBe(true);
  expect(nodeMatchesFolderState(research, tree[0].path)).toBe(false);
  expect(buildFolderTree([notes, research], sources.map(source => ({ ...source, name: source.name + '-renamed' })))[0].children[0].path).toBe(key);
  const single = buildFolderTree([notes], [sources[0]]);
  expect(single[0].sourceRow).toBeUndefined();
  expect(single[0].name).toBe('Same');
  expect(single[0].displayPath).toBe('Same');
  expect(single[0].path).toBe(key);
});
