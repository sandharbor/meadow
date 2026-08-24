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
import type { IEdge } from '../../../../../contracts/types/graph.js';
import type { IBundleNode } from '../../../../../contracts/types/IBundleNode.js';
import type { BundleNodeConfig, BundleNodeId, BundleNodeKey } from '../../../../../contracts/types/bundleNodeConfig.js';
import { buildVisibleStructuralProjection } from '../../../../../shared_code/utils/structuralProjection.js';

const id = (value: string) => value as BundleNodeId;
const key = (value: string) => value as BundleNodeKey;
const base = { label: '', depth: 0, remaining_depth: 0, getIdent() { return this.bundleNodeKey; } };

describe('visible structural projection', () => {
  it('contracts untracked folders, stops at tracked folders and blacklists, and retains member order', () => {
    const nodes: IBundleNode[] = [
      { ...base, bundleNodeKind: 'collection', bundleNodeKey: key('collection:c'), bundleNodeId: id('cccccccccccc'), bundleNodeName: 'Home', memberBundleNodeIds: [id('bbbbbbbbbbbb'), id('aaaaaaaaaaaa')] },
      { ...base, bundleNodeKind: 'folder', bundleNodeKey: key('folder:B'), bundleNodeId: id('bbbbbbbbbbbb'), bundleNodeName: 'B', sourceGraphSubdirectory: 'B' },
      { ...base, bundleNodeKind: 'folder', bundleNodeKey: key('folder:A'), bundleNodeId: id('aaaaaaaaaaaa'), bundleNodeName: 'A', sourceGraphSubdirectory: 'A' },
      { ...base, bundleNodeKind: 'folder', bundleNodeKey: key('folder:A/middle'), bundleNodeName: 'middle', sourceGraphSubdirectory: 'A/middle' },
      { ...base, bundleNodeKind: 'file', bundleNodeKey: key('/A/middle/Z.md'), bundleNodeId: id('zzzzzzzzzzzz'), bundleNodeName: 'Z', sourceGraphSubdirectory: 'A/middle', fileType: 'md' },
      { ...base, bundleNodeKind: 'folder', bundleNodeKey: key('folder:A/stop'), bundleNodeId: id('ssssssssssss'), bundleNodeName: 'stop', sourceGraphSubdirectory: 'A/stop' },
      { ...base, bundleNodeKind: 'file', bundleNodeKey: key('/A/stop/Child.md'), bundleNodeId: id('dddddddddddd'), bundleNodeName: 'Child', sourceGraphSubdirectory: 'A/stop', fileType: 'md' },
      { ...base, bundleNodeKind: 'folder', bundleNodeKey: key('folder:A/private'), bundleNodeId: id('pppppppppppp'), bundleNodeName: 'private', sourceGraphSubdirectory: 'A/private' },
      { ...base, bundleNodeKind: 'file', bundleNodeKey: key('/Outside.md'), bundleNodeId: id('oooooooooooo'), bundleNodeName: 'Outside', sourceGraphSubdirectory: '', fileType: 'md' },
    ];
    const configs: BundleNodeConfig[] = [
      { bundleNodeKind: 'collection', bundleNodeId: id('cccccccccccc'), bundleNodeName: 'Home', memberBundleNodeIds: [id('bbbbbbbbbbbb'), id('aaaaaaaaaaaa')], listType: 'whitelist' },
      { bundleNodeKind: 'folder', bundleNodeId: id('bbbbbbbbbbbb'), bundleNodeName: 'B', sourceGraphSubdirectory: 'B', listType: 'whitelist' },
      { bundleNodeKind: 'folder', bundleNodeId: id('aaaaaaaaaaaa'), bundleNodeName: 'A', sourceGraphSubdirectory: 'A', listType: 'whitelist' },
      { bundleNodeKind: 'file', bundleNodeId: id('zzzzzzzzzzzz'), bundleNodeName: 'Z', sourceGraphSubdirectory: 'A/middle', fileType: 'md', listType: 'whitelist' },
      { bundleNodeKind: 'folder', bundleNodeId: id('ssssssssssss'), bundleNodeName: 'stop', sourceGraphSubdirectory: 'A/stop', listType: 'whitelist' },
      { bundleNodeKind: 'file', bundleNodeId: id('dddddddddddd'), bundleNodeName: 'Child', sourceGraphSubdirectory: 'A/stop', fileType: 'md', listType: 'whitelist' },
      { bundleNodeKind: 'folder', bundleNodeId: id('pppppppppppp'), bundleNodeName: 'private', sourceGraphSubdirectory: 'A/private', listType: 'blacklist' },
      { bundleNodeKind: 'file', bundleNodeId: id('oooooooooooo'), bundleNodeName: 'Outside', sourceGraphSubdirectory: '', fileType: 'md', listType: 'whitelist' },
    ];
    const containment = (source: string, target: string, kind: IEdge['bundleEdgeKind'] = 'directoryContainment'): IEdge => ({ source, target, bundleEdgeKind: kind });
    const edges = [
      containment('collection:c', 'folder:B', 'collectionMembership'),
      containment('collection:c', 'folder:A', 'collectionMembership'),
      containment('folder:A', 'folder:A/middle'),
      containment('folder:A/middle', '/A/middle/Z.md'),
      containment('folder:A', 'folder:A/stop'),
      containment('folder:A/stop', '/A/stop/Child.md'),
      containment('folder:A', 'folder:A/private'),
    ];

    const result = buildVisibleStructuralProjection(nodes, edges, configs, id('cccccccccccc'));
    expect(result.childrenByNodeKey.get(key('collection:c'))).toEqual([key('folder:B'), key('folder:A')]);
    expect(result.childrenByNodeKey.get(key('folder:A'))).toEqual([key('folder:A/stop'), key('/A/middle/Z.md')]);
    expect(result.childrenByNodeKey.get(key('folder:A/stop'))).toEqual([key('/A/stop/Child.md')]);
    expect(result.renderedNodeKeys).not.toContain(key('folder:A/private'));
    expect(result.semanticOnlyNodeKeys).toEqual([key('/Outside.md')]);
  });
});
