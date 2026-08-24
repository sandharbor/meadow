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
import type { PublishingProviderManifest } from '../../../shared_code/interfaces/IPublishingProvider.js';
import type {
  CleanupPublishedBundleOptions,
  CleanupPublishedBundleResult,
  IPublishingProviderBackend,
} from '../../../runtime/service/src/shared/publishing-provider-host/IPublishingProviderBackend.js';
import { registerS3Routes } from './internal/routes/registerS3Routes.js';
import { cleanupS3PublishedFiles } from './internal/cleanupPublishedBundle.js';
import { S3_PROVIDER_ID } from './internal/s3Config.js';
import { getS3PublicationSummary, hasRemoteS3Versions } from './internal/versioning/publicationStore.js';

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

const s3Provider: IPublishingProviderBackend = {
  manifest,
  registerRoutes(app: Express): void {
    registerS3Routes(app);
  },
  isBundlePublished,
  getBundlePublicationSummaries: getS3PublicationSummary,
  cleanupPublishedBundle,
};

export default s3Provider;
