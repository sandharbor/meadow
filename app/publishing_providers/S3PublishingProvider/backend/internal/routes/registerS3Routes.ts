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

import express, { type Express } from 'express';
import { registerS3PublishRoute } from './publishRoute.js';
import { registerS3DeletePublishedRoute } from './deletePublishedRoute.js';
import { registerS3PublishedReadRoutes } from './publishedReadRoutes.js';
import { registerS3ProviderConfigRoutes } from './providerConfigRoutes.js';
import { registerS3ConfigurationRoutes } from './configurationRoutes.js';

/**
 * Mount point for every S3PublishingProvider HTTP endpoint. Composed URL:
 * `${S3_API_PREFIX}<router-path>`.
 */
export const S3_API_PREFIX = '/api/publishing-providers/S3PublishingProvider';

export function registerS3Routes(app: Express): void {
  const router = express.Router();

  registerS3PublishRoute(router);
  registerS3DeletePublishedRoute(router);
  registerS3PublishedReadRoutes(router);
  registerS3ProviderConfigRoutes(router);
  registerS3ConfigurationRoutes(router);

  app.use(S3_API_PREFIX, router);
}
