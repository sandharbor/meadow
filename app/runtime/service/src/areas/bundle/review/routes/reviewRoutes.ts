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
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { loadAppConfig as loadAppConfigFromDisk } from '../../../../../../../shared_code/utils/appConfigUtils.js';
import { getConfigDirectory, getBundleDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { commitBundleChanges, getGeneratedHtmlChanges } from '../../../../shared/utils/configDirectory/gitUtils/generatedHtmlGitService.js';
import { getConfigFileTree, getGeneratedHtmlFileTree, getOriginalContent, readFileContent, findGitRoot, detectFileType, getMimeType } from '../../../../shared/utils/configFileExplorerUtils.js';
import { commitChangesNative, runGitDirLogNative, runGitCommitFilesNative, runGitCatFileNative, runGitFileLogNative, runGitHtmlSectionDiffNative } from '../../../../shared/utils/configDirectory/gitUtils/gitStatusUtils.js';
import { logBundleError, logBundleInfo } from '../../../../shared/utils/logging/bundleLogger.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';
import {
  currentGeneratedBundleVersionDirectory,
  generatedBundleVersionManifestPath,
  generatedBundleVersionsRoot,
  loadGeneratedBundleVersionManifest,
} from '../../../../shared/generated-bundle-versioning/generatedBundleVersionManifestService.js';
import {
  deriveGeneratedBundleVersionState,
  requireGeneratedBundleVersionId,
} from '../../../../shared/generated-bundle-versioning/generatedBundleVersionDomain.js';
import {
  assertFrozenGeneratedVersionsIntegrity,
  cancelCurrentGeneratedBundleVersion,
  currentVersionEntry,
  deleteLocalGeneratedBundleVersionFiles,
  inspectFrozenGeneratedVersionsIntegrity,
  restoreFrozenGeneratedBundleVersion,
  updateGeneratedBundleVersionNotes,
} from '../../../../shared/generated-bundle-versioning/generatedBundleVersionLifecycle.js';
import {
  compareGeneratedBundleVersionTrees,
  inspectGeneratedVersionGitState,
} from '../../../../shared/generated-bundle-versioning/generatedBundleVersionGitService.js';
import {
  saveGeneratedBundleVersion,
  SaveGeneratedBundleVersionError,
} from '../../../../shared/generated-bundle-versioning/saveGeneratedBundleVersion.js';
import { CLI_OPERATION_SCHEMA_VERSION } from '../../../../../../../contracts/types/cliOperations.js';

const router = express.Router();

const loadAppConfig = () => loadAppConfigFromDisk(getConfigDirectory());

router.post('/bundles/:bundleSlug/review/versions/:versionId/save-generation', (req, res, next) => {
  void (async () => {
    const { bundleSlug, versionId } = req.params;
    const bundleDirectory = getBundleDirectory(bundleSlug);
    if (!fs.existsSync(bundleDirectory)) {
      return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
    }
    try {
      const result = await saveGeneratedBundleVersion({
        bundleDirectory,
        configDirectory: getConfigDirectory(),
        versionId,
      });
      res.json({
        schemaVersion: CLI_OPERATION_SCHEMA_VERSION,
        operation: 'bundle.save-generation',
        slug: bundleSlug,
        changed: result.changed,
        versionId: result.versionId,
        savedGenerationId: result.savedGenerationId,
        saved: true,
        ...(result.commitSha && { commitSha: result.commitSha }),
        nextActions: [{
          operation: 'publish-generation',
          args: ['bundle', 'publish', bundleSlug, '--version', result.versionId],
          displayCommand: `meadow bundle publish ${bundleSlug} --version ${result.versionId}`,
        }],
      });
    } catch (error) {
      if (error instanceof SaveGeneratedBundleVersionError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      next(error);
    }
  })().catch(next);
});

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

    const generatedHtmlDirectory = currentGeneratedBundleVersionDirectory(bundleDirectory);
    const changes = generatedHtmlDirectory
      ? getGeneratedHtmlChanges(generatedHtmlDirectory)
      : { changedFiles: [], fileDiffs: {} };
    
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
    const operationId = randomUUID();
    const operation = `[operation ${operationId}] [version-save]`;
    try {
      const { bundleSlug } = req.params;

      if (!bundleSlug) {
        return res.status(400).json({ error: 'bundleSlug is required' });
      }

      const bundleDirectory = getBundleDirectory(bundleSlug);

      if (!fs.existsSync(bundleDirectory)) {
        return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
      }

      const currentVersion = currentVersionEntry(bundleDirectory);
      if (!currentVersion) return res.status(400).json({ error: 'Generate a version before saving changes' });
      assertFrozenGeneratedVersionsIntegrity(bundleDirectory);
      logBundleInfo(bundleSlug, `${operation} Started saving version ${currentVersion.versionId}`);

      // Check if git auto-management is enabled
      const appConfigForGit = loadAppConfig();
      if (appConfigForGit.manageGitAutomatically === false) {
        const currentState = inspectGeneratedVersionGitState(bundleDirectory, currentVersion.versionId);
        logBundleInfo(
          bundleSlug,
          `${operation} Git auto-management is disabled; version ${currentVersion.versionId} remains unchanged for manual Git save`,
        );
        return res.json({
          success: true,
          skipped: true,
          message: 'Git auto-management is disabled',
          versionId: currentVersion.versionId,
          savedGenerationId: currentState.isSaved ? currentState.savedGenerationId : null,
          operationId,
        });
      }

      const commitSha = await commitBundleChanges(
        bundleDirectory,
        `user saved generated bundle version ${currentVersion.versionId}`,
        { includeConfigDir: true },
      );
      const savedState = inspectGeneratedVersionGitState(bundleDirectory, currentVersion.versionId);

      if (commitSha) {
        logBundleInfo(
          bundleSlug,
          `${operation} Saved version ${currentVersion.versionId} as generation ${savedState.savedGenerationId}; unrelated repository state was unchanged`,
        );
        res.json({
          success: true,
          commitSha,
          versionId: currentVersion.versionId,
          savedGenerationId: savedState.savedGenerationId,
          operationId,
        });
      } else {
        logBundleInfo(
          bundleSlug,
          `${operation} Version ${currentVersion.versionId} was already saved as generation ${savedState.savedGenerationId}; no commit was needed`,
        );
        res.json({
          success: true,
          noChanges: true,
          message: 'No changes to commit',
          versionId: currentVersion.versionId,
          savedGenerationId: savedState.savedGenerationId,
          operationId,
        });
      }
    } catch (error) {
      logger.error('Error saving changes:', error);
      const bundleSlug = req.params.bundleSlug;
      if (bundleSlug) {
        logBundleError(
          bundleSlug,
          `${operation} Save failed; generated files remain local and retry is safe: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
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

      const generatedHtmlDirectory = currentGeneratedBundleVersionDirectory(bundleDirectory);
      if (!generatedHtmlDirectory) return res.json({ root: '', tree: [] });
      const treeData = await getGeneratedHtmlFileTree(generatedHtmlDirectory, changedOnly);
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

      const generatedHtmlDir = currentGeneratedBundleVersionDirectory(bundleDirectory);
      if (!generatedHtmlDir) return res.json({ files: [] });
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

// Canonical local generated-bundle version management.
router.get('/bundles/:bundleSlug/review/versions', (req, res, next) => {
  try {
    const { bundleSlug } = req.params;
    if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
    const bundleDirectory = getBundleDirectory(bundleSlug);
    if (!fs.existsSync(bundleDirectory)) return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
    const manifest = loadGeneratedBundleVersionManifest(bundleDirectory);
    const integrityByVersion = new Map(
      inspectFrozenGeneratedVersionsIntegrity(bundleDirectory, manifest)
        .map(problem => [problem.versionId, problem.changes] as const),
    );
    const versions = manifest.versions.map(entry => {
      const derivedState = deriveGeneratedBundleVersionState(manifest, entry.versionId);
      const integrityChanges = integrityByVersion.get(entry.versionId) ?? [];
      const gitState = entry.localFilesState === 'present'
        ? inspectGeneratedVersionGitState(bundleDirectory, entry.versionId)
        : null;
      const unsaved = derivedState === 'current' && gitState?.isSaved !== true;
      return {
        ...entry,
        derivedState,
        displayState: integrityChanges.length > 0
          ? 'integrity-problem'
          : unsaved ? 'unsaved' : derivedState,
        savedGenerationId: entry.localFilesState === 'deleted'
          ? entry.lastSavedGenerationId
          : gitState?.savedGenerationId ?? null,
        generatedChanges: gitState?.changes ?? [],
        integrityChanges,
      };
    });
    res.json({ schemaVersion: manifest.schemaVersion, versions });
  } catch (error) {
    next(error);
  }
});

router.patch('/bundles/:bundleSlug/review/versions/:versionId', (req, res, next) => {
  void (async () => {
    const operationId = randomUUID();
    try {
    const { bundleSlug, versionId } = req.params;
      const { notes } = req.body as { notes?: unknown };
      if (!bundleSlug || !versionId) return res.status(400).json({ error: 'bundleSlug and versionId are required' });
      if (typeof notes !== 'string') return res.status(400).json({ error: 'notes must be a string' });
      const bundleDirectory = getBundleDirectory(bundleSlug);
      const canonicalVersionId = requireGeneratedBundleVersionId(versionId);
      updateGeneratedBundleVersionNotes(bundleDirectory, canonicalVersionId, notes);
      const commitSha = await commitChangesNative(
        [path.dirname(generatedBundleVersionManifestPath(bundleDirectory))],
        `update generated bundle version ${canonicalVersionId} note`,
        { configDir: getConfigDirectory() },
      );
      logBundleInfo(bundleSlug, `[operation ${operationId}] [version-note] Updated the private local note for version ${canonicalVersionId}; generated files were unchanged`);
      res.json({ success: true, commitSha, operationId });
    } catch (error) {
      next(error);
    }
  })().catch(next);
});

router.delete('/bundles/:bundleSlug/review/versions/:versionId', (req, res, next) => {
  void (async () => {
    const operationId = randomUUID();
    try {
      const { bundleSlug, versionId } = req.params;
      if (!bundleSlug || !versionId) return res.status(400).json({ error: 'bundleSlug and versionId are required' });
      const bundleDirectory = getBundleDirectory(bundleSlug);
      const canonicalVersionId = requireGeneratedBundleVersionId(versionId);
      await deleteLocalGeneratedBundleVersionFiles(bundleDirectory, canonicalVersionId);
      const commitSha = await commitChangesNative(
        [
          path.dirname(generatedBundleVersionManifestPath(bundleDirectory)),
          generatedBundleVersionsRoot(bundleDirectory),
        ],
        `delete local files for generated bundle version ${canonicalVersionId}`,
        { configDir: getConfigDirectory() },
      );
      logBundleInfo(bundleSlug, `[operation ${operationId}] [version-delete-local] Created a local tombstone for version ${canonicalVersionId}; remote copies and publication history were unchanged`);
      res.json({ success: true, commitSha, operationId });
    } catch (error) {
      next(error);
    }
  })().catch(next);
});

router.get('/bundles/:bundleSlug/review/version-comparison', (req, res, next) => {
  try {
    const { bundleSlug } = req.params;
    if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
    const bundleDirectory = getBundleDirectory(bundleSlug);
    const manifest = loadGeneratedBundleVersionManifest(bundleDirectory);
    const current = manifest.versions.at(-1);
    const defaultLeft = manifest.versions.at(-2)?.versionId;
    const leftValue = typeof req.query.left === 'string' ? req.query.left : defaultLeft;
    const rightValue = typeof req.query.right === 'string' ? req.query.right : 'working';
    if (!leftValue || !current) return res.json({ left: null, right: null, changes: [] });
    const left = requireGeneratedBundleVersionId(leftValue);
    const leftEntry = manifest.versions.find(entry => entry.versionId === left);
    if (!leftEntry || leftEntry.localFilesState === 'deleted') {
      return res.status(400).json({ error: 'left version must be locally present' });
    }
    let changes;
    if (rightValue === 'working') {
      if (current.localFilesState === 'deleted') return res.status(400).json({ error: 'current version is not locally present' });
      changes = compareGeneratedBundleVersionTrees(bundleDirectory, left, {
        workingCurrentVersionId: current.versionId,
      });
    } else {
      const right = requireGeneratedBundleVersionId(rightValue);
      const rightEntry = manifest.versions.find(entry => entry.versionId === right);
      if (!rightEntry || rightEntry.localFilesState === 'deleted') {
        return res.status(400).json({ error: 'right version must be locally present' });
      }
      changes = compareGeneratedBundleVersionTrees(bundleDirectory, left, { versionId: right });
    }
    res.json({ left, right: rightValue, changes });
  } catch (error) {
    next(error);
  }
});

router.post('/bundles/:bundleSlug/review/versions/:versionId/restore-frozen', (req, res, next) => {
  const operationId = randomUUID();
  try {
    const { bundleSlug, versionId } = req.params;
    if (!bundleSlug || !versionId) return res.status(400).json({ error: 'bundleSlug and versionId are required' });
    const canonicalVersionId = requireGeneratedBundleVersionId(versionId);
    restoreFrozenGeneratedBundleVersion(getBundleDirectory(bundleSlug), canonicalVersionId);
    logBundleInfo(bundleSlug, `[operation ${operationId}] [version-restore] Restored frozen version ${canonicalVersionId} exactly from Git; publishing and version creation may resume`);
    res.json({ success: true, operationId });
  } catch (error) {
    next(error);
  }
});

router.post('/bundles/:bundleSlug/review/versions/current/cancel', (req, res, next) => {
  const operationId = randomUUID();
  try {
    const { bundleSlug } = req.params;
    if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
    const manifest = cancelCurrentGeneratedBundleVersion(getBundleDirectory(bundleSlug));
    const currentVersionId = manifest.versions.at(-1)?.versionId ?? null;
    logBundleInfo(bundleSlug, `[operation ${operationId}] [version-cancel] Canceled the never-saved current version; restored current version ${currentVersionId ?? 'none'}`);
    res.json({ success: true, currentVersionId, operationId });
  } catch (error) {
    next(error);
  }
});

export default router;
