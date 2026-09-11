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
import { randomUUID } from 'crypto';
import { PublishingProviderOperationError } from '../../../../../runtime/service/src/shared/publishing-provider-host/IPublishingProviderBackend.js';
import { publishS3Version } from '../publishVersion.js';

export function registerS3PublishRoute(router: Router): void {
  router.post('/bundles/:bundleSlug/publish', (req, res, next) => {
    void (async () => {
      try {
        const result = await publishS3Version({
          bundleSlug: req.params.bundleSlug,
          versionId: (req.body as { versionId?: string } | undefined)?.versionId ?? '',
          operationId: randomUUID(),
        });
        res.json(result);
      } catch (error) {
        if (error instanceof PublishingProviderOperationError) {
          res.status(error.statusCode).json({ error: error.message });
          return;
        }
        throw error;
      }
    })().catch(next);
  });
}
