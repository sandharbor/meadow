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
  getSitePresetId,
} from '../utils/stylePresetsLoader.js';
import { loadAppConfig, saveAppConfig } from '../../../shared_code/utils/appConfigUtils.js';
import { loadSiteConfig, saveSiteConfig } from '../utils/siteConfigUtils.js';
import { getConfigDirectory, getSitesDirectory } from './siteConfigRoutes.js';

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

// GET /api/presets - List all available presets
router.get('/presets', asyncHandler((_req, res) => {
  const presets = loadPresetsRegistry();
  res.json({ presets });
}));

// GET /api/presets/global - Get current global preset ID
router.get('/presets/global', asyncHandler((_req, res) => {
  const presetId = getGlobalPresetId();
  const preset = getPresetById(presetId);
  res.json({ presetId, preset });
}));

// PUT /api/presets/global - Update global preset
router.put('/presets/global', asyncHandler((req, res) => {
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

// GET /api/presets/site/:siteSlug - Get site preset + effective preset
router.get('/presets/site/:siteSlug', asyncHandler((req, res) => {
  const { siteSlug } = req.params;

  if (!siteSlug) {
    res.status(400).json({ error: 'siteSlug is required' });
    return;
  }

  const sitePresetId = getSitePresetId(siteSlug);
  const effectivePresetId = getEffectivePresetId(siteSlug);
  const effectivePreset = getPresetById(effectivePresetId);

  res.json({
    sitePresetId, // undefined means inheriting from global
    effectivePresetId,
    effectivePreset,
    isInherited: sitePresetId === undefined,
  });
}));

// PUT /api/presets/site/:siteSlug - Update site preset
router.put('/presets/site/:siteSlug', asyncHandler((req, res) => {
  const { siteSlug } = req.params;
  const { presetId } = req.body as { presetId?: string | null };

  if (!siteSlug) {
    res.status(400).json({ error: 'siteSlug is required' });
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

  // Update site config
  const sitesDir = getSitesDirectory();
  const siteDir = path.join(sitesDir, siteSlug);
  const siteConfig = loadSiteConfig(siteDir);

  if (presetId) {
    siteConfig.stylePresetId = presetId;
  } else {
    // Clear the site preset to inherit from global
    delete siteConfig.stylePresetId;
  }

  saveSiteConfig(siteDir, siteConfig);

  // Return updated state
  const effectivePresetId = getEffectivePresetId(siteSlug);
  const effectivePreset = getPresetById(effectivePresetId);

  res.json({
    success: true,
    sitePresetId: siteConfig.stylePresetId,
    effectivePresetId,
    effectivePreset,
    isInherited: !siteConfig.stylePresetId,
  });
}));

export default router;
