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
  PUBLISH_SLUG_PATTERN,
  S3_PROVIDER_ID,
  s3ProviderConfigCodec,
  type S3ProviderConfig,
} from '../s3Config.js';
import { hasRemoteS3Versions } from '../versioning/publicationStore.js';
import {
  readDurableDocument,
  requireValidDocument,
  writeDurableDocument,
} from '../../../../../shared_code/utils/durableDocument.js';

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

      const { publishSlug } = req.body as { publishSlug?: string };
      if (typeof publishSlug !== 'string' || !PUBLISH_SLUG_PATTERN.test(publishSlug)) {
        return res.status(400).json({
          error: 'publishSlug must contain only lowercase letters, numbers, and dashes',
        });
      }

      const current = loadS3ConfigForBundle(bundleSlug).publishSlug;
      if (current && current !== publishSlug && hasRemoteS3Versions(bundleSlug)) {
        return res.status(409).json({
          error: 'publishSlug cannot change while this destination still has remote versions',
        });
      }

      saveBundleConfig(bundleSlug, { publishSlug });
      res.json({ publishSlug });
    } catch (error) {
      next(error);
    }
  });
}

function saveBundleConfig(bundleSlug: string, patch: Partial<S3ProviderConfig>): void {
  const target = PublishingProviderPaths.getBundleConfigFile(
    getConfigDirectory(),
    bundleSlug,
    S3_PROVIDER_ID,
  );
  const existing = requireValidDocument(readDurableDocument(target, s3ProviderConfigCodec), () => ({}));
  const merged: S3ProviderConfig = { ...existing, ...patch };
  writeDurableDocument({ path: target, value: merged, codec: s3ProviderConfigCodec });
}
