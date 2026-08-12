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
import type { SiteNodeId } from '../../../../../shared_code/types/siteNodeConfig.js';
import { AppConfigPaths } from '../../../../../shared_code/paths/appConfigPaths.js';
import { AppConfigGitUtils, GIT_AUTHORS } from '../../../../../shared_code/utils/appConfigGitUtils.js';
import { generateSiteGuid } from '../../../../../shared_code/utils/siteGuidUtils.js';
import { getConfigDirectory, getSiteConfigPath, getSiteDirectory } from '../../../shared/site-config/siteConfigPaths.js';
import {
  getFolderSiteRepairStatus,
  preflightSelectedFolderRelink,
  verifySelectedFolderRelink,
} from '../../../shared/site-config/folderSiteRepair.js';

const router = express.Router();

router.get('/sites/:slug/folders/repair-status', (req, res, next) => {
  try {
    const siteDirectory = getSiteDirectory(req.params.slug);
    if (!fs.existsSync(siteDirectory)) return res.status(404).json({ error: 'Site not found' });
    res.json(getFolderSiteRepairStatus(siteDirectory));
  } catch (error) {
    next(error);
  }
});

router.post('/sites/:slug/folders/relink-preflight', (req, res, next) => {
  void (async () => {
    const { siteNodeId, selectedFolder } = req.body as { siteNodeId?: string; selectedFolder?: string };
    if (!siteNodeId || !selectedFolder) {
      return res.status(400).json({ error: 'siteNodeId and selectedFolder are required' });
    }
    const siteDirectory = getSiteDirectory(req.params.slug);
    if (!fs.existsSync(siteDirectory)) return res.status(404).json({ error: 'Site not found' });
    res.json(await preflightSelectedFolderRelink(siteDirectory, siteNodeId as SiteNodeId, selectedFolder));
  })().catch(next);
});

router.post('/sites/:slug/folders/relink', (req, res, next) => {
  void (async () => {
    const { siteNodeId, selectedFolder, fingerprint, confirmHighImpact } = req.body as {
      siteNodeId?: string;
      selectedFolder?: string;
      fingerprint?: string;
      confirmHighImpact?: boolean;
    };
    if (!siteNodeId || !selectedFolder || !fingerprint) {
      return res.status(400).json({ error: 'A confirmed selected-folder relink preflight is required' });
    }
    const siteDirectory = getSiteDirectory(req.params.slug);
    if (!fs.existsSync(siteDirectory)) return res.status(404).json({ error: 'Site not found' });
    const nodeConfigPath = getSiteConfigPath(req.params.slug, 'site_node_config.yaml');
    const original = fs.readFileSync(nodeConfigPath, 'utf8');
    const verified = await verifySelectedFolderRelink(
      siteDirectory, siteNodeId as SiteNodeId, selectedFolder, fingerprint,
    );
    if (verified.preflight.prediction?.highImpactWarning && confirmHighImpact !== true) {
      return res.status(409).json({
        error: 'This relink requires explicit high-impact confirmation',
        preflight: verified.preflight,
      });
    }
    const temporaryPath = `${nodeConfigPath}.relink-${generateSiteGuid()}`;
    try {
      fs.writeFileSync(temporaryPath, verified.serializedNodes, 'utf8');
      fs.renameSync(temporaryPath, nodeConfigPath);
      const gitUtils = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, getConfigDirectory());
      await gitUtils.commitFiles([
        AppConfigPaths.relative.siteNodeConfigFile(req.params.slug),
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
