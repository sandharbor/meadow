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
import { getBundleDirectory } from '../../../../../backend/src/shared/bundle-config/bundleConfigPaths.js';
import { getHtmlPathForPage } from '../../../../../backend/src/shared/utils/htmlPathLookup.js';
import { loadValidatedBundleNodeConfiguration } from '../../../../../backend/src/shared/bundle-node/bundleNodeConfigLoader.js';
import { logger } from '../../../../../backend/src/shared/utils/logging/backendLoggingUtils.js';
import { createS3Client, requireBucket } from '../s3Client.js';
import { countPrefix } from '../s3Operations.js';
import { loadS3ConfigForBundle, loadS3Resources, loadS3Secrets, normalizeWebBaseUrl } from '../s3Config.js';

export function registerS3PublishedReadRoutes(router: Router): void {
  // Published URL for the bundle (latest = current, since this provider has no versions).
  router.get('/bundles/:bundleSlug/published-url', (req, res, next) => {
    try {
      const { bundleSlug } = req.params;
      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });

      const bundleDirectory = getBundleDirectory(bundleSlug);
      if (!fs.existsSync(bundleDirectory)) {
        return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
      }

      const bundleConfig = loadS3ConfigForBundle(bundleSlug);
      if (!bundleConfig.publishSlug) {
        return res.status(404).json({ error: 'Bundle has not been published yet' });
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
        const { defaultTraversalNode } = loadValidatedBundleNodeConfiguration(bundleDirectory);
        const foundPath = getHtmlPathForPage(
          bundleDirectory,
          defaultTraversalNode.bundleNodeName,
          defaultTraversalNode.sourceGraphSubdirectory,
        );
        if (foundPath) landingPath = foundPath;
      } catch (error) {
        logger.warn('[S3PublishingProvider] Could not resolve traversal page:', error);
      }

      res.json({ url: `${webBaseUrl}/${bundleConfig.publishSlug}/${encodePathForUrl(landingPath)}` });
    } catch (error) {
      next(error);
    }
  });

  // File counts at the published prefix — drives the delete-bundle confirmation UI.
  router.get('/bundles/:bundleSlug/published-file-counts', (req, res, _next) => {
    const { bundleSlug } = req.params;
    (async () => {
      try {
        if (!bundleSlug) {
          res.status(400).json({ error: 'bundleSlug is required' });
          return;
        }

        const bundleConfig = loadS3ConfigForBundle(bundleSlug);
        if (!bundleConfig.publishSlug) {
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
        const summary = await countPrefix(client, bucket, bundleConfig.publishSlug);
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
