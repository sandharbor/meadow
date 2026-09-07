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
import { join } from 'path';
import YAML from 'yaml';
import fs from 'fs';
import {
  applyNodeConfigsToNodes,
  applySensitiveFromApiData,
} from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { canonicalPageFilename, sourceFileCandidateFilenames } from '../../../../../../../shared_code/utils/fileTypeUtils.js';
import { getConfigDirectory, getBundleDirectory, getBundleConfigPath, getBundleRawDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { commitChangesNative } from '../../../../shared/utils/configDirectory/gitUtils/gitStatusUtils.js';
import { FrontmatterUtils } from '../../../../shared/utils/frontmatterUtils.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';

import type {
  GraphFilterApplication,
  GraphFilterCombination,
  GraphInspectionScope,
} from '../../../../../../../contracts/types/graphInspection.js';
import { describeWorkingGraph } from '../services/graphDescriptionService.js';
import { loadCustomFiltersForBundle } from '../../../../shared/custom-filters/customFilterLoader.js';
import {
  loadWorkingGraph,
} from '../../../../shared/bundle-graph/workingGraphService.js';

import { acceptedSourceRoot } from '../../../../shared/source-snapshot/sourceSnapshots.js';

const router = express.Router();


interface GraphDescriptionRequest {
  scope: GraphInspectionScope;
  applications: GraphFilterApplication[];
  combine: GraphFilterCombination;
}

function parseGraphDescriptionRequest(req: express.Request): GraphDescriptionRequest {
  const scope = req.query.scope;
  if (scope !== 'all' && scope !== 'final') {
    throw new Error("scope must be exactly one of 'all' or 'final'");
  }

  const combineQuery = req.query.combine ?? 'default';
  if (
    combineQuery !== 'default'
    && combineQuery !== 'union'
    && combineQuery !== 'intersection'
    && combineQuery !== 'difference'
  ) {
    throw new Error("combine must be one of 'default', 'union', 'intersection', or 'difference'");
  }

  const filterQuery = req.query.filter;
  const filterValues = filterQuery === undefined
    ? []
    : Array.isArray(filterQuery)
      ? filterQuery
      : [filterQuery];
  const applications = filterValues.map(value => {
    if (typeof value !== 'string') throw new Error('filter must be a string');
    const separatorIndex = value.lastIndexOf('=');
    const filterId = value.slice(0, separatorIndex);
    const mode = value.slice(separatorIndex + 1);
    if (separatorIndex <= 0 || (mode !== 'solo' && mode !== 'exclude')) {
      throw new Error("filter must use '<filter-id>=solo' or '<filter-id>=exclude'");
    }
    return { filterId, mode: mode as GraphFilterApplication['mode'] };
  });
  if (applications.length === 0 && combineQuery !== 'default') {
    throw new Error('combine requires at least one filter');
  }

  return { scope, applications, combine: combineQuery };
}

// Copy tracked pages to bundle's tracked_page_content directory
router.post('/bundles/:bundleSlug/curation/copy-tracked-pages', (req, res, next) => {
  (async () => {
    const { bundleSlug } = req.params;
    const { trackedNodes, commitMessage } = req.body as {
      trackedNodes?: Array<{ sourceGraphSubdirectory: string; title: string; fileType: string }>;
      commitMessage?: string;
    };
    
    if (!bundleSlug) {
      return res.status(400).json({ error: 'bundleSlug is required' });
    }

    if (!trackedNodes || !Array.isArray(trackedNodes)) {
      return res.status(400).json({ error: 'trackedNodes array is required' });
    }

    if (trackedNodes.length === 0) {
      return res.json({ message: 'No tracked nodes provided', copiedFiles: [] });
    }

    // Load bundle config to get notesDir (base directory)
    const configPath = getBundleConfigPath(bundleSlug);
    let notesDir = '';
    try {
      if (!fs.existsSync(configPath)) {
        return res.status(500).json({ error: `bundle_config.yaml not found for slug ${bundleSlug}` });
      }
      const yamlContent = fs.readFileSync(configPath, 'utf8');
      const config = YAML.parse(yamlContent) as { sourceDirectory?: string };
      if (config && typeof config.sourceDirectory === 'string') {
        notesDir = acceptedSourceRoot(getBundleDirectory(bundleSlug));
      }
    } catch {
      return next(new Error(`Failed to load bundle configuration for ${bundleSlug}`));
    }
    if (!notesDir) {
      return res.status(500).json({ error: `Could not determine the notes directory for bundle ${bundleSlug}. Ensure bundle_config.yaml exists and contains a 'directory' property.` });
    }

    // Create target directory if it doesn't exist
    const targetDir = join(getBundleRawDirectory(bundleSlug), 'tracked_page_content');
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
    } catch (err) {
      return next(new Error(`Failed to create target directory: ${err instanceof Error ? err.message : String(err)}`));
    }

    // Copy tracked page files
    const copiedFiles: string[] = [];
    const errors: string[] = [];

    for (const page of trackedNodes) {
      try {
        const filename = canonicalPageFilename(page.title, page.fileType);
        const sourceFile = sourceFileCandidateFilenames(page.title, page.fileType)
          .map(candidateFilename => join(notesDir, page.sourceGraphSubdirectory, candidateFilename))
          .find(candidatePath => fs.existsSync(candidatePath));
        const targetFile = join(targetDir, filename);

        if (sourceFile) {
          fs.copyFileSync(sourceFile, targetFile);
          copiedFiles.push(page.title);
        } else {
          errors.push(`Source file not found: ${join(notesDir, page.sourceGraphSubdirectory, filename)}`);
        }
      } catch (err) {
        errors.push(`Failed to copy ${page.title}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Commit both the bundle_node_config.yaml and tracked_page_content as a single commit
    // This ensures the configuration and its tracked content are versioned together
    try {
      const bundleConfigDir = join(getBundleDirectory(bundleSlug), 'config');
      const dirsToCommit = [bundleConfigDir, targetDir];
      
      const sha = await commitChangesNative(
        dirsToCommit,
        commitMessage || 'update bundle page configuration',
        { configDir: getConfigDirectory() }
      );
      if (sha) {
        logger.info(`[copy-tracked-pages] Committed config and tracked content: ${sha}`);
      }
    } catch (commitError) {
      // Log but don't fail the request - the files were saved successfully
      logger.error('[copy-tracked-pages] Failed to commit changes:', commitError);
    }

    res.json({
      message: `Copied ${copiedFiles.length} tracked pages`,
      copiedFiles,
      errors: errors.length > 0 ? errors : undefined
    });
  })().catch(next);
});

const handleWorkingGraphRequest: express.RequestHandler = (req, res, next) => {
  (async () => {
    const { bundleSlug } = req.params;
    const descriptionRequested = req.path.endsWith('/graph-description');
    let descriptionRequest: GraphDescriptionRequest | undefined;
    if (descriptionRequested) {
      try {
        descriptionRequest = parseGraphDescriptionRequest(req);
      } catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
      }
    }
    const frontierDepthQuery = req.query.frontierDepth as string | undefined;
    const frontierDepth = frontierDepthQuery ? parseInt(frontierDepthQuery, 10) : 0;

    const loaded = await loadWorkingGraph({ bundleSlug, frontierDepth });
    const { nodes, edges: resultEdges, allInlinkSources, allOutlinkTargets, committedNodes, draftNodes } = loaded;

    if (descriptionRequest) {
      applySensitiveFromApiData(nodes);
      applyNodeConfigsToNodes(nodes, draftNodes ?? committedNodes);
      try {
        return res.json(describeWorkingGraph({
          bundleSlug,
          scope: descriptionRequest.scope,
          applications: descriptionRequest.applications,
          combine: descriptionRequest.combine,
          nodes,
          edges: resultEdges,
          linkData: {
            allInlinkSources,
            allOutlinkTargets,
          },
          customFilters: loadCustomFiltersForBundle(bundleSlug),
        }));
      } catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
      }
    }

    res.json({
      nodes,
      edges: resultEdges,
      allInlinkSources,
      allOutlinkTargets,
      folderScope: loaded.folderScope,
      changeExplanations: loaded.changeExplanations,
    });
  })().catch(next);
};

router.get('/bundles/:bundleSlug/curation/working-graph', handleWorkingGraphRequest);
router.get('/bundles/:bundleSlug/curation/graph-description', handleWorkingGraphRequest);

// Mark page as sensitive/non-sensitive
router.patch('/bundles/:bundleSlug/curation/page/:pageTitle/sensitive', (req, res, next) => {
  try {
    const { bundleSlug, pageTitle } = req.params;
    const { isSensitive } = req.body as { isSensitive: boolean };

    if (!bundleSlug || !pageTitle) {
      return res.status(400).json({ error: 'bundleSlug and pageTitle are required' });
    }

    if (typeof isSensitive !== 'boolean') {
      return res.status(400).json({ error: 'isSensitive must be a boolean' });
    }

    // Get bundle configuration to find the source directory
    const bundleDirectory = getBundleDirectory(bundleSlug);
    if (!fs.existsSync(bundleDirectory)) {
      return res.status(404).json({ error: `Bundle '${bundleSlug}' not found` });
    }

    const configPath = getBundleConfigPath(bundleSlug);
    let notesDir = '';
    try {
      if (!fs.existsSync(configPath)) {
        return res.status(500).json({ error: `bundle_config.yaml not found for slug ${bundleSlug}` });
      }
      const yamlContent = fs.readFileSync(configPath, 'utf8');
      const config = YAML.parse(yamlContent) as { sourceDirectory?: string };
      if (config && typeof config.sourceDirectory === 'string') {
        notesDir = config.sourceDirectory;
      }
    } catch {
      return res.status(500).json({ error: `Failed to load bundle configuration for ${bundleSlug}` });
    }

    if (!notesDir) {
      return res.status(500).json({ error: `Could not determine source directory for bundle ${bundleSlug}` });
    }

    // Get sourceGraphDirectory from request body (frontend should provide this from page data)
    const { sourceGraphDirectory } = req.body as { isSensitive: boolean; sourceGraphDirectory?: string };

    // Construct the full path using the sourceGraphDirectory information
    let markdownPath = '';
    if (sourceGraphDirectory && sourceGraphDirectory.trim()) {
      markdownPath = join(notesDir, sourceGraphDirectory, `${pageTitle}.md`);
    } else {
      markdownPath = join(notesDir, `${pageTitle}.md`);
    }

    if (!fs.existsSync(markdownPath)) {
      return res.status(404).json({ error: `Page file not found: ${markdownPath}` });
    }

    // Update the sensitive property in the file
    try {
      FrontmatterUtils.updateSensitiveProperty(markdownPath, isSensitive);

      res.json({
        success: true,
        message: `Page '${pageTitle}' marked as ${isSensitive ? 'sensitive' : 'non-sensitive'}`,
        pageTitle,
        isSensitive
      });
    } catch (error) {
      logger.error('Error updating sensitive property:', error);
      return res.status(500).json({
        error: 'Failed to update sensitive property',
        details: error instanceof Error ? error.message : String(error)
      });
    }

  } catch (error) {
    next(error);
  }
});

export default router;
