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
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import { getConfigDirectory, getSiteDirectory } from './siteConfigRoutes.js';
import { AppConfigPaths } from '../../../shared_code/paths/appConfigPaths.js';
import { SiteConfigPaths } from '../../../shared_code/paths/siteConfigPaths.js';
import { CustomAssetType } from '../../../shared_code/types/customAssets.js';
import { getCustomAssetMetadata, getCustomAssetsDir } from '../utils/customAssetsLoader.js';
import { loadAppConfig, saveAppConfig } from '../../../shared_code/utils/appConfigUtils.js';
import { loadSiteConfig, saveSiteConfig } from '../utils/siteConfigUtils.js';
import { commitChangesNative } from '../utils/configDirectory/gitUtils/gitStatusUtils.js';
import { logger } from '../utils/logging/backendLoggingUtils.js';

const router = express.Router();

const ASSET_TYPE_TO_FILENAME: Record<CustomAssetType, string> = {
  style_css: 'style.css',
  javascript_js: 'javascript.js',
};

const isValidAssetType = (t: string): t is CustomAssetType =>
  t === 'style_css' || t === 'javascript_js';

const validateSiteSlug = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { siteSlug } = req.params;
  if (!siteSlug || !/^[a-zA-Z0-9-_]+$/.test(siteSlug)) {
    res.status(400).json({ error: 'Invalid site slug' });
    return;
  }
  next();
};

/** Fire-and-forget git commit — never blocks the response. */
function commitInBackground(directories: string[], message: string): void {
  commitChangesNative(directories, message).catch((e: unknown) => {
    logger.warn(`[customAssetsRoutes] Background git commit failed: ${String(e)}`);
  });
}

// ─── Global routes ───────────────────────────────────────────────────────────

router.get('/global', (_req, res) => {
  try {
    const assets = (['style_css', 'javascript_js'] as CustomAssetType[]).map(t =>
      getCustomAssetMetadata('global', t)
    );
    const appConfig = loadAppConfig(getConfigDirectory());
    res.json({
      assets,
      disableBaseStyleCss: appConfig.disableBaseStyleCss ?? false,
      disableBaseJavascriptJs: appConfig.disableBaseJavascriptJs ?? false,
    });
  } catch (error) {
    logger.error(`Error listing global custom assets: ${String(error)}`);
    res.status(500).json({ error: 'Failed to list global custom assets' });
  }
});

router.get('/global/folder-path', (_req, res) => {
  const dir = getCustomAssetsDir('global');
  mkdirSync(dir, { recursive: true });
  res.json({ path: dir });
});

router.get('/global/:assetType', (req, res) => {
  const { assetType } = req.params;
  if (!isValidAssetType(assetType)) {
    res.status(400).json({ error: 'Invalid asset type' });
    return;
  }
  try {
    const meta = getCustomAssetMetadata('global', assetType);
    res.json(meta);
  } catch (error) {
    logger.error(`Error getting global custom asset: ${String(error)}`);
    res.status(500).json({ error: 'Failed to get global custom asset' });
  }
});

router.put('/global/:assetType', (req, res) => {
  const { assetType } = req.params;
  if (!isValidAssetType(assetType)) {
    res.status(400).json({ error: 'Invalid asset type' });
    return;
  }
  try {
    const { content } = req.body as { content: string };
    if (typeof content !== 'string') {
      res.status(400).json({ error: 'content must be a string' });
      return;
    }
    const filename = ASSET_TYPE_TO_FILENAME[assetType];
    const dir = AppConfigPaths.getGlobalCustomAssetsDir(getConfigDirectory());
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, filename), content, 'utf8');
    res.json({ success: true });
    commitInBackground([getConfigDirectory()], `Update global custom asset: ${filename}`);
  } catch (error) {
    logger.error(`Error saving global custom asset: ${String(error)}`);
    res.status(500).json({ error: 'Failed to save global custom asset' });
  }
});

router.delete('/global/:assetType', (req, res) => {
  const { assetType } = req.params;
  if (!isValidAssetType(assetType)) {
    res.status(400).json({ error: 'Invalid asset type' });
    return;
  }
  try {
    const filename = ASSET_TYPE_TO_FILENAME[assetType];
    const filePath = AppConfigPaths.getGlobalCustomAssetFile(getConfigDirectory(), filename);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
    res.json({ success: true });
    commitInBackground([getConfigDirectory()], `Delete global custom asset: ${filename}`);
  } catch (error) {
    logger.error(`Error deleting global custom asset: ${String(error)}`);
    res.status(500).json({ error: 'Failed to delete global custom asset' });
  }
});

router.post('/global/base-disabled', (req, res) => {
  try {
    const { disableBaseStyleCss, disableBaseJavascriptJs } = req.body as {
      disableBaseStyleCss?: boolean;
      disableBaseJavascriptJs?: boolean;
    };
    const configDir = getConfigDirectory();
    const appConfig = loadAppConfig(configDir);

    if (typeof disableBaseStyleCss === 'boolean') {
      appConfig.disableBaseStyleCss = disableBaseStyleCss;
    }
    if (typeof disableBaseJavascriptJs === 'boolean') {
      appConfig.disableBaseJavascriptJs = disableBaseJavascriptJs;
    }
    saveAppConfig(appConfig, configDir);
    res.json({ success: true });
    commitInBackground([configDir], 'Update base asset disabled settings');
  } catch (error) {
    logger.error(`Error updating base-disabled settings: ${String(error)}`);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ─── Site routes ─────────────────────────────────────────────────────────────

router.get('/site/:siteSlug', validateSiteSlug, (req, res) => {
  const { siteSlug } = req.params;
  try {
    const globalAssets = (['style_css', 'javascript_js'] as CustomAssetType[]).map(t =>
      getCustomAssetMetadata('global', t)
    );
    const siteAssets = (['style_css', 'javascript_js'] as CustomAssetType[]).map(t =>
      getCustomAssetMetadata('site', t, siteSlug)
    );

    const siteDir = getSiteDirectory(siteSlug);
    const siteConfig = loadSiteConfig(siteDir);
    const appConfig = loadAppConfig(getConfigDirectory());

    res.json({
      globalAssets,
      siteAssets,
      disableBaseStyleCss: appConfig.disableBaseStyleCss ?? false,
      disableBaseJavascriptJs: appConfig.disableBaseJavascriptJs ?? false,
      siteDisableBaseStyleCss: siteConfig.disableBaseStyleCss,
      siteDisableBaseJavascriptJs: siteConfig.disableBaseJavascriptJs,
    });
  } catch (error) {
    logger.error(`Error listing site custom assets: ${String(error)}`);
    res.status(500).json({ error: 'Failed to list site custom assets' });
  }
});

router.get('/site/:siteSlug/folder-path', validateSiteSlug, (req, res) => {
  const { siteSlug } = req.params;
  const dir = getCustomAssetsDir('site', siteSlug);
  mkdirSync(dir, { recursive: true });
  res.json({ path: dir });
});

router.get('/site/:siteSlug/:assetType', validateSiteSlug, (req, res) => {
  const { siteSlug, assetType } = req.params;
  if (!isValidAssetType(assetType)) {
    res.status(400).json({ error: 'Invalid asset type' });
    return;
  }
  try {
    const meta = getCustomAssetMetadata('site', assetType, siteSlug);
    res.json(meta);
  } catch (error) {
    logger.error(`Error getting site custom asset: ${String(error)}`);
    res.status(500).json({ error: 'Failed to get site custom asset' });
  }
});

router.put('/site/:siteSlug/:assetType', validateSiteSlug, (req, res) => {
  const { siteSlug, assetType } = req.params;
  if (!isValidAssetType(assetType)) {
    res.status(400).json({ error: 'Invalid asset type' });
    return;
  }
  try {
    const { content } = req.body as { content: string };
    if (typeof content !== 'string') {
      res.status(400).json({ error: 'content must be a string' });
      return;
    }
    const filename = ASSET_TYPE_TO_FILENAME[assetType];
    const dir = SiteConfigPaths.getSiteCustomAssetsDir(getSiteDirectory(siteSlug));
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, filename), content, 'utf8');
    res.json({ success: true });
    commitInBackground([getConfigDirectory()], `Update site custom asset: ${filename} for ${siteSlug}`);
  } catch (error) {
    logger.error(`Error saving site custom asset: ${String(error)}`);
    res.status(500).json({ error: 'Failed to save site custom asset' });
  }
});

router.delete('/site/:siteSlug/:assetType', validateSiteSlug, (req, res) => {
  const { siteSlug, assetType } = req.params;
  if (!isValidAssetType(assetType)) {
    res.status(400).json({ error: 'Invalid asset type' });
    return;
  }
  try {
    const filename = ASSET_TYPE_TO_FILENAME[assetType];
    const filePath = SiteConfigPaths.getSiteCustomAssetFile(getSiteDirectory(siteSlug), filename);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
    res.json({ success: true });
    commitInBackground([getConfigDirectory()], `Delete site custom asset: ${filename} for ${siteSlug}`);
  } catch (error) {
    logger.error(`Error deleting site custom asset: ${String(error)}`);
    res.status(500).json({ error: 'Failed to delete site custom asset' });
  }
});

router.post('/site/:siteSlug/base-disabled', validateSiteSlug, (req, res) => {
  const { siteSlug } = req.params;
  try {
    const { disableBaseStyleCss, disableBaseJavascriptJs } = req.body as {
      disableBaseStyleCss?: boolean | null;
      disableBaseJavascriptJs?: boolean | null;
    };
    const siteDir = getSiteDirectory(siteSlug);
    const siteConfig = loadSiteConfig(siteDir);

    if (typeof disableBaseStyleCss === 'boolean') {
      siteConfig.disableBaseStyleCss = disableBaseStyleCss;
    } else if (disableBaseStyleCss === null) {
      delete siteConfig.disableBaseStyleCss;
    }
    if (typeof disableBaseJavascriptJs === 'boolean') {
      siteConfig.disableBaseJavascriptJs = disableBaseJavascriptJs;
    } else if (disableBaseJavascriptJs === null) {
      delete siteConfig.disableBaseJavascriptJs;
    }
    saveSiteConfig(siteDir, siteConfig);
    res.json({ success: true });
    commitInBackground([getConfigDirectory()], `Update base asset disabled settings for ${siteSlug}`);
  } catch (error) {
    logger.error(`Error updating site base-disabled settings: ${String(error)}`);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
