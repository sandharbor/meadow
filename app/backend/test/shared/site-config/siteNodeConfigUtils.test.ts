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
import type {
  CollectionSiteNodeConfig,
  FileSiteNodeConfig,
  FolderSiteNodeConfig,
  SiteNodeConfig,
  SiteNodeId,
} from '../../../../shared_code/types/siteNodeConfig.js';
import {
  generateSiteNodeId,
  normalizeFolderSourceGraphSubdirectory,
  parseSiteNodeConfig,
  stringifySiteNodeConfig,
  validateCanonicalSiteConfiguration,
} from '../../../../shared_code/utils/siteNodeConfigUtils.js';

const id = (value: string) => value as SiteNodeId;
const node = (overrides: Partial<FileSiteNodeConfig> = {}): FileSiteNodeConfig => ({
  siteNodeName: 'Example',
  sourceGraphSubdirectory: 'Projects',
  siteNodeKind: 'file',
  fileType: 'md',
  siteNodeId: id('a1b2c3d4e5f6'),
  listType: 'whitelist',
  outlinksDepth: 3,
  inlinksDepth: 1,
  ...overrides,
});
const folder = (overrides: Partial<FolderSiteNodeConfig> = {}): FolderSiteNodeConfig => ({
  siteNodeName: 'Projects',
  sourceGraphSubdirectory: 'Projects',
  siteNodeKind: 'folder',
  siteNodeId: id('f1b2c3d4e5f6'),
  listType: 'whitelist',
  ...overrides,
});
const collection = (overrides: Partial<CollectionSiteNodeConfig> = {}): CollectionSiteNodeConfig => ({
  siteNodeName: 'Research site',
  siteNodeKind: 'collection',
  siteNodeId: id('c1b2c3d4e5f6'),
  listType: 'whitelist',
  memberSiteNodeIds: [id('f1b2c3d4e5f6'), id('g1b2c3d4e5f6')],
  ...overrides,
});

describe('canonical site node configuration', () => {
  it('serializes in deterministic record and field order and is byte-stable', () => {
    const first = stringifySiteNodeConfig([
      node({ siteNodeName: 'zeta', siteNodeId: id('z1b2c3d4e5f6') }),
      node({ siteNodeName: 'Alpha', siteNodeId: id('b1b2c3d4e5f6') }),
    ]);
    expect(first).toBe(`nodes:\n  - siteNodeName: Alpha\n    sourceGraphSubdirectory: Projects\n    siteNodeKind: file\n    fileType: md\n    siteNodeId: b1b2c3d4e5f6\n    listType: whitelist\n    outlinksDepth: 3\n    inlinksDepth: 1\n  - siteNodeName: zeta\n    sourceGraphSubdirectory: Projects\n    siteNodeKind: file\n    fileType: md\n    siteNodeId: z1b2c3d4e5f6\n    listType: whitelist\n    outlinksDepth: 3\n    inlinksDepth: 1\n`);
    expect(stringifySiteNodeConfig(parseSiteNodeConfig(first))).toBe(first);
  });

  it('parses and canonically serializes folder and ordered collection records', () => {
    const firstFolder = folder();
    const secondFolder = folder({
      siteNodeName: 'Writing',
      sourceGraphSubdirectory: 'Writing',
      siteNodeId: id('g1b2c3d4e5f6'),
      outlinksDepth: 2,
      inlinksDepth: 0,
    });
    const content = stringifySiteNodeConfig([secondFolder, collection(), firstFolder]);
    expect(content).toBe(`nodes:\n  - siteNodeName: Projects\n    sourceGraphSubdirectory: Projects\n    siteNodeKind: folder\n    siteNodeId: f1b2c3d4e5f6\n    listType: whitelist\n  - siteNodeName: Research site\n    siteNodeKind: collection\n    siteNodeId: c1b2c3d4e5f6\n    listType: whitelist\n    memberSiteNodeIds:\n      - f1b2c3d4e5f6\n      - g1b2c3d4e5f6\n  - siteNodeName: Writing\n    sourceGraphSubdirectory: Writing\n    siteNodeKind: folder\n    siteNodeId: g1b2c3d4e5f6\n    listType: whitelist\n    outlinksDepth: 2\n    inlinksDepth: 0\n`);
    expect(stringifySiteNodeConfig(parseSiteNodeConfig(content))).toBe(content);
    expect(parseSiteNodeConfig(content).find(candidate => candidate.siteNodeKind === 'collection'))
      .toMatchObject({ memberSiteNodeIds: ['f1b2c3d4e5f6', 'g1b2c3d4e5f6'] });
  });

  it('normalizes directory locators and rejects non-canonical or escaping folder records', () => {
    expect(normalizeFolderSourceGraphSubdirectory('Projects/./Meadow/')).toBe('Projects/Meadow');
    expect(() => normalizeFolderSourceGraphSubdirectory('../Projects')).toThrow(/must not contain/);
    expect(() => stringifySiteNodeConfig([folder({ sourceGraphSubdirectory: 'Projects/./Meadow', siteNodeName: 'Meadow' })]))
      .toThrow(/must be normalized/);
    expect(() => stringifySiteNodeConfig([folder({ sourceGraphSubdirectory: '../Projects' })]))
      .toThrow(/must not contain/);
    expect(() => stringifySiteNodeConfig([folder({ sourceGraphSubdirectory: '/Projects' })]))
      .toThrow(/must be relative/);
    expect(() => stringifySiteNodeConfig([folder({ sourceGraphSubdirectory: 'Projects/Meadow', siteNodeName: 'Wrong' })]))
      .toThrow(/must equal the basename/);
  });

  it('enforces kind-specific fields and collection membership', () => {
    expect(() => stringifySiteNodeConfig([{ ...folder(), fileType: 'md' } as SiteNodeConfig]))
      .toThrow(/fileType.*not valid for folder/);
    expect(() => stringifySiteNodeConfig([{ ...collection(), outlinksDepth: 1 } as SiteNodeConfig]))
      .toThrow(/depth overrides.*not valid for collection/);
    expect(() => stringifySiteNodeConfig([{ ...collection(), listType: 'blacklist' }]))
      .toThrow(/collection nodes must be whitelisted/);
    expect(() => stringifySiteNodeConfig([folder(), collection()]))
      .toThrow(/does not resolve \(g1b2c3d4e5f6\)/);
    expect(() => stringifySiteNodeConfig([
      folder(),
      folder({ siteNodeName: 'Writing', sourceGraphSubdirectory: 'Writing', siteNodeId: id('g1b2c3d4e5f6'), listType: 'blacklist' }),
      collection(),
    ])).toThrow(/whitelisted folder/);
    expect(() => stringifySiteNodeConfig([
      folder(),
      folder({ siteNodeName: 'Writing', sourceGraphSubdirectory: 'Writing', siteNodeId: id('g1b2c3d4e5f6') }),
      collection({ memberSiteNodeIds: [id('f1b2c3d4e5f6'), id('f1b2c3d4e5f6')] }),
    ])).toThrow(/unique IDs/);
  });

  it.each([
    ['siteNodeId', 'siteNodeId: a1b2c3d4e5f6', 'siteNodeId: invalid', /siteNodeId.*must match/],
    ['siteNodeKind', 'siteNodeKind: file', 'siteNodeKind: nope', /siteNodeKind.*file.*folder.*collection/],
    ['fileType', 'fileType: md', 'fileType: nope', /fileType.*must be one of/],
    ['listType', 'listType: whitelist', 'listType: maybe', /listType.*exactly/],
    ['tracked', 'listType: whitelist', 'listType: whitelist\n    tracked: true', /tracked.*not part of canonical node configuration/],
    ['outlinksDepth', 'outlinksDepth: 3', 'outlinksDepth: -1', /outlinksDepth.*non-negative integer/],
  ])('fails closed for %s', (_field, target, replacement, expected) => {
    const content = stringifySiteNodeConfig([node()]).replace(target, replacement);
    expect(() => parseSiteNodeConfig(content, '/site/conf/site_node_config.yaml')).toThrow(expected);
  });

  it('rejects unknown document and record fields', () => {
    const content = stringifySiteNodeConfig([node()]);
    expect(() => parseSiteNodeConfig(`${content}pages: []\n`)).toThrow(
      /pages.*not part of the canonical node configuration document/,
    );
    expect(() => stringifySiteNodeConfig([{ ...node(), title: 'legacy' } as SiteNodeConfig])).toThrow(
      /title.*not part of canonical node configuration/,
    );
  });

  it('rejects duplicate IDs and duplicate source locators', () => {
    expect(() => parseSiteNodeConfig(stringifySiteNodeConfig([
      node(),
      node({ siteNodeName: 'Other', siteNodeId: id('b1b2c3d4e5f6') }),
    ]).replace('b1b2c3d4e5f6', 'a1b2c3d4e5f6'))).toThrow(/duplicates record 1/);
    expect(() => stringifySiteNodeConfig([node(), node({ siteNodeId: id('b1b2c3d4e5f6') })])).toThrow(/source locator.*duplicates record 1/);
  });

  it('enforces shared committed/draft identity and strong whitelisted roles', () => {
    const committed = [node()];
    expect(() => validateCanonicalSiteConfiguration({
      committedNodes: committed,
      draftNodes: [node({ siteNodeId: id('b1b2c3d4e5f6') })],
      siteConfig: {
        entrySiteNodeId: 'a1b2c3d4e5f6',
        defaultTraversalSiteNodeId: 'a1b2c3d4e5f6',
      },
    })).toThrow(/must equal committed ID/);

    expect(() => validateCanonicalSiteConfiguration({
      committedNodes: committed,
      siteConfig: {
        entrySiteNodeId: 'missing00000',
        defaultTraversalSiteNodeId: 'a1b2c3d4e5f6',
      },
    })).toThrow(/entrySiteNodeId.*does not resolve/);

    expect(() => validateCanonicalSiteConfiguration({
      committedNodes: [node({ listType: 'blacklist' })],
      siteConfig: {
        entrySiteNodeId: 'a1b2c3d4e5f6',
        defaultTraversalSiteNodeId: 'a1b2c3d4e5f6',
      },
    })).toThrow(/entrySiteNodeId.*whitelisted/);

    expect(() => validateCanonicalSiteConfiguration({
      committedNodes: committed,
      draftNodes: [node({ siteNodeName: 'Other', siteNodeId: id('b1b2c3d4e5f6') })],
      siteConfig: {
        entrySiteNodeId: 'a1b2c3d4e5f6',
        defaultTraversalSiteNodeId: 'a1b2c3d4e5f6',
      },
    })).toThrow(/entrySiteNodeId.*does not resolve/);
  });

  it('enforces entry strategy, collection entry, source-root naming, and blacklist boundaries', () => {
    const folders = [
      folder(),
      folder({ siteNodeName: 'Writing', sourceGraphSubdirectory: 'Writing', siteNodeId: id('g1b2c3d4e5f6') }),
    ];
    expect(() => validateCanonicalSiteConfiguration({
      committedNodes: [...folders, collection()],
      siteConfig: {
        sourceDirectory: '/vault',
        entrySiteNodeId: id('f1b2c3d4e5f6'),
        defaultTraversalSiteNodeId: id('f1b2c3d4e5f6'),
      },
    })).toThrow(/collection must be the entry/);

    expect(() => validateCanonicalSiteConfiguration({
      committedNodes: [folder({ siteNodeName: 'Wrong', sourceGraphSubdirectory: '' })],
      siteConfig: {
        sourceDirectory: '/sources/vault',
        entrySiteNodeId: id('f1b2c3d4e5f6'),
        defaultTraversalSiteNodeId: id('f1b2c3d4e5f6'),
      },
    })).toThrow(/source-root folder must be named 'vault'/);

    expect(() => validateCanonicalSiteConfiguration({
      committedNodes: [
        folder({ listType: 'blacklist' }),
        node({ siteNodeName: 'Entry', sourceGraphSubdirectory: 'Projects', siteNodeId: id('e1b2c3d4e5f6') }),
      ],
      siteConfig: {
        entrySiteNodeId: id('e1b2c3d4e5f6'),
        defaultTraversalSiteNodeId: id('e1b2c3d4e5f6'),
      },
    })).toThrow(/lies below blacklisted folder/);
  });

  it('retries collisions in the site-wide ID namespace', () => {
    let calls = 0;
    const generated = generateSiteNodeId(['aaaaaaaaaaaa'], () => {
      calls += 1;
      return calls <= 12 ? 0 : 0.5;
    });
    expect(generated).not.toBe('aaaaaaaaaaaa');
    expect(generated).toMatch(/^[a-z0-9]{12}$/);
  });
});
