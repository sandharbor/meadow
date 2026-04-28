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
import { encodePathForUrl } from '../../../../../shared_code/utils/urlUtils.js';
import { getSiteDirectory } from '../../../../../backend/src/routes/siteConfigRoutes.js';
import { loadSiteConfig } from '../../../../../backend/src/utils/siteConfigUtils.js';
import { getHtmlPathForPage } from '../../../../../backend/src/utils/htmlPathLookup.js';
import { logger } from '../../../../../backend/src/utils/logging/backendLoggingUtils.js';
import { createS3Client, requireBucket } from '../s3Client.js';
import { countPrefix } from '../s3Operations.js';
import { loadS3ConfigForSite, loadS3Resources, loadS3Secrets, normalizeWebBaseUrl } from '../s3Config.js';

export function registerS3PublishedReadRoutes(router: Router): void {
  // Published URL for the site (latest = current, since this provider has no versions).
  router.get('/sites/:siteSlug/published-url', (req, res, next) => {
    try {
      const { siteSlug } = req.params;
      if (!siteSlug) return res.status(400).json({ error: 'siteSlug is required' });

      const siteDirectory = getSiteDirectory(siteSlug);
      if (!fs.existsSync(siteDirectory)) {
        return res.status(404).json({ error: `Site '${siteSlug}' not found` });
      }

      const siteConfig = loadS3ConfigForSite(siteSlug);
      if (!siteConfig.publishSlug) {
        return res.status(404).json({ error: 'Site has not been published yet' });
      }

      const resources = loadS3Resources();
      const webBaseUrl = normalizeWebBaseUrl(resources.webBaseUrl);
      if (!webBaseUrl) {
        return res.status(500).json({
          error: 'Web base URL is not configured. Set it under S3 configuration.',
        });
      }

      let landingPath = 'index.html';
      try {
        const coreSiteConfig = loadSiteConfig(siteDirectory);
        if (coreSiteConfig.defaultTraversalSitePageTitle) {
          const foundPath = getHtmlPathForPage(
            siteDirectory,
            coreSiteConfig.defaultTraversalSitePageTitle,
            coreSiteConfig.defaultTraversalSitePageDirectory,
          );
          if (foundPath) landingPath = foundPath;
        }
      } catch (error) {
        logger.warn('[S3PublishingProvider] Could not resolve traversal page:', error);
      }

      res.json({ url: `${webBaseUrl}/${siteConfig.publishSlug}/${encodePathForUrl(landingPath)}` });
    } catch (error) {
      next(error);
    }
  });

  // File counts at the published prefix — drives the delete-site confirmation UI.
  router.get('/sites/:siteSlug/published-file-counts', (req, res, _next) => {
    const { siteSlug } = req.params;
    (async () => {
      try {
        if (!siteSlug) {
          res.status(400).json({ error: 'siteSlug is required' });
          return;
        }

        const siteConfig = loadS3ConfigForSite(siteSlug);
        if (!siteConfig.publishSlug) {
          res.json({ htmlCount: 0, otherCount: 0 });
          return;
        }

        const resources = loadS3Resources();
        let bucket: string;
        try {
          bucket = requireBucket(resources);
        } catch {
          res.json({ htmlCount: 0, otherCount: 0 });
          return;
        }

        const secrets = loadS3Secrets();
        if (!secrets.s3AccessKeyId || !secrets.s3SecretAccessKey) {
          res.json({ htmlCount: 0, otherCount: 0 });
          return;
        }
        const client = createS3Client(resources, secrets);
        const summary = await countPrefix(client, bucket, siteConfig.publishSlug);
        res.json(summary);
      } catch (error) {
        const err = error as Error;
        logger.error('[S3PublishingProvider] file-counts failed:', err);
        res.status(500).json({ error: err.message });
      }
    })().catch((error) => {
      logger.error('[S3PublishingProvider] unexpected file-counts error:', error);
      res.status(500).json({ error: String(error) });
    });
  });
}
