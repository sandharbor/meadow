/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import type {
  BundlePublicationSummary,
  GeneratedBundleReaderRouteIndex,
  GeneratedBundleVersionId,
  PredecessorCleanupPolicy,
  ProviderDestinationRecord,
  ProviderPublicationRevisionState,
  ProviderSuccessorManifest,
  PublicationRevision,
  PublicationRevisionId,
  ReaderConnectionToPredecessor,
} from '../../../../../contracts/types/generatedBundleVersioning.js';
import { PublishingProviderPaths } from '../../../../../shared_code/paths/publishingProviderPaths.js';
import { getConfigDirectory } from '../../../../../runtime/service/src/shared/bundle-config/bundleConfigPaths.js';
import {
  furthestConnectedPresentSuccessor,
  planPublicationRevision,
  remotelyPresentPublicationRevisions,
} from '../../../../../runtime/service/src/areas/bundle/sharing/versioning/publicationRevisions.js';
import { S3_PROVIDER_ID } from '../s3Config.js';
import { isPlainObject, readDurableDocument, requireValidDocument, writeDurableDocument, yamlDocumentCodec } from '../../../../../shared_code/utils/durableDocument.js';
import { publicationRevisionStateCodec } from '../../../../../shared_code/utils/publicationRevisionDocument.js';

export const S3_DEFAULT_PROVIDER_INSTANCE_ID = 's3-default-destination';

export interface S3PublicationState extends ProviderPublicationRevisionState {
  destinationIdentity: { bucketName: string };
}

type LegacyS3PublicationState = ProviderDestinationRecord & {
  destination: { publishSlug: string; bucketName: string };
};

const legacyCodec = yamlDocumentCodec<LegacyS3PublicationState>(value => {
  if (!isPlainObject(value)) return { valid: false, diagnostic: '$ must be an object' };
  if (value.schemaVersion !== 1) return { valid: false, diagnostic: '$.schemaVersion must be 1' };
  if (value.providerInstanceId !== S3_DEFAULT_PROVIDER_INSTANCE_ID) {
    return { valid: false, diagnostic: `$.providerInstanceId must be ${S3_DEFAULT_PROVIDER_INSTANCE_ID}` };
  }
  if (!isPlainObject(value.destination)) return { valid: false, diagnostic: '$.destination must be an object' };
  if (typeof value.destination.publishSlug !== 'string') {
    return { valid: false, diagnostic: '$.destination.publishSlug must be a string' };
  }
  if (typeof value.destination.bucketName !== 'string') {
    return { valid: false, diagnostic: '$.destination.bucketName must be a string' };
  }
  if (!Array.isArray(value.events)) return { valid: false, diagnostic: '$.events must be an array' };
  return { valid: true, value: value as unknown as LegacyS3PublicationState };
});

const codec = publicationRevisionStateCodec<S3PublicationState>(S3_DEFAULT_PROVIDER_INSTANCE_ID, value => {
  if (!isPlainObject(value)) return '$.destinationIdentity must be an object';
  return typeof value.bucketName === 'string' ? null : '$.destinationIdentity.bucketName must be a string';
});

function statePath(bundleSlug: string, configDirectory = getConfigDirectory()): string {
  return path.join(PublishingProviderPaths.getBundleProviderDir(configDirectory, bundleSlug, S3_PROVIDER_ID), 'versioning', 'publications.yaml');
}

export function emptyS3PublicationState(_publishSlug: string, bucketName: string): S3PublicationState {
  return { schemaVersion: 2, providerInstanceId: S3_DEFAULT_PROVIDER_INSTANCE_ID, destinationIdentity: { bucketName }, currentRevisionId: null, pendingRevisionId: null, revisions: [] };
}

function legacyId(seed: string): PublicationRevisionId {
  return `r${createHash('sha256').update(seed).digest('hex').slice(0, 12)}` as PublicationRevisionId;
}

export function migrateLegacyS3PublicationState(value: ProviderDestinationRecord & { destination: { publishSlug: string; bucketName: string } }): S3PublicationState {
  const revisions: PublicationRevision[] = [];
  for (const event of value.events) {
    const namespaceSuffix = `-${event.versionId}`;
    const inferredSlug = event.remoteNamespace.endsWith(namespaceSuffix)
      ? event.remoteNamespace.slice(0, -namespaceSuffix.length)
      : value.destination.publishSlug;
    const publishSlug = inferredSlug || value.destination.publishSlug;
    let revision = revisions.find(item => item.generatedVersionId === event.versionId && item.publishSlug === publishSlug);
    if (!revision) {
      revision = {
        publicationRevisionId: legacyId(`${value.providerInstanceId}\0${value.destination.bucketName}\0${publishSlug}\0${event.versionId}`),
        generatedVersionId: event.versionId,
        publishSlug,
        predecessorPublicationRevisionId: revisions.at(-1)?.publicationRevisionId ?? null,
        readerConnectionToPredecessor: revisions.length ? 'connected' : 'disconnected',
        predecessorCleanupPolicy: 'keep', cleanupState: 'not-requested', remoteState: 'pending',
        createdAt: event.timestamp, latestSuccessfulSavedGenerationId: null, publishedAt: null,
        deletedAt: null, remoteNamespace: null,
      };
      revisions.push(revision);
    }
    if (event.eventType === 'remote-deletion-success') {
      revision.remoteState = 'deleted'; revision.deletedAt = event.timestamp;
    } else if (['publication-success', 'republish-success', 'imported-publication', 'verification-success'].includes(event.eventType)) {
      revision.remoteState = 'present'; revision.deletedAt = null; revision.publishedAt = event.timestamp;
      revision.latestSuccessfulSavedGenerationId = event.savedGenerationId;
      revision.remoteNamespace = event.remoteNamespace; revision.publicUrl = event.publicUrl;
      revision.readerRouteIndex = event.readerRouteIndex; revision.entryPath = event.entryPath;
    }
  }
  const current = [...revisions].reverse().find(item => item.remoteState === 'present');
  return { schemaVersion: 2, providerInstanceId: value.providerInstanceId, destinationIdentity: { bucketName: value.destination.bucketName }, currentRevisionId: current?.publicationRevisionId ?? null, pendingRevisionId: null, revisions };
}

export function loadS3PublicationState(bundleSlug: string, destination?: { publishSlug: string; bucketName: string }, configDirectory?: string): S3PublicationState | null {
  const filePath = statePath(bundleSlug, configDirectory);
  if (!fs.existsSync(filePath)) return destination ? emptyS3PublicationState(destination.publishSlug, destination.bucketName) : null;
  const legacy = readDurableDocument(filePath, legacyCodec);
  if (legacy.status === 'valid') {
    const migrated = migrateLegacyS3PublicationState(legacy.value);
    writeDurableDocument({
      path: filePath,
      value: migrated,
      codec,
      acceptedExistingCodecs: [legacyCodec],
    });
    return migrated;
  }
  return requireValidDocument(readDurableDocument(filePath, codec), () => emptyS3PublicationState('', ''));
}

export function saveS3PublicationState(bundleSlug: string, state: S3PublicationState, configDirectory?: string): void {
  writeDurableDocument({ path: statePath(bundleSlug, configDirectory), value: state, codec });
}

export function ensureS3PublicationRevision(state: S3PublicationState, input: {
  generatedVersionId: GeneratedBundleVersionId;
  publishSlug: string;
  readerConnectionToPredecessor?: ReaderConnectionToPredecessor;
  predecessorCleanupPolicy?: PredecessorCleanupPolicy;
}): S3PublicationState {
  return planPublicationRevision(state, input);
}

export function remotelyPresentS3VersionIds(state: S3PublicationState): Set<GeneratedBundleVersionId> {
  return new Set(remotelyPresentPublicationRevisions(state).map(item => item.generatedVersionId));
}

/** Only the bucket is immutable; publishSlug changes create revisions. */
export function s3DestinationFieldsLocked(state: S3PublicationState, proposed: { publishSlug: string; bucketName: string }): boolean {
  return state.revisions.length > 0 && state.destinationIdentity.bucketName !== proposed.bucketName;
}

export function s3VersionNamespace(publishSlug: string, versionId: GeneratedBundleVersionId): string { return `${publishSlug}-${versionId}`; }
export function s3SuccessorManifestKey(publishSlug: string): string { return `${publishSlug}-versions.json`; }

function readerRouteIndex(bundleDirectory: string, versionId: GeneratedBundleVersionId): { routeIndex: string; entryPath: string } {
  const relativeDirectory = path.posix.join('_mw_assets', 'versioning');
  const assetDirectory = path.join(bundleDirectory, 'html', 'generated_bundle_versions', versionId, ...relativeDirectory.split('/'));
  const files = fs.readdirSync(assetDirectory).filter(name => /^routes\.[a-f0-9]+\.json$/.test(name));
  if (files.length !== 1) throw new Error(`Version ${versionId} must contain exactly one reader route index`);
  const routeIndex = JSON.parse(fs.readFileSync(path.join(assetDirectory, files[0]), 'utf8')) as GeneratedBundleReaderRouteIndex;
  if (routeIndex.schemaVersion !== 1 || typeof routeIndex.entryPath !== 'string') throw new Error(`Version ${versionId} reader route index is invalid`);
  return { routeIndex: path.posix.join(relativeDirectory, files[0]), entryPath: routeIndex.entryPath };
}

export function buildS3SuccessorManifests(bundleDirectory: string, state: S3PublicationState): Map<string, ProviderSuccessorManifest> {
  const manifests = new Map<string, ProviderSuccessorManifest>();
  for (const source of remotelyPresentPublicationRevisions(state)) {
    const key = s3SuccessorManifestKey(source.publishSlug);
    const manifest = manifests.get(key) ?? { schemaVersion: 1 as const, successors: {} };
    const successor = furthestConnectedPresentSuccessor(state, source.publicationRevisionId);
    if (successor) {
      const route = fs.existsSync(path.join(bundleDirectory, 'html', 'generated_bundle_versions', successor.generatedVersionId))
        ? readerRouteIndex(bundleDirectory, successor.generatedVersionId)
        : { routeIndex: successor.readerRouteIndex!, entryPath: successor.entryPath! };
      manifest.successors[source.generatedVersionId] = { versionId: successor.generatedVersionId, versionRoot: successor.remoteNamespace ?? s3VersionNamespace(successor.publishSlug, successor.generatedVersionId), routeIndex: route.routeIndex, entryPath: route.entryPath };
    }
    manifests.set(key, manifest);
  }
  return manifests;
}

export function buildS3SuccessorManifest(bundleDirectory: string, publishSlug: string, _ids: ReadonlySet<string>, state?: S3PublicationState): ProviderSuccessorManifest {
  return state ? buildS3SuccessorManifests(bundleDirectory, state).get(s3SuccessorManifestKey(publishSlug)) ?? { schemaVersion: 1, successors: {} } : { schemaVersion: 1, successors: {} };
}

export function s3VersionEntryRoute(bundleDirectory: string, versionId: GeneratedBundleVersionId): string { return readerRouteIndex(bundleDirectory, versionId).entryPath; }
export function hasRemoteS3Versions(bundleSlug: string): boolean { const state = loadS3PublicationState(bundleSlug); return state ? remotelyPresentPublicationRevisions(state).length > 0 : false; }
export function getS3PublicationSummary(bundleSlug: string): BundlePublicationSummary[] {
  const state = loadS3PublicationState(bundleSlug); if (!state) return [];
  const present = remotelyPresentPublicationRevisions(state);
  return [{ providerInstanceId: state.providerInstanceId, mostRecentSuccessfulEventAt: state.revisions.flatMap(item => item.publishedAt ? [item.publishedAt] : []).sort().at(-1) ?? null, remotelyPresentVersionIds: [...new Set(present.map(item => item.generatedVersionId))] }];
}
export function s3PublicationStatePath(bundleSlug: string, configDirectory?: string): string { return statePath(bundleSlug, configDirectory); }
