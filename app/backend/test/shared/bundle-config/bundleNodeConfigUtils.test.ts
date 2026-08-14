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
  CollectionBundleNodeConfig,
  FileBundleNodeConfig,
  FolderBundleNodeConfig,
  BundleNodeConfig,
  BundleNodeId,
} from '../../../../shared_code/types/bundleNodeConfig.js';
import {
  generateBundleNodeId,
  normalizeFolderSourceGraphSubdirectory,
  parseBundleNodeConfig,
  stringifyBundleNodeConfig,
  validateCanonicalBundleConfiguration,
} from '../../../../shared_code/utils/bundleNodeConfigUtils.js';

const id = (value: string) => value as BundleNodeId;
const node = (overrides: Partial<FileBundleNodeConfig> = {}): FileBundleNodeConfig => ({
  bundleNodeName: 'Example',
  sourceGraphSubdirectory: 'Projects',
  bundleNodeKind: 'file',
  fileType: 'md',
  bundleNodeId: id('a1b2c3d4e5f6'),
  listType: 'whitelist',
  outlinksDepth: 3,
  inlinksDepth: 1,
  ...overrides,
});
const folder = (overrides: Partial<FolderBundleNodeConfig> = {}): FolderBundleNodeConfig => ({
  bundleNodeName: 'Projects',
  sourceGraphSubdirectory: 'Projects',
  bundleNodeKind: 'folder',
  bundleNodeId: id('f1b2c3d4e5f6'),
  listType: 'whitelist',
  ...overrides,
});
const collection = (overrides: Partial<CollectionBundleNodeConfig> = {}): CollectionBundleNodeConfig => ({
  bundleNodeName: 'Research bundle',
  bundleNodeKind: 'collection',
  bundleNodeId: id('c1b2c3d4e5f6'),
  listType: 'whitelist',
  memberBundleNodeIds: [id('f1b2c3d4e5f6'), id('g1b2c3d4e5f6')],
  ...overrides,
});

describe('canonical bundle node configuration', () => {
  it('serializes in deterministic record and field order and is byte-stable', () => {
    const first = stringifyBundleNodeConfig([
      node({ bundleNodeName: 'zeta', bundleNodeId: id('z1b2c3d4e5f6') }),
      node({ bundleNodeName: 'Alpha', bundleNodeId: id('b1b2c3d4e5f6') }),
    ]);
    expect(first).toBe(`nodes:\n  - bundleNodeName: Alpha\n    sourceGraphSubdirectory: Projects\n    bundleNodeKind: file\n    fileType: md\n    bundleNodeId: b1b2c3d4e5f6\n    listType: whitelist\n    outlinksDepth: 3\n    inlinksDepth: 1\n  - bundleNodeName: zeta\n    sourceGraphSubdirectory: Projects\n    bundleNodeKind: file\n    fileType: md\n    bundleNodeId: z1b2c3d4e5f6\n    listType: whitelist\n    outlinksDepth: 3\n    inlinksDepth: 1\n`);
    expect(stringifyBundleNodeConfig(parseBundleNodeConfig(first))).toBe(first);
  });

  it('parses and canonically serializes folder and ordered collection records', () => {
    const firstFolder = folder();
    const secondFolder = folder({
      bundleNodeName: 'Writing',
      sourceGraphSubdirectory: 'Writing',
      bundleNodeId: id('g1b2c3d4e5f6'),
      outlinksDepth: 2,
      inlinksDepth: 0,
    });
    const content = stringifyBundleNodeConfig([secondFolder, collection(), firstFolder]);
    expect(content).toBe(`nodes:\n  - bundleNodeName: Projects\n    sourceGraphSubdirectory: Projects\n    bundleNodeKind: folder\n    bundleNodeId: f1b2c3d4e5f6\n    listType: whitelist\n  - bundleNodeName: Research bundle\n    bundleNodeKind: collection\n    bundleNodeId: c1b2c3d4e5f6\n    listType: whitelist\n    memberBundleNodeIds:\n      - f1b2c3d4e5f6\n      - g1b2c3d4e5f6\n  - bundleNodeName: Writing\n    sourceGraphSubdirectory: Writing\n    bundleNodeKind: folder\n    bundleNodeId: g1b2c3d4e5f6\n    listType: whitelist\n    outlinksDepth: 2\n    inlinksDepth: 0\n`);
    expect(stringifyBundleNodeConfig(parseBundleNodeConfig(content))).toBe(content);
    expect(parseBundleNodeConfig(content).find(candidate => candidate.bundleNodeKind === 'collection'))
      .toMatchObject({ memberBundleNodeIds: ['f1b2c3d4e5f6', 'g1b2c3d4e5f6'] });
  });

  it('normalizes directory locators and rejects non-canonical or escaping folder records', () => {
    expect(normalizeFolderSourceGraphSubdirectory('Projects/./Meadow/')).toBe('Projects/Meadow');
    expect(() => normalizeFolderSourceGraphSubdirectory('../Projects')).toThrow(/must not contain/);
    expect(() => stringifyBundleNodeConfig([folder({ sourceGraphSubdirectory: 'Projects/./Meadow', bundleNodeName: 'Meadow' })]))
      .toThrow(/must be normalized/);
    expect(() => stringifyBundleNodeConfig([folder({ sourceGraphSubdirectory: '../Projects' })]))
      .toThrow(/must not contain/);
    expect(() => stringifyBundleNodeConfig([folder({ sourceGraphSubdirectory: '/Projects' })]))
      .toThrow(/must be relative/);
    expect(() => stringifyBundleNodeConfig([folder({ sourceGraphSubdirectory: 'Projects/Meadow', bundleNodeName: 'Wrong' })]))
      .toThrow(/must equal the basename/);
  });

  it('enforces kind-specific fields and collection membership', () => {
    expect(() => stringifyBundleNodeConfig([{ ...folder(), fileType: 'md' } as BundleNodeConfig]))
      .toThrow(/fileType.*not valid for folder/);
    expect(() => stringifyBundleNodeConfig([{ ...collection(), outlinksDepth: 1 } as BundleNodeConfig]))
      .toThrow(/depth overrides.*not valid for collection/);
    expect(() => stringifyBundleNodeConfig([{ ...collection(), listType: 'blacklist' }]))
      .toThrow(/collection nodes must be whitelisted/);
    expect(() => stringifyBundleNodeConfig([folder(), collection()]))
      .toThrow(/does not resolve \(g1b2c3d4e5f6\)/);
    expect(() => stringifyBundleNodeConfig([
      folder(),
      folder({ bundleNodeName: 'Writing', sourceGraphSubdirectory: 'Writing', bundleNodeId: id('g1b2c3d4e5f6'), listType: 'blacklist' }),
      collection(),
    ])).not.toThrow();
    expect(() => stringifyBundleNodeConfig([
      folder(),
      folder({ bundleNodeName: 'Writing', sourceGraphSubdirectory: 'Writing', bundleNodeId: id('g1b2c3d4e5f6') }),
      collection({ memberBundleNodeIds: [id('f1b2c3d4e5f6'), id('f1b2c3d4e5f6')] }),
    ])).toThrow(/unique IDs/);
  });

  it.each([
    ['bundleNodeId', 'bundleNodeId: a1b2c3d4e5f6', 'bundleNodeId: invalid', /bundleNodeId.*must match/],
    ['bundleNodeKind', 'bundleNodeKind: file', 'bundleNodeKind: nope', /bundleNodeKind.*file.*folder.*collection/],
    ['fileType', 'fileType: md', 'fileType: nope', /fileType.*must be one of/],
    ['listType', 'listType: whitelist', 'listType: maybe', /listType.*exactly/],
    ['tracked', 'listType: whitelist', 'listType: whitelist\n    tracked: true', /tracked.*not part of canonical node configuration/],
    ['outlinksDepth', 'outlinksDepth: 3', 'outlinksDepth: -1', /outlinksDepth.*non-negative integer/],
  ])('fails closed for %s', (_field, target, replacement, expected) => {
    const content = stringifyBundleNodeConfig([node()]).replace(target, replacement);
    expect(() => parseBundleNodeConfig(content, '/bundle/config/bundle_node_config.yaml')).toThrow(expected);
  });

  it('rejects unknown document and record fields', () => {
    const content = stringifyBundleNodeConfig([node()]);
    expect(() => parseBundleNodeConfig(`${content}pages: []\n`)).toThrow(
      /pages.*not part of the canonical node configuration document/,
    );
    expect(() => stringifyBundleNodeConfig([{ ...node(), title: 'legacy' } as BundleNodeConfig])).toThrow(
      /title.*not part of canonical node configuration/,
    );
  });

  it('rejects duplicate IDs and duplicate source locators', () => {
    expect(() => parseBundleNodeConfig(stringifyBundleNodeConfig([
      node(),
      node({ bundleNodeName: 'Other', bundleNodeId: id('b1b2c3d4e5f6') }),
    ]).replace('b1b2c3d4e5f6', 'a1b2c3d4e5f6'))).toThrow(/duplicates record 1/);
    expect(() => stringifyBundleNodeConfig([node(), node({ bundleNodeId: id('b1b2c3d4e5f6') })])).toThrow(/source locator.*duplicates record 1/);
  });

  it('enforces shared committed/draft identity and strong whitelisted roles', () => {
    const committed = [node()];
    expect(() => validateCanonicalBundleConfiguration({
      committedNodes: committed,
      draftNodes: [node({ bundleNodeId: id('b1b2c3d4e5f6') })],
      bundleConfig: {
        entryBundleNodeId: 'a1b2c3d4e5f6',
        defaultTraversalBundleNodeId: 'a1b2c3d4e5f6',
      },
    })).toThrow(/must equal committed ID/);

    expect(() => validateCanonicalBundleConfiguration({
      committedNodes: committed,
      bundleConfig: {
        entryBundleNodeId: 'missing00000',
        defaultTraversalBundleNodeId: 'a1b2c3d4e5f6',
      },
    })).toThrow(/entryBundleNodeId.*does not resolve/);

    expect(() => validateCanonicalBundleConfiguration({
      committedNodes: [node({ listType: 'blacklist' })],
      bundleConfig: {
        entryBundleNodeId: 'a1b2c3d4e5f6',
        defaultTraversalBundleNodeId: 'a1b2c3d4e5f6',
      },
    })).toThrow(/entryBundleNodeId.*whitelisted/);

    expect(() => validateCanonicalBundleConfiguration({
      committedNodes: committed,
      draftNodes: [node({ bundleNodeName: 'Other', bundleNodeId: id('b1b2c3d4e5f6') })],
      bundleConfig: {
        entryBundleNodeId: 'a1b2c3d4e5f6',
        defaultTraversalBundleNodeId: 'a1b2c3d4e5f6',
      },
    })).toThrow(/entryBundleNodeId.*does not resolve/);
  });

  it('enforces entry strategy, collection entry, source-root naming, and blacklist boundaries', () => {
    const folders = [
      folder(),
      folder({ bundleNodeName: 'Writing', sourceGraphSubdirectory: 'Writing', bundleNodeId: id('g1b2c3d4e5f6') }),
    ];
    expect(() => validateCanonicalBundleConfiguration({
      committedNodes: [...folders, collection()],
      bundleConfig: {
        sourceDirectory: '/vault',
        entryBundleNodeId: id('f1b2c3d4e5f6'),
        defaultTraversalBundleNodeId: id('f1b2c3d4e5f6'),
      },
    })).toThrow(/collection must be the entry/);

    expect(() => validateCanonicalBundleConfiguration({
      committedNodes: [folder({ bundleNodeName: 'Wrong', sourceGraphSubdirectory: '' })],
      bundleConfig: {
        sourceDirectory: '/sources/vault',
        entryBundleNodeId: id('f1b2c3d4e5f6'),
        defaultTraversalBundleNodeId: id('f1b2c3d4e5f6'),
      },
    })).toThrow(/source-root folder must be named 'vault'/);

    expect(() => validateCanonicalBundleConfiguration({
      committedNodes: [
        folder({ listType: 'blacklist' }),
        node({ bundleNodeName: 'Entry', sourceGraphSubdirectory: 'Projects', bundleNodeId: id('e1b2c3d4e5f6') }),
      ],
      bundleConfig: {
        entryBundleNodeId: id('e1b2c3d4e5f6'),
        defaultTraversalBundleNodeId: id('e1b2c3d4e5f6'),
      },
    })).toThrow(/lies below blacklisted folder/);

    expect(() => validateCanonicalBundleConfiguration({
      committedNodes: [
        folder({ listType: 'blacklist' }),
        folder({ bundleNodeName: 'Writing', sourceGraphSubdirectory: 'Writing', bundleNodeId: id('g1b2c3d4e5f6') }),
        collection(),
      ],
      bundleConfig: {
        entryBundleNodeId: id('c1b2c3d4e5f6'),
        defaultTraversalBundleNodeId: id('c1b2c3d4e5f6'),
      },
    })).not.toThrow();
  });

  it('retries collisions in the bundle-wide ID namespace', () => {
    let calls = 0;
    const generated = generateBundleNodeId(['aaaaaaaaaaaa'], () => {
      calls += 1;
      return calls <= 12 ? 0 : 0.5;
    });
    expect(generated).not.toBe('aaaaaaaaaaaa');
    expect(generated).toMatch(/^[a-z0-9]{12}$/);
  });
});
