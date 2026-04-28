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
import YAML from 'yaml';
import { PublishingProviderPaths } from '../../../../../shared_code/paths/publishingProviderPaths.js';
import {
  getConfigDirectory,
  getSiteDirectory,
} from '../../../../../backend/src/routes/siteConfigRoutes.js';
import {
  loadS3ConfigForSite,
  PUBLISH_SLUG_PATTERN,
  S3_PROVIDER_ID,
  type S3ProviderConfig,
} from '../s3Config.js';

/**
 * Per-site S3 provider config routes. Unlike Meadow, there's no prefix — a
 * site's S3 destination is just its publishSlug.
 */
export function registerS3ProviderConfigRoutes(router: Router): void {
  router.get('/sites/:siteSlug/provider-config', (req, res, next) => {
    try {
      const { siteSlug } = req.params;
      if (!siteSlug) return res.status(400).json({ error: 'siteSlug is required' });
      if (!fs.existsSync(getSiteDirectory(siteSlug))) {
        return res.status(404).json({ error: `Site '${siteSlug}' not found` });
      }
      const { publishSlug } = loadS3ConfigForSite(siteSlug);
      res.json({ publishSlug: publishSlug ?? null });
    } catch (error) {
      next(error);
    }
  });

  router.put('/sites/:siteSlug/provider-config', (req, res, next) => {
    try {
      const { siteSlug } = req.params;
      if (!siteSlug) return res.status(400).json({ error: 'siteSlug is required' });
      if (!fs.existsSync(getSiteDirectory(siteSlug))) {
        return res.status(404).json({ error: `Site '${siteSlug}' not found` });
      }

      const { publishSlug } = req.body as { publishSlug?: string };
      if (typeof publishSlug !== 'string' || !PUBLISH_SLUG_PATTERN.test(publishSlug)) {
        return res.status(400).json({
          error: 'publishSlug must contain only lowercase letters, numbers, and dashes',
        });
      }

      saveSiteConfig(siteSlug, { publishSlug });
      res.json({ publishSlug });
    } catch (error) {
      next(error);
    }
  });
}

function saveSiteConfig(siteSlug: string, patch: Partial<S3ProviderConfig>): void {
  const target = PublishingProviderPaths.getSiteConfigFile(
    getConfigDirectory(),
    siteSlug,
    S3_PROVIDER_ID,
  );
  let existing: S3ProviderConfig = {};
  if (fs.existsSync(target)) {
    try {
      existing = (YAML.parse(fs.readFileSync(target, 'utf8')) as S3ProviderConfig) ?? {};
    } catch {
      existing = {};
    }
  } else {
    fs.mkdirSync(
      PublishingProviderPaths.getSiteProviderDir(getConfigDirectory(), siteSlug, S3_PROVIDER_ID),
      { recursive: true },
    );
  }
  const merged: S3ProviderConfig = { ...existing, ...patch };
  fs.writeFileSync(target, YAML.stringify(merged), 'utf8');
}
