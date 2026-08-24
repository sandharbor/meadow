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
import * as path from 'path';
import {
  loadPresetsRegistry,
  getPresetById,
  getEffectivePresetId,
  getGlobalPresetId,
  getBundlePresetId,
} from '../utils/stylePresetsLoader.js';
import { loadAppConfig, saveAppConfig } from '../../../../../../../shared_code/utils/appConfigUtils.js';
import { loadBundleConfig, saveBundleConfig } from '../../../../shared/utils/bundleConfigUtils.js';
import { getConfigDirectory, getBundlesDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';

const router = express.Router();

// Wrapper to handle async errors
const asyncHandler = (fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void> | void) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const result = fn(req, res, next);
      if (result instanceof Promise) {
        result.catch(next);
      }
    } catch (error) {
      next(error);
    }
  };
};

// GET /api/generation/style-presets - List all available presets
router.get('/generation/style-presets', asyncHandler((_req, res) => {
  const presets = loadPresetsRegistry();
  res.json({ presets });
}));

// GET /api/generation/style-presets/global - Get current global preset ID
router.get('/generation/style-presets/global', asyncHandler((_req, res) => {
  const presetId = getGlobalPresetId();
  const preset = getPresetById(presetId);
  res.json({ presetId, preset });
}));

// PUT /api/generation/style-presets/global - Update global preset
router.put('/generation/style-presets/global', asyncHandler((req, res) => {
  const { presetId } = req.body as { presetId?: string };

  if (!presetId || typeof presetId !== 'string') {
    res.status(400).json({ error: 'presetId is required and must be a string' });
    return;
  }

  // Validate the preset exists
  const preset = getPresetById(presetId);
  if (!preset) {
    res.status(400).json({ error: `Preset '${presetId}' not found` });
    return;
  }

  // Update app config
  const configDir = getConfigDirectory();
  const appConfig = loadAppConfig(configDir);
  appConfig.globalStylePresetId = presetId;
  saveAppConfig(appConfig, configDir);

  res.json({ success: true, presetId, preset });
}));

// GET /api/bundles/:bundleSlug/generation/style-preset - Get bundle preset + effective preset
router.get('/bundles/:bundleSlug/generation/style-preset', asyncHandler((req, res) => {
  const { bundleSlug } = req.params;

  if (!bundleSlug) {
    res.status(400).json({ error: 'bundleSlug is required' });
    return;
  }

  const bundlePresetId = getBundlePresetId(bundleSlug);
  const effectivePresetId = getEffectivePresetId(bundleSlug);
  const effectivePreset = getPresetById(effectivePresetId);

  res.json({
    bundlePresetId, // undefined means inheriting from global
    effectivePresetId,
    effectivePreset,
    isInherited: bundlePresetId === undefined,
  });
}));

// PUT /api/bundles/:bundleSlug/generation/style-preset - Update bundle preset
router.put('/bundles/:bundleSlug/generation/style-preset', asyncHandler((req, res) => {
  const { bundleSlug } = req.params;
  const { presetId } = req.body as { presetId?: string | null };

  if (!bundleSlug) {
    res.status(400).json({ error: 'bundleSlug is required' });
    return;
  }

  // presetId can be null/undefined to clear (inherit from global) or a string
  if (presetId !== null && presetId !== undefined && typeof presetId !== 'string') {
    res.status(400).json({ error: 'presetId must be a string or null' });
    return;
  }

  // If setting a specific preset, validate it exists
  if (presetId) {
    const preset = getPresetById(presetId);
    if (!preset) {
      res.status(400).json({ error: `Preset '${presetId}' not found` });
      return;
    }
  }

  // Update bundle config
  const bundlesDir = getBundlesDirectory();
  const bundleDir = path.join(bundlesDir, bundleSlug);
  const bundleConfig = loadBundleConfig(bundleDir);

  if (presetId) {
    bundleConfig.stylePresetId = presetId;
  } else {
    // Clear the bundle preset to inherit from global
    delete bundleConfig.stylePresetId;
  }

  saveBundleConfig(bundleDir, bundleConfig);

  // Return updated state
  const effectivePresetId = getEffectivePresetId(bundleSlug);
  const effectivePreset = getPresetById(effectivePresetId);

  res.json({
    success: true,
    bundlePresetId: bundleConfig.stylePresetId,
    effectivePresetId,
    effectivePreset,
    isInherited: !bundleConfig.stylePresetId,
  });
}));

export default router;
