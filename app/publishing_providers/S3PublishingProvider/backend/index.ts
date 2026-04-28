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
  CleanupPublishedSiteOptions,
  CleanupPublishedSiteResult,
  IPublishingProviderBackend,
} from '../../../backend/src/publishing/IPublishingProviderBackend.js';
import { getSiteDirectory } from '../../../backend/src/routes/siteConfigRoutes.js';
import { loadSiteConfig } from '../../../backend/src/utils/siteConfigUtils.js';
import { registerS3Routes } from './internal/routes/registerS3Routes.js';
import { cleanupS3PublishedFiles } from './internal/cleanupPublishedSite.js';
import { loadS3ConfigForSite, loadS3Resources, S3_PROVIDER_ID } from './internal/s3Config.js';

const manifest: PublishingProviderManifest = {
  id: S3_PROVIDER_ID,
  displayName: 'S3 Bucket',
  publishTabLabel: 'Publish to S3',
};

function isSitePublished(siteSlug: string): boolean {
  try {
    const siteDirectory = getSiteDirectory(siteSlug);
    const siteConfig = loadSiteConfig(siteDirectory);
    const s3SiteConfig = loadS3ConfigForSite(siteSlug);
    const resources = loadS3Resources();
    return !!(
      siteConfig.siteLastPublishedAt &&
      s3SiteConfig.publishSlug &&
      resources.s3BucketName
    );
  } catch {
    return false;
  }
}

async function cleanupPublishedSite(
  options: CleanupPublishedSiteOptions,
): Promise<CleanupPublishedSiteResult> {
  return cleanupS3PublishedFiles(options);
}

const s3Provider: IPublishingProviderBackend = {
  manifest,
  registerRoutes(app: Express): void {
    registerS3Routes(app);
  },
  isSitePublished,
  cleanupPublishedSite,
};

export default s3Provider;
