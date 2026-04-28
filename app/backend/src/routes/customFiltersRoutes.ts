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
import fs from 'fs';
import { getConfigDirectory, getSiteConfigPath, getSiteDirectory } from './siteConfigRoutes.js';
import { CustomFilterConfig, SiteCustomFiltersConfig } from '../../../shared_code/types/customFilters.js';
import { loadSiteConfig, saveSiteConfig } from '../utils/siteConfigUtils.js';
import { logSiteWarn } from '../utils/logging/siteLogger.js';
import { loadGlobalCustomFilters, saveGlobalCustomFilters } from '../../../shared_code/utils/globalCustomFiltersUtils.js';
import { DEFAULT_DAILY_NOTES_FILTER_ID } from '../../../shared_code/utils/defaultGlobalFiltersUtils.js';
import { loadAppConfig, saveAppConfig } from '../../../shared_code/utils/appConfigUtils.js';

const router = express.Router();

// Helper functions
const getSiteCustomFiltersPath = (siteSlug: string) => getSiteConfigPath(siteSlug, 'custom_filters.json');

const loadSiteCustomFilters = (siteSlug: string): SiteCustomFiltersConfig => {
  const path = getSiteCustomFiltersPath(siteSlug);
  if (!fs.existsSync(path)) {
    return { filters: [], version: '1.0.0' };
  }
  try {
    const content = readFileSync(path, 'utf8');
    return JSON.parse(content) as SiteCustomFiltersConfig;
  } catch (error) {
    logSiteWarn(siteSlug, `Error loading site custom filters: ${error instanceof Error ? error.message : String(error)}`);
    return { filters: [], version: '1.0.0' };
  }
};

const saveSiteCustomFilters = (siteSlug: string, config: SiteCustomFiltersConfig): void => {
  const path = getSiteCustomFiltersPath(siteSlug);
  config.version = '1.0.0';
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf8');
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

// Get all custom filters for a site (includes global filters)
router.get('/site/:siteSlug/custom-filters', validateSiteSlug, asyncHandler((req, res) => {
  const { siteSlug } = req.params;
  
  const configDir = getConfigDirectory();
  const globalConfig = loadGlobalCustomFilters(configDir);
  const siteConfig = loadSiteCustomFilters(siteSlug);

  // Load the site configuration to check for disabled global filters
  const siteDirectory = getSiteDirectory(siteSlug);
  const siteCf = loadSiteConfig(siteDirectory);
  const disabledGlobalFilters = siteCf.disabledGlobalFilters || [];
  
  // Include all global filters, but mark disabled ones as enabled: false
  const globalFiltersWithDisabledState = globalConfig.filters.map(f => ({
    ...f,
    scope: 'global' as const,
    enabled: !disabledGlobalFilters.includes(f.id)
  }));
  
  const allFilters = [
    ...globalFiltersWithDisabledState,
    ...siteConfig.filters.map(f => ({ ...f, scope: 'site' as const }))
  ];
  
  res.json({ filters: allFilters });
}));

// Get global custom filters
router.get('/custom-filters/global', asyncHandler((req, res) => {
  const config = loadGlobalCustomFilters(getConfigDirectory());
  res.json({ filters: config.filters });
}));

// Save custom filter
router.post('/site/:siteSlug/custom-filters', validateSiteSlug, asyncHandler((req, res) => {
  const { siteSlug } = req.params;
  const { filter } = req.body as { filter: CustomFilterConfig };
  
  if (!filter || !filter.id || !filter.name || !filter.scope) {
    res.status(400).json({ error: 'Invalid filter data' });
    return;
  }
  
  const now = new Date().toISOString();
  filter.updatedAt = now;
  if (!filter.createdAt) {
    filter.createdAt = now;
  }
  
  if (filter.scope === 'global') {
    const configDir = getConfigDirectory();
    const config = loadGlobalCustomFilters(configDir);
    const existingIndex = config.filters.findIndex(f => f.id === filter.id);

    if (existingIndex >= 0) {
      config.filters[existingIndex] = filter;
    } else {
      config.filters.push(filter);
    }

    saveGlobalCustomFilters(configDir, config);
  } else {
    const config = loadSiteCustomFilters(siteSlug);
    const existingIndex = config.filters.findIndex(f => f.id === filter.id);
    
    if (existingIndex >= 0) {
      config.filters[existingIndex] = filter;
    } else {
      config.filters.push(filter);
    }
    
    saveSiteCustomFilters(siteSlug, config);
  }
  
  res.json({ success: true });
}));

// Delete custom filter
router.delete('/site/:siteSlug/custom-filters/:filterId', validateSiteSlug, asyncHandler((req, res) => {
  const { siteSlug, filterId } = req.params;
  const { scope } = req.query as { scope: 'global' | 'site' };
  
  if (!scope || (scope !== 'global' && scope !== 'site')) {
    res.status(400).json({ error: 'Scope is required and must be "global" or "site"' });
    return;
  }
  
  if (scope === 'global') {
    const configDir = getConfigDirectory();
    const config = loadGlobalCustomFilters(configDir);
    config.filters = config.filters.filter(f => f.id !== filterId);
    saveGlobalCustomFilters(configDir, config);

    // Track deletion of default filters so they aren't re-created on startup
    if (filterId === DEFAULT_DAILY_NOTES_FILTER_ID) {
      const appConfig = loadAppConfig(configDir);
      if (!appConfig.deletedDefaultFilterIds) {
        appConfig.deletedDefaultFilterIds = [];
      }
      if (!appConfig.deletedDefaultFilterIds.includes(filterId)) {
        appConfig.deletedDefaultFilterIds.push(filterId);
      }
      saveAppConfig(appConfig, configDir);
    }
  } else {
    const config = loadSiteCustomFilters(siteSlug);
    config.filters = config.filters.filter(f => f.id !== filterId);
    saveSiteCustomFilters(siteSlug, config);
  }
  
  res.json({ success: true });
}));

// Get disabled global filters for a site
router.get('/site/:siteSlug/disabled-global-filters', validateSiteSlug, asyncHandler((req, res) => {
  const { siteSlug } = req.params;
  const siteDirectory = getSiteDirectory(siteSlug);
  const siteConfig = loadSiteConfig(siteDirectory);
  
  res.json({ disabledGlobalFilters: siteConfig.disabledGlobalFilters || [] });
}));

// Toggle a global filter's disabled status for a site
router.post('/site/:siteSlug/disabled-global-filters/:filterId', validateSiteSlug, asyncHandler((req, res) => {
  const { siteSlug, filterId } = req.params;
  const { disabled } = req.body as { disabled: boolean };
  
  if (typeof disabled !== 'boolean') {
    res.status(400).json({ error: 'disabled field is required and must be a boolean' });
    return;
  }
  
  const siteDirectory = getSiteDirectory(siteSlug);
  const siteConfig = loadSiteConfig(siteDirectory);
  const disabledGlobalFilters = siteConfig.disabledGlobalFilters || [];
  
  if (disabled) {
    // Add to disabled list if not already there
    if (!disabledGlobalFilters.includes(filterId)) {
      disabledGlobalFilters.push(filterId);
    }
  } else {
    // Remove from disabled list
    const index = disabledGlobalFilters.indexOf(filterId);
    if (index > -1) {
      disabledGlobalFilters.splice(index, 1);
    }
  }
  
  siteConfig.disabledGlobalFilters = disabledGlobalFilters;
  saveSiteConfig(siteDirectory, siteConfig);
  
  res.json({ success: true, disabledGlobalFilters });
}));

export default router; 