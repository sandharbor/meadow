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

import type { CleanupPublishedBundleOptions, CleanupPublishedBundleResult } from '../../../../runtime/service/src/shared/publishing-provider-host/IPublishingProviderBackend.js';
import { logBundleError, logBundleInfo } from '../../../../runtime/service/src/shared/utils/logging/bundleLogger.js';
import { createS3Client } from './s3Client.js';
import { deleteObjectKeys, deletePrefix, putJsonObject } from './s3Operations.js';
import { loadS3Resources, loadS3Secrets } from './s3Config.js';
import {
  appendS3PublicationEvent,
  loadS3PublicationState,
  remotelyPresentS3VersionIds,
  s3SuccessorManifestKey,
  s3VersionNamespace,
  saveS3PublicationState,
} from './versioning/publicationStore.js';

export async function cleanupS3PublishedFiles(
  options: CleanupPublishedBundleOptions,
): Promise<CleanupPublishedBundleResult> {
  const { bundleSlug, operationId, onProgress } = options;
  const operation = `[operation ${operationId}] [s3-cleanup-bundle]`;
  let state = loadS3PublicationState(bundleSlug);
  if (!state || remotelyPresentS3VersionIds(state).size === 0) return { confirmed: true };

  const resources = loadS3Resources();
  const secrets = loadS3Secrets();
  if (!secrets.s3AccessKeyId || !secrets.s3SecretAccessKey) {
    throw new Error('S3 credentials are required to confirm remote cleanup');
  }
  const client = createS3Client(resources, secrets);
  const versions = [...remotelyPresentS3VersionIds(state)];
  logBundleInfo(bundleSlug, `${operation} Started cleanup of ${versions.length} remote version${versions.length === 1 ? '' : 's'} for provider instance ${state.providerInstanceId}, destination ${state.destination.publishSlug}`);
  onProgress({ stage: 'deleting-s3', message: `Preparing to remove ${versions.length} remote version${versions.length === 1 ? '' : 's'}...` });

  try {
    await putJsonObject(
      client,
      state.destination.bucketName,
      s3SuccessorManifestKey(state.destination.publishSlug),
      { schemaVersion: 1, successors: {} },
    );
    let totalDeleted = 0;
    for (const versionId of versions) {
      const result = await deletePrefix(
        client,
        state.destination.bucketName,
        s3VersionNamespace(state.destination.publishSlug, versionId),
      );
      totalDeleted += result.filesDeleted;
      const prior = [...state.events].reverse().find(event => event.versionId === versionId);
      state = appendS3PublicationEvent(state, {
        eventType: 'remote-deletion-success',
        versionId,
        savedGenerationId: prior?.savedGenerationId ?? 'unknown',
        timestamp: new Date().toISOString(),
        remoteNamespace: s3VersionNamespace(state.destination.publishSlug, versionId),
      });
      saveS3PublicationState(bundleSlug, state);
      onProgress({
        stage: 'deleting-s3',
        message: `Removed remote version ${versionId}`,
        filesDeleted: totalDeleted,
        version: versionId,
      });
    }
    await deleteObjectKeys(
      client,
      state.destination.bucketName,
      [s3SuccessorManifestKey(state.destination.publishSlug)],
    );
    logBundleInfo(bundleSlug, `${operation} Confirmed all remote versions and the successor manifest removed; local bundle may now be deleted`);
    return { confirmed: true };
  } catch (error) {
    logBundleError(bundleSlug, `${operation} Cleanup failed; partial remote state may remain, local bundle must be preserved, and retry is safe: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
