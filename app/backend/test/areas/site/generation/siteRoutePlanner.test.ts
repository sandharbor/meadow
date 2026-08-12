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
import type { SiteNodeConfig, SiteNodeId } from '../../../../../shared_code/types/siteNodeConfig.js';
import { planSiteRoutes } from '../../../../src/areas/site/generation/html/siteRoutePlanner.js';

const id = (value: string) => value as SiteNodeId;

describe('folder-derived route planning', () => {
  it('reserves the entry route, lets files win non-entry collisions, and resolves case collisions', () => {
    const configs: SiteNodeConfig[] = [
      { siteNodeKind: 'collection', siteNodeId: id('cccccc000000'), siteNodeName: 'Home', memberSiteNodeIds: [id('aaaaaa000000'), id('bbbbbb000000')], listType: 'whitelist' },
      { siteNodeKind: 'folder', siteNodeId: id('aaaaaa000000'), siteNodeName: 'A', sourceGraphSubdirectory: 'A', listType: 'whitelist' },
      { siteNodeKind: 'folder', siteNodeId: id('bbbbbb000000'), siteNodeName: 'Docs', sourceGraphSubdirectory: 'Docs', listType: 'whitelist' },
      { siteNodeKind: 'file', siteNodeId: id('ffffff000000'), siteNodeName: 'index', sourceGraphSubdirectory: '', fileType: 'md', listType: 'whitelist' },
      { siteNodeKind: 'file', siteNodeId: id('111111000000'), siteNodeName: 'index', sourceGraphSubdirectory: 'Docs', fileType: 'md', listType: 'whitelist' },
      { siteNodeKind: 'file', siteNodeId: id('222222000000'), siteNodeName: 'INDEX', sourceGraphSubdirectory: 'docs', fileType: 'md', listType: 'whitelist' },
    ];
    const plan = planSiteRoutes(configs, { entrySiteNodeId: id('cccccc000000') });
    expect(plan.routes.get(id('cccccc000000'))).toBe('index.html');
    expect(plan.routes.get(id('ffffff000000'))).toBe('index--file-ffffff.html');
    expect(plan.routes.get(id('111111000000'))).toBe('Docs/index.html');
    expect(plan.routes.get(id('bbbbbb000000'))).toBe('Docs/_folder-bbbbbb.html');
    expect(new Set([...plan.routes.values()].map(route => route.toLowerCase())).size).toBe(plan.routes.size);
  });

  it('leaves page-derived preferred routes unchanged', () => {
    const entry = { siteNodeKind: 'file', siteNodeId: id('eeeeee000000'), siteNodeName: 'Entry', sourceGraphSubdirectory: 'Notes', fileType: 'md', listType: 'whitelist' } as const;
    const plan = planSiteRoutes([entry], { entrySiteNodeId: entry.siteNodeId });
    expect(plan.folderDerived).toBe(false);
    expect(plan.routes.get(entry.siteNodeId)).toBe('Notes/Entry.html');
  });
});
