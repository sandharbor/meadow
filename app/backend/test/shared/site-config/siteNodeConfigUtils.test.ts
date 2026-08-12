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
import type { SiteNodeConfig, SiteNodeId } from '../../../../shared_code/types/siteNodeConfig.js';
import {
  generateSiteNodeId,
  parseSiteNodeConfig,
  stringifySiteNodeConfig,
  validateCanonicalSiteConfiguration,
} from '../../../../shared_code/utils/siteNodeConfigUtils.js';

const id = (value: string) => value as SiteNodeId;
const node = (overrides: Partial<SiteNodeConfig> = {}): SiteNodeConfig => ({
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

describe('canonical site node configuration', () => {
  it('serializes in deterministic record and field order and is byte-stable', () => {
    const first = stringifySiteNodeConfig([
      node({ siteNodeName: 'zeta', siteNodeId: id('z1b2c3d4e5f6') }),
      node({ siteNodeName: 'Alpha', siteNodeId: id('b1b2c3d4e5f6') }),
    ]);
    expect(first).toBe(`nodes:\n  - siteNodeName: Alpha\n    sourceGraphSubdirectory: Projects\n    siteNodeKind: file\n    fileType: md\n    siteNodeId: b1b2c3d4e5f6\n    listType: whitelist\n    outlinksDepth: 3\n    inlinksDepth: 1\n  - siteNodeName: zeta\n    sourceGraphSubdirectory: Projects\n    siteNodeKind: file\n    fileType: md\n    siteNodeId: z1b2c3d4e5f6\n    listType: whitelist\n    outlinksDepth: 3\n    inlinksDepth: 1\n`);
    expect(stringifySiteNodeConfig(parseSiteNodeConfig(first))).toBe(first);
  });

  it.each([
    ['siteNodeId', 'siteNodeId: a1b2c3d4e5f6', 'siteNodeId: invalid', /siteNodeId.*must match/],
    ['siteNodeKind', 'siteNodeKind: file', 'siteNodeKind: folder', /siteNodeKind.*exactly 'file'/],
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
