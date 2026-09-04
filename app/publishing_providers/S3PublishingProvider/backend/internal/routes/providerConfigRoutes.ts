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
import fs from 'fs';
import { PublishingProviderPaths } from '../../../../../shared_code/paths/publishingProviderPaths.js';
import {
  getConfigDirectory,
  getBundleDirectory,
} from '../../../../../runtime/service/src/shared/bundle-config/bundleConfigPaths.js';
import {
  loadS3ConfigForBundle,
  loadS3Resources,
  PUBLISH_SLUG_PATTERN,
  S3_PROVIDER_ID,
  s3ProviderConfigCodec,
  type S3ProviderConfig,
} from '../s3Config.js';
import { loadGeneratedBundleVersionManifest } from '../../../../../runtime/service/src/shared/generated-bundle-versioning/generatedBundleVersionManifestService.js';
import { requireGeneratedBundleVersionId } from '../../../../../runtime/service/src/shared/generated-bundle-versioning/generatedBundleVersionDomain.js';
import { ensureS3PublicationRevision, loadS3PublicationState, saveS3PublicationState } from '../versioning/publicationStore.js';
import {
  readDurableDocument,
  requireValidDocument,
  writeDurableDocument,
} from '../../../../../shared_code/utils/durableDocument.js';
import {
  cancelPendingPublicationRevision,
  currentPublicationRevision,
  requirePublicationRevisionId,
} from '../../../../../runtime/service/src/areas/bundle/sharing/versioning/publicationRevisions.js';

/**
 * Per-bundle S3 provider config routes. Unlike Meadow, there's no prefix — a
 * bundle's S3 destination is just its publishSlug.
 */
export function registerS3ProviderConfigRoutes(router: Router): void {
  router.get('/bundles/:bundleSlug/provider-config', (req, res, next) => {
    try {
      const { bundleSlug } = req.params;
      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
      if (!fs.existsSync(getBundleDirectory(bundleSlug))) {
        return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
      }
      const { publishSlug } = loadS3ConfigForBundle(bundleSlug);
      res.json({ publishSlug: publishSlug ?? null });
    } catch (error) {
      next(error);
    }
  });

  router.put('/bundles/:bundleSlug/provider-config', (req, res, next) => {
    try {
      const { bundleSlug } = req.params;
      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
      if (!fs.existsSync(getBundleDirectory(bundleSlug))) {
        return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
      }

      const { publishSlug, versionId: rawVersionId, readerConnectionToPredecessor, predecessorCleanupPolicy } = req.body as {
        publishSlug?: string;
        versionId?: unknown;
        readerConnectionToPredecessor?: 'connected' | 'disconnected';
        predecessorCleanupPolicy?: 'keep' | 'delete-after-success';
      };
      if (typeof publishSlug !== 'string' || !PUBLISH_SLUG_PATTERN.test(publishSlug)) {
        return res.status(400).json({
          error: 'publishSlug must contain only lowercase letters, numbers, and dashes',
        });
      }
      if (readerConnectionToPredecessor !== undefined
        && !['connected', 'disconnected'].includes(readerConnectionToPredecessor)) {
        return res.status(400).json({ error: 'readerConnectionToPredecessor is invalid' });
      }
      if (predecessorCleanupPolicy !== undefined
        && !['keep', 'delete-after-success'].includes(predecessorCleanupPolicy)) {
        return res.status(400).json({ error: 'predecessorCleanupPolicy is invalid' });
      }

      const previousPublishSlug = loadS3ConfigForBundle(bundleSlug).publishSlug;
      const state = loadS3PublicationState(bundleSlug);
      let nextPublicationState = state;
      const bucketName = loadS3Resources().s3BucketName;
      if (state && bucketName && publishSlug !== previousPublishSlug) {
        const manifest = loadGeneratedBundleVersionManifest(getBundleDirectory(bundleSlug));
        const versionId = rawVersionId === undefined
          ? manifest.versions.at(-1)?.versionId
          : requireGeneratedBundleVersionId(rawVersionId);
        const selectedVersion = manifest.versions.find(version =>
          version.versionId === versionId && version.localFilesState === 'present'
        );
        if (!selectedVersion) return res.status(400).json({ error: 'The selected version is not locally present' });
        nextPublicationState = ensureS3PublicationRevision(state, {
          generatedVersionId: selectedVersion.versionId,
          publishSlug,
          readerConnectionToPredecessor,
          predecessorCleanupPolicy,
        });
      }
      saveS3BundleConfig(bundleSlug, { publishSlug });
      if (nextPublicationState) saveS3PublicationState(bundleSlug, nextPublicationState);
      res.json({ publishSlug });
    } catch (error) {
      next(error);
    }
  });

  router.post('/bundles/:bundleSlug/publication-revisions/:publicationRevisionId/cancel', (req, res, next) => {
    try {
      const { bundleSlug } = req.params;
      const publicationRevisionId = requirePublicationRevisionId(req.params.publicationRevisionId);
      const state = loadS3PublicationState(bundleSlug);
      if (!state || state.pendingRevisionId !== publicationRevisionId) {
        return res.status(409).json({ error: 'This publication revision is not pending' });
      }
      const pending = state.revisions.find(revision => revision.publicationRevisionId === publicationRevisionId);
      if (!pending || pending.remoteState !== 'pending') {
        return res.status(409).json({ error: 'A published revision cannot be cancelled' });
      }
      const nextState = cancelPendingPublicationRevision(state);
      const current = currentPublicationRevision(nextState);
      if (current) saveS3BundleConfig(bundleSlug, { publishSlug: current.publishSlug });
      saveS3PublicationState(bundleSlug, nextState);
      res.json({ success: true, publishSlug: current?.publishSlug ?? loadS3ConfigForBundle(bundleSlug).publishSlug });
    } catch (error) {
      next(error);
    }
  });

  router.post('/bundles/:bundleSlug/publication-revisions/plan', (req, res, next) => {
    try {
      const { bundleSlug } = req.params;
      const { versionId: rawVersionId, readerConnectionToPredecessor, predecessorCleanupPolicy } = req.body as {
        versionId?: unknown;
        readerConnectionToPredecessor?: 'connected' | 'disconnected';
        predecessorCleanupPolicy?: 'keep' | 'delete-after-success';
      };
      const versionId = requireGeneratedBundleVersionId(rawVersionId);
      if (!['connected', 'disconnected'].includes(String(readerConnectionToPredecessor))) {
        return res.status(400).json({ error: 'readerConnectionToPredecessor is required' });
      }
      if (!['keep', 'delete-after-success'].includes(String(predecessorCleanupPolicy))) {
        return res.status(400).json({ error: 'predecessorCleanupPolicy is required' });
      }
      const version = loadGeneratedBundleVersionManifest(getBundleDirectory(bundleSlug)).versions.find(item =>
        item.versionId === versionId && item.localFilesState === 'present'
      );
      if (!version) return res.status(400).json({ error: 'The selected version is not locally present' });
      const config = loadS3ConfigForBundle(bundleSlug);
      const bucketName = loadS3Resources().s3BucketName;
      if (!config.publishSlug || !bucketName) return res.status(400).json({ error: 'S3 destination is not configured' });
      const state = loadS3PublicationState(bundleSlug, { publishSlug: config.publishSlug, bucketName })!;
      const nextState = ensureS3PublicationRevision(state, {
        generatedVersionId: versionId,
        publishSlug: config.publishSlug,
        readerConnectionToPredecessor,
        predecessorCleanupPolicy,
      });
      saveS3PublicationState(bundleSlug, nextState);
      res.json({ success: true, pendingRevisionId: nextState.pendingRevisionId });
    } catch (error) {
      next(error);
    }
  });
}

export function saveS3BundleConfig(bundleSlug: string, patch: Partial<S3ProviderConfig>): void {
  const target = PublishingProviderPaths.getBundleConfigFile(
    getConfigDirectory(),
    bundleSlug,
    S3_PROVIDER_ID,
  );
  const existing = requireValidDocument(readDurableDocument(target, s3ProviderConfigCodec), () => ({}));
  const merged: S3ProviderConfig = { ...existing, ...patch };
  writeDurableDocument({ path: target, value: merged, codec: s3ProviderConfigCodec });
}
