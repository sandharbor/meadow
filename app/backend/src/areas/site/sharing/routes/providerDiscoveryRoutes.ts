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
import { getActiveBackendProviders, getAllBackendProviders } from '../../../../shared/publishing-provider-host/providerRegistry.js';

const router = express.Router();

// Lightweight provider discovery endpoint: the frontend registry merges
// this with its own locally-known manifests so it can decide which provider
// owns the Publish tab, the "open website" button, etc.
router.get('/publishing-providers', (_req, res) => {
  const active = new Set(getActiveBackendProviders().map((p) => p.manifest.id));
  res.json({
    providers: getAllBackendProviders().map((p) => ({
      manifest: p.manifest,
      isActive: active.has(p.manifest.id),
    })),
  });
});

export default router;
