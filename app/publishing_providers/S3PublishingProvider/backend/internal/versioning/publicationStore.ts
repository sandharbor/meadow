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
import path from 'path';
import type {
  BundlePublicationSummary,
  GeneratedBundleReaderRouteIndex,
  GeneratedBundleVersionId,
  ProviderDestinationRecord,
  ProviderPublicationEvent,
  ProviderSuccessorManifest,
} from '../../../../../shared_code/types/generatedBundleVersioning.js';
import { PublishingProviderPaths } from '../../../../../shared_code/paths/publishingProviderPaths.js';
import { getConfigDirectory } from '../../../../../runtime/service/src/shared/bundle-config/bundleConfigPaths.js';
import { loadGeneratedBundleVersionManifest } from '../../../../../runtime/service/src/shared/generated-bundle-versioning/generatedBundleVersionManifestService.js';
import { computePublishedSuccessors } from '../../../../../runtime/service/src/shared/generated-bundle-versioning/readerSuccessors.js';
import { S3_PROVIDER_ID } from '../s3Config.js';
import {
  isPlainObject,
  readDurableDocument,
  requireValidDocument,
  writeDurableDocument,
} from '../../../../../shared_code/utils/durableDocument.js';
import { providerPublicationStateCodec } from '../../../../../shared_code/utils/providerPublicationDocument.js';

export const S3_DEFAULT_PROVIDER_INSTANCE_ID = 's3-default-destination';

export interface S3PublicationState extends ProviderDestinationRecord {
  destination: {
    publishSlug: string;
    bucketName: string;
  };
}

const s3PublicationStateCodec = providerPublicationStateCodec<S3PublicationState>(
  S3_DEFAULT_PROVIDER_INSTANCE_ID,
  value => {
    if (!isPlainObject(value)) return '$.destination must be an object';
    if (typeof value.publishSlug !== 'string') return '$.destination.publishSlug must be a string';
    if (typeof value.bucketName !== 'string') return '$.destination.bucketName must be a string';
    return null;
  },
);

function statePath(bundleSlug: string): string {
  return path.join(
    PublishingProviderPaths.getBundleProviderDir(getConfigDirectory(), bundleSlug, S3_PROVIDER_ID),
    'versioning',
    'publications.yaml',
  );
}

export function emptyS3PublicationState(publishSlug: string, bucketName: string): S3PublicationState {
  return {
    schemaVersion: 1,
    providerInstanceId: S3_DEFAULT_PROVIDER_INSTANCE_ID,
    destination: { publishSlug, bucketName },
    events: [],
  };
}

export function loadS3PublicationState(
  bundleSlug: string,
  destination?: { publishSlug: string; bucketName: string },
): S3PublicationState | null {
  const filePath = statePath(bundleSlug);
  const result = readDurableDocument(filePath, s3PublicationStateCodec);
  if (result.status === 'missing') {
    return destination ? emptyS3PublicationState(destination.publishSlug, destination.bucketName) : null;
  }
  return requireValidDocument(result, () => emptyS3PublicationState('', ''));
}

export function saveS3PublicationState(bundleSlug: string, state: S3PublicationState): void {
  const filePath = statePath(bundleSlug);
  writeDurableDocument({ path: filePath, value: state, codec: s3PublicationStateCodec });
}

export function appendS3PublicationEvent(
  state: S3PublicationState,
  event: Omit<ProviderPublicationEvent, 'providerInstanceId'>,
): S3PublicationState {
  return {
    ...state,
    events: [...state.events, { ...event, providerInstanceId: state.providerInstanceId }],
  };
}

export function remotelyPresentS3VersionIds(state: S3PublicationState): Set<GeneratedBundleVersionId> {
  const present = new Set<GeneratedBundleVersionId>();
  for (const event of state.events) {
    if (event.eventType === 'remote-deletion-success') present.delete(event.versionId);
    else if (
      event.eventType === 'publication-success'
      || event.eventType === 'republish-success'
      || event.eventType === 'imported-publication'
      || event.eventType === 'verification-success'
    ) present.add(event.versionId);
  }
  return present;
}

export function s3DestinationFieldsLocked(
  state: S3PublicationState,
  proposed: { publishSlug: string; bucketName: string },
): boolean {
  return remotelyPresentS3VersionIds(state).size > 0
    && (state.destination.publishSlug !== proposed.publishSlug
      || state.destination.bucketName !== proposed.bucketName);
}

export function s3VersionNamespace(publishSlug: string, versionId: GeneratedBundleVersionId): string {
  return `${publishSlug}-${versionId}`;
}

export function s3SuccessorManifestKey(publishSlug: string): string {
  return `${publishSlug}-versions.json`;
}

function readerRouteIndex(bundleDirectory: string, versionId: GeneratedBundleVersionId): {
  routeIndex: string;
  entryPath: string;
} {
  const relativeDirectory = path.posix.join('_mw_assets', 'versioning');
  const assetDirectory = path.join(
    bundleDirectory,
    'html',
    'generated_bundle_versions',
    versionId,
    ...relativeDirectory.split('/'),
  );
  const routeIndexFiles = fs.readdirSync(assetDirectory)
    .filter(filename => /^routes\.[a-f0-9]+\.json$/.test(filename));
  if (routeIndexFiles.length !== 1) throw new Error(`Version ${versionId} must contain exactly one reader route index`);
  const routeIndex = JSON.parse(fs.readFileSync(path.join(assetDirectory, routeIndexFiles[0]), 'utf8')) as GeneratedBundleReaderRouteIndex;
  if (routeIndex.schemaVersion !== 1 || typeof routeIndex.entryPath !== 'string') {
    throw new Error(`Version ${versionId} reader route index is invalid`);
  }
  return {
    routeIndex: path.posix.join(relativeDirectory, routeIndexFiles[0]),
    entryPath: routeIndex.entryPath,
  };
}

export function buildS3SuccessorManifest(
  bundleDirectory: string,
  publishSlug: string,
  remotelyPresentVersionIds: ReadonlySet<string>,
  state?: S3PublicationState,
): ProviderSuccessorManifest {
  const localManifest = loadGeneratedBundleVersionManifest(bundleDirectory);
  const successors = computePublishedSuccessors(localManifest, remotelyPresentVersionIds);
  return {
    schemaVersion: 1,
    successors: Object.fromEntries([...successors.entries()].map(([sourceVersionId, successorVersionId]) => {
      const localDirectory = path.join(bundleDirectory, 'html', 'generated_bundle_versions', successorVersionId);
      const persistedRoute = state
        ? [...state.events].reverse().find(event =>
          event.versionId === successorVersionId
          && event.eventType !== 'remote-deletion-success'
          && event.readerRouteIndex
          && event.entryPath
        )
        : undefined;
      const route = fs.existsSync(localDirectory)
        ? readerRouteIndex(bundleDirectory, successorVersionId)
        : persistedRoute?.readerRouteIndex && persistedRoute.entryPath
          ? { routeIndex: persistedRoute.readerRouteIndex, entryPath: persistedRoute.entryPath }
          : (() => { throw new Error(`Reader routing metadata is unavailable for remote version ${successorVersionId}`); })();
      return [sourceVersionId, {
        versionId: successorVersionId,
        versionRoot: s3VersionNamespace(publishSlug, successorVersionId),
        routeIndex: route.routeIndex,
        entryPath: route.entryPath,
      }];
    })),
  };
}

export function s3VersionEntryRoute(bundleDirectory: string, versionId: GeneratedBundleVersionId): string {
  return readerRouteIndex(bundleDirectory, versionId).entryPath;
}

export function hasRemoteS3Versions(bundleSlug: string): boolean {
  const state = loadS3PublicationState(bundleSlug);
  return state ? remotelyPresentS3VersionIds(state).size > 0 : false;
}

export function getS3PublicationSummary(bundleSlug: string): BundlePublicationSummary[] {
  const state = loadS3PublicationState(bundleSlug);
  if (!state) return [];
  const successfulEvents = state.events.filter(event =>
    event.eventType === 'publication-success'
    || event.eventType === 'republish-success'
    || event.eventType === 'imported-publication'
    || event.eventType === 'verification-success'
  );
  return [{
    providerInstanceId: state.providerInstanceId,
    mostRecentSuccessfulEventAt: successfulEvents.at(-1)?.timestamp ?? null,
    remotelyPresentVersionIds: [...remotelyPresentS3VersionIds(state)],
  }];
}

export function s3PublicationStatePath(bundleSlug: string): string {
  return statePath(bundleSlug);
}
