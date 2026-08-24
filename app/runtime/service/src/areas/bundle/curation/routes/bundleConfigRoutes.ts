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
import { readFileSync } from 'fs';
import {
  stringifyBundleNodeConfig,
  parseBundleNodeConfig,
  validateCanonicalBundleConfiguration,
} from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { saveBundleNodeConfigDocument } from '../../../../../../../shared_code/utils/bundleNodeConfigPersistence.js';
import { BundleNodeConfig } from '../../../../../../../shared_code/types/bundleNodeConfig.js';
import { BundleConfig } from '../../../../../../../shared_code/types/bundleConfig.js';
import fs from 'fs';
import { getBundleConfigPath } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { loadBundleConfigFromPath } from '../../../../shared/utils/bundleConfigUtils.js';

const router = express.Router();

// Helper function to get both draft and main paths
const getConfigPaths = (bundleSlug: string) => {
  return {
    draftPath: getBundleConfigPath(bundleSlug, 'draft_bundle_node_config.yaml'),
    mainPath: getBundleConfigPath(bundleSlug, 'bundle_node_config.yaml'),
    bundleConfigPath: getBundleConfigPath(bundleSlug),
  };
};

function readNodeConfig(filePath: string): BundleNodeConfig[] {
  return parseBundleNodeConfig(readFileSync(filePath, 'utf8'), filePath);
}

function readBundleConfig(filePath: string): BundleConfig {
  return loadBundleConfigFromPath(filePath);
}

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

// Read bundle page configuration
router.get('/bundles/:bundleSlug/curation/bundle-config', validateBundleSlug, asyncHandler((req, res) => {
  const { bundleSlug } = req.params;
  const { draftPath, mainPath, bundleConfigPath } = getConfigPaths(bundleSlug);
  
  let content = '';
  let hasDraft = false;
  
  if (fs.existsSync(draftPath)) {
    content = readFileSync(draftPath, 'utf8');
    hasDraft = true;
  } else if (fs.existsSync(mainPath)) {
    content = readFileSync(mainPath, 'utf8');
  }
  
  const configs = content ? parseBundleNodeConfig(content, hasDraft ? draftPath : mainPath) : [];
  if (fs.existsSync(mainPath) && fs.existsSync(bundleConfigPath)) {
    validateCanonicalBundleConfiguration({
      committedNodes: readNodeConfig(mainPath),
      committedPath: mainPath,
      ...(hasDraft && { draftNodes: configs, draftPath }),
      bundleConfig: readBundleConfig(bundleConfigPath),
      bundleConfigPath,
    });
  }
  res.json({ configs, hasDraft });
}));

// Save bundle page configuration
router.post('/bundles/:bundleSlug/curation/bundle-config', validateBundleSlug, asyncHandler((req, res) => {
  const { bundleSlug } = req.params;
  const { configs, isDraft = true } = req.body as { configs?: BundleNodeConfig[], isDraft?: boolean };

  if (!configs || !Array.isArray(configs)) { 
    res.status(400).json({ error: 'Configs are required and must be an array' });
    return;
  }
  
  const { draftPath, mainPath, bundleConfigPath } = getConfigPaths(bundleSlug);
  if (!fs.existsSync(mainPath) || !fs.existsSync(bundleConfigPath)) {
    res.status(409).json({ error: 'Canonical bundle configuration is incomplete' });
    return;
  }
  const targetPath = isDraft ? draftPath : mainPath;
  const candidate = parseBundleNodeConfig(stringifyBundleNodeConfig(configs), targetPath);
  const committed = readNodeConfig(mainPath);
  const bundleConfig = readBundleConfig(bundleConfigPath);

  // Comparing against committed first preserves IDs for logical nodes and
  // prevents reuse of a committed ID for a different locator.
  validateCanonicalBundleConfiguration({
    committedNodes: committed,
    committedPath: mainPath,
    draftNodes: candidate,
    draftPath: targetPath,
    bundleConfig,
    bundleConfigPath,
  });
  if (!isDraft) {
    validateCanonicalBundleConfiguration({
      committedNodes: candidate,
      committedPath: mainPath,
      bundleConfig,
      bundleConfigPath,
    });
  }
  if (isDraft) {
    // Save to draft file
    saveBundleNodeConfigDocument(draftPath, candidate);
  } else {
    // Save to main file and remove draft
    // Note: Commit happens in copy-tracked-pages endpoint to include both config and tracked content
    saveBundleNodeConfigDocument(mainPath, candidate);
    if (fs.existsSync(draftPath)) {
      fs.unlinkSync(draftPath);
    }
  }
  res.json({ success: true });
}));

// Undo draft changes (remove draft file)
router.delete('/bundles/:bundleSlug/curation/bundle-config-draft', validateBundleSlug, asyncHandler((req, res) => {
  const { bundleSlug } = req.params;
  const { draftPath, mainPath, bundleConfigPath } = getConfigPaths(bundleSlug);
  if (fs.existsSync(mainPath) && fs.existsSync(bundleConfigPath)) {
    validateCanonicalBundleConfiguration({
      committedNodes: readNodeConfig(mainPath),
      committedPath: mainPath,
      bundleConfig: readBundleConfig(bundleConfigPath),
      bundleConfigPath,
    });
  }
  
  if (fs.existsSync(draftPath)) {
    fs.unlinkSync(draftPath);
  }
  res.json({ success: true });
}));

// Check if draft differs from main config
router.get('/bundles/:bundleSlug/curation/bundle-config-draft-status', validateBundleSlug, asyncHandler((req, res) => {
  const { bundleSlug } = req.params;
  const { draftPath, mainPath } = getConfigPaths(bundleSlug);
  
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
