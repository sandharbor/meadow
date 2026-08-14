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
import { GeneratedBundleVersion } from '../../../../../../shared_code/types/bundleConfig.js';
import { BundleConfigPaths } from '../../../../../../shared_code/paths/bundleConfigPaths.js';
import { loadAppConfig as loadAppConfigFromDisk } from '../../../../../../shared_code/utils/appConfigUtils.js';
import { getConfigDirectory, getBundleDirectory, getBundleConfigPath } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { loadYamlFromPath, saveYamlToPath } from '../../../../shared/utils/bundleConfigUtils.js';
import { commitBundleChanges, getGeneratedHtmlChanges } from '../../../../shared/utils/configDirectory/gitUtils/generatedHtmlGitService.js';
import { getConfigFileTree, getGeneratedHtmlFileTree, getOriginalContent, readFileContent, findGitRoot, detectFileType, getMimeType } from '../../../../shared/utils/configFileExplorerUtils.js';
import { runGitDirLogNative, runGitCommitFilesNative, runGitCatFileNative, runGitFileLogNative, runGitHtmlSectionDiffNative } from '../../../../shared/utils/configDirectory/gitUtils/gitStatusUtils.js';
import { logBundleInfo } from '../../../../shared/utils/logging/bundleLogger.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';

const router = express.Router();

const loadAppConfig = () => loadAppConfigFromDisk(getConfigDirectory());

// Get preview changes (diff between preview and last published)
router.get('/bundles/:bundleSlug/review/preview-changes', (req, res, next) => {
  try {
    const { bundleSlug } = req.params;
    
    if (!bundleSlug) {
      return res.status(400).json({ error: 'bundleSlug is required' });
    }

    const bundleDirectory = getBundleDirectory(bundleSlug);
    
    if (!fs.existsSync(bundleDirectory)) {
      return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
    }

    const changes = getGeneratedHtmlChanges(bundleDirectory);
    
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
router.get('/bundles/:bundleSlug/review/save-changes', (req, res, next) => {
  void (async () => {
    try {
      const { bundleSlug } = req.params;

      if (!bundleSlug) {
        return res.status(400).json({ error: 'bundleSlug is required' });
      }

      const bundleDirectory = getBundleDirectory(bundleSlug);

      if (!fs.existsSync(bundleDirectory)) {
        return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
      }

      // Check if git auto-management is enabled
      const appConfigForGit = loadAppConfig();
      if (appConfigForGit.manageGitAutomatically === false) {
        logBundleInfo(bundleSlug, '[save-changes] Git commit skipped (manageGitAutomatically=false)');
        return res.json({ success: true, skipped: true, message: 'Git auto-management is disabled' });
      }

      logBundleInfo(bundleSlug, '[save-changes] Committing changes to git...');
      const commitSha = await commitBundleChanges(bundleDirectory, 'user saved changes to preview');

      if (commitSha) {
        logBundleInfo(bundleSlug, `[save-changes] Git commit successful: ${commitSha}`);
        res.json({ success: true, commitSha });
      } else {
        logBundleInfo(bundleSlug, '[save-changes] Git commit: no changes to commit');
        res.json({ success: true, noChanges: true, message: 'No changes to commit' });
      }
    } catch (error) {
      logger.error('Error saving changes:', error);
      next(error);
    }
  })();
});

// Get file tree for the bundle's config directory
router.get('/bundles/:bundleSlug/review/config-files/tree', (req, res, next) => {
  (async () => {
    try {
      const { bundleSlug } = req.params;
      const changedOnly = req.query.changedOnly === 'true';
      
      if (!bundleSlug) {
        return res.status(400).json({ error: 'bundleSlug is required' });
      }

      const bundleDirectory = getBundleDirectory(bundleSlug);
      
      if (!fs.existsSync(bundleDirectory)) {
        return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
      }

      const treeData = await getConfigFileTree(bundleDirectory, changedOnly);
      res.json(treeData);
      
    } catch (error) {
      logger.error('Error getting config file tree:', error);
      next(error);
    }
  })().catch(next);
});

// Get the file tree for the bundle's current generated HTML.
router.get('/bundles/:bundleSlug/review/preview-files/tree', (req, res, next) => {
  (async () => {
    try {
      const { bundleSlug } = req.params;
      const changedOnly = req.query.changedOnly === 'true';
      
      if (!bundleSlug) {
        return res.status(400).json({ error: 'bundleSlug is required' });
      }

      const bundleDirectory = getBundleDirectory(bundleSlug);
      
      if (!fs.existsSync(bundleDirectory)) {
        return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
      }

      const treeData = await getGeneratedHtmlFileTree(bundleDirectory, changedOnly);
      res.json(treeData);
      
    } catch (error) {
      logger.error('Error getting preview file tree:', error);
      next(error);
    }
  })().catch(next);
});

// Get HTML section changes for the current generated HTML (working tree vs index).
router.get('/bundles/:bundleSlug/review/preview-files/html-section-changes', (req, res, next) => {
  (async () => {
    try {
      const { bundleSlug } = req.params;
      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });

      const bundleDirectory = getBundleDirectory(bundleSlug);
      if (!fs.existsSync(bundleDirectory)) return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });

      const generatedHtmlDir = BundleConfigPaths.getGeneratedHtmlDir(bundleDirectory);
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
router.get('/bundles/:bundleSlug/review/file-content', (req, res, next) => {
  try {
    const { bundleSlug } = req.params;
    const filePath = req.query.path as string;
    
    if (!bundleSlug) {
      return res.status(400).json({ error: 'bundleSlug is required' });
    }
    
    if (!filePath) {
      return res.status(400).json({ error: 'path query parameter is required' });
    }

    const bundleDirectory = getBundleDirectory(bundleSlug);
    
    if (!fs.existsSync(bundleDirectory)) {
      return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
    }

    // Security: ensure path is within the bundle directory
    const normalizedPath = fs.realpathSync(filePath);
    const normalizedBundleDir = fs.realpathSync(bundleDirectory);
    
    if (!normalizedPath.startsWith(normalizedBundleDir)) {
      return res.status(403).json({ error: 'Access denied - path outside bundle directory' });
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
router.get('/bundles/:bundleSlug/review/file-original', (req, res, next) => {
  (async () => {
    try {
      const { bundleSlug } = req.params;
      const filePath = req.query.path as string;
      
      if (!bundleSlug) {
        return res.status(400).json({ error: 'bundleSlug is required' });
      }
      
      if (!filePath) {
        return res.status(400).json({ error: 'path query parameter is required' });
      }

      const bundleDirectory = getBundleDirectory(bundleSlug);
      
      if (!fs.existsSync(bundleDirectory)) {
        return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
      }

      // Security: ensure path is within the bundle directory (handle non-existent files)
      // Use realpathSync for both to handle macOS /var -> /private/var symlink consistently.
      // For the file path, resolve what exists (the parent dir) to handle deleted files.
      const normalizedBundleDir = fs.realpathSync(bundleDirectory);
      const fileDir = path.dirname(filePath);
      const resolvedPath = fs.existsSync(filePath)
        ? fs.realpathSync(filePath)
        : fs.existsSync(fileDir)
          ? path.join(fs.realpathSync(fileDir), path.basename(filePath))
          : path.resolve(filePath);

      if (!resolvedPath.startsWith(normalizedBundleDir)) {
        return res.status(403).json({ error: 'Access denied - path outside bundle directory' });
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
router.get('/bundles/:bundleSlug/review/git/dir-log', (req, res, next) => {
  (async () => {
    try {
      const { bundleSlug } = req.params;
      const dir = req.query.dir as string;
      const limit = Number(req.query.limit ?? 50) || 50;

      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
      if (!dir) return res.status(400).json({ error: 'dir query parameter is required' });

      const bundleDirectory = getBundleDirectory(bundleSlug);
      if (!fs.existsSync(bundleDirectory)) return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });

      const normalizedBundleDir = fs.realpathSync(bundleDirectory);
      const normalizedDir = fs.realpathSync(dir);
      if (!normalizedDir.startsWith(normalizedBundleDir)) {
        return res.status(403).json({ error: 'Access denied - dir outside bundle directory' });
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
router.get('/bundles/:bundleSlug/review/git/commit-files', (req, res, next) => {
  (async () => {
    try {
      const { bundleSlug } = req.params;
      const sha = req.query.sha as string;
      const contextDir = req.query.contextDir as string;

      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
      if (!sha) return res.status(400).json({ error: 'sha query parameter is required' });
      if (!contextDir) return res.status(400).json({ error: 'contextDir query parameter is required' });

      const bundleDirectory = getBundleDirectory(bundleSlug);
      if (!fs.existsSync(bundleDirectory)) return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });

      const normalizedBundleDir = fs.realpathSync(bundleDirectory);
      const normalizedContextDir = fs.realpathSync(contextDir);
      if (!normalizedContextDir.startsWith(normalizedBundleDir)) {
        return res.status(403).json({ error: 'Access denied - contextDir outside bundle directory' });
      }

      const gitRoot = findGitRoot(normalizedContextDir);
      if (!gitRoot) return res.status(400).json({ error: 'Not in a git repository' });
      const normalizedGitRoot = fs.realpathSync(gitRoot);
      // It's valid for the git root to be an ancestor of the bundle directory (e.g. repo at ~/.config/meadow).
      // We still enforce that all requested paths remain within the bundle directory.
      if (!normalizedBundleDir.startsWith(normalizedGitRoot)) {
        return res.status(403).json({ error: 'Access denied - bundle directory outside git root' });
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
router.get('/bundles/:bundleSlug/review/git/html-section-diff', (req, res, next) => {
  (async () => {
    try {
      const { bundleSlug } = req.params;
      const sha = req.query.sha as string;
      const contextDir = req.query.contextDir as string;

      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
      if (!sha) return res.status(400).json({ error: 'sha query parameter is required' });
      if (!contextDir) return res.status(400).json({ error: 'contextDir query parameter is required' });

      const bundleDirectory = getBundleDirectory(bundleSlug);
      if (!fs.existsSync(bundleDirectory)) return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });

      const normalizedBundleDir = fs.realpathSync(bundleDirectory);
      const normalizedContextDir = fs.realpathSync(contextDir);
      if (!normalizedContextDir.startsWith(normalizedBundleDir)) {
        return res.status(403).json({ error: 'Access denied - contextDir outside bundle directory' });
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
router.get('/bundles/:bundleSlug/review/git/commit-file-content', (req, res, next) => {
  (async () => {
    try {
      const { bundleSlug } = req.params;
      const sha = req.query.sha as string;
      const filePath = req.query.path as string;
      const contextDir = (req.query.contextDir as string) || path.dirname(filePath || '');

      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
      if (!sha) return res.status(400).json({ error: 'sha query parameter is required' });
      if (!filePath) return res.status(400).json({ error: 'path query parameter is required' });

      const bundleDirectory = getBundleDirectory(bundleSlug);
      if (!fs.existsSync(bundleDirectory)) return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });

      const normalizedBundleDir = fs.realpathSync(bundleDirectory);
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(normalizedBundleDir)) {
        return res.status(403).json({ error: 'Access denied - path outside bundle directory' });
      }

      const gitRoot = findGitRoot(resolvedPath);
      if (!gitRoot) return res.status(400).json({ error: 'Not in a git repository' });
      const normalizedGitRoot = fs.realpathSync(gitRoot);
      if (!normalizedBundleDir.startsWith(normalizedGitRoot)) {
        return res.status(403).json({ error: 'Access denied - bundle directory outside git root' });
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
router.get('/bundles/:bundleSlug/review/git/commit-file-original', (req, res, next) => {
  (async () => {
    try {
      const { bundleSlug } = req.params;
      const sha = req.query.sha as string;
      const parentSha = (req.query.parentSha as string) || null;
      const filePath = req.query.path as string;
      const contextDir = (req.query.contextDir as string) || path.dirname(filePath || '');

      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
      if (!sha) return res.status(400).json({ error: 'sha query parameter is required' });
      if (!filePath) return res.status(400).json({ error: 'path query parameter is required' });

      const bundleDirectory = getBundleDirectory(bundleSlug);
      if (!fs.existsSync(bundleDirectory)) return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });

      const normalizedBundleDir = fs.realpathSync(bundleDirectory);
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(normalizedBundleDir)) {
        return res.status(403).json({ error: 'Access denied - path outside bundle directory' });
      }

      const gitRoot = findGitRoot(resolvedPath);
      if (!gitRoot) return res.status(400).json({ error: 'Not in a git repository' });
      const normalizedGitRoot = fs.realpathSync(gitRoot);
      if (!normalizedBundleDir.startsWith(normalizedGitRoot)) {
        return res.status(403).json({ error: 'Access denied - bundle directory outside git root' });
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
router.get('/bundles/:bundleSlug/review/git/file-log', (req, res, next) => {
  (async () => {
    try {
      const { bundleSlug } = req.params;
      const filePath = req.query.path as string;
      const limit = Number(req.query.limit ?? 50) || 50;

      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
      if (!filePath) return res.status(400).json({ error: 'path query parameter is required' });

      const bundleDirectory = getBundleDirectory(bundleSlug);
      if (!fs.existsSync(bundleDirectory)) return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });

      const normalizedBundleDir = fs.realpathSync(bundleDirectory);
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(normalizedBundleDir)) {
        return res.status(403).json({ error: 'Access denied - path outside bundle directory' });
      }

      const gitRoot = findGitRoot(resolvedPath);
      if (!gitRoot) return res.status(400).json({ error: 'Not in a git repository' });
      const normalizedGitRoot = fs.realpathSync(gitRoot);
      if (!normalizedBundleDir.startsWith(normalizedGitRoot)) {
        return res.status(403).json({ error: 'Access denied - bundle directory outside git root' });
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

// Get all versions for a bundle
router.get('/bundles/:bundleSlug/review/versions', (req, res, next) => {
  try {
    const { bundleSlug } = req.params;
    
    if (!bundleSlug) {
      return res.status(400).json({ error: 'bundleSlug is required' });
    }

    const versionsPath = getBundleConfigPath(bundleSlug, 'generated_bundle_versions.yaml');
    
    if (!fs.existsSync(versionsPath)) {
      return res.json({ versions: [] });
    }

    const versionsData = loadYamlFromPath<{ versions: GeneratedBundleVersion[] }>(versionsPath);
    
    res.json(versionsData);
  } catch (error) {
    next(error);
  }
});

// Update version notes
router.patch('/bundles/:bundleSlug/review/versions/:versionId', (req, res, next) => {
  try {
    const { bundleSlug, versionId } = req.params;
    const { notes } = req.body as { notes: string };
    
    if (!bundleSlug || !versionId) {
      return res.status(400).json({ error: 'bundleSlug and versionId are required' });
    }

    const versionsPath = getBundleConfigPath(bundleSlug, 'generated_bundle_versions.yaml');
    
    if (!fs.existsSync(versionsPath)) {
      return res.status(404).json({ error: 'No versions found for this bundle' });
    }

    const versionsData = loadYamlFromPath<{ versions: GeneratedBundleVersion[] }>(versionsPath);
    
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
router.delete('/bundles/:bundleSlug/review/versions/:versionId', (req, res, next) => {
  try {
    const { bundleSlug, versionId } = req.params;
    
    if (!bundleSlug || !versionId) {
      return res.status(400).json({ error: 'bundleSlug and versionId are required' });
    }

    const versionsPath = getBundleConfigPath(bundleSlug, 'generated_bundle_versions.yaml');
    
    if (!fs.existsSync(versionsPath)) {
      return res.status(404).json({ error: 'No versions found for this bundle' });
    }

    const yamlContent = fs.readFileSync(versionsPath, 'utf8');
    const versionsData = YAML.parse(yamlContent) as { versions: GeneratedBundleVersion[] };
    
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

    // Delete the immutable generated-bundle version.
    const versionDirectory = join(
      BundleConfigPaths.getGeneratedBundleVersionsDir(getBundleDirectory(bundleSlug)),
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
router.post('/bundles/:bundleSlug/review/versions/:versionId/set-active', (req, res, next) => {
  try {
    const { bundleSlug, versionId } = req.params;
    
    if (!bundleSlug || !versionId) {
      return res.status(400).json({ error: 'bundleSlug and versionId are required' });
    }

    const versionsPath = getBundleConfigPath(bundleSlug, 'generated_bundle_versions.yaml');
    
    if (!fs.existsSync(versionsPath)) {
      return res.status(404).json({ error: 'No versions found for this bundle' });
    }

    const yamlContent = fs.readFileSync(versionsPath, 'utf8');
    const versionsData = YAML.parse(yamlContent) as { versions: GeneratedBundleVersion[] };
    
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
