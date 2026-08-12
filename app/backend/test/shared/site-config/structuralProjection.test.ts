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
import type { IEdge } from '../../../../shared_code/types/graph.js';
import type { ISiteNode } from '../../../../shared_code/types/ISiteNode.js';
import type { SiteNodeConfig, SiteNodeId, SiteNodeKey } from '../../../../shared_code/types/siteNodeConfig.js';
import { buildVisibleStructuralProjection } from '../../../../shared_code/utils/structuralProjection.js';

const id = (value: string) => value as SiteNodeId;
const key = (value: string) => value as SiteNodeKey;
const base = { label: '', depth: 0, remaining_depth: 0, getIdent() { return this.siteNodeKey; } };

describe('visible structural projection', () => {
  it('contracts untracked folders, stops at tracked folders and blacklists, and retains member order', () => {
    const nodes: ISiteNode[] = [
      { ...base, siteNodeKind: 'collection', siteNodeKey: key('collection:c'), siteNodeId: id('cccccccccccc'), siteNodeName: 'Home', memberSiteNodeIds: [id('bbbbbbbbbbbb'), id('aaaaaaaaaaaa')] },
      { ...base, siteNodeKind: 'folder', siteNodeKey: key('folder:B'), siteNodeId: id('bbbbbbbbbbbb'), siteNodeName: 'B', sourceGraphSubdirectory: 'B' },
      { ...base, siteNodeKind: 'folder', siteNodeKey: key('folder:A'), siteNodeId: id('aaaaaaaaaaaa'), siteNodeName: 'A', sourceGraphSubdirectory: 'A' },
      { ...base, siteNodeKind: 'folder', siteNodeKey: key('folder:A/middle'), siteNodeName: 'middle', sourceGraphSubdirectory: 'A/middle' },
      { ...base, siteNodeKind: 'file', siteNodeKey: key('/A/middle/Z.md'), siteNodeId: id('zzzzzzzzzzzz'), siteNodeName: 'Z', sourceGraphSubdirectory: 'A/middle', fileType: 'md' },
      { ...base, siteNodeKind: 'folder', siteNodeKey: key('folder:A/stop'), siteNodeId: id('ssssssssssss'), siteNodeName: 'stop', sourceGraphSubdirectory: 'A/stop' },
      { ...base, siteNodeKind: 'file', siteNodeKey: key('/A/stop/Child.md'), siteNodeId: id('dddddddddddd'), siteNodeName: 'Child', sourceGraphSubdirectory: 'A/stop', fileType: 'md' },
      { ...base, siteNodeKind: 'folder', siteNodeKey: key('folder:A/private'), siteNodeId: id('pppppppppppp'), siteNodeName: 'private', sourceGraphSubdirectory: 'A/private' },
      { ...base, siteNodeKind: 'file', siteNodeKey: key('/Outside.md'), siteNodeId: id('oooooooooooo'), siteNodeName: 'Outside', sourceGraphSubdirectory: '', fileType: 'md' },
    ];
    const configs: SiteNodeConfig[] = [
      { siteNodeKind: 'collection', siteNodeId: id('cccccccccccc'), siteNodeName: 'Home', memberSiteNodeIds: [id('bbbbbbbbbbbb'), id('aaaaaaaaaaaa')], listType: 'whitelist' },
      { siteNodeKind: 'folder', siteNodeId: id('bbbbbbbbbbbb'), siteNodeName: 'B', sourceGraphSubdirectory: 'B', listType: 'whitelist' },
      { siteNodeKind: 'folder', siteNodeId: id('aaaaaaaaaaaa'), siteNodeName: 'A', sourceGraphSubdirectory: 'A', listType: 'whitelist' },
      { siteNodeKind: 'file', siteNodeId: id('zzzzzzzzzzzz'), siteNodeName: 'Z', sourceGraphSubdirectory: 'A/middle', fileType: 'md', listType: 'whitelist' },
      { siteNodeKind: 'folder', siteNodeId: id('ssssssssssss'), siteNodeName: 'stop', sourceGraphSubdirectory: 'A/stop', listType: 'whitelist' },
      { siteNodeKind: 'file', siteNodeId: id('dddddddddddd'), siteNodeName: 'Child', sourceGraphSubdirectory: 'A/stop', fileType: 'md', listType: 'whitelist' },
      { siteNodeKind: 'folder', siteNodeId: id('pppppppppppp'), siteNodeName: 'private', sourceGraphSubdirectory: 'A/private', listType: 'blacklist' },
      { siteNodeKind: 'file', siteNodeId: id('oooooooooooo'), siteNodeName: 'Outside', sourceGraphSubdirectory: '', fileType: 'md', listType: 'whitelist' },
    ];
    const containment = (source: string, target: string, kind: IEdge['siteEdgeKind'] = 'directoryContainment'): IEdge => ({ source, target, siteEdgeKind: kind });
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
