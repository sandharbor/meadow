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
import { stringifyBundleNodeConfig } from '../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import type { BundleNodeConfig } from '../../../../../contracts/types/bundleNodeConfig.js';
import { workingGraphTopologyFingerprint } from '../../../src/shared/utils/workingGraphUtils.js';

const entryId = 'entry0000001';
const traversalId = 'traversal001';

function fingerprint(configs: BundleNodeConfig[]): string {
  return workingGraphTopologyFingerprint(
    stringifyBundleNodeConfig(configs),
    entryId,
    traversalId,
  );
}

function fileConfig(
  bundleNodeName: string,
  bundleNodeId: string,
  extra: Partial<BundleNodeConfig> = {},
): BundleNodeConfig {
  return {
    bundleNodeName,
    sourceGraphSubdirectory: '',
    bundleNodeKind: 'file',
    fileType: 'md',
    bundleNodeId,
    listType: 'whitelist',
    ...extra,
  } as BundleNodeConfig;
}

describe('working graph topology fingerprint', () => {
  const roleConfigs = [
    fileConfig('Entry', entryId),
    fileConfig('Traversal', traversalId),
  ];

  it('does not invalidate traversal for plain tracking or tracking evidence', () => {
    const before = fingerprint(roleConfigs);
    const afterTracking = fingerprint([
      ...roleConfigs,
      fileConfig('Newly tracked', 'track0000001'),
    ]);
    const afterEvidence = fingerprint([
      { ...roleConfigs[0], trackingEvidence: {
        sourceContentDigest: `sha256:${'a'.repeat(64)}`,
        effectivelySensitive: false,
        trackedAt: '2026-08-24T00:00:00.000Z',
      } },
      roleConfigs[1],
    ]);

    expect(afterTracking).toBe(before);
    expect(afterEvidence).toBe(before);
  });

  it('invalidates traversal for depth and blacklist changes', () => {
    const tracked = [...roleConfigs, fileConfig('Policy page', 'policy000001')];
    const before = fingerprint(tracked);

    expect(fingerprint([
      ...roleConfigs,
      fileConfig('Policy page', 'policy000001', { outlinksDepth: 2 }),
    ])).not.toBe(before);
    expect(fingerprint([
      ...roleConfigs,
      fileConfig('Policy page', 'policy000001', { listType: 'blacklist' }),
    ])).not.toBe(before);
  });

  it('invalidates traversal for collection membership changes', () => {
    const folders: BundleNodeConfig[] = [
      {
        bundleNodeName: 'Alpha',
        sourceGraphSubdirectory: 'Alpha',
        bundleNodeKind: 'folder',
        bundleNodeId: 'folder000001',
        listType: 'whitelist',
      },
      {
        bundleNodeName: 'Beta',
        sourceGraphSubdirectory: 'Beta',
        bundleNodeKind: 'folder',
        bundleNodeId: 'folder000002',
        listType: 'whitelist',
      },
      {
        bundleNodeName: 'Gamma',
        sourceGraphSubdirectory: 'Gamma',
        bundleNodeKind: 'folder',
        bundleNodeId: 'folder000003',
        listType: 'whitelist',
      },
    ];
    const collection = (members: string[]): BundleNodeConfig => ({
      bundleNodeName: 'Bundle home',
      bundleNodeKind: 'collection',
      bundleNodeId: entryId,
      listType: 'whitelist',
      memberBundleNodeIds: members,
    }) as BundleNodeConfig;

    expect(fingerprint([
      ...folders,
      collection(['folder000001', 'folder000002']),
    ])).not.toBe(fingerprint([
      ...folders,
      collection(['folder000001', 'folder000003']),
    ]));
  });
});
