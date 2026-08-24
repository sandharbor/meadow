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
import { getConfigDirectory, getBundleConfigPath, getBundleDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { CustomFilterConfig, BundleCustomFiltersConfig } from '../../../../../../../contracts/types/customFilters.js';
import { loadBundleConfig, saveBundleConfig } from '../../../../shared/utils/bundleConfigUtils.js';
import { loadGlobalCustomFilters, saveGlobalCustomFilters } from '../../../../../../../shared_code/utils/globalCustomFiltersUtils.js';
import { DEFAULT_DAILY_NOTES_FILTER_ID } from '../../../../../../../shared_code/utils/defaultGlobalFiltersUtils.js';
import { loadAppConfig, saveAppConfig } from '../../../../../../../shared_code/utils/appConfigUtils.js';
import { bundleCustomFiltersCodec } from '../../../../../../../shared_code/utils/configDocumentCodecs.js';
import {
  readDurableDocument,
  requireValidDocument,
  writeDurableDocument,
} from '../../../../../../../shared_code/utils/durableDocument.js';
import { getGraphFilterCatalog } from '../services/graphFilterService.js';

const router = express.Router();

// Helper functions
const getBundleCustomFiltersPath = (bundleSlug: string) => getBundleConfigPath(bundleSlug, 'custom_filters.json');

const loadBundleCustomFilters = (bundleSlug: string): BundleCustomFiltersConfig => {
  const path = getBundleCustomFiltersPath(bundleSlug);
  return requireValidDocument(
    readDurableDocument(path, bundleCustomFiltersCodec),
    (): BundleCustomFiltersConfig => ({ filters: [], version: '1.0.0' }),
  );
};

const saveBundleCustomFilters = (bundleSlug: string, config: BundleCustomFiltersConfig): void => {
  const path = getBundleCustomFiltersPath(bundleSlug);
  writeDurableDocument({
    path,
    value: { ...config, version: '1.0.0' },
    codec: bundleCustomFiltersCodec,
  });
};

export const loadCustomFiltersForBundle = (bundleSlug: string): CustomFilterConfig[] => {
  const globalConfig = loadGlobalCustomFilters(getConfigDirectory());
  const bundleConfig = loadBundleCustomFilters(bundleSlug);
  const bundleDirectory = getBundleDirectory(bundleSlug);
  const bundleCf = loadBundleConfig(bundleDirectory);
  const disabledGlobalFilters = bundleCf.disabledGlobalFilters || [];

  return [
    ...globalConfig.filters.map(filter => ({
      ...filter,
      scope: 'global' as const,
      enabled: !disabledGlobalFilters.includes(filter.id),
    })),
    ...bundleConfig.filters.map(filter => ({ ...filter, scope: 'bundle' as const })),
  ];
};

// Middleware to validate bundleSlug
const validateBundleSlug = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { bundleSlug } = req.params;
  if (!bundleSlug) {
    return res.status(400).json({ error: 'bundleSlug is required' });
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

// Get all custom filters for a bundle (includes global filters)
router.get('/bundles/:bundleSlug/curation/custom-filters', validateBundleSlug, asyncHandler((req, res) => {
  const { bundleSlug } = req.params;

  res.json({ filters: loadCustomFiltersForBundle(bundleSlug) });
}));

// Discover every built-in selector plus the global and bundle custom filters.
router.get('/bundles/:bundleSlug/curation/filters', validateBundleSlug, asyncHandler((req, res) => {
  const { bundleSlug } = req.params;
  res.json(getGraphFilterCatalog(bundleSlug, loadCustomFiltersForBundle(bundleSlug)));
}));

// Get global custom filters
router.get('/curation/custom-filters/global', asyncHandler((req, res) => {
  const config = loadGlobalCustomFilters(getConfigDirectory());
  res.json({ filters: config.filters });
}));

// Save custom filter
router.post('/bundles/:bundleSlug/curation/custom-filters', validateBundleSlug, asyncHandler((req, res) => {
  const { bundleSlug } = req.params;
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
    const config = loadBundleCustomFilters(bundleSlug);
    const existingIndex = config.filters.findIndex(f => f.id === filter.id);
    
    if (existingIndex >= 0) {
      config.filters[existingIndex] = filter;
    } else {
      config.filters.push(filter);
    }
    
    saveBundleCustomFilters(bundleSlug, config);
  }
  
  res.json({ success: true });
}));

// Delete custom filter
router.delete('/bundles/:bundleSlug/curation/custom-filters/:filterId', validateBundleSlug, asyncHandler((req, res) => {
  const { bundleSlug, filterId } = req.params;
  const { scope } = req.query as { scope: 'global' | 'bundle' };
  
  if (!scope || (scope !== 'global' && scope !== 'bundle')) {
    res.status(400).json({ error: 'Scope is required and must be "global" or "bundle"' });
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
    const config = loadBundleCustomFilters(bundleSlug);
    config.filters = config.filters.filter(f => f.id !== filterId);
    saveBundleCustomFilters(bundleSlug, config);
  }
  
  res.json({ success: true });
}));

// Get disabled global filters for a bundle
router.get('/bundles/:bundleSlug/curation/disabled-global-filters', validateBundleSlug, asyncHandler((req, res) => {
  const { bundleSlug } = req.params;
  const bundleDirectory = getBundleDirectory(bundleSlug);
  const bundleConfig = loadBundleConfig(bundleDirectory);
  
  res.json({ disabledGlobalFilters: bundleConfig.disabledGlobalFilters || [] });
}));

// Toggle a global filter's disabled status for a bundle
router.post('/bundles/:bundleSlug/curation/disabled-global-filters/:filterId', validateBundleSlug, asyncHandler((req, res) => {
  const { bundleSlug, filterId } = req.params;
  const { disabled } = req.body as { disabled: boolean };
  
  if (typeof disabled !== 'boolean') {
    res.status(400).json({ error: 'disabled field is required and must be a boolean' });
    return;
  }
  
  const bundleDirectory = getBundleDirectory(bundleSlug);
  const bundleConfig = loadBundleConfig(bundleDirectory);
  const disabledGlobalFilters = bundleConfig.disabledGlobalFilters || [];
  
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
  
  bundleConfig.disabledGlobalFilters = disabledGlobalFilters;
  saveBundleConfig(bundleDirectory, bundleConfig);
  
  res.json({ success: true, disabledGlobalFilters });
}));

export default router; 
