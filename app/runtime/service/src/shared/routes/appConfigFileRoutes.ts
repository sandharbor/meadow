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
import fs from 'fs';
import path, { join } from 'path';
import { getConfigDirectory } from '../bundle-config/bundleConfigPaths.js';
import { getOriginalContent, readFileContent, getGitStatusMap, buildFileTree, buildChangedFilesTree } from '../utils/configFileExplorerUtils.js';
import { logger } from '../utils/logging/backendLoggingUtils.js';
import {
  filterReviewableAppConfigTree,
  isReviewableAppConfigPath,
} from './appConfigExplorerPolicy.js';

const router = express.Router();

// === Config File Explorer API ===

// Get file tree for app config directory (~/.config/meadow/app)
router.get('/app-config/tree', (req, res, next) => {
  (async () => {
    try {
      const changedOnly = req.query.changedOnly === 'true';
      const configDir = getConfigDirectory();
      const appConfigDir = join(configDir, 'app');

      if (!fs.existsSync(appConfigDir)) {
        res.json({ root: appConfigDir, tree: [] });
        return;
      }

      const gitStatusMap = await getGitStatusMap(appConfigDir);
      const unfilteredTree = changedOnly
        ? buildChangedFilesTree(appConfigDir, gitStatusMap)
        : buildFileTree(appConfigDir, gitStatusMap);
      const tree = filterReviewableAppConfigTree(appConfigDir, unfilteredTree);

      res.json({ root: appConfigDir, tree });
    } catch (error) {
      logger.error('Error getting app config file tree:', error);
      next(error);
    }
  })().catch(next);
});

// Get file content for app config directory
router.get('/app-config/content', (req, res, next) => {
  try {
    const filePath = req.query.path as string;

    if (!filePath) {
      return res.status(400).json({ error: 'path query parameter is required' });
    }

    const configDir = getConfigDirectory();
    const appConfigDir = join(configDir, 'app');

    if (!fs.existsSync(appConfigDir)) {
      return res.status(404).json({ error: 'App config directory not found' });
    }

    if (!isReviewableAppConfigPath(appConfigDir, filePath)) {
      return res.status(403).json({ error: 'Access denied - file is not reviewable' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'Cannot read directory content' });
    }

    // Security: ensure path is within app config directory
    const normalizedPath = fs.realpathSync(filePath);
    const normalizedAppDir = fs.realpathSync(appConfigDir);

    if (!(normalizedPath === normalizedAppDir || normalizedPath.startsWith(normalizedAppDir + path.sep))) {
      return res.status(403).json({ error: 'Access denied - path outside app config directory' });
    }

    const { content, fileType, mimeType } = readFileContent(filePath);
    res.json({ content, path: filePath, fileType, mimeType });
  } catch (error) {
    logger.error('Error reading app config file:', error);
    next(error);
  }
});

// Get original (committed) file content for app config directory (diff comparison)
router.get('/app-config/original', (req, res, next) => {
  (async () => {
    try {
      const filePath = req.query.path as string;

      if (!filePath) {
        return res.status(400).json({ error: 'path query parameter is required' });
      }

      const configDir = getConfigDirectory();
      const appConfigDir = join(configDir, 'app');

      if (!fs.existsSync(appConfigDir)) {
        return res.status(404).json({ error: 'App config directory not found' });
      }

      if (!isReviewableAppConfigPath(appConfigDir, filePath)) {
        return res.status(403).json({ error: 'Access denied - file is not reviewable' });
      }

      // Security: ensure path is within app config directory (handle non-existent files)
      const normalizedAppDir = fs.realpathSync(appConfigDir);
      const resolvedPath = path.resolve(filePath);

      if (!(resolvedPath === normalizedAppDir || resolvedPath.startsWith(normalizedAppDir + path.sep))) {
        return res.status(403).json({ error: 'Access denied - path outside app config directory' });
      }

      const { content, isNew, fileType, mimeType } = await getOriginalContent(filePath);
      res.json({ content, path: filePath, isNew, fileType, mimeType });
    } catch (error) {
      logger.error('Error reading original app config file:', error);
      next(error);
    }
  })().catch(next);
});

export default router;
