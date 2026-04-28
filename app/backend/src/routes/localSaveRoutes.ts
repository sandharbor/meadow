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
import { getConfigDirectory, getSiteDirectory } from './siteConfigRoutes.js';
import { SiteConfigPaths } from '../../../shared_code/paths/siteConfigPaths.js';
import { AppConfigPaths } from '../../../shared_code/paths/appConfigPaths.js';
import { createZipFromDirectory } from '../utils/zipUtils.js';
import { findUniqueName } from '../utils/uniqueNameUtils.js';
import { buildFilteredMarkdownExportForSite } from '../utils/markdownExportBuilder.js';

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

  try {
    fs.cpSync(sourcePath, actualDestination, { recursive: true });
    res.json({ success: true, exportPath: actualDestination });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Copy failed: ${errorMessage}` });
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

  try {
    await createZipFromDirectory(sourcePath, finalPath);
    res.json({ success: true, path: finalPath });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Zip creation failed: ${errorMessage}` });
  }
});

export default router;
