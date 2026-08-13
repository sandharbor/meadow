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
import YAML from 'yaml';
import { GeneratedSiteVersion } from '../../../../../../shared_code/types/siteConfig.js';
import { SiteConfigPaths } from '../../../../../../shared_code/paths/siteConfigPaths.js';
import { loadAppConfig as loadAppConfigFromDisk } from '../../../../../../shared_code/utils/appConfigUtils.js';
import { getConfigDirectory, getSiteDirectory, getSiteConfigPath } from '../../../../shared/site-config/siteConfigPaths.js';
import { loadYamlFromPath, saveYamlToPath } from '../../../../shared/utils/siteConfigUtils.js';
import { commitSiteChanges, getGeneratedHtmlChanges } from '../../../../shared/utils/configDirectory/gitUtils/generatedHtmlGitService.js';
import { getConfFileTree, getGeneratedHtmlFileTree, getOriginalContent, readFileContent, findGitRoot, detectFileType, getMimeType } from '../../../../shared/utils/confFileExplorerUtils.js';
import { runGitDirLogNative, runGitCommitFilesNative, runGitCatFileNative, runGitFileLogNative, runGitHtmlSectionDiffNative } from '../../../../shared/utils/configDirectory/gitUtils/gitStatusUtils.js';
import { logSiteInfo } from '../../../../shared/utils/logging/siteLogger.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';

const router = express.Router();

const loadAppConfig = () => loadAppConfigFromDisk(getConfigDirectory());

// Get preview changes (diff between preview and last published)
router.get('/sites/:siteSlug/review/preview-changes', (req, res, next) => {
  try {
    const { siteSlug } = req.params;
    
    if (!siteSlug) {
      return res.status(400).json({ error: 'siteSlug is required' });
    }

    const siteDirectory = getSiteDirectory(siteSlug);
    
    if (!fs.existsSync(siteDirectory)) {
      return res.status(404).json({ error: `Site '${siteSlug}' not found` });
    }

    const changes = getGeneratedHtmlChanges(siteDirectory);
    
    res.json({
      success: true,
      changedFiles: changes.changedFiles,
      fileDiffs: changes.fileDiffs
    });
    
  } catch (error) {
    logger.error('Error getting preview changes:', error);
    next(error);
  }
});

// Save preview changes to git (without publishing)
router.get('/sites/:siteSlug/review/save-changes', (req, res, next) => {
  void (async () => {
    try {
      const { siteSlug } = req.params;

      if (!siteSlug) {
        return res.status(400).json({ error: 'siteSlug is required' });
      }

      const siteDirectory = getSiteDirectory(siteSlug);

      if (!fs.existsSync(siteDirectory)) {
        return res.status(404).json({ error: `Site '${siteSlug}' not found` });
      }

      // Check if git auto-management is enabled
      const appConfigForGit = loadAppConfig();
      if (appConfigForGit.manageGitAutomatically === false) {
        logSiteInfo(siteSlug, '[save-changes] Git commit skipped (manageGitAutomatically=false)');
        return res.json({ success: true, skipped: true, message: 'Git auto-management is disabled' });
      }

      logSiteInfo(siteSlug, '[save-changes] Committing changes to git...');
      const commitSha = await commitSiteChanges(siteDirectory, 'user saved changes to preview');

      if (commitSha) {
        logSiteInfo(siteSlug, `[save-changes] Git commit successful: ${commitSha}`);
        res.json({ success: true, commitSha });
      } else {
        logSiteInfo(siteSlug, '[save-changes] Git commit: no changes to commit');
        res.json({ success: true, noChanges: true, message: 'No changes to commit' });
      }
    } catch (error) {
      logger.error('Error saving changes:', error);
      next(error);
    }
  })();
});

// Get file tree for site's conf directory
router.get('/sites/:siteSlug/review/conf-files/tree', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      const changedOnly = req.query.changedOnly === 'true';
      
      if (!siteSlug) {
        return res.status(400).json({ error: 'siteSlug is required' });
      }

      const siteDirectory = getSiteDirectory(siteSlug);
      
      if (!fs.existsSync(siteDirectory)) {
        return res.status(404).json({ error: `Site '${siteSlug}' not found` });
      }

      const treeData = await getConfFileTree(siteDirectory, changedOnly);
      res.json(treeData);
      
    } catch (error) {
      logger.error('Error getting conf file tree:', error);
      next(error);
    }
  })().catch(next);
});

// Get the file tree for the site's current generated HTML.
router.get('/sites/:siteSlug/review/preview-files/tree', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      const changedOnly = req.query.changedOnly === 'true';
      
      if (!siteSlug) {
        return res.status(400).json({ error: 'siteSlug is required' });
      }

      const siteDirectory = getSiteDirectory(siteSlug);
      
      if (!fs.existsSync(siteDirectory)) {
        return res.status(404).json({ error: `Site '${siteSlug}' not found` });
      }

      const treeData = await getGeneratedHtmlFileTree(siteDirectory, changedOnly);
      res.json(treeData);
      
    } catch (error) {
      logger.error('Error getting preview file tree:', error);
      next(error);
    }
  })().catch(next);
});

// Get HTML section changes for the current generated HTML (working tree vs index).
router.get('/sites/:siteSlug/review/preview-files/html-section-changes', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      if (!siteSlug) return res.status(400).json({ error: 'siteSlug is required' });

      const siteDirectory = getSiteDirectory(siteSlug);
      if (!fs.existsSync(siteDirectory)) return res.status(404).json({ error: `Site '${siteSlug}' not found` });

      const generatedHtmlDir = SiteConfigPaths.getGeneratedHtmlDir(siteDirectory);
      if (!fs.existsSync(generatedHtmlDir)) {
        return res.json({ files: [] });
      }

      const result = await runGitHtmlSectionDiffNative(generatedHtmlDir);
      res.json(result);
    } catch (error) {
      logger.error('Error getting preview HTML section changes:', error);
      next(error);
    }
  })().catch(next);
});

// Get file content (works for both conf and preview directories)
router.get('/sites/:siteSlug/review/file-content', (req, res, next) => {
  try {
    const { siteSlug } = req.params;
    const filePath = req.query.path as string;
    
    if (!siteSlug) {
      return res.status(400).json({ error: 'siteSlug is required' });
    }
    
    if (!filePath) {
      return res.status(400).json({ error: 'path query parameter is required' });
    }

    const siteDirectory = getSiteDirectory(siteSlug);
    
    if (!fs.existsSync(siteDirectory)) {
      return res.status(404).json({ error: `Site '${siteSlug}' not found` });
    }

    // Security: ensure path is within the site directory
    const normalizedPath = fs.realpathSync(filePath);
    const normalizedSiteDir = fs.realpathSync(siteDirectory);
    
    if (!normalizedPath.startsWith(normalizedSiteDir)) {
      return res.status(403).json({ error: 'Access denied - path outside site directory' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'Cannot read directory content' });
    }

    const { content, fileType, mimeType } = readFileContent(filePath);
    res.json({ content, path: filePath, fileType, mimeType });
    
  } catch (error) {
    logger.error('Error reading file:', error);
    next(error);
  }
});

// Get original (committed) file content for diff comparison
router.get('/sites/:siteSlug/review/file-original', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      const filePath = req.query.path as string;
      
      if (!siteSlug) {
        return res.status(400).json({ error: 'siteSlug is required' });
      }
      
      if (!filePath) {
        return res.status(400).json({ error: 'path query parameter is required' });
      }

      const siteDirectory = getSiteDirectory(siteSlug);
      
      if (!fs.existsSync(siteDirectory)) {
        return res.status(404).json({ error: `Site '${siteSlug}' not found` });
      }

      // Security: ensure path is within the site directory (handle non-existent files)
      // Use realpathSync for both to handle macOS /var -> /private/var symlink consistently.
      // For the file path, resolve what exists (the parent dir) to handle deleted files.
      const normalizedSiteDir = fs.realpathSync(siteDirectory);
      const fileDir = path.dirname(filePath);
      const resolvedPath = fs.existsSync(filePath)
        ? fs.realpathSync(filePath)
        : fs.existsSync(fileDir)
          ? path.join(fs.realpathSync(fileDir), path.basename(filePath))
          : path.resolve(filePath);

      if (!resolvedPath.startsWith(normalizedSiteDir)) {
        return res.status(403).json({ error: 'Access denied - path outside site directory' });
      }

      const { content, isNew, fileType, mimeType } = await getOriginalContent(filePath);
      res.json({ content, path: filePath, isNew, fileType, mimeType });
      
    } catch (error) {
      logger.error('Error reading original file:', error);
      next(error);
    }
  })().catch(next);
});

// === Config File Explorer Git History API (fast_git_ops) ===

// Directory change log (like `git log -- <dir>`)
router.get('/sites/:siteSlug/review/git/dir-log', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      const dir = req.query.dir as string;
      const limit = Number(req.query.limit ?? 50) || 50;

      if (!siteSlug) return res.status(400).json({ error: 'siteSlug is required' });
      if (!dir) return res.status(400).json({ error: 'dir query parameter is required' });

      const siteDirectory = getSiteDirectory(siteSlug);
      if (!fs.existsSync(siteDirectory)) return res.status(404).json({ error: `Site '${siteSlug}' not found` });

      const normalizedSiteDir = fs.realpathSync(siteDirectory);
      const normalizedDir = fs.realpathSync(dir);
      if (!normalizedDir.startsWith(normalizedSiteDir)) {
        return res.status(403).json({ error: 'Access denied - dir outside site directory' });
      }

      const result = await runGitDirLogNative(normalizedDir, limit);
      res.json(result);
    } catch (error) {
      logger.error('Error getting dir log:', error);
      next(error);
    }
  })().catch(next);
});

// Commit changed files (all files in commit)
router.get('/sites/:siteSlug/review/git/commit-files', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      const sha = req.query.sha as string;
      const contextDir = req.query.contextDir as string;

      if (!siteSlug) return res.status(400).json({ error: 'siteSlug is required' });
      if (!sha) return res.status(400).json({ error: 'sha query parameter is required' });
      if (!contextDir) return res.status(400).json({ error: 'contextDir query parameter is required' });

      const siteDirectory = getSiteDirectory(siteSlug);
      if (!fs.existsSync(siteDirectory)) return res.status(404).json({ error: `Site '${siteSlug}' not found` });

      const normalizedSiteDir = fs.realpathSync(siteDirectory);
      const normalizedContextDir = fs.realpathSync(contextDir);
      if (!normalizedContextDir.startsWith(normalizedSiteDir)) {
        return res.status(403).json({ error: 'Access denied - contextDir outside site directory' });
      }

      const gitRoot = findGitRoot(normalizedContextDir);
      if (!gitRoot) return res.status(400).json({ error: 'Not in a git repository' });
      const normalizedGitRoot = fs.realpathSync(gitRoot);
      // It's valid for the git root to be an ancestor of the site directory (e.g. repo at ~/.config/meadow).
      // We still enforce that all requested paths remain within the site directory.
      if (!normalizedSiteDir.startsWith(normalizedGitRoot)) {
        return res.status(403).json({ error: 'Access denied - site directory outside git root' });
      }

      const result = await runGitCommitFilesNative(normalizedContextDir, sha);
      const files = (result.files || []).map((f) => {
        const absPath = path.join(normalizedGitRoot, f.path);
        const relFromContext = path.relative(normalizedContextDir, absPath);
        const outsideContextDir = relFromContext.startsWith('..' + path.sep) || relFromContext === '..';
        return {
          repoPath: f.path,
          path: absPath,
          status: f.status,
          relFromContext,
          outsideContextDir,
        };
      });

      res.json({ sha: result.sha, parent_sha: result.parent_sha, files });
    } catch (error) {
      logger.error('Error getting commit files:', error);
      next(error);
    }
  })().catch(next);
});

// Diff HTML sections for a specific commit vs its parent, scoped to a context directory
router.get('/sites/:siteSlug/review/git/html-section-diff', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      const sha = req.query.sha as string;
      const contextDir = req.query.contextDir as string;

      if (!siteSlug) return res.status(400).json({ error: 'siteSlug is required' });
      if (!sha) return res.status(400).json({ error: 'sha query parameter is required' });
      if (!contextDir) return res.status(400).json({ error: 'contextDir query parameter is required' });

      const siteDirectory = getSiteDirectory(siteSlug);
      if (!fs.existsSync(siteDirectory)) return res.status(404).json({ error: `Site '${siteSlug}' not found` });

      const normalizedSiteDir = fs.realpathSync(siteDirectory);
      const normalizedContextDir = fs.realpathSync(contextDir);
      if (!normalizedContextDir.startsWith(normalizedSiteDir)) {
        return res.status(403).json({ error: 'Access denied - contextDir outside site directory' });
      }

      const result = await runGitHtmlSectionDiffNative(normalizedContextDir, sha);
      res.json(result);
    } catch (error) {
      logger.error('Error diffing HTML sections for commit:', error);
      next(error);
    }
  })().catch(next);
});

// File content at a specific commit (for commit viewer)
router.get('/sites/:siteSlug/review/git/commit-file-content', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      const sha = req.query.sha as string;
      const filePath = req.query.path as string;
      const contextDir = (req.query.contextDir as string) || path.dirname(filePath || '');

      if (!siteSlug) return res.status(400).json({ error: 'siteSlug is required' });
      if (!sha) return res.status(400).json({ error: 'sha query parameter is required' });
      if (!filePath) return res.status(400).json({ error: 'path query parameter is required' });

      const siteDirectory = getSiteDirectory(siteSlug);
      if (!fs.existsSync(siteDirectory)) return res.status(404).json({ error: `Site '${siteSlug}' not found` });

      const normalizedSiteDir = fs.realpathSync(siteDirectory);
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(normalizedSiteDir)) {
        return res.status(403).json({ error: 'Access denied - path outside site directory' });
      }

      const gitRoot = findGitRoot(resolvedPath);
      if (!gitRoot) return res.status(400).json({ error: 'Not in a git repository' });
      const normalizedGitRoot = fs.realpathSync(gitRoot);
      if (!normalizedSiteDir.startsWith(normalizedGitRoot)) {
        return res.status(403).json({ error: 'Access denied - site directory outside git root' });
      }

      const repoRel = path.relative(normalizedGitRoot, resolvedPath).replace(/\\/g, '/');
      const cat = await runGitCatFileNative(contextDir, sha, repoRel);

      const fileType = detectFileType(resolvedPath);
      if (!cat.found) {
        return res.json({ content: '', path: resolvedPath, fileType });
      }

      if (fileType === 'binary') {
        return res.json({ content: '', path: resolvedPath, fileType: 'binary' });
      }

      if (fileType === 'image') {
        const mimeType = getMimeType(resolvedPath);
        const content = cat.data_base64 ? `data:${mimeType};base64,${cat.data_base64}` : '';
        return res.json({ content, path: resolvedPath, fileType: 'image', mimeType });
      }

      const content = cat.data_base64 ? Buffer.from(cat.data_base64, 'base64').toString('utf-8') : '';
      return res.json({ content, path: resolvedPath, fileType: 'text' });
    } catch (error) {
      logger.error('Error reading commit file content:', error);
      next(error);
    }
  })().catch(next);
});

// File content at parent of a commit (for commit viewer diffs)
router.get('/sites/:siteSlug/review/git/commit-file-original', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      const sha = req.query.sha as string;
      const parentSha = (req.query.parentSha as string) || null;
      const filePath = req.query.path as string;
      const contextDir = (req.query.contextDir as string) || path.dirname(filePath || '');

      if (!siteSlug) return res.status(400).json({ error: 'siteSlug is required' });
      if (!sha) return res.status(400).json({ error: 'sha query parameter is required' });
      if (!filePath) return res.status(400).json({ error: 'path query parameter is required' });

      const siteDirectory = getSiteDirectory(siteSlug);
      if (!fs.existsSync(siteDirectory)) return res.status(404).json({ error: `Site '${siteSlug}' not found` });

      const normalizedSiteDir = fs.realpathSync(siteDirectory);
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(normalizedSiteDir)) {
        return res.status(403).json({ error: 'Access denied - path outside site directory' });
      }

      const gitRoot = findGitRoot(resolvedPath);
      if (!gitRoot) return res.status(400).json({ error: 'Not in a git repository' });
      const normalizedGitRoot = fs.realpathSync(gitRoot);
      if (!normalizedSiteDir.startsWith(normalizedGitRoot)) {
        return res.status(403).json({ error: 'Access denied - site directory outside git root' });
      }

      const resolvedParentSha =
        parentSha ||
        (await runGitCommitFilesNative(contextDir, sha)).parent_sha ||
        null;

      const fileType = detectFileType(resolvedPath);
      const mimeType = fileType === 'image' ? getMimeType(resolvedPath) : undefined;

      if (!resolvedParentSha) {
        return res.json({ content: null, path: resolvedPath, isNew: true, fileType, mimeType });
      }

      const repoRel = path.relative(normalizedGitRoot, resolvedPath).replace(/\\/g, '/');
      const cat = await runGitCatFileNative(contextDir, resolvedParentSha, repoRel);

      if (!cat.found) {
        return res.json({ content: null, path: resolvedPath, isNew: true, fileType, mimeType });
      }

      if (fileType === 'binary') {
        return res.json({ content: null, path: resolvedPath, isNew: false, fileType: 'binary' });
      }

      if (fileType === 'image') {
        const content = cat.data_base64 ? `data:${mimeType};base64,${cat.data_base64}` : null;
        return res.json({ content, path: resolvedPath, isNew: false, fileType: 'image', mimeType });
      }

      const content = cat.data_base64 ? Buffer.from(cat.data_base64, 'base64').toString('utf-8') : '';
      return res.json({ content, path: resolvedPath, isNew: false, fileType: 'text' });
    } catch (error) {
      logger.error('Error reading commit file original:', error);
      next(error);
    }
  })().catch(next);
});

// Single-file log (newest-first, no merges)
router.get('/sites/:siteSlug/review/git/file-log', (req, res, next) => {
  (async () => {
    try {
      const { siteSlug } = req.params;
      const filePath = req.query.path as string;
      const limit = Number(req.query.limit ?? 50) || 50;

      if (!siteSlug) return res.status(400).json({ error: 'siteSlug is required' });
      if (!filePath) return res.status(400).json({ error: 'path query parameter is required' });

      const siteDirectory = getSiteDirectory(siteSlug);
      if (!fs.existsSync(siteDirectory)) return res.status(404).json({ error: `Site '${siteSlug}' not found` });

      const normalizedSiteDir = fs.realpathSync(siteDirectory);
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(normalizedSiteDir)) {
        return res.status(403).json({ error: 'Access denied - path outside site directory' });
      }

      const gitRoot = findGitRoot(resolvedPath);
      if (!gitRoot) return res.status(400).json({ error: 'Not in a git repository' });
      const normalizedGitRoot = fs.realpathSync(gitRoot);
      if (!normalizedSiteDir.startsWith(normalizedGitRoot)) {
        return res.status(403).json({ error: 'Access denied - site directory outside git root' });
      }

      const repoRel = path.relative(normalizedGitRoot, resolvedPath).replace(/\\/g, '/');
      const result = await runGitFileLogNative(path.dirname(resolvedPath), repoRel, limit);
      res.json(result);
    } catch (error) {
      logger.error('Error getting file log:', error);
      next(error);
    }
  })().catch(next);
});

// Version management endpoints

// Get all versions for a site
router.get('/sites/:siteSlug/review/versions', (req, res, next) => {
  try {
    const { siteSlug } = req.params;
    
    if (!siteSlug) {
      return res.status(400).json({ error: 'siteSlug is required' });
    }

    const versionsPath = getSiteConfigPath(siteSlug, 'generated_site_versions.yaml');
    
    if (!fs.existsSync(versionsPath)) {
      return res.json({ versions: [] });
    }

    const versionsData = loadYamlFromPath<{ versions: GeneratedSiteVersion[] }>(versionsPath);
    
    res.json(versionsData);
  } catch (error) {
    next(error);
  }
});

// Update version notes
router.patch('/sites/:siteSlug/review/versions/:versionId', (req, res, next) => {
  try {
    const { siteSlug, versionId } = req.params;
    const { notes } = req.body as { notes: string };
    
    if (!siteSlug || !versionId) {
      return res.status(400).json({ error: 'siteSlug and versionId are required' });
    }

    const versionsPath = getSiteConfigPath(siteSlug, 'generated_site_versions.yaml');
    
    if (!fs.existsSync(versionsPath)) {
      return res.status(404).json({ error: 'No versions found for this site' });
    }

    const versionsData = loadYamlFromPath<{ versions: GeneratedSiteVersion[] }>(versionsPath);
    
    const versionIndex = versionsData.versions.findIndex(v => v.versionId === versionId);
    if (versionIndex === -1) {
      return res.status(404).json({ error: 'Version not found' });
    }

    versionsData.versions[versionIndex].notes = notes;
    versionsData.versions[versionIndex].lastUpdatedAt = new Date().toISOString();

    saveYamlToPath(versionsPath, versionsData);

    res.json({ success: true, message: 'Version notes updated successfully' });
  } catch (error) {
    next(error);
  }
});

// Delete a version
router.delete('/sites/:siteSlug/review/versions/:versionId', (req, res, next) => {
  try {
    const { siteSlug, versionId } = req.params;
    
    if (!siteSlug || !versionId) {
      return res.status(400).json({ error: 'siteSlug and versionId are required' });
    }

    const versionsPath = getSiteConfigPath(siteSlug, 'generated_site_versions.yaml');
    
    if (!fs.existsSync(versionsPath)) {
      return res.status(404).json({ error: 'No versions found for this site' });
    }

    const yamlContent = fs.readFileSync(versionsPath, 'utf8');
    const versionsData = YAML.parse(yamlContent) as { versions: GeneratedSiteVersion[] };
    
    const versionIndex = versionsData.versions.findIndex(v => v.versionId === versionId);
    if (versionIndex === -1) {
      return res.status(404).json({ error: 'Version not found' });
    }

    // Don't allow deleting the active version
    if (versionsData.versions[versionIndex].isActive) {
      return res.status(400).json({ error: 'Cannot delete the active version' });
    }

    // Remove the version from the array
    versionsData.versions.splice(versionIndex, 1);

    // Delete the immutable generated-site version.
    const versionDirectory = join(
      SiteConfigPaths.getGeneratedSiteVersionsDir(getSiteDirectory(siteSlug)),
      versionId,
    );
    if (fs.existsSync(versionDirectory)) {
      fs.rmSync(versionDirectory, { recursive: true, force: true });
    }

    const updatedYaml = YAML.stringify(versionsData);
    fs.writeFileSync(versionsPath, updatedYaml, 'utf8');

    res.json({ success: true, message: 'Version deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Set active version
router.post('/sites/:siteSlug/review/versions/:versionId/set-active', (req, res, next) => {
  try {
    const { siteSlug, versionId } = req.params;
    
    if (!siteSlug || !versionId) {
      return res.status(400).json({ error: 'siteSlug and versionId are required' });
    }

    const versionsPath = getSiteConfigPath(siteSlug, 'generated_site_versions.yaml');
    
    if (!fs.existsSync(versionsPath)) {
      return res.status(404).json({ error: 'No versions found for this site' });
    }

    const yamlContent = fs.readFileSync(versionsPath, 'utf8');
    const versionsData = YAML.parse(yamlContent) as { versions: GeneratedSiteVersion[] };
    
    const versionIndex = versionsData.versions.findIndex(v => v.versionId === versionId);
    if (versionIndex === -1) {
      return res.status(404).json({ error: 'Version not found' });
    }

    // Set all versions to inactive
    versionsData.versions.forEach(v => v.isActive = false);
    
    // Set the specified version as active
    versionsData.versions[versionIndex].isActive = true;

    const updatedYaml = YAML.stringify(versionsData);
    fs.writeFileSync(versionsPath, updatedYaml, 'utf8');

    res.json({ success: true, message: 'Active version updated successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
