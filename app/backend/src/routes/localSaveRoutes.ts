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
import path from 'path';
import os from 'os';
import zlib from 'zlib';
import { getConfigDirectory, getSiteDirectory } from './siteConfigRoutes.js';
import { SiteConfigPaths } from '../../../shared_code/paths/siteConfigPaths.js';
import { AppConfigPaths } from '../../../shared_code/paths/appConfigPaths.js';
import { createZipFromDirectory } from '../utils/zipUtils.js';
import { findUniqueName } from '../utils/uniqueNameUtils.js';
import { buildFilteredMarkdownExportForSite } from '../utils/markdownExportBuilder.js';
import { loadGzipPathSet, COMPRESSION_MANIFEST_FILENAME } from '../../../shared_code/utils/compressionManifestUtils.js';

// For 'raw' source: produces (and returns the path to) a filtered markdown
// export directory that excludes orphaned-tracked and non-whitelisted pages,
// matching the site-publish path. For 'html': returns the preview directory
// as-is.
async function resolveSourcePath(siteDir: string, sourceType: 'raw' | 'html'): Promise<string> {
  if (sourceType === 'raw') {
    return await buildFilteredMarkdownExportForSite(siteDir);
  }
  return SiteConfigPaths.getPreviewDir(siteDir);
}

/**
 * Local-export equivalent of "decompress and serve with Content-Encoding": we
 * can't ship pre-gzipped bytes because file:// has no negotiation mechanism,
 * so a user double-clicking the exported HTML would get unparseable JS.
 * Stage the source into a temp dir, inflate any gzipped assets back to raw
 * bytes, and drop the manifest itself before exporting.
 *
 * Returns the source path unchanged when there's nothing to inflate (e.g.
 * raw-markdown exports, sites without the excalidraw vendor).
 */
function stageForLocalExport(sourcePath: string): { stagedPath: string; cleanup: () => void } {
  const assetsDir = path.join(sourcePath, '_mw_assets');
  const gzipped = fs.existsSync(assetsDir) ? loadGzipPathSet(assetsDir) : null;
  if (!gzipped || gzipped.size === 0) {
    return { stagedPath: sourcePath, cleanup: () => { /* nothing to clean */ } };
  }

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-export-'));
  try {
    fs.cpSync(sourcePath, stagingDir, { recursive: true });
    const stagedAssetsDir = path.join(stagingDir, '_mw_assets');
    for (const relPath of gzipped) {
      const fullPath = path.join(stagedAssetsDir, relPath);
      if (!fs.existsSync(fullPath)) continue;
      fs.writeFileSync(fullPath, zlib.gunzipSync(fs.readFileSync(fullPath)));
    }
    const manifestPath = path.join(stagedAssetsDir, COMPRESSION_MANIFEST_FILENAME);
    if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
    return {
      stagedPath: stagingDir,
      cleanup: () => { fs.rmSync(stagingDir, { recursive: true, force: true }); }
    };
  } catch (err) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw err;
  }
}

const router = express.Router();

interface CopyToDirectoryBody {
  sourceType: 'raw' | 'html';
  destinationPath: string;
}

interface CreateZipBody {
  sourceType: 'raw' | 'html';
  destinationPath: string;
}

// Get paths for a site's local content
router.get('/site/:siteSlug/local-paths', (req, res) => {
  const { siteSlug } = req.params;
  const siteDir = getSiteDirectory(siteSlug);

  const configDir = getConfigDirectory();

  res.json({
    appConfigFile: AppConfigPaths.getAppConfigFile(configDir),
    rawMarkdown: SiteConfigPaths.getTrackedPageContentDir(siteDir),
    previewHtml: SiteConfigPaths.getPreviewDir(siteDir),
    siteConfigFile: SiteConfigPaths.getSiteConfigFile(siteDir),
    sitePageConfigFile: SiteConfigPaths.getSitePageConfigFile(siteDir),
  });
});

// Copy directory to destination
// If the destination folder is empty, exports directly into it.
// If not empty, creates a subfolder named after the site slug (with incrementing suffix if needed).
// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.post('/site/:siteSlug/copy-to-directory', async (req, res) => {
  const { siteSlug } = req.params;
  const body = req.body as CopyToDirectoryBody;
  const { sourceType, destinationPath } = body;

  const siteDir = getSiteDirectory(siteSlug);
  const sourcePath = await resolveSourcePath(siteDir, sourceType);

  // Check if source exists
  if (!fs.existsSync(sourcePath)) {
    res.status(404).json({ error: 'Source directory not found' });
    return;
  }

  // Determine the actual destination: if folder is non-empty, create a slug subfolder
  let actualDestination = destinationPath;
  let destinationEmpty = true;

  if (fs.existsSync(destinationPath)) {
    const contents = fs.readdirSync(destinationPath);
    destinationEmpty = contents.length === 0;
  }

  if (!destinationEmpty) {
    // Folder has contents — create a subfolder with the site slug name (auto-incrementing if needed)
    const uniqueName = findUniqueName(siteSlug, (name) =>
      fs.existsSync(path.join(destinationPath, name))
    );
    actualDestination = path.join(destinationPath, uniqueName);
  }

  const staged = stageForLocalExport(sourcePath);
  try {
    fs.cpSync(staged.stagedPath, actualDestination, { recursive: true });
    res.json({ success: true, exportPath: actualDestination });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Copy failed: ${errorMessage}` });
  } finally {
    staged.cleanup();
  }
});

// Create zip file
// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.post('/site/:siteSlug/create-zip', async (req, res) => {
  const { siteSlug } = req.params;
  const body = req.body as CreateZipBody;
  const { sourceType, destinationPath } = body;

  const siteDir = getSiteDirectory(siteSlug);
  const sourcePath = await resolveSourcePath(siteDir, sourceType);

  if (!fs.existsSync(sourcePath)) {
    res.status(404).json({ error: 'Source directory not found' });
    return;
  }

  // Find non-conflicting filename
  let finalPath = destinationPath;
  let counter = 1;
  const ext = path.extname(destinationPath);
  const base = destinationPath.slice(0, -ext.length);

  while (fs.existsSync(finalPath)) {
    finalPath = `${base}-${counter}${ext}`;
    counter++;
  }

  const staged = stageForLocalExport(sourcePath);
  try {
    await createZipFromDirectory(staged.stagedPath, finalPath);
    res.json({ success: true, path: finalPath });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Zip creation failed: ${errorMessage}` });
  } finally {
    staged.cleanup();
  }
});

export default router;
