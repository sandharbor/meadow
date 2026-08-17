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

import type { Router } from 'express';
import { randomUUID } from 'crypto';
import { getBundleDirectory } from '../../../../../backend/src/shared/bundle-config/bundleConfigPaths.js';
import { requireGeneratedBundleVersionId } from '../../../../../backend/src/shared/generated-bundle-versioning/generatedBundleVersionDomain.js';
import { logger } from '../../../../../backend/src/shared/utils/logging/backendLoggingUtils.js';
import { logBundleError, logBundleInfo } from '../../../../../backend/src/shared/utils/logging/bundleLogger.js';
import { createS3Client, describeS3Error } from '../s3Client.js';
import { deletePrefix, putJsonObject } from '../s3Operations.js';
import { loadS3Resources, loadS3Secrets } from '../s3Config.js';
import {
  appendS3PublicationEvent,
  buildS3SuccessorManifest,
  loadS3PublicationState,
  remotelyPresentS3VersionIds,
  s3SuccessorManifestKey,
  s3VersionNamespace,
  saveS3PublicationState,
} from '../versioning/publicationStore.js';
import { deleteManifestThenVersionFiles } from '../versioning/remoteTransactions.js';

export function registerS3DeletePublishedRoute(router: Router): void {
  router.delete('/bundles/:bundleSlug/published', (req, res, next) => {
    void (async () => {
      const operationId = randomUUID();
      const operation = `[operation ${operationId}] [s3-delete-remote]`;
      const { bundleSlug } = req.params;
      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
      let versionId;
      try {
        versionId = requireGeneratedBundleVersionId((req.body as { versionId?: unknown })?.versionId ?? req.query.versionId);
      } catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
      }
      const stateBefore = loadS3PublicationState(bundleSlug);
      if (!stateBefore) return res.json({ success: true, filesDeleted: 0, alreadyAbsent: true });
      const resources = loadS3Resources();
      const secrets = loadS3Secrets();
      const client = createS3Client(resources, secrets);
      const remotelyPresentAfter = remotelyPresentS3VersionIds(stateBefore);
      const wasPresent = remotelyPresentAfter.delete(versionId);
      const destination = s3VersionNamespace(stateBefore.destination.publishSlug, versionId);
      logBundleInfo(bundleSlug, `${operation} Started remote cleanup for version ${versionId}, provider instance ${stateBefore.providerInstanceId}, destination ${destination}`);
      try {
        const manifest = buildS3SuccessorManifest(
          getBundleDirectory(bundleSlug),
          stateBefore.destination.publishSlug,
          remotelyPresentAfter,
          stateBefore,
        );
        const { filesDeleted } = await deleteManifestThenVersionFiles({
          putSuccessorManifest: () => putJsonObject(
            client,
            stateBefore.destination.bucketName,
            s3SuccessorManifestKey(stateBefore.destination.publishSlug),
            manifest,
          ),
          deleteVersionFiles: () => deletePrefix(
            client,
            stateBefore.destination.bucketName,
            s3VersionNamespace(stateBefore.destination.publishSlug, versionId),
          ),
        });
        const prior = [...stateBefore.events].reverse().find(event => event.versionId === versionId);
        const stateAfter = appendS3PublicationEvent(stateBefore, {
          eventType: 'remote-deletion-success',
          versionId,
          savedGenerationId: prior?.savedGenerationId ?? 'unknown',
          timestamp: new Date().toISOString(),
          remoteNamespace: s3VersionNamespace(stateBefore.destination.publishSlug, versionId),
        });
        saveS3PublicationState(bundleSlug, stateAfter);
        const alreadyAbsent = !wasPresent && filesDeleted === 0;
        logBundleInfo(bundleSlug, `${operation} ${alreadyAbsent ? 'Confirmed already absent' : 'Removed'} remote version ${versionId}; successor manifest was updated first and local files were unchanged`);
        res.json({ success: true, filesDeleted, alreadyAbsent, operationId });
      } catch (error) {
        logger.error('[S3PublishingProvider] delete-published failed:', error);
        logBundleError(bundleSlug, `${operation} Remote cleanup of version ${versionId} failed; local files and publication history were preserved and retry is safe: ${describeS3Error(error)}`);
        res.status(502).json({ error: `${describeS3Error(error)} Retry is safe.` });
      }
    })().catch(next);
  });
}
