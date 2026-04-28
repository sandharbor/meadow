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

import type { CleanupPublishedSiteOptions, CleanupPublishedSiteResult } from '../../../../backend/src/publishing/IPublishingProviderBackend.js';
import { logger } from '../../../../backend/src/utils/logging/backendLoggingUtils.js';
import { createS3Client, describeS3Error, requireBucket } from './s3Client.js';
import { deletePrefix } from './s3Operations.js';
import { loadS3ConfigForSite, loadS3Resources, loadS3Secrets } from './s3Config.js';

export async function cleanupS3PublishedFiles(
  options: CleanupPublishedSiteOptions,
): Promise<CleanupPublishedSiteResult> {
  const { siteSlug, onProgress } = options;

  const siteConfig = loadS3ConfigForSite(siteSlug);
  if (!siteConfig.publishSlug) {
    return { warning: undefined };
  }

  const resources = loadS3Resources();
  let bucket: string;
  try {
    bucket = requireBucket(resources);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[S3PublishingProvider] cleanup skipped:', message);
    return { warning: message };
  }

  const secrets = loadS3Secrets();
  const client = createS3Client(resources, secrets);
  onProgress({ stage: 'deleting-s3', message: 'Deleting published files from S3...' });

  try {
    const { filesDeleted } = await deletePrefix(client, bucket, siteConfig.publishSlug);
    onProgress({
      stage: 'deleting-s3',
      message: `Deleted ${filesDeleted} files from S3`,
      filesDeleted,
      totalFiles: filesDeleted,
    });
    return {};
  } catch (err) {
    logger.warn('[S3PublishingProvider] S3 delete failed:', err);
    return { warning: `Could not delete published files from S3: ${describeS3Error(err)}` };
  }
}
