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
  GeneratedBundleVersionId,
  GeneratedBundleVersionManifest,
  ProviderDestinationRecord,
} from '../../../../../../../contracts/types/generatedBundleVersioning.js';
import {
  appendGeneratedBundleVersion,
  cancelUnsavedCurrentVersion,
  currentGeneratedBundleVersion,
  deriveGeneratedBundleVersionState,
  emptyGeneratedBundleVersionManifest,
  parseGeneratedBundleVersionManifest,
  requireGeneratedBundleVersionId,
  tombstoneGeneratedBundleVersion,
  updateGeneratedBundleVersionNote,
} from '../../../../../src/shared/generated-bundle-versioning/generatedBundleVersionDomain.js';
import { computePublishedSuccessors } from '../../../../../src/shared/generated-bundle-versioning/readerSuccessors.js';
import {
  deriveSelectedVersionPublicationStatus,
  summarizeProviderDestination,
} from '../../../../../src/areas/bundle/sharing/versioning/publicationStatus.js';

const CREATED_1 = '2026-08-16T12:00:00.000Z';
const CREATED_2 = '2026-08-18T09:30:00.000Z';
const CREATED_3 = '2026-08-20T10:45:00.000Z';
const TREE_1 = '1111111111111111111111111111111111111111';

const id = (value: string): GeneratedBundleVersionId => requireGeneratedBundleVersionId(value);

function append(
  manifest: GeneratedBundleVersionManifest,
  versionId: string,
  createdAt: string,
  connection: 'connected' | 'disconnected' = 'connected',
): GeneratedBundleVersionManifest {
  return appendGeneratedBundleVersion(manifest, {
    versionId: id(versionId),
    createdAt,
    readerConnectionToPredecessor: connection,
  });
}

function threeVersions(secondConnection: 'connected' | 'disconnected' = 'connected') {
  let manifest = append(emptyGeneratedBundleVersionManifest(), 'vAb1234', CREATED_1);
  manifest = append(manifest, 'vBc2345', CREATED_2, secondConnection);
  return append(manifest, 'vCd3456', CREATED_3);
}

describe('generated bundle version domain', () => {
  it('V01 accepts only v plus six case-sensitive alphanumeric characters', () => {
    expect(requireGeneratedBundleVersionId('vAb12Z9')).toBe('vAb12Z9');
    for (const invalid of ['v12345', 'v1234567', 'V123456', 'v12-456', 'vå12345', '']) {
      expect(() => requireGeneratedBundleVersionId(invalid)).toThrow(/must match/);
    }
  });

  it('V01 rejects duplicate and case-colliding IDs', () => {
    const manifest = append(emptyGeneratedBundleVersionManifest(), 'vAb1234', CREATED_1);
    expect(() => append(manifest, 'vaB1234', CREATED_2)).toThrow(/collides/);
    expect(() => parseGeneratedBundleVersionManifest({
      schemaVersion: 1,
      versions: [manifest.versions[0], { ...manifest.versions[0], versionId: 'vaB1234' }],
    })).toThrow(/case-colliding/);
  });

  it('V02 derives currentness only from manifest order', () => {
    const manifest = threeVersions();
    expect(currentGeneratedBundleVersion(manifest)?.versionId).toBe('vCd3456');
    expect(deriveGeneratedBundleVersionState(manifest, id('vAb1234'))).toBe('frozen');
    expect(deriveGeneratedBundleVersionState(manifest, id('vCd3456'))).toBe('current');
  });

  it('V02 rejects a predecessor that is not the immediately prior entry', () => {
    const manifest = threeVersions();
    const invalid = structuredClone(manifest);
    invalid.versions[2].predecessorVersionId = id('vAb1234');
    expect(() => parseGeneratedBundleVersionManifest(invalid)).toThrow(/immediate predecessor/);
  });

  it('V08 cancels only a never-saved current version', () => {
    const manifest = threeVersions();
    expect(cancelUnsavedCurrentVersion(manifest, false).versions.map((entry) => entry.versionId))
      .toEqual(['vAb1234', 'vBc2345']);
    expect(() => cancelUnsavedCurrentVersion(manifest, true)).toThrow(/cannot be canceled/);
  });

  it('V09 tombstones retain order, identity, metadata, and the final Git tree ID', () => {
    const manifest = threeVersions();
    const withNote = updateGeneratedBundleVersionNote(manifest, id('vAb1234'), 'Before the restructure');
    const tombstoned = tombstoneGeneratedBundleVersion(withNote, id('vAb1234'), {
      localFilesDeletedAt: '2026-09-02T17:10:00.000Z',
      lastSavedGenerationId: TREE_1,
    });
    expect(tombstoned.versions.map((entry) => entry.versionId)).toEqual(['vAb1234', 'vBc2345', 'vCd3456']);
    expect(tombstoned.versions[0]).toMatchObject({
      notes: 'Before the restructure',
      localFilesState: 'deleted',
      lastSavedGenerationId: TREE_1,
    });
    expect(deriveGeneratedBundleVersionState(tombstoned, id('vAb1234'))).toBe('locally-deleted');
  });

  it('V09 rejects deletion of the current version', () => {
    const manifest = threeVersions();
    expect(() => tombstoneGeneratedBundleVersion(manifest, id('vCd3456'), {
      localFilesDeletedAt: CREATED_3,
      lastSavedGenerationId: TREE_1,
    })).toThrow(/only a frozen version/);
  });

  it('V10 never prunes entries while appending versions', () => {
    let manifest = emptyGeneratedBundleVersionManifest();
    const ids = ['vAa0001', 'vAa0002', 'vAa0003', 'vAa0004', 'vAa0005'];
    ids.forEach((versionId, index) => {
      manifest = append(manifest, versionId, `2026-08-${String(10 + index).padStart(2, '0')}T00:00:00.000Z`);
    });
    expect(manifest.versions.map((entry) => entry.versionId)).toEqual(ids);
  });

  it('strictly rejects legacy publication fields and unknown currentness fields', () => {
    expect(() => parseGeneratedBundleVersionManifest({
      schemaVersion: 1,
      versions: [{
        versionId: 'vAb1234',
        createdAt: CREATED_1,
        notes: '',
        predecessorVersionId: null,
        readerConnectionToPredecessor: 'disconnected',
        localFilesState: 'present',
        isActive: true,
      }],
    })).toThrow(/unknown field/);
  });
});

describe('reader successors', () => {
  it('R01 composes connected edges transitively', () => {
    const successors = computePublishedSuccessors(threeVersions(), new Set(['vAb1234', 'vBc2345', 'vCd3456']));
    expect(successors.get(id('vAb1234'))).toBe('vCd3456');
    expect(successors.get(id('vBc2345'))).toBe('vCd3456');
  });

  it('R02 stops a lineage at a disconnected edge', () => {
    const successors = computePublishedSuccessors(
      threeVersions('disconnected'),
      new Set(['vAb1234', 'vBc2345', 'vCd3456']),
    );
    expect(successors.has(id('vAb1234'))).toBe(false);
    expect(successors.get(id('vBc2345'))).toBe('vCd3456');
  });

  it('R03 skips unpublished connected versions without selecting them', () => {
    const successors = computePublishedSuccessors(threeVersions(), new Set(['vAb1234', 'vCd3456']));
    expect(successors.get(id('vAb1234'))).toBe('vCd3456');
    expect(successors.has(id('vBc2345'))).toBe(false);
  });

  it('R04 older or intermediate publications never outrank the furthest forward publication', () => {
    const successors = computePublishedSuccessors(threeVersions(), new Set(['vAb1234', 'vBc2345', 'vCd3456']));
    expect(successors.get(id('vAb1234'))).toBe('vCd3456');
  });

  it('R05 deletion rolls back to the furthest remaining connected publication', () => {
    const successors = computePublishedSuccessors(threeVersions(), new Set(['vAb1234', 'vBc2345']));
    expect(successors.get(id('vAb1234'))).toBe('vBc2345');
  });
});

describe('provider publication status', () => {
  const event = (
    providerInstanceId: string,
    savedGenerationId: string | 'unknown',
    eventType: ProviderDestinationRecord['events'][number]['eventType'] = 'publication-success',
  ): ProviderDestinationRecord['events'][number] => ({
    eventType,
    providerInstanceId,
    versionId: id('vAb1234'),
    savedGenerationId,
    timestamp: CREATED_1,
    remoteNamespace: 'bundle-vAb1234',
    publicUrl: 'https://example.test/bundle-vAb1234/index.html',
  });

  it('P01 scopes status and summary to a stable provider instance', () => {
    const first: ProviderDestinationRecord = { schemaVersion: 1, providerInstanceId: 's3-a', events: [event('s3-a', TREE_1)] };
    const second: ProviderDestinationRecord = { schemaVersion: 1, providerInstanceId: 's3-b', events: [] };
    expect(deriveSelectedVersionPublicationStatus(first, id('vAb1234'), TREE_1).kind).toBe('published-current');
    expect(deriveSelectedVersionPublicationStatus(second, id('vAb1234'), TREE_1).kind).toBe('not-published');
    expect(summarizeProviderDestination(first).providerInstanceId).toBe('s3-a');
  });

  it('P07 distinguishes current, changed, imported-unknown, and removed historical states', () => {
    const record: ProviderDestinationRecord = { schemaVersion: 1, providerInstanceId: 's3-a', events: [event('s3-a', TREE_1)] };
    expect(deriveSelectedVersionPublicationStatus(record, id('vAb1234'), TREE_1).kind).toBe('published-current');
    expect(deriveSelectedVersionPublicationStatus(record, id('vAb1234'), '2222222222222222222222222222222222222222').kind)
      .toBe('update-available');
    record.events.push(event('s3-a', 'unknown', 'imported-publication'));
    expect(deriveSelectedVersionPublicationStatus(record, id('vAb1234'), TREE_1).kind).toBe('imported-unknown');
    record.events.push(event('s3-a', 'unknown', 'remote-deletion-success'));
    expect(deriveSelectedVersionPublicationStatus(record, id('vAb1234'), TREE_1).kind).toBe('removed');
  });
});
