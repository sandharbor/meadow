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
  loadAppConfig,
  updateAllowImagesToExtendToFrontier,
  updateManageGitAutomatically,
  updateGenerationOptions,
  updateCalloutDismissal,
} from '../../../shared_code/utils/appConfigUtils.js';
import { loadResourcesConfig } from '../../../shared_code/utils/resourcesConfigUtils.js';
import { CalloutDismissals } from '../../../shared_code/types/appConfig.js';
import { getConfigDirectory } from './siteConfigRoutes.js';
import { AppConfigGitUtils, GIT_AUTHORS } from '../../../shared_code/utils/appConfigGitUtils.js';
import { AppConfigPaths } from '../../../shared_code/paths/appConfigPaths.js';

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

// Get app config (merges core settings with resources for a single
// frontend-facing view).
router.get('/app-config', asyncHandler((req, res) => {
  const settings = loadAppConfig(getConfigDirectory());
  const resources = loadResourcesConfig(getConfigDirectory());
  res.json({
    ...settings,
    ...resources,
  });
}));

// Update allowImagesToExtendToFrontier setting
router.post('/app-config/allow-images-to-extend-to-frontier', asyncHandler((req, res) => {
  const { value } = req.body as { value?: boolean };

  // Allow boolean or undefined (to reset to default)
  if (value !== undefined && typeof value !== 'boolean') {
    res.status(400).json({ error: 'value must be a boolean or undefined' });
    return;
  }

  const settings = updateAllowImagesToExtendToFrontier(value, getConfigDirectory());
  res.json({ success: true, settings });
}));

// Delete allowImagesToExtendToFrontier setting (reset to default)
router.delete('/app-config/allow-images-to-extend-to-frontier', asyncHandler((_req, res) => {
  const settings = updateAllowImagesToExtendToFrontier(undefined, getConfigDirectory());
  res.json({ success: true, settings });
}));

// Update manageGitAutomatically setting
router.post('/app-config/manage-git-automatically', asyncHandler((req, res) => {
  const { value } = req.body as { value?: boolean };

  if (value !== undefined && typeof value !== 'boolean') {
    res.status(400).json({ error: 'value must be a boolean or undefined' });
    return;
  }

  const settings = updateManageGitAutomatically(value, getConfigDirectory());
  res.json({ success: true, settings });
}));

// Reset manageGitAutomatically to default (true)
router.delete('/app-config/manage-git-automatically', asyncHandler((_req, res) => {
  const settings = updateManageGitAutomatically(undefined, getConfigDirectory());
  res.json({ success: true, settings });
}));

// Update global publish option defaults (breadcrumbs, backlinks, tags)
router.post('/app-config/generation-options', asyncHandler((req, res) => {
  const {
    generationBreadcrumbsEnabled,
    generationBacklinksEnabled,
    generationTagsEnabled,
    generationHoverPreviewEnabled,
    generationMarkdownZipEnabled,
    generationSpacedRepetitionEnabled,
    generationSpacedRepetitionTags,
  } = req.body as {
    generationBreadcrumbsEnabled?: boolean | null;
    generationBacklinksEnabled?: boolean | null;
    generationTagsEnabled?: boolean | null;
    generationHoverPreviewEnabled?: boolean | null;
    generationMarkdownZipEnabled?: boolean | null;
    generationSpacedRepetitionEnabled?: boolean | null;
    generationSpacedRepetitionTags?: string[] | null;
  };

  const validateBoolOrNullOrUndef = (v: unknown): v is boolean | null | undefined =>
    v === undefined || v === null || typeof v === 'boolean';
  const validateStringArrayOrNullOrUndef = (v: unknown): v is string[] | null | undefined =>
    v === undefined || v === null || (Array.isArray(v) && v.every(item => typeof item === 'string'));

  if (
    !validateBoolOrNullOrUndef(generationBreadcrumbsEnabled) ||
    !validateBoolOrNullOrUndef(generationBacklinksEnabled) ||
    !validateBoolOrNullOrUndef(generationTagsEnabled) ||
    !validateBoolOrNullOrUndef(generationHoverPreviewEnabled) ||
    !validateBoolOrNullOrUndef(generationMarkdownZipEnabled) ||
    !validateBoolOrNullOrUndef(generationSpacedRepetitionEnabled) ||
    !validateStringArrayOrNullOrUndef(generationSpacedRepetitionTags)
  ) {
    res.status(400).json({ error: 'publish options must be boolean, null, or undefined' });
    return;
  }

  const settings = updateGenerationOptions(
    {
      generationBreadcrumbsEnabled,
      generationBacklinksEnabled,
      generationTagsEnabled,
      generationHoverPreviewEnabled,
      generationMarkdownZipEnabled,
      generationSpacedRepetitionEnabled,
      generationSpacedRepetitionTags,
    },
    getConfigDirectory()
  );
  res.json({ success: true, settings });
}));

// Update callout dismissal state
router.post('/app-config/callout-dismissal/:calloutKey', asyncHandler(async (req, res) => {
  const { calloutKey } = req.params;
  const { dismissed } = req.body as { dismissed?: boolean };

  // Validate calloutKey is a valid key
  const validKeys: Array<keyof CalloutDismissals> = ['calloutInitialPageOutlinksDepth', 'calloutPreviewSinglePage', 'allowAddMeadowSensitivePropertyToSourcePages', 'customizeSidebarAutoShown'];
  if (!validKeys.includes(calloutKey as keyof CalloutDismissals)) {
    res.status(400).json({ error: `Invalid callout key: ${calloutKey}` });
    return;
  }

  if (typeof dismissed !== 'boolean') {
    res.status(400).json({ error: 'dismissed must be a boolean' });
    return;
  }

  const configDir = getConfigDirectory();
  const settings = updateCalloutDismissal(calloutKey as keyof CalloutDismissals, dismissed, configDir);

  // Commit the callout dismissal change to git
  const gitUtils = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, configDir);
  await gitUtils.addAndCommit(AppConfigPaths.relative.appConfigFile(), `dismiss callout ${calloutKey}`);

  res.json({ success: true, settings });
}));

export default router;
