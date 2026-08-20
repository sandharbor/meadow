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

import express from 'express';
import {
  BundleTrackingOperationError,
  trackBundleNodes,
} from '../services/bundleTrackingOperations.js';
import { WorkingGraphOperationError } from '../services/workingGraphService.js';

const router = express.Router();

router.post('/bundles/:bundleSlug/curation/track-nodes', (req, res, next) => {
  void (async () => {
    const { bundleSlug } = req.params;
    const body = (req.body ?? {}) as { nodeKeys?: unknown; allSafe?: unknown };
    if (body.allSafe === true && body.nodeKeys !== undefined) {
      return res.status(400).json({ error: 'Choose either allSafe or nodeKeys, not both' });
    }
    if (body.allSafe !== true && !Array.isArray(body.nodeKeys)) {
      return res.status(400).json({ error: 'Provide allSafe: true or a nodeKeys array' });
    }
    if (Array.isArray(body.nodeKeys) && !body.nodeKeys.every(key => typeof key === 'string' && key.length > 0)) {
      return res.status(400).json({ error: 'Every node key must be a non-empty string' });
    }
    try {
      const result = await trackBundleNodes(
        bundleSlug,
        body.allSafe === true
          ? { mode: 'all-safe' }
          : { mode: 'targeted', nodeKeys: body.nodeKeys as string[] },
      );
      res.json(result);
    } catch (error) {
      if (error instanceof BundleTrackingOperationError || error instanceof WorkingGraphOperationError) {
        return res.status(error.statusCode).json({ error: error.message, ...error.details });
      }
      next(error);
    }
  })().catch(next);
});

export default router;
