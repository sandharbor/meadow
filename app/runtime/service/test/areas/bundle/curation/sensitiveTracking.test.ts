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

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BundleNodeId, FileBundleNodeConfig } from '../../../../../../contracts/types/bundleNodeConfig.js';
import { parseNodeCommand } from '../../../../../../clients/cli/src/nodeCommands.js';
import { parseTrackBundleOptions } from '../../../../../../clients/cli/src/trackCommands.js';
import { BundleConfigPaths } from '../../../../../../shared_code/paths/bundleConfigPaths.js';
import { assertIncludeSensitiveFileNode } from '../../../../src/areas/bundle/curation/services/bundleNodeOperations.js';
import {
  applyTrackingEvidenceFromSnapshot,
  sourceContentDigest,
  trackingEvidenceMatches,
} from '../../../../src/shared/bundle-node/trackingEvidence.js';
import { deriveTrackingEvidenceFindings } from '../../../../src/shared/bundle-boundary-review/bundleBoundaryReviewService.js';
import type { IBundleNode } from '../../../../../../contracts/types/IBundleNode.js';

const temporaryRoots: string[] = [];
afterEach(() => {
  while (temporaryRoots.length > 0) fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
});

describe('single-file sensitive tracking', () => {
  it('accepts the explicit option only on one-node track and rejects folder targets', () => {
    expect(parseNodeCommand([
      'track', 'example', '--path', 'private.md', '--include-sensitive',
    ])).toMatchObject({ operation: 'track', includeSensitive: true });
    expect(() => parseNodeCommand([
      'untrack', 'example', '--path', 'private.md', '--include-sensitive',
    ])).toThrow(/only valid for the track operation/);
    expect(() => assertIncludeSensitiveFileNode('folder', true)).toThrow(/only for one file node/);
    expect(() => assertIncludeSensitiveFileNode('collection', true)).toThrow(/only for one file node/);
    expect(() => assertIncludeSensitiveFileNode('file', true)).not.toThrow();
  });

  it('keeps targeted-set and all-safe commands free of a sensitive override', () => {
    expect(() => parseTrackBundleOptions([
      'example', '--node-key', 'private.md', '--include-sensitive',
    ])).toThrow(/Unknown option: --include-sensitive/);
    expect(() => parseTrackBundleOptions([
      'example', '--all-safe', '--include-sensitive',
    ])).toThrow(/Unknown option: --include-sensitive/);
  });

  it('records the digest of exact tracked snapshot bytes and supports evidence idempotency', () => {
    const bundleDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-tracking-evidence-'));
    temporaryRoots.push(bundleDirectory);
    const snapshotRoot = BundleConfigPaths.getTrackedPageContentDir(bundleDirectory);
    fs.mkdirSync(path.join(snapshotRoot, 'private'), { recursive: true });
    const exactBytes = Buffer.from([0, 1, 2, 10, 13, 255]);
    fs.writeFileSync(path.join(snapshotRoot, 'private', 'Secret.txt'), exactBytes);
    const config: FileBundleNodeConfig = {
      bundleNodeName: 'Secret',
      sourceGraphSubdirectory: 'private',
      bundleNodeKind: 'file',
      fileType: 'txt',
      bundleNodeId: 'a1b2c3d4e5f6' as BundleNodeId,
      listType: 'whitelist',
    };
    applyTrackingEvidenceFromSnapshot({
      bundleDirectory,
      configs: [config],
      effectivelySensitiveByNodeId: new Map([[config.bundleNodeId, true]]),
      trackedAt: '2026-08-24T08:00:00.000Z',
    });
    expect(config.trackingEvidence).toEqual({
      trackedAt: '2026-08-24T08:00:00.000Z',
      sourceContentDigest: sourceContentDigest(exactBytes),
      effectivelySensitive: true,
    });
    expect(trackingEvidenceMatches(
      config.trackingEvidence,
      sourceContentDigest(exactBytes),
      true,
    )).toBe(true);
    expect(trackingEvidenceMatches(
      config.trackingEvidence,
      sourceContentDigest(Buffer.from('changed')),
      true,
    )).toBe(false);
    expect(trackingEvidenceMatches(config.trackingEvidence, sourceContentDigest(exactBytes), false)).toBe(false);
  });

  it('derives advisory content findings and a required sensitivity-transition pause deterministically', () => {
    const recordedDigest = `sha256:${'a'.repeat(64)}` as `sha256:${string}`;
    const currentDigest = `sha256:${'b'.repeat(64)}` as `sha256:${string}`;
    const config: FileBundleNodeConfig = {
      bundleNodeName: 'Secret',
      sourceGraphSubdirectory: '',
      bundleNodeKind: 'file',
      fileType: 'md',
      bundleNodeId: 'a1b2c3d4e5f6' as BundleNodeId,
      listType: 'whitelist',
      trackingEvidence: {
        trackedAt: '2026-08-24T08:00:00.000Z',
        sourceContentDigest: recordedDigest,
        effectivelySensitive: false,
      },
    };
    const node = {
      bundleNodeKey: 'Secret.md',
      bundleNodeName: 'Secret',
      bundleNodeKind: 'file',
    } as IBundleNode;
    const first = deriveTrackingEvidenceFindings({
      config,
      node,
      sourceContentDigest: currentDigest,
      effectivelySensitive: true,
    });
    const second = deriveTrackingEvidenceFindings({
      config,
      node,
      sourceContentDigest: currentDigest,
      effectivelySensitive: true,
    });
    expect(second).toEqual(first);
    expect(first.map(finding => [finding.code, finding.policy])).toEqual([
      ['content-changed-since-tracking', 'recommend-review'],
      ['sensitivity-reaffirmation-required', 'review-required'],
    ]);
    expect(deriveTrackingEvidenceFindings({
      config: { ...config, trackingEvidence: undefined },
      node,
      sourceContentDigest: currentDigest,
      effectivelySensitive: true,
    })).toEqual([]);
  });
});
