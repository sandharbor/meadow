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
import { readFileSync, writeFileSync } from 'fs';
import { stringifyPageConfig, parsePageConfig } from '../../../../../../shared_code/utils/sitePageConfigUtils.js';
import { SitePageConfig } from '../../../../../../shared_code/types/sitePageConfig.js';
import fs from 'fs';
import { getSiteConfigPath } from '../../../../shared/site-config/siteConfigPaths.js';

const router = express.Router();

// Helper function to get both draft and main paths
const getConfigPaths = (siteSlug: string) => {
  return {
    draftPath: getSiteConfigPath(siteSlug, 'draft_site_page_config.yaml'),
    mainPath: getSiteConfigPath(siteSlug, 'site_page_config.yaml')
  };
};

// Middleware to validate siteSlug
const validateSiteSlug = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { siteSlug } = req.params;
  if (!siteSlug) {
    return res.status(400).json({ error: 'siteSlug is required' });
  }
  next();
};

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

// Read site page configuration
router.get('/sites/:siteSlug/curation/site-config', validateSiteSlug, asyncHandler((req, res) => {
  const { siteSlug } = req.params;
  const { draftPath, mainPath } = getConfigPaths(siteSlug);
  
  let content = '';
  let hasDraft = false;
  
  if (fs.existsSync(draftPath)) {
    content = readFileSync(draftPath, 'utf8');
    hasDraft = true;
  } else if (fs.existsSync(mainPath)) {
    content = readFileSync(mainPath, 'utf8');
  }
  
  const configs = content ? parsePageConfig(content) : [];
  res.json({ configs, hasDraft });
}));

// Save site page configuration
router.post('/sites/:siteSlug/curation/site-config', validateSiteSlug, asyncHandler((req, res) => {
  const { siteSlug } = req.params;
  const { configs, isDraft = true } = req.body as { configs?: SitePageConfig[], isDraft?: boolean };

  if (!configs || !Array.isArray(configs)) { 
    res.status(400).json({ error: 'Configs are required and must be an array' });
    return;
  }
  
  const content = stringifyPageConfig(configs);
  const { draftPath, mainPath } = getConfigPaths(siteSlug);
  
  if (isDraft) {
    // Save to draft file
    writeFileSync(draftPath, content, 'utf8');
  } else {
    // Save to main file and remove draft
    // Note: Commit happens in copy-tracked-pages endpoint to include both config and tracked content
    writeFileSync(mainPath, content, 'utf8');
    if (fs.existsSync(draftPath)) {
      fs.unlinkSync(draftPath);
    }
  }
  res.json({ success: true });
}));

// Undo draft changes (remove draft file)
router.delete('/sites/:siteSlug/curation/site-config-draft', validateSiteSlug, asyncHandler((req, res) => {
  const { siteSlug } = req.params;
  const { draftPath } = getConfigPaths(siteSlug);
  
  if (fs.existsSync(draftPath)) {
    fs.unlinkSync(draftPath);
  }
  res.json({ success: true });
}));

// Check if draft differs from main config
router.get('/sites/:siteSlug/curation/site-config-draft-status', validateSiteSlug, asyncHandler((req, res) => {
  const { siteSlug } = req.params;
  const { draftPath, mainPath } = getConfigPaths(siteSlug);
  
  const hasDraft = fs.existsSync(draftPath);
  let hasChanges = false;
  
  if (hasDraft) {
    const draftContent = readFileSync(draftPath, 'utf8');
    const mainContent = fs.existsSync(mainPath) ? readFileSync(mainPath, 'utf8') : '';
    hasChanges = draftContent !== mainContent;
  }
  
  res.json({ hasDraft, hasChanges });
}));

export default router; 
