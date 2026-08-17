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
import fs from 'fs';
import { encodePathForUrl } from '../../../../../shared_code/utils/urlUtils.js';
import { getBundleDirectory } from '../../../../../backend/src/shared/bundle-config/bundleConfigPaths.js';
import { requireGeneratedBundleVersionId } from '../../../../../backend/src/shared/generated-bundle-versioning/generatedBundleVersionDomain.js';
import {
  generatedBundleVersionDirectory,
  loadGeneratedBundleVersionManifest,
} from '../../../../../backend/src/shared/generated-bundle-versioning/generatedBundleVersionManifestService.js';
import { assertFrozenGeneratedVersionsIntegrity } from '../../../../../backend/src/shared/generated-bundle-versioning/generatedBundleVersionLifecycle.js';
import { inspectGeneratedVersionGitState } from '../../../../../backend/src/shared/generated-bundle-versioning/generatedBundleVersionGitService.js';
import { logBundleError, logBundleInfo } from '../../../../../backend/src/shared/utils/logging/bundleLogger.js';
import { logger } from '../../../../../backend/src/shared/utils/logging/backendLoggingUtils.js';
import { createS3Client, describeS3Error, requireBucket } from '../s3Client.js';
import { putJsonObject, uploadDirectory } from '../s3Operations.js';
import { loadS3ConfigForBundle, loadS3Resources, loadS3Secrets, normalizeWebBaseUrl } from '../s3Config.js';
import {
  appendS3PublicationEvent,
  buildS3SuccessorManifest,
  loadS3PublicationState,
  remotelyPresentS3VersionIds,
  s3DestinationFieldsLocked,
  s3SuccessorManifestKey,
  s3VersionEntryRoute,
  s3VersionNamespace,
  saveS3PublicationState,
} from '../versioning/publicationStore.js';
import { publishVersionFilesThenManifest } from '../versioning/remoteTransactions.js';

export function registerS3PublishRoute(router: Router): void {
  router.post('/bundles/:bundleSlug/publish', (req, res, next) => {
    void (async () => {
      const operationId = randomUUID();
      const operation = `[operation ${operationId}] [s3-publish]`;
      const { bundleSlug } = req.params;
      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
      const bundleDirectory = getBundleDirectory(bundleSlug);
      if (!fs.existsSync(bundleDirectory)) return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });

      let versionId;
      try {
        versionId = requireGeneratedBundleVersionId((req.body as { versionId?: unknown })?.versionId);
      } catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
      }
      const localManifest = loadGeneratedBundleVersionManifest(bundleDirectory);
      const localEntry = localManifest.versions.find(entry => entry.versionId === versionId);
      if (!localEntry || localEntry.localFilesState === 'deleted') {
        return res.status(400).json({ error: 'The selected version is not locally present' });
      }
      try {
        assertFrozenGeneratedVersionsIntegrity(bundleDirectory, localManifest);
      } catch (error) {
        return res.status(409).json({ error: error instanceof Error ? error.message : String(error) });
      }
      const gitState = inspectGeneratedVersionGitState(bundleDirectory, versionId);
      if (!gitState.isSaved || !gitState.savedGenerationId) {
        return res.status(409).json({ error: 'Save the selected generated version before publishing' });
      }
      const savedGenerationId = gitState.savedGenerationId;

      const bundleConfig = loadS3ConfigForBundle(bundleSlug);
      if (!bundleConfig.publishSlug) {
        return res.status(400).json({ error: 'publishSlug is not set. Open the Publish tab and set it before publishing.' });
      }
      const publishSlug = bundleConfig.publishSlug;
      const resources = loadS3Resources();
      let bucket: string;
      try {
        bucket = requireBucket(resources);
      } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
      const stateBefore = loadS3PublicationState(bundleSlug, { publishSlug, bucketName: bucket })!;
      const remotelyPresentBefore = remotelyPresentS3VersionIds(stateBefore);
      if (s3DestinationFieldsLocked(stateBefore, { publishSlug, bucketName: bucket })) {
        return res.status(409).json({ error: 'S3 destination fields cannot change while remote versions remain' });
      }

      const secrets = loadS3Secrets();
      if (!secrets.s3AccessKeyId || !secrets.s3SecretAccessKey) {
        return res.status(400).json({ error: 'No S3 credentials are configured. Set them under S3 configuration.' });
      }
      const client = createS3Client(resources, secrets);
      const namespace = s3VersionNamespace(publishSlug, versionId);
      const sourceDirectory = generatedBundleVersionDirectory(bundleDirectory, versionId);
      logBundleInfo(
        bundleSlug,
        `${operation} Started publication of version ${versionId} generation ${savedGenerationId} to provider instance ${stateBefore.providerInstanceId}, destination ${namespace}`,
      );
      try {
        const remotelyPresentAfter = new Set(remotelyPresentBefore);
        remotelyPresentAfter.add(versionId);
        const successorManifest = buildS3SuccessorManifest(
          bundleDirectory,
          publishSlug,
          remotelyPresentAfter,
          stateBefore,
        );
        const result = await publishVersionFilesThenManifest({
          uploadVersionFiles: () => uploadDirectory(client, bucket, namespace, sourceDirectory),
          putSuccessorManifest: () => putJsonObject(
            client,
            bucket,
            s3SuccessorManifestKey(publishSlug),
            successorManifest,
          ),
        });

        const normalizedBase = normalizeWebBaseUrl(resources.webBaseUrl);
        const entryPath = s3VersionEntryRoute(bundleDirectory, versionId);
        const publishedUrl = normalizedBase
          ? `${normalizedBase}/${namespace}/${encodePathForUrl(entryPath)}`
          : undefined;
        const stateAfter = appendS3PublicationEvent(stateBefore, {
          eventType: remotelyPresentBefore.has(versionId) ? 'republish-success' : 'publication-success',
          versionId,
          savedGenerationId,
          timestamp: new Date().toISOString(),
          remoteNamespace: namespace,
          readerRouteIndex: (() => {
            const asset = fs.readdirSync(`${sourceDirectory}/_mw_assets/versioning`).find(name => /^routes\.[a-f0-9]+\.json$/.test(name));
            if (!asset) throw new Error('Reader route index is missing');
            return `_mw_assets/versioning/${asset}`;
          })(),
          entryPath,
          ...(publishedUrl ? { publicUrl: publishedUrl } : {}),
        });
        saveS3PublicationState(bundleSlug, stateAfter);
        logBundleInfo(bundleSlug, `${operation} Published version ${versionId} generation ${savedGenerationId} to destination ${namespace}; successor manifest updated last and local generated files were unchanged`);
        res.json({
          success: true,
          versionId,
          savedGenerationId,
          publishedUrl,
          filesUploaded: result.filesUploaded,
          totalBytes: result.totalBytes,
          operationId,
        });
      } catch (error) {
        logger.error('[S3PublishingProvider] publish failed:', error);
        logBundleError(
          bundleSlug,
          `${operation} Publication of version ${versionId} to destination ${namespace} failed; partial remote files may exist, no success was recorded, local files were unchanged, and retry is safe: ${describeS3Error(error)}`,
        );
        res.status(502).json({
          error: `${describeS3Error(error)} No publication success was recorded; retry is safe.`,
        });
      }
    })().catch(next);
  });
}
