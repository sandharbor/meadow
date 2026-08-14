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
import { BundleConfigPaths } from '../../../../../shared_code/paths/bundleConfigPaths.js';
import { getBundleDirectory } from '../../../../../backend/src/shared/bundle-config/bundleConfigPaths.js';
import { loadBundleConfig, updateBundleConfig } from '../../../../../backend/src/shared/utils/bundleConfigUtils.js';
import { getHtmlPathForPage } from '../../../../../backend/src/shared/utils/htmlPathLookup.js';
import { loadValidatedBundleNodeConfiguration } from '../../../../../backend/src/shared/bundle-node/bundleNodeConfigLoader.js';
import { logger } from '../../../../../backend/src/shared/utils/logging/backendLoggingUtils.js';
import { createS3Client, describeS3Error, requireBucket } from '../s3Client.js';
import { uploadDirectory } from '../s3Operations.js';
import { loadS3ConfigForBundle, loadS3Resources, loadS3Secrets, normalizeWebBaseUrl } from '../s3Config.js';

/**
 * POST /bundles/:bundleSlug/publish — upload the bundle's preview directory to S3
 * under the configured publishSlug. Returns the published URL on success.
 *
 * Intentionally synchronous (no SSE) for MVP. The preview is expected to
 * already be generated; callers run the regenerate-preview step first.
 */
export function registerS3PublishRoute(router: Router): void {
  router.post('/bundles/:bundleSlug/publish', (req, res, next) => {
    (async () => {
      const { bundleSlug } = req.params;
      if (!bundleSlug) {
        return res.status(400).json({ error: 'bundleSlug is required' });
      }

      const bundleDirectory = getBundleDirectory(bundleSlug);
      if (!fs.existsSync(bundleDirectory)) {
        return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
      }

      const generatedHtmlDir = BundleConfigPaths.getGeneratedHtmlDir(bundleDirectory);
      if (!fs.existsSync(generatedHtmlDir)) {
        return res.status(400).json({
          error: 'No preview found. Please generate a preview before publishing.',
        });
      }

      const bundleConfig = loadS3ConfigForBundle(bundleSlug);
      if (!bundleConfig.publishSlug) {
        return res.status(400).json({
          error: 'publishSlug is not set. Open the Publish tab and set it before publishing.',
        });
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
      if (!secrets.s3AccessKeyId || !secrets.s3SecretAccessKey) {
        return res.status(400).json({
          error:
            'No S3 credentials are configured. Set an access key id and secret access key under S3 configuration.',
        });
      }

      const client = createS3Client(resources, secrets);
      try {
        const result = await uploadDirectory(client, bucket, bundleConfig.publishSlug, generatedHtmlDir);

        try {
          updateBundleConfig(bundleDirectory, { bundleLastPublishedAt: new Date().toISOString() });
        } catch (error) {
          logger.warn('[S3PublishingProvider] Could not update bundleLastPublishedAt:', error);
        }

        const normalizedBase = normalizeWebBaseUrl(resources.webBaseUrl);
        let publishedUrl: string | undefined;
        if (normalizedBase) {
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
          publishedUrl = `${normalizedBase}/${bundleConfig.publishSlug}/${encodePathForUrl(landingPath)}`;
        }

        res.json({
          success: true,
          publishedUrl,
          filesUploaded: result.filesUploaded,
          totalBytes: result.totalBytes,
        });
      } catch (err) {
        logger.error('[S3PublishingProvider] publish failed:', err);
        res.status(502).json({ error: describeS3Error(err) });
      }
    })().catch(next);
  });
}
