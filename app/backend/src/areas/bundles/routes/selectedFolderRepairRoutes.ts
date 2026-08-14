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
import type { BundleNodeId } from '../../../../../shared_code/types/bundleNodeConfig.js';
import { AppConfigPaths } from '../../../../../shared_code/paths/appConfigPaths.js';
import { AppConfigGitUtils, GIT_AUTHORS } from '../../../../../shared_code/utils/appConfigGitUtils.js';
import { generateBundleGuid } from '../../../../../shared_code/utils/bundleGuidUtils.js';
import { getConfigDirectory, getBundleConfigPath, getBundleDirectory } from '../../../shared/bundle-config/bundleConfigPaths.js';
import {
  getFolderBundleRepairStatus,
  preflightSelectedFolderRelink,
  verifySelectedFolderRelink,
} from '../../../shared/bundle-config/folderBundleRepair.js';

const router = express.Router();

router.get('/bundles/:slug/folders/repair-status', (req, res, next) => {
  try {
    const bundleDirectory = getBundleDirectory(req.params.slug);
    if (!fs.existsSync(bundleDirectory)) return res.status(404).json({ error: 'Bundle not found' });
    res.json(getFolderBundleRepairStatus(bundleDirectory));
  } catch (error) {
    next(error);
  }
});

router.post('/bundles/:slug/folders/relink-preflight', (req, res, next) => {
  void (async () => {
    const { bundleNodeId, selectedFolder } = req.body as { bundleNodeId?: string; selectedFolder?: string };
    if (!bundleNodeId || !selectedFolder) {
      return res.status(400).json({ error: 'bundleNodeId and selectedFolder are required' });
    }
    const bundleDirectory = getBundleDirectory(req.params.slug);
    if (!fs.existsSync(bundleDirectory)) return res.status(404).json({ error: 'Bundle not found' });
    res.json(await preflightSelectedFolderRelink(bundleDirectory, bundleNodeId as BundleNodeId, selectedFolder));
  })().catch(next);
});

router.post('/bundles/:slug/folders/relink', (req, res, next) => {
  void (async () => {
    const { bundleNodeId, selectedFolder, fingerprint, confirmHighImpact } = req.body as {
      bundleNodeId?: string;
      selectedFolder?: string;
      fingerprint?: string;
      confirmHighImpact?: boolean;
    };
    if (!bundleNodeId || !selectedFolder || !fingerprint) {
      return res.status(400).json({ error: 'A confirmed selected-folder relink preflight is required' });
    }
    const bundleDirectory = getBundleDirectory(req.params.slug);
    if (!fs.existsSync(bundleDirectory)) return res.status(404).json({ error: 'Bundle not found' });
    const nodeConfigPath = getBundleConfigPath(req.params.slug, 'bundle_node_config.yaml');
    const original = fs.readFileSync(nodeConfigPath, 'utf8');
    const verified = await verifySelectedFolderRelink(
      bundleDirectory, bundleNodeId as BundleNodeId, selectedFolder, fingerprint,
    );
    if (verified.preflight.prediction?.highImpactWarning && confirmHighImpact !== true) {
      return res.status(409).json({
        error: 'This relink requires explicit high-impact confirmation',
        preflight: verified.preflight,
      });
    }
    const temporaryPath = `${nodeConfigPath}.relink-${generateBundleGuid()}`;
    try {
      fs.writeFileSync(temporaryPath, verified.serializedNodes, 'utf8');
      fs.renameSync(temporaryPath, nodeConfigPath);
      const gitUtils = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, getConfigDirectory());
      await gitUtils.commitFiles([
        AppConfigPaths.relative.bundleNodeConfigFile(req.params.slug),
      ], `relink selected folder for ${req.params.slug}`);
      res.json({ success: true, preflight: verified.preflight });
    } catch (error) {
      if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
      fs.writeFileSync(nodeConfigPath, original, 'utf8');
      throw error;
    }
  })().catch(next);
});

export default router;
