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

/**
 * Shapes and accessors for S3PublishingProvider config, resources, and
 * secrets.
 *
 *   <CONF_DIR>/app/publishing_providers/S3PublishingProvider/
 *     pp_config.yaml         { isActive }
 *     pp_resources.yaml      { s3BucketName, s3Endpoint, s3ForcePathStyle, s3Region,
 *                              webBaseUrl }
 *     pp_resources.local.yaml  (same shape; per-copy overrides, gitignored)
 *     pp_secrets.yaml        { s3AccessKeyId, s3SecretAccessKey } (gitignored)
 *
 *   <CONF_DIR>/sites/<slug>/config/publishing_providers/S3PublishingProvider/
 *     pp_config.yaml         { publishSlug }
 *
 * No `publishPrefix` here — the S3 provider doesn't partition user sites
 * from each other. A single MeadowHome instance maps a site to exactly one
 * S3 prefix equal to `publishSlug`.
 */

import fs from 'fs';
import YAML from 'yaml';
import {
  loadProviderConfig,
  loadProviderResources,
  loadProviderSecrets,
} from '../../../../shared_code/utils/publishingProviderConfigUtils.js';
import { PublishingProviderPaths } from '../../../../shared_code/paths/publishingProviderPaths.js';
import { getConfigDirectory } from '../../../../backend/src/routes/siteConfigRoutes.js';
import type {
  PublishingProviderConfigBase,
  PublishingProviderSecretsBase,
} from '../../../../shared_code/interfaces/PublishingProviderConfig.js';

export const S3_PROVIDER_ID = 'S3PublishingProvider';

export interface S3ProviderConfig extends PublishingProviderConfigBase {
  isActive?: boolean;
  publishSlug?: string;
}

export interface S3ProviderResources extends PublishingProviderConfigBase {
  s3BucketName?: string;
  s3Endpoint?: string;
  s3ForcePathStyle?: boolean;
  s3Region?: string;
  /**
   * Base URL under which published sites are served. E.g. with
   * `https://cdn.example.com` and publishSlug `foo`, the published URL is
   * `https://cdn.example.com/foo/index.html`.
   */
  webBaseUrl?: string;
}

export interface S3ProviderSecrets extends PublishingProviderSecretsBase {
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
}

export function loadS3Config(): S3ProviderConfig {
  return loadProviderConfig<S3ProviderConfig>(S3_PROVIDER_ID, {
    configDir: getConfigDirectory(),
  });
}

export function loadS3ConfigForSite(siteSlug: string): S3ProviderConfig {
  return loadProviderConfig<S3ProviderConfig>(S3_PROVIDER_ID, {
    configDir: getConfigDirectory(),
    siteSlug,
  });
}

export function loadS3Resources(): S3ProviderResources {
  return loadProviderResources<S3ProviderResources>(S3_PROVIDER_ID, {
    configDir: getConfigDirectory(),
  });
}

export function loadS3Secrets(): S3ProviderSecrets {
  return loadProviderSecrets<S3ProviderSecrets>(S3_PROVIDER_ID, {
    configDir: getConfigDirectory(),
  });
}

export function saveS3Resources(patch: Partial<S3ProviderResources>): S3ProviderResources {
  const target = PublishingProviderPaths.getGlobalResourcesFile(getConfigDirectory(), S3_PROVIDER_ID);
  return writeYamlPatch<S3ProviderResources>(target, patch);
}

export function saveS3Secrets(patch: Partial<S3ProviderSecrets>): void {
  const target = PublishingProviderPaths.getGlobalSecretsFile(getConfigDirectory(), S3_PROVIDER_ID);
  writeYamlPatch<S3ProviderSecrets>(target, patch);
}

function writeYamlPatch<T extends object>(target: string, patch: Partial<T>): T {
  const dir = target.substring(0, target.lastIndexOf('/'));
  fs.mkdirSync(dir, { recursive: true });
  let existing: T = {} as T;
  if (fs.existsSync(target)) {
    try {
      existing = (YAML.parse(fs.readFileSync(target, 'utf8')) as T) ?? ({} as T);
    } catch {
      existing = {} as T;
    }
  }
  const merged = { ...existing, ...patch } as T;
  fs.writeFileSync(target, YAML.stringify(merged), 'utf8');
  return merged;
}

export const PUBLISH_SLUG_PATTERN = /^[a-z0-9-]+$/;

/**
 * Trim and strip trailing slashes. The protocol is whatever the user stored
 * (e.g. http:// for a plain S3 website endpoint, https:// for CDN-fronted)
 * — we honor it verbatim instead of guessing.
 */
export function normalizeWebBaseUrl(raw: string | undefined | null): string {
  return (raw ?? '').trim().replace(/\/+$/, '');
}
