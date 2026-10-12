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
import { fileContentFromBuffer, getConfigFileTree, getOriginalContent, readFileContent, findGitRoot, detectFileType, getMimeType } from '../../../../shared/utils/configFileExplorerUtils.js';
import { livePreviewFilePath } from '../../../../shared/generated-bundle-versioning/livePreview.js';
import { commitChangesNative, runGitDirLogNative, runGitCommitFilesNative, runGitCatFileNative, runGitFileLogNative, runGitHtmlSectionDiffNative } from '../../../../shared/utils/configDirectory/gitUtils/gitStatusUtils.js';
import { logBundleError, logBundleInfo } from '../../../../shared/utils/logging/bundleLogger.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';
import {
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
  hasGitRepository,
  inspectGeneratedVersionGitState,
  readGitBlobs,
} from '../../../../shared/generated-bundle-versioning/generatedBundleVersionGitService.js';
import { compareCurrentGeneratedOutput, compareSelectedGeneratedVersions, readComparedGeneratedFile, StaleGeneratedComparisonError, type ResolvedGeneratedComparison } from '../services/generatedOutputComparison.js';
import { GeneratedComparisonUnavailableError } from '../../../../shared/generated-bundle-versioning/generatedOutputEndpoint.js';
import type { GeneratedBundleVersionId } from '../../../../../../../contracts/types/shared/generated-bundle-versioning/generatedBundleVersioning.js';
import type { GeneratedChangeEntry } from '../../../../../../../contracts/types/areas/bundle/review/generatedOutputComparison.js';
import {
  changedEntriesTree,
  changeNodeDetails,
  displayedRelativePath,
  workingFilesTree,
  type GeneratedChangeNodeDetails,
} from '../services/generatedChangesTree.js';
import { htmlSectionChanges } from '../services/htmlSectionChanges.js';
import {
  saveGeneratedBundleVersion,
  SaveGeneratedBundleVersionError,
} from '../../../../shared/generated-bundle-versioning/saveGeneratedBundleVersion.js';
import {
  CLI_MUTATION_BEHAVIORS,
  CLI_OPERATION_SCHEMA_VERSION,
} from '../../../../../../../contracts/types/shared/cli/cliOperations.js';
import { findBundleBoundaryReviewRequest } from '../../../../shared/bundle-boundary-review/bundleBoundaryReviewService.js';
import { requireBundleRenameWorkflowOperations } from '../../../../shared/bundle-management/bundleRenameWorkflowHost.js';

import { defaultBundlePreviewUrl } from '../services/defaultBundlePreviewUrl.js';

const router = express.Router();

const loadAppConfig = () => loadAppConfigFromDisk(getConfigDirectory());

router.get('/review/requests/:reviewRequestId', (req, res) => {
  const request = findBundleBoundaryReviewRequest(req.params.reviewRequestId);
  if (!request) return res.status(404).json({ error: 'Bundle Boundary Review Request not found' });
  res.json(request);
});

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
        mutationBehavior: CLI_MUTATION_BEHAVIORS.saveGeneration,
        versionId: result.versionId,
        savedGenerationId: result.savedGenerationId,
        saved: true,
        previewUrl: defaultBundlePreviewUrl(req, bundleSlug, bundleDirectory),
        message: 'The site is saved locally. Use previewUrl to preview it; no publishing is needed.',

        ...(result.commitSha && { commitSha: result.commitSha }),
        nextActions: [{
          operation: 'publish-generation',
          optional: true,
          guidance: 'Publish only if the user explicitly requests publication. Saving and previewing do not require publishing.',

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

// Save the current generated version locally (commit to Git without publishing).
router.get('/bundles/:bundleSlug/review/save-changes', (req, res, next) => {
  void (async () => {
    const operationId = randomUUID();
    const operation = `[operation ${operationId}] [version-save]`;
    try {
      const { bundleSlug } = req.params;
      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
      const bundleDirectory = getBundleDirectory(bundleSlug);
      if (!fs.existsSync(bundleDirectory)) {
        return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
      }

      const currentVersion = currentVersionEntry(bundleDirectory);
      if (!currentVersion) return res.status(400).json({ error: 'Generate a version before saving changes' });
      logBundleInfo(bundleSlug, `${operation} Started saving version ${currentVersion.versionId}`);

      if (loadAppConfig().manageGitAutomatically === false) {
        assertFrozenGeneratedVersionsIntegrity(bundleDirectory);
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

      const saved = await saveGeneratedBundleVersion({
        bundleDirectory,
        configDirectory: getConfigDirectory(),
        versionId: currentVersion.versionId,
      });
      if (saved.commitSha) {
        logBundleInfo(
          bundleSlug,
          `${operation} Saved version ${saved.versionId} as generation ${saved.savedGenerationId} with its generation records; unrelated repository state was unchanged`,
        );
        return res.json({
          success: true,
          commitSha: saved.commitSha,
          versionId: saved.versionId,
          savedGenerationId: saved.savedGenerationId,
          operationId,
        });
      }
      logBundleInfo(
        bundleSlug,
        `${operation} Version ${saved.versionId} was already saved as generation ${saved.savedGenerationId}; no commit was needed`,
      );
      res.json({
        success: true,
        noChanges: true,
        message: 'No changes to commit',
        versionId: saved.versionId,
        savedGenerationId: saved.savedGenerationId,
        operationId,
      });
    } catch (error) {
      const bundleSlug = req.params.bundleSlug;
      if (bundleSlug) {
        logBundleError(
          bundleSlug,
          `${operation} Save failed; generated files remain local and retry is safe: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (error instanceof SaveGeneratedBundleVersionError) {
        return res.status(error.statusCode).json({ error: error.message });
      }
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

function comparisonFailure(res: express.Response, error: unknown): boolean {
  if (error instanceof GeneratedComparisonUnavailableError || error instanceof StaleGeneratedComparisonError) {
    res.status(409).json({ error: error.message });
    return true;
  }
  return false;
}

function comparisonSummary(comparison: ResolvedGeneratedComparison) {
  const count = (predicate: (entry: GeneratedChangeEntry) => boolean) => comparison.entries.filter(predicate).length;
  return {
    baseline: comparison.baseline,
    left: comparison.left,
    right: comparison.right,
    identityPairing: comparison.identityPairing,
    counts: {
      total: comparison.entries.length,
      added: count(entry => entry.kind === 'added'),
      deleted: count(entry => entry.kind === 'deleted'),
      modified: count(entry => entry.modified),
      moved: count(entry => entry.moved),
    },
  };
}

// The current version's generated-file changes against its comparison
// baseline, with identity-paired moves listed once under their destination.
router.get('/bundles/:bundleSlug/review/preview-files/tree', (req, res, next) => {
  (async () => {
    try {
      const { bundleSlug } = req.params;
      const changedOnly = req.query.changedOnly === 'true';
      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
      const bundleDirectory = getBundleDirectory(bundleSlug);
      if (!fs.existsSync(bundleDirectory)) {
        return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
      }
      const manifest = loadGeneratedBundleVersionManifest(bundleDirectory);
      const comparison = await compareCurrentGeneratedOutput(bundleDirectory, manifest);
      if (!comparison?.workingDirectory) return res.json({ root: '', tree: [], comparison: null, saveState: null });
      const current = manifest.versions.at(-1)!;
      const gitState = hasGitRepository(bundleDirectory)
        ? inspectGeneratedVersionGitState(bundleDirectory, current.versionId)
        : null;
      res.json({
        root: comparison.workingDirectory,
        tree: changedOnly
          ? changedEntriesTree(comparison, comparison.workingDirectory)
          : workingFilesTree(comparison, comparison.workingDirectory),
        comparison: comparisonSummary(comparison),
        saveState: {
          versionId: current.versionId,
          saved: gitState?.isSaved === true,
          hasSavedGeneration: Boolean(gitState?.savedGenerationId),
        },
      });
    } catch (error) {
      if (comparisonFailure(res, error)) return;
      logger.error('Error getting preview file tree:', error);
      next(error);
    }
  })().catch(next);
});

// HTML section changes for each changed generated page, keyed by comparison entry.
router.get('/bundles/:bundleSlug/review/preview-files/html-section-changes', (req, res, next) => {
  (async () => {
    try {
      const { bundleSlug } = req.params;
      if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
      const bundleDirectory = getBundleDirectory(bundleSlug);
      if (!fs.existsSync(bundleDirectory)) return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
      const comparison = await compareCurrentGeneratedOutput(bundleDirectory);
      if (!comparison) return res.json({ files: [] });
      const htmlEntries = comparison.entries
        .filter(entry => displayedRelativePath(entry).toLowerCase().endsWith('.html') && (entry.kind !== 'changed' || entry.modified));
      // Additions and deletions count as every section; only content changes need both sides read.
      const savedBlobs = await readGitBlobs(bundleDirectory, htmlEntries.flatMap(entry => {
        const details = changeNodeDetails(comparison, entry);
        return entry.kind === 'changed'
          ? [details.before, details.after].filter(side => side?.endpoint === 'saved').map(side => side!.objectId)
          : [];
      }));
      const read = (details: NonNullable<GeneratedChangeNodeDetails['before']>): string => {
        const saved = details.endpoint === 'saved' ? savedBlobs.get(details.objectId) : undefined;
        return (saved ?? readComparedGeneratedFile(bundleDirectory, {
          endpointKind: details.endpoint === 'working' ? 'working' : 'saved',
          versionId: details.versionId as GeneratedBundleVersionId | null,
          path: details.path,
          objectId: details.objectId,
        })).toString('utf8');
      };
      const files = htmlEntries.map(entry => {
        const details = changeNodeDetails(comparison, entry);
        return {
          entryId: entry.entryId,
          path: path.join(comparison.workingDirectory!, ...displayedRelativePath(entry).split('/')),
          sections: entry.kind === 'changed'
            ? htmlSectionChanges(read(details.before!), read(details.after!))
            : htmlSectionChanges(null, null),
        };
      });
      res.json({ files });
    } catch (error) {
      if (comparisonFailure(res, error)) return;
      logger.error('Error getting preview HTML section changes:', error);
      next(error);
    }
  })().catch(next);
});

// Exact bytes of one side of a generated-file comparison entry.
router.get('/bundles/:bundleSlug/review/generated-changes/file', (req, res, next) => {
  try {
    const { bundleSlug } = req.params;
    const endpoint = req.query.endpoint;
    const relativePath = req.query.path;
    const objectId = req.query.objectId;
    const versionId = typeof req.query.versionId === 'string' && req.query.versionId ? req.query.versionId : null;
    if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
    if ((endpoint !== 'saved' && endpoint !== 'working') || typeof relativePath !== 'string' || typeof objectId !== 'string') {
      return res.status(400).json({ error: 'endpoint, path, and objectId are required' });
    }
    const bundleDirectory = getBundleDirectory(bundleSlug);
    if (!fs.existsSync(bundleDirectory)) return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
    const content = readComparedGeneratedFile(bundleDirectory, {
      endpointKind: endpoint,
      versionId: versionId ? requireGeneratedBundleVersionId(versionId) : null,
      path: relativePath,
      objectId,
    });
    res.json({ ...fileContentFromBuffer(relativePath, content), path: relativePath });
  } catch (error) {
    // A newer generation or version operation replaced the file after the
    // comparison was listed: an expected transient state, refreshed by the client.
    if (error instanceof StaleGeneratedComparisonError) return res.json({ stale: true, path: req.query.path });
    if (comparisonFailure(res, error)) return;
    logger.error('Error reading compared generated file:', error);
    next(error);
  }
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

    const { content, fileType, mimeType } = readFileContent(livePreviewFilePath(bundleDirectory, filePath));
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
    const renameWorkflow = requireBundleRenameWorkflowOperations();
    res.json({ schemaVersion: manifest.schemaVersion, versions, pendingBundleRename: renameWorkflow.hasPendingRename(bundleSlug) });
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
      let commitSha: string | null = null;
      await deleteLocalGeneratedBundleVersionFiles(bundleDirectory, canonicalVersionId, {
        commit: async () => {
          commitSha = await commitChangesNative(
            [
              path.dirname(generatedBundleVersionManifestPath(bundleDirectory)),
              generatedBundleVersionsRoot(bundleDirectory),
            ],
            `delete local files for generated bundle version ${canonicalVersionId}`,
            { configDir: getConfigDirectory() },
          );
        },
      });
      logBundleInfo(bundleSlug, `[operation ${operationId}] [version-delete-local] Created a local tombstone for version ${canonicalVersionId}; remote copies and publication history were unchanged`);
      res.json({ success: true, commitSha, operationId });
    } catch (error) {
      next(error);
    }
  })().catch(next);
});

router.get('/bundles/:bundleSlug/review/version-comparison', (req, res, next) => {
  void (async () => {
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
    if (!manifest.versions.some(entry => entry.versionId === left)) {
      return res.status(400).json({ error: 'left version is unknown' });
    }
    try {
      let comparison: ResolvedGeneratedComparison;
      if (rightValue === 'working') {
        if (current.localFilesState === 'deleted') return res.status(400).json({ error: 'current version is not locally present' });
        comparison = await compareSelectedGeneratedVersions(bundleDirectory, left, { workingCurrentVersionId: current.versionId }, manifest);
      } else {
        const right = requireGeneratedBundleVersionId(rightValue);
        if (!manifest.versions.some(entry => entry.versionId === right)) {
          return res.status(400).json({ error: 'right version is unknown' });
        }
        comparison = await compareSelectedGeneratedVersions(bundleDirectory, left, { versionId: right }, manifest);
      }
      res.json({ ...comparisonSummary(comparison), leftVersionId: left, rightSelection: rightValue, changes: comparison.entries });
    } catch (error) {
      if (comparisonFailure(res, error)) return;
      throw error;
    }
  })().catch(next);
});

router.post('/bundles/:bundleSlug/review/versions/:versionId/restore-frozen', (req, res, next) => {
  const operationId = randomUUID();
  try {
    const { bundleSlug, versionId } = req.params;
    if (!bundleSlug || !versionId) return res.status(400).json({ error: 'bundleSlug and versionId are required' });
    const canonicalVersionId = requireGeneratedBundleVersionId(versionId);
    void restoreFrozenGeneratedBundleVersion(getBundleDirectory(bundleSlug), canonicalVersionId)
      .then(() => {
        logBundleInfo(bundleSlug, `[operation ${operationId}] [version-restore] Restored frozen version ${canonicalVersionId} and its generation records exactly from Git; publishing and version creation may resume`);
        res.json({ success: true, operationId });
      })
      .catch(next);
  } catch (error) {
    next(error);
  }
});

router.post('/bundles/:bundleSlug/review/versions/current/cancel', (req, res, next) => {
  const operationId = randomUUID();
  try {
    const { bundleSlug } = req.params;
    if (!bundleSlug) return res.status(400).json({ error: 'bundleSlug is required' });
    const renameWorkflow = requireBundleRenameWorkflowOperations();
    if (renameWorkflow.hasPendingRename(bundleSlug)) {
      void renameWorkflow.undoPendingRename(bundleSlug)
        .then(result => res.json({ success: true, currentVersionId: result.versionId, slug: result.slug, operationId }))
        .catch(next);
      return;
    }
    void cancelCurrentGeneratedBundleVersion(getBundleDirectory(bundleSlug))
      .then(manifest => {
        const currentVersionId = manifest.versions.at(-1)?.versionId ?? null;
        logBundleInfo(bundleSlug, `[operation ${operationId}] [version-cancel] Canceled the never-saved current version and removed its generation records; restored current version ${currentVersionId ?? 'none'}`);
        res.json({ success: true, currentVersionId, operationId });
      })
      .catch(next);
  } catch (error) {
    next(error);
  }
});

export default router;
