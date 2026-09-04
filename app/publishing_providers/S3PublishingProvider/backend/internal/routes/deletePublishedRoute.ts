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

import type { NextFunction, Request, Response, Router } from 'express';
import { randomUUID } from 'crypto';
import { getBundleDirectory } from '../../../../../runtime/service/src/shared/bundle-config/bundleConfigPaths.js';
import { requireGeneratedBundleVersionId } from '../../../../../runtime/service/src/shared/generated-bundle-versioning/generatedBundleVersionDomain.js';
import { logger } from '../../../../../runtime/service/src/shared/utils/logging/backendLoggingUtils.js';
import { logBundleError, logBundleInfo } from '../../../../../runtime/service/src/shared/utils/logging/bundleLogger.js';
import { createS3Client, describeS3Error } from '../s3Client.js';
import { deleteObjectKeys, deletePrefix, putJsonObject } from '../s3Operations.js';
import { loadS3Resources, loadS3Secrets } from '../s3Config.js';
import {
  buildS3SuccessorManifests,
  loadS3PublicationState,
  s3SuccessorManifestKey,
  s3VersionNamespace,
  saveS3PublicationState,
} from '../versioning/publicationStore.js';
import { deleteManifestThenVersionFiles } from '../versioning/remoteTransactions.js';
import {
  recordPublicationDeletion,
  requirePublicationRevisionId,
} from '../../../../../runtime/service/src/areas/bundle/sharing/versioning/publicationRevisions.js';

export function registerS3DeletePublishedRoute(router: Router): void {
  const deletePublished = (
    req: Request,
    res: Response,
    next: NextFunction,
    requestedRevisionId?: unknown,
  ): void => {
    void (async () => {
      const operationId = randomUUID();
      const operation = `[operation ${operationId}] [s3-delete-remote]`;
      const { bundleSlug } = req.params;
      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
      const body = (req.body ?? {}) as { versionId?: unknown; publicationRevisionId?: unknown };
      let versionId = null;
      let publicationRevisionId = null;
      try {
        if (requestedRevisionId !== undefined) publicationRevisionId = requirePublicationRevisionId(requestedRevisionId);
        else if (body.publicationRevisionId !== undefined) publicationRevisionId = requirePublicationRevisionId(body.publicationRevisionId);
        else versionId = requireGeneratedBundleVersionId(body.versionId ?? req.query.versionId);
      } catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
      }
      const stateBefore = loadS3PublicationState(bundleSlug);
      if (!stateBefore) return res.json({ success: true, filesDeleted: 0, alreadyAbsent: true });
      const resources = loadS3Resources();
      const secrets = loadS3Secrets();
      const client = createS3Client(resources, secrets);
      const target = [...stateBefore.revisions].reverse().find(revision =>
        (publicationRevisionId
          ? revision.publicationRevisionId === publicationRevisionId
          : revision.generatedVersionId === versionId)
        && revision.remoteState === 'present'
      );
      const wasPresent = Boolean(target);
      if (!target) return res.json({ success: true, filesDeleted: 0, alreadyAbsent: true });
      const destination = target.remoteNamespace ?? s3VersionNamespace(target.publishSlug, target.generatedVersionId);
      logBundleInfo(bundleSlug, `${operation} Started remote cleanup for publication revision ${target.publicationRevisionId}, provider instance ${stateBefore.providerInstanceId}, destination ${destination}`);
      try {
        const stateAfter = recordPublicationDeletion(stateBefore, target.publicationRevisionId);
        const { filesDeleted } = await deleteManifestThenVersionFiles({
          putSuccessorManifest: async () => {
            const manifests = buildS3SuccessorManifests(getBundleDirectory(bundleSlug), stateAfter);
            for (const [key, manifest] of manifests) {
              await putJsonObject(client, stateBefore.destinationIdentity.bucketName, key, manifest);
            }
            const staleKeys = [...new Set(stateBefore.revisions.map(revision => s3SuccessorManifestKey(revision.publishSlug)))]
              .filter(key => !manifests.has(key));
            await deleteObjectKeys(client, stateBefore.destinationIdentity.bucketName, staleKeys);
          },
          deleteVersionFiles: () => deletePrefix(
            client,
            stateBefore.destinationIdentity.bucketName,
            destination,
          ),
        });
        saveS3PublicationState(bundleSlug, stateAfter);
        const alreadyAbsent = !wasPresent && filesDeleted === 0;
        logBundleInfo(bundleSlug, `${operation} ${alreadyAbsent ? 'Confirmed already absent' : 'Removed'} publication revision ${target.publicationRevisionId}; successor manifests were updated first and local files were unchanged`);
        res.json({ success: true, filesDeleted, alreadyAbsent, operationId });
      } catch (error) {
        logger.error('[S3PublishingProvider] delete-published failed:', error);
        logBundleError(bundleSlug, `${operation} Remote cleanup of publication revision ${target.publicationRevisionId} failed; local files and publication history were preserved and retry is safe: ${describeS3Error(error)}`);
        res.status(502).json({ error: `${describeS3Error(error)} Retry is safe.` });
      }
    })().catch(next);
  };

  router.delete('/bundles/:bundleSlug/published', (req, res, next) => {
    deletePublished(req, res, next);
  });
  router.delete('/bundles/:bundleSlug/publication-revisions/:publicationRevisionId', (req, res, next) => {
    deletePublished(req, res, next, req.params.publicationRevisionId);
  });
}
