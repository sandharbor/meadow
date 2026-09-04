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
import YAML from 'yaml';
import type { S3Client } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it } from 'vitest';
import type { GeneratedBundleVersionId } from '../../../../contracts/types/generatedBundleVersioning.js';
import {
  pendingPublicationRevision,
  recordPublicationDeletion,
  recordPublicationSuccess,
} from '../../../../runtime/service/src/areas/bundle/sharing/versioning/publicationRevisions.js';
import { uploadDirectory } from '../internal/s3Operations.js';
import {
  buildS3SuccessorManifest,
  emptyS3PublicationState,
  ensureS3PublicationRevision,
  migrateLegacyS3PublicationState,
  remotelyPresentS3VersionIds,
  s3DestinationFieldsLocked,
  s3SuccessorManifestKey,
  s3VersionNamespace,
} from '../internal/versioning/publicationStore.js';
import {
  deleteManifestThenVersionFiles,
  publishVersionFilesThenManifest,
} from '../internal/versioning/remoteTransactions.js';

const temporaryDirectories: string[] = [];
const id = (value: string): GeneratedBundleVersionId => value as GeneratedBundleVersionId;

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 's3-provider-versioning-'));
  temporaryDirectories.push(directory);
  return directory;
}

function write(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('minimal S3 provider versioning contract', () => {
  it('migrates historical publish-slug changes into distinct same-generation revisions', () => {
    const state = migrateLegacyS3PublicationState({
      schemaVersion: 1,
      providerInstanceId: 's3-default-destination',
      destination: { publishSlug: 'orchard', bucketName: 'bucket' },
      events: [
        {
          eventType: 'publication-success',
          providerInstanceId: 's3-default-destination',
          versionId: id('vAb3XyZ'),
          savedGenerationId: 'tree-1',
          timestamp: '2026-01-01T00:00:00.000Z',
          remoteNamespace: 'garden-vAb3XyZ',
        },
        {
          eventType: 'publication-success',
          providerInstanceId: 's3-default-destination',
          versionId: id('vAb3XyZ'),
          savedGenerationId: 'tree-1',
          timestamp: '2026-01-02T00:00:00.000Z',
          remoteNamespace: 'orchard-vAb3XyZ',
        },
      ],
    });
    expect(state.revisions.map(revision => revision.publishSlug)).toEqual(['garden', 'orchard']);
    expect(state.revisions.every(revision => /^r[A-Za-z0-9]{12}$/.test(revision.publicationRevisionId))).toBe(true);
    expect(state.currentRevisionId).toBe(state.revisions[1].publicationRevisionId);
  });

  it('P03 P04 D03 writes the manifest at the safe boundary and records no success after partial failure', async () => {
    const order: string[] = [];
    let state = emptyS3PublicationState('garden', 'bucket');

    await expect(publishVersionFilesThenManifest({
      uploadVersionFiles: async () => {
        order.push('version-files');
        return { filesUploaded: 1 };
      },
      putSuccessorManifest: async () => {
        order.push('successor-manifest');
        throw new Error('injected manifest failure');
      },
    })).rejects.toThrow('injected manifest failure');
    expect(order).toEqual(['version-files', 'successor-manifest']);
    expect(state.revisions).toEqual([]);

    order.length = 0;
    await deleteManifestThenVersionFiles({
      putSuccessorManifest: async () => { order.push('successor-manifest'); },
      deleteVersionFiles: async () => { order.push('version-files'); },
    });
    expect(order).toEqual(['successor-manifest', 'version-files']);

    state = ensureS3PublicationRevision(state, {
      generatedVersionId: id('vAb3XyZ'),
      publishSlug: 'garden',
    });
    state = recordPublicationSuccess(state, {
      publicationRevisionId: pendingPublicationRevision(state)!.publicationRevisionId,
      savedGenerationId: 'tree',
      now: new Date('2026-01-01T00:00:00.000Z'),
      remoteNamespace: 'garden-vAb3XyZ',
      readerRouteIndex: '_mw_assets/versioning/routes.1234abcd.json',
      entryPath: 'index.html',
    });
    expect(state.revisions).toHaveLength(1);
  });

  it('P03 P05 uploads dependencies before HTML with immutable awareness caching and never mutates source', async () => {
    const source = temporaryDirectory();
    write(path.join(source, '_mw_assets', 'versioning', 'routes.1234abcd.json'), '{}');
    write(path.join(source, '_mw_assets', 'app.js'), 'asset');
    write(path.join(source, 'data.json'), '{}');
    write(path.join(source, 'index.html'), '<html></html>');
    const before = new Map(fs.readdirSync(source, { recursive: true, encoding: 'utf8' })
      .filter(relativePath => fs.statSync(path.join(source, relativePath)).isFile())
      .map(relativePath => [relativePath, fs.readFileSync(path.join(source, relativePath))]));
    const commands: Array<{ name: string; input: Record<string, unknown> }> = [];
    const client = {
      send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
        commands.push({ name: command.constructor.name, input: command.input });
        if (command.constructor.name === 'ListObjectsV2Command') return { Contents: [] };
        return {};
      },
    } as unknown as S3Client;

    await uploadDirectory(client, 'bucket', 'garden-vAb3XyZ', source);
    const puts = commands.filter(command => command.name === 'PutObjectCommand');
    expect(puts.map(command => command.input.Key)).toEqual([
      'garden-vAb3XyZ/_mw_assets/versioning/routes.1234abcd.json',
      'garden-vAb3XyZ/_mw_assets/app.js',
      'garden-vAb3XyZ/data.json',
      'garden-vAb3XyZ/index.html',
    ]);
    expect(puts[0].input.CacheControl).toBe('public, max-age=31536000, immutable');
    for (const [relativePath, bytes] of before) {
      expect(fs.readFileSync(path.join(source, relativePath))).toEqual(bytes);
    }
  });

  it('R03 R04 R05 P01 computes destination-local successors around gaps and remote deletion', () => {
    const bundle = temporaryDirectory();
    const ids = [id('vAb3XyZ'), id('vQ7mN2p'), id('vK8cR4s')];
    write(path.join(bundle, 'config', 'generated_bundle_versions.yaml'), YAML.stringify({
      schemaVersion: 1,
      versions: ids.map((versionId, index) => ({
        versionId,
        createdAt: `2026-01-0${index + 1}T00:00:00.000Z`,
        notes: '',
        predecessorVersionId: index ? ids[index - 1] : null,
        readerConnectionToPredecessor: index ? 'connected' : 'disconnected',
        localFilesState: 'present',
      })),
    }));
    for (const versionId of ids) {
      write(
        path.join(bundle, 'html', 'generated_bundle_versions', versionId, '_mw_assets', 'versioning', 'routes.1234abcd.json'),
        JSON.stringify({ schemaVersion: 1, entryPath: 'index.html', routesByBundleNodeId: {}, generatedPagePaths: ['index.html'] }),
      );
    }
    let state = emptyS3PublicationState('garden', 'bucket');
    for (const versionId of [ids[0], ids[2]]) {
      state = ensureS3PublicationRevision(state, { generatedVersionId: versionId, publishSlug: 'garden' });
      state = recordPublicationSuccess(state, {
        publicationRevisionId: pendingPublicationRevision(state)!.publicationRevisionId,
        savedGenerationId: 'tree',
        now: new Date('2026-01-10T00:00:00.000Z'),
        remoteNamespace: s3VersionNamespace('garden', versionId),
        readerRouteIndex: '_mw_assets/versioning/routes.1234abcd.json',
        entryPath: 'index.html',
      });
    }
    expect(buildS3SuccessorManifest(bundle, 'garden', remotelyPresentS3VersionIds(state), state).successors[ids[0]])
      .toMatchObject({ versionId: ids[2], versionRoot: `garden-${ids[2]}` });
    state = recordPublicationDeletion(state, state.currentRevisionId!, new Date('2026-01-11T00:00:00.000Z'));
    expect(buildS3SuccessorManifest(bundle, 'garden', remotelyPresentS3VersionIds(state), state).successors)
      .toEqual({});
    expect(state.providerInstanceId).toBe('s3-default-destination');
    expect(s3SuccessorManifestKey('garden')).toBe('garden-versions.json');
  });

  it('P06 locks URL-shaping destination fields only while remote versions remain', () => {
    let state = emptyS3PublicationState('garden', 'bucket');
    expect(s3DestinationFieldsLocked(state, { publishSlug: 'renamed', bucketName: 'other' })).toBe(false);
    state = ensureS3PublicationRevision(state, {
      generatedVersionId: id('vAb3XyZ'),
      publishSlug: 'garden',
    });
    state = recordPublicationSuccess(state, {
      publicationRevisionId: pendingPublicationRevision(state)!.publicationRevisionId,
      savedGenerationId: 'tree',
      now: new Date('2026-01-01T00:00:00.000Z'),
      remoteNamespace: 'garden-vAb3XyZ',
      readerRouteIndex: '_mw_assets/versioning/routes.1234abcd.json',
      entryPath: 'index.html',
    });
    expect(s3DestinationFieldsLocked(state, { publishSlug: 'garden', bucketName: 'bucket' })).toBe(false);
    expect(s3DestinationFieldsLocked(state, { publishSlug: 'renamed', bucketName: 'bucket' })).toBe(false);
    expect(s3DestinationFieldsLocked(state, { publishSlug: 'garden', bucketName: 'other' })).toBe(true);
  });
});
