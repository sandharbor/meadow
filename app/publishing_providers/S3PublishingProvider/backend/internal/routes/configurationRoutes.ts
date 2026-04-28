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
import {
  loadS3Resources,
  loadS3Secrets,
  saveS3Resources,
  saveS3Secrets,
  type S3ProviderResources,
} from '../s3Config.js';

interface ConfigurationGetResponse {
  s3BucketName: string;
  s3Region: string;
  s3Endpoint: string;
  s3ForcePathStyle: boolean;
  webBaseUrl: string;
  s3AccessKeyId: string;
  hasSecretAccessKey: boolean;
}

interface ConfigurationPutBody {
  s3BucketName?: string;
  s3Region?: string;
  s3Endpoint?: string;
  s3ForcePathStyle?: boolean;
  webBaseUrl?: string;
  s3AccessKeyId?: string;
  /** Omitted = leave unchanged. Empty string = clear. */
  s3SecretAccessKey?: string;
}

/**
 * Global configuration for the S3 publishing provider — bucket settings
 * (pp_resources.yaml) plus credentials (pp_secrets.yaml). The secret access
 * key is never returned by the bulk GET; the dedicated `/secret` endpoint
 * returns it on explicit request from the "show" toggle.
 */
export function registerS3ConfigurationRoutes(router: Router): void {
  router.get('/configuration', (_req, res, next) => {
    try {
      const resources = loadS3Resources();
      const secrets = loadS3Secrets();
      const body: ConfigurationGetResponse = {
        s3BucketName: resources.s3BucketName ?? '',
        s3Region: resources.s3Region ?? '',
        s3Endpoint: resources.s3Endpoint ?? '',
        s3ForcePathStyle: !!resources.s3ForcePathStyle,
        webBaseUrl: resources.webBaseUrl ?? '',
        s3AccessKeyId: secrets.s3AccessKeyId ?? '',
        hasSecretAccessKey: !!secrets.s3SecretAccessKey,
      };
      res.json(body);
    } catch (error) {
      next(error);
    }
  });

  router.put('/configuration', (req, res, next) => {
    try {
      const body = (req.body ?? {}) as ConfigurationPutBody;

      const resourcesPatch: Partial<S3ProviderResources> = {};
      if (typeof body.s3BucketName === 'string') resourcesPatch.s3BucketName = body.s3BucketName.trim();
      if (typeof body.s3Region === 'string') resourcesPatch.s3Region = body.s3Region.trim();
      if (typeof body.s3Endpoint === 'string') resourcesPatch.s3Endpoint = body.s3Endpoint.trim();
      if (typeof body.s3ForcePathStyle === 'boolean') resourcesPatch.s3ForcePathStyle = body.s3ForcePathStyle;
      if (typeof body.webBaseUrl === 'string') resourcesPatch.webBaseUrl = body.webBaseUrl.trim();

      if (Object.keys(resourcesPatch).length > 0) {
        saveS3Resources(resourcesPatch);
      }

      if (typeof body.s3AccessKeyId === 'string' || typeof body.s3SecretAccessKey === 'string') {
        const secretsPatch: { s3AccessKeyId?: string; s3SecretAccessKey?: string } = {};
        if (typeof body.s3AccessKeyId === 'string') secretsPatch.s3AccessKeyId = body.s3AccessKeyId.trim();
        if (typeof body.s3SecretAccessKey === 'string') secretsPatch.s3SecretAccessKey = body.s3SecretAccessKey;
        saveS3Secrets(secretsPatch);
      }

      const resources = loadS3Resources();
      const secrets = loadS3Secrets();
      const response: ConfigurationGetResponse = {
        s3BucketName: resources.s3BucketName ?? '',
        s3Region: resources.s3Region ?? '',
        s3Endpoint: resources.s3Endpoint ?? '',
        s3ForcePathStyle: !!resources.s3ForcePathStyle,
        webBaseUrl: resources.webBaseUrl ?? '',
        s3AccessKeyId: secrets.s3AccessKeyId ?? '',
        hasSecretAccessKey: !!secrets.s3SecretAccessKey,
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  router.get('/configuration/secret', (_req, res, next) => {
    try {
      const secrets = loadS3Secrets();
      res.json({ s3SecretAccessKey: secrets.s3SecretAccessKey ?? '' });
    } catch (error) {
      next(error);
    }
  });
}
