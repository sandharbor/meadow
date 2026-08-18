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
 *   <CONF_DIR>/bundles/<slug>/config/publishing_providers/S3PublishingProvider/
 *     pp_config.yaml         { publishSlug }
 *
 * No `publishPrefix` here — the S3 provider doesn't partition user bundles
 * from each other. A single MeadowHome instance maps a bundle to exactly one
 * S3 prefix equal to `publishSlug`.
 */

import {
  loadProviderConfig,
  loadProviderResources,
  loadProviderSecrets,
} from '../../../../shared_code/utils/publishingProviderConfigUtils.js';
import { PublishingProviderPaths } from '../../../../shared_code/paths/publishingProviderPaths.js';
import { getConfigDirectory } from '../../../../backend/src/shared/bundle-config/bundleConfigPaths.js';
import type {
  PublishingProviderConfigBase,
  PublishingProviderSecretsBase,
} from '../../../../shared_code/interfaces/PublishingProviderConfig.js';
import {
  extensibleObjectValidation,
  readDurableDocument,
  requireValidDocument,
  writeDurableDocument,
  yamlDocumentCodec,
  type DurableDocumentCodec,
} from '../../../../shared_code/utils/durableDocument.js';

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
   * Base URL under which published bundles are served. E.g. with
   * `https://cdn.example.com` and publishSlug `foo`, the published URL is
   * `https://cdn.example.com/foo/index.html`.
   */
  webBaseUrl?: string;
}

export interface S3ProviderSecrets extends PublishingProviderSecretsBase {
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
}

function validateKnownFields(
  value: Record<string, unknown>,
  fields: Record<string, 'string' | 'boolean'>,
): string | null {
  for (const [field, expected] of Object.entries(fields)) {
    if (value[field] !== undefined && typeof value[field] !== expected) {
      return `$.${field} must be a ${expected}`;
    }
  }
  return null;
}

export const s3ProviderConfigCodec = yamlDocumentCodec<S3ProviderConfig>(value =>
  extensibleObjectValidation<S3ProviderConfig>(value, record =>
    validateKnownFields(record, { isActive: 'boolean', publishSlug: 'string' }),
  ),
);
export const s3ProviderResourcesCodec = yamlDocumentCodec<S3ProviderResources>(value =>
  extensibleObjectValidation<S3ProviderResources>(value, record =>
    validateKnownFields(record, {
      s3BucketName: 'string',
      s3Endpoint: 'string',
      s3ForcePathStyle: 'boolean',
      s3Region: 'string',
      webBaseUrl: 'string',
    }),
  ),
);
export const s3ProviderSecretsCodec = yamlDocumentCodec<S3ProviderSecrets>(value =>
  extensibleObjectValidation<S3ProviderSecrets>(value, record =>
    validateKnownFields(record, { s3AccessKeyId: 'string', s3SecretAccessKey: 'string' }),
  ),
);

export function loadS3Config(): S3ProviderConfig {
  return loadProviderConfig<S3ProviderConfig>(S3_PROVIDER_ID, {
    configDir: getConfigDirectory(),
  });
}

export function loadS3ConfigForBundle(bundleSlug: string): S3ProviderConfig {
  return loadProviderConfig<S3ProviderConfig>(S3_PROVIDER_ID, {
    configDir: getConfigDirectory(),
    bundleSlug,
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
  return writeYamlPatch(target, patch, s3ProviderResourcesCodec);
}

export function saveS3Secrets(patch: Partial<S3ProviderSecrets>): void {
  const target = PublishingProviderPaths.getGlobalSecretsFile(getConfigDirectory(), S3_PROVIDER_ID);
  writeYamlPatch(target, patch, s3ProviderSecretsCodec, 0o600);
}

function writeYamlPatch<T extends object>(
  target: string,
  patch: Partial<T>,
  codec: DurableDocumentCodec<T>,
  mode = 0o644,
): T {
  const existing = requireValidDocument(readDurableDocument(target, codec), () => ({} as T));
  const merged = { ...existing, ...patch } as T;
  writeDurableDocument({ path: target, value: merged, codec, mode });
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
