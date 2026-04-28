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
import { getSiteDirectory } from '../../../../../backend/src/routes/siteConfigRoutes.js';
import { updateSiteConfig } from '../../../../../backend/src/utils/siteConfigUtils.js';
import { logger } from '../../../../../backend/src/utils/logging/backendLoggingUtils.js';
import { createS3Client, describeS3Error, requireBucket } from '../s3Client.js';
import { deletePrefix } from '../s3Operations.js';
import { loadS3ConfigForSite, loadS3Resources, loadS3Secrets } from '../s3Config.js';

/**
 * DELETE /sites/:siteSlug/published — remove every object under the site's
 * publishSlug prefix and clear siteLastPublishedAt. Used by the "Delete
 * site's published files" option in the publish tab's Settings dropdown.
 */
export function registerS3DeletePublishedRoute(router: Router): void {
  router.delete('/sites/:siteSlug/published', (req, res, next) => {
    (async () => {
      const { siteSlug } = req.params;
      if (!siteSlug) return res.status(400).json({ error: 'siteSlug is required' });

      const siteDirectory = getSiteDirectory(siteSlug);
      if (!fs.existsSync(siteDirectory)) {
        return res.status(404).json({ error: `Site '${siteSlug}' not found` });
      }

      const siteConfig = loadS3ConfigForSite(siteSlug);
      if (!siteConfig.publishSlug) {
        // No publishSlug means the site was never published through this
        // provider — treat as success so the UI can reflect "nothing to
        // delete" without a blocking error.
        return res.json({ success: true, filesDeleted: 0 });
      }

      const resources = loadS3Resources();
      let bucket: string;
      try {
        bucket = requireBucket(resources);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return res.status(500).json({ error: message });
      }

      const secrets = loadS3Secrets();
      const client = createS3Client(resources, secrets);
      try {
        const { filesDeleted } = await deletePrefix(client, bucket, siteConfig.publishSlug);
        try {
          updateSiteConfig(siteDirectory, { siteLastPublishedAt: null });
        } catch (error) {
          logger.warn('[S3PublishingProvider] Could not clear siteLastPublishedAt:', error);
        }
        res.json({ success: true, filesDeleted });
      } catch (err) {
        logger.error('[S3PublishingProvider] delete-published failed:', err);
        res.status(502).json({ error: describeS3Error(err) });
      }
    })().catch(next);
  });
}
