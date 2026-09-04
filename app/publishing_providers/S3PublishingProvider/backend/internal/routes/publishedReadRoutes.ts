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
import { getBundleDirectory } from '../../../../../runtime/service/src/shared/bundle-config/bundleConfigPaths.js';
import { requireGeneratedBundleVersionId } from '../../../../../runtime/service/src/shared/generated-bundle-versioning/generatedBundleVersionDomain.js';
import { loadGeneratedBundleVersionManifest } from '../../../../../runtime/service/src/shared/generated-bundle-versioning/generatedBundleVersionManifestService.js';
import { inspectGeneratedVersionGitState } from '../../../../../runtime/service/src/shared/generated-bundle-versioning/generatedBundleVersionGitService.js';
import {
  loadS3PublicationState,
  remotelyPresentS3VersionIds,
} from '../versioning/publicationStore.js';

export function registerS3PublishedReadRoutes(router: Router): void {
  router.get('/bundles/:bundleSlug/publication-state', (req, res, next) => {
    try {
      const { bundleSlug } = req.params;
      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
      const bundleDirectory = getBundleDirectory(bundleSlug);
      if (!fs.existsSync(bundleDirectory)) return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
      const state = loadS3PublicationState(bundleSlug);
      if (!state) return res.json({ providerInstanceId: null, status: { kind: 'not-published' }, revisions: [], remotelyPresentVersionIds: [] });
      const localManifest = loadGeneratedBundleVersionManifest(bundleDirectory);
      const requested = typeof req.query.versionId === 'string' ? req.query.versionId : localManifest.versions.at(-1)?.versionId;
      if (!requested) return res.json({ providerInstanceId: state.providerInstanceId, destinationIdentity: state.destinationIdentity, status: { kind: 'not-published' }, revisions: state.revisions, remotelyPresentVersionIds: [] });
      const versionId = requireGeneratedBundleVersionId(requested);
      const localEntry = localManifest.versions.find(entry => entry.versionId === versionId);
      const savedGenerationId = localEntry?.localFilesState === 'present'
        ? inspectGeneratedVersionGitState(bundleDirectory, versionId).savedGenerationId
        : localEntry?.lastSavedGenerationId ?? null;
      const revision = [...state.revisions].reverse().find(item => item.generatedVersionId === versionId);
      const status = !revision || revision.remoteState === 'pending'
        ? { kind: 'not-published' as const }
        : revision.remoteState === 'deleted'
          ? { kind: 'removed' as const, revision }
          : revision.latestSuccessfulSavedGenerationId === 'unknown'
            ? { kind: 'imported-unknown' as const, revision }
            : savedGenerationId !== null && revision.latestSuccessfulSavedGenerationId === savedGenerationId
              ? { kind: 'published-current' as const, revision }
              : { kind: 'update-available' as const, revision };
      res.json({
        providerInstanceId: state.providerInstanceId,
        destinationIdentity: state.destinationIdentity,
        status,
        revisions: state.revisions,
        currentRevisionId: state.currentRevisionId,
        pendingRevisionId: state.pendingRevisionId,
        remotelyPresentVersionIds: [...remotelyPresentS3VersionIds(state)],
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/bundles/:bundleSlug/published-url', (req, res, next) => {
    try {
      const { bundleSlug } = req.params;
      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
      const state = loadS3PublicationState(bundleSlug);
      if (!state) return res.status(404).json({ error: 'Bundle has not been published yet' });
      const requested = typeof req.query.versionId === 'string' ? req.query.versionId : null;
      const latest = requested
        ? [...state.revisions].reverse().find(revision => revision.generatedVersionId === requested)
        : state.revisions.find(revision => revision.publicationRevisionId === state.currentRevisionId);
      if (!latest || latest.remoteState !== 'present' || !latest.publicUrl) {
        return res.status(404).json({ error: 'Selected version is not remotely present' });
      }
      res.json({ url: latest.publicUrl, versionId: latest.generatedVersionId, publicationRevisionId: latest.publicationRevisionId });
    } catch (error) {
      next(error);
    }
  });

  router.get('/bundles/:bundleSlug/published-file-counts', (req, res, next) => {
    try {
      const { bundleSlug } = req.params;
      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
      const state = loadS3PublicationState(bundleSlug);
      const remoteVersionCount = state ? remotelyPresentS3VersionIds(state).size : 0;
      // This deliberately avoids a remote inventory request merely to render UI.
      res.json({ htmlCount: remoteVersionCount, otherCount: 0, isVersionCount: true });
    } catch (error) {
      next(error);
    }
  });
}
