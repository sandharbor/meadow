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

import type { Express } from 'express';
import type { PublishingProviderManifest } from '../../../contracts/interfaces/IPublishingProvider.js';
import type {
  CleanupPublishedBundleOptions,
  CleanupPublishedBundleResult,
  IPublishingProviderBackend,
  PrepareBundleRenamePublicationOptions,
} from '../../../runtime/service/src/shared/publishing-provider-host/IPublishingProviderBackend.js';
import { registerS3Routes } from './internal/routes/registerS3Routes.js';
import { cleanupS3PublishedFiles } from './internal/cleanupPublishedBundle.js';
import { loadS3ConfigForBundle, loadS3Resources, S3_PROVIDER_ID } from './internal/s3Config.js';
import {
  ensureS3PublicationRevision,
  getS3PublicationSummary,
  hasRemoteS3Versions,
  loadS3PublicationState,
  saveS3PublicationState,
} from './internal/versioning/publicationStore.js';
import { saveS3BundleConfig } from './internal/routes/providerConfigRoutes.js';
import {
  cancelPendingPublicationRevision,
  currentPublicationRevision,
  predecessorRevisionIdsForCleanup,
} from '../../../runtime/service/src/areas/bundle/sharing/versioning/publicationRevisions.js';

const manifest: PublishingProviderManifest = {
  id: S3_PROVIDER_ID,
  displayName: 'S3 Bucket',
  publishTabLabel: 'Publish to S3',
};

function isBundlePublished(bundleSlug: string): boolean {
  try {
    return hasRemoteS3Versions(bundleSlug);
  } catch {
    return false;
  }
}

async function cleanupPublishedBundle(
  options: CleanupPublishedBundleOptions,
): Promise<CleanupPublishedBundleResult> {
  return cleanupS3PublishedFiles(options);
}

function getBundleRenamePublicationPlan(bundleSlug: string) {
  const state = loadS3PublicationState(bundleSlug);
  if (!state || state.revisions.every(revision => revision.publishedAt === null)) return null;
  const current = currentPublicationRevision(state) ?? [...state.revisions].reverse().find(revision => revision.publishedAt) ?? null;
  return {
    providerId: S3_PROVIDER_ID,
    providerDisplayName: manifest.displayName,
    currentPublishSlug: loadS3ConfigForBundle(bundleSlug).publishSlug ?? current?.publishSlug ?? bundleSlug,
    currentPublicUrl: current?.remoteState === 'present' ? current.publicUrl ?? null : null,
    predecessorCleanupRevisionCount: current?.remoteState === 'present'
      ? 1 + predecessorRevisionIdsForCleanup(state, current.publicationRevisionId).length
      : 0,
  };
}

function prepareBundleRenamePublication(options: PrepareBundleRenamePublicationOptions): void {
  const bucketName = loadS3Resources().s3BucketName;
  if (!bucketName) throw new Error('S3 bucket is not configured');
  const state = loadS3PublicationState(options.bundleSlug, { publishSlug: options.publishSlug, bucketName })!;
  saveS3BundleConfig(options.bundleSlug, { publishSlug: options.publishSlug });
  saveS3PublicationState(options.bundleSlug, ensureS3PublicationRevision(state, {
    generatedVersionId: options.generatedVersionId,
    publishSlug: options.publishSlug,
    readerConnectionToPredecessor: options.readerConnectionToPredecessor,
    predecessorCleanupPolicy: options.predecessorCleanupPolicy,
  }));
}

function cancelPendingBundleRenamePublication(bundleSlug: string, restorePublishSlug: string): void {
  const state = loadS3PublicationState(bundleSlug);
  if (state) saveS3PublicationState(bundleSlug, cancelPendingPublicationRevision(state));
  saveS3BundleConfig(bundleSlug, { publishSlug: restorePublishSlug });
}

const s3Provider: IPublishingProviderBackend = {
  manifest,
  registerRoutes(app: Express): void {
    registerS3Routes(app);
  },
  isBundlePublished,
  getBundlePublicationSummaries: getS3PublicationSummary,
  cleanupPublishedBundle,
  getBundleRenamePublicationPlan,
  prepareBundleRenamePublication,
  cancelPendingBundleRenamePublication,
};

export default s3Provider;
