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
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import path from 'path';
import { getConfigDirectory, getBundleDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { AppConfigPaths } from '../../../../../../../shared_code/paths/appConfigPaths.js';
import { BundleConfigPaths } from '../../../../../../../shared_code/paths/bundleConfigPaths.js';
import { CustomAssetType } from '../../../../../../../shared_code/types/customAssets.js';
import { getCustomAssetMetadata, getCustomAssetsDir } from '../utils/customAssetsLoader.js';
import { loadAppConfig, saveAppConfig } from '../../../../../../../shared_code/utils/appConfigUtils.js';
import { loadBundleConfig, saveBundleConfig } from '../../../../shared/utils/bundleConfigUtils.js';
import { commitChangesNative } from '../../../../shared/utils/configDirectory/gitUtils/gitStatusUtils.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';
import { textDocumentCodec, writeDurableDocument } from '../../../../../../../shared_code/utils/durableDocument.js';

const router = express.Router();

const ASSET_TYPE_TO_FILENAME: Record<CustomAssetType, string> = {
  style_css: 'style.css',
  javascript_js: 'javascript.js',
};

const isValidAssetType = (t: string): t is CustomAssetType =>
  t === 'style_css' || t === 'javascript_js';

const validateBundleSlug = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { bundleSlug } = req.params;
  if (!bundleSlug || !/^[a-zA-Z0-9-_]+$/.test(bundleSlug)) {
    res.status(400).json({ error: 'Invalid bundle slug' });
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

router.get('/generation/custom-assets/global', (_req, res) => {
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

router.get('/generation/custom-assets/global/folder-path', (_req, res) => {
  const dir = getCustomAssetsDir('global');
  mkdirSync(dir, { recursive: true });
  res.json({ path: dir });
});

router.get('/generation/custom-assets/global/:assetType', (req, res) => {
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

router.put('/generation/custom-assets/global/:assetType', (req, res) => {
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
    writeDurableDocument({ path: path.join(dir, filename), value: content, codec: textDocumentCodec });
    res.json({ success: true });
    commitInBackground([getConfigDirectory()], `Update global custom asset: ${filename}`);
  } catch (error) {
    logger.error(`Error saving global custom asset: ${String(error)}`);
    res.status(500).json({ error: 'Failed to save global custom asset' });
  }
});

router.delete('/generation/custom-assets/global/:assetType', (req, res) => {
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

router.post('/generation/custom-assets/global/base-disabled', (req, res) => {
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

// ─── Bundle routes ─────────────────────────────────────────────────────────────

router.get('/bundles/:bundleSlug/generation/custom-assets', validateBundleSlug, (req, res) => {
  const { bundleSlug } = req.params;
  try {
    const globalAssets = (['style_css', 'javascript_js'] as CustomAssetType[]).map(t =>
      getCustomAssetMetadata('global', t)
    );
    const bundleAssets = (['style_css', 'javascript_js'] as CustomAssetType[]).map(t =>
      getCustomAssetMetadata('bundle', t, bundleSlug)
    );

    const bundleDir = getBundleDirectory(bundleSlug);
    const bundleConfig = loadBundleConfig(bundleDir);
    const appConfig = loadAppConfig(getConfigDirectory());

    res.json({
      globalAssets,
      bundleAssets,
      disableBaseStyleCss: appConfig.disableBaseStyleCss ?? false,
      disableBaseJavascriptJs: appConfig.disableBaseJavascriptJs ?? false,
      bundleDisableBaseStyleCss: bundleConfig.disableBaseStyleCss,
      bundleDisableBaseJavascriptJs: bundleConfig.disableBaseJavascriptJs,
    });
  } catch (error) {
    logger.error(`Error listing bundle custom assets: ${String(error)}`);
    res.status(500).json({ error: 'Failed to list bundle custom assets' });
  }
});

router.get('/bundles/:bundleSlug/generation/custom-assets/folder-path', validateBundleSlug, (req, res) => {
  const { bundleSlug } = req.params;
  const dir = getCustomAssetsDir('bundle', bundleSlug);
  mkdirSync(dir, { recursive: true });
  res.json({ path: dir });
});

router.get('/bundles/:bundleSlug/generation/custom-assets/:assetType', validateBundleSlug, (req, res) => {
  const { bundleSlug, assetType } = req.params;
  if (!isValidAssetType(assetType)) {
    res.status(400).json({ error: 'Invalid asset type' });
    return;
  }
  try {
    const meta = getCustomAssetMetadata('bundle', assetType, bundleSlug);
    res.json(meta);
  } catch (error) {
    logger.error(`Error getting bundle custom asset: ${String(error)}`);
    res.status(500).json({ error: 'Failed to get bundle custom asset' });
  }
});

router.put('/bundles/:bundleSlug/generation/custom-assets/:assetType', validateBundleSlug, (req, res) => {
  const { bundleSlug, assetType } = req.params;
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
    const dir = BundleConfigPaths.getBundleCustomAssetsDir(getBundleDirectory(bundleSlug));
    mkdirSync(dir, { recursive: true });
    writeDurableDocument({ path: path.join(dir, filename), value: content, codec: textDocumentCodec });
    res.json({ success: true });
    commitInBackground([getConfigDirectory()], `Update bundle custom asset: ${filename} for ${bundleSlug}`);
  } catch (error) {
    logger.error(`Error saving bundle custom asset: ${String(error)}`);
    res.status(500).json({ error: 'Failed to save bundle custom asset' });
  }
});

router.delete('/bundles/:bundleSlug/generation/custom-assets/:assetType', validateBundleSlug, (req, res) => {
  const { bundleSlug, assetType } = req.params;
  if (!isValidAssetType(assetType)) {
    res.status(400).json({ error: 'Invalid asset type' });
    return;
  }
  try {
    const filename = ASSET_TYPE_TO_FILENAME[assetType];
    const filePath = BundleConfigPaths.getBundleCustomAssetFile(getBundleDirectory(bundleSlug), filename);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
    res.json({ success: true });
    commitInBackground([getConfigDirectory()], `Delete bundle custom asset: ${filename} for ${bundleSlug}`);
  } catch (error) {
    logger.error(`Error deleting bundle custom asset: ${String(error)}`);
    res.status(500).json({ error: 'Failed to delete bundle custom asset' });
  }
});

router.post('/bundles/:bundleSlug/generation/custom-assets/base-disabled', validateBundleSlug, (req, res) => {
  const { bundleSlug } = req.params;
  try {
    const { disableBaseStyleCss, disableBaseJavascriptJs } = req.body as {
      disableBaseStyleCss?: boolean | null;
      disableBaseJavascriptJs?: boolean | null;
    };
    const bundleDir = getBundleDirectory(bundleSlug);
    const bundleConfig = loadBundleConfig(bundleDir);

    if (typeof disableBaseStyleCss === 'boolean') {
      bundleConfig.disableBaseStyleCss = disableBaseStyleCss;
    } else if (disableBaseStyleCss === null) {
      delete bundleConfig.disableBaseStyleCss;
    }
    if (typeof disableBaseJavascriptJs === 'boolean') {
      bundleConfig.disableBaseJavascriptJs = disableBaseJavascriptJs;
    } else if (disableBaseJavascriptJs === null) {
      delete bundleConfig.disableBaseJavascriptJs;
    }
    saveBundleConfig(bundleDir, bundleConfig);
    res.json({ success: true });
    commitInBackground([getConfigDirectory()], `Update base asset disabled settings for ${bundleSlug}`);
  } catch (error) {
    logger.error(`Error updating bundle base-disabled settings: ${String(error)}`);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
