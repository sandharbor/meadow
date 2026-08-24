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
  parseBundleNodeConfig,
  validateCanonicalBundleConfiguration,
} from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { canonicalPageFilename, sourceFileCandidateFilenames } from '../../../../../../../shared_code/utils/fileTypeUtils.js';
import { BundleNodeConfig } from '../../../../../../../shared_code/types/bundleNodeConfig.js';
import { FileType } from '../../../../../../../shared_code/types/FileType.js';
import { IBundleNode } from '../../../../../../../shared_code/types/IBundleNode.js';
import type { BundleConfig } from '../../../../../../../shared_code/types/bundleConfig.js';
import { loadAppConfig as loadAppConfigFromDisk } from '../../../../../../../shared_code/utils/appConfigUtils.js';
import type { BundleNodeTraversalDetails } from '../../../../../../../shared_code/types/bundleNodeGraph.js';
import { getConfigDirectory, getBundleDirectory, getBundleConfigPath, getBundleRawDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { runWorkingGraphRaw } from '../../../../shared/utils/workingGraphUtils.js';
import { commitChangesNative } from '../../../../shared/utils/configDirectory/gitUtils/gitStatusUtils.js';
import { FrontmatterUtils } from '../../../../shared/utils/frontmatterUtils.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';
import { getFolderBundleRepairStatus } from '../../../../shared/bundle-config/folderBundleRepair.js';
import {
  explainFolderScopeChanges,
  loadFolderScopeSnapshot,
  writeFolderScopeSnapshot,
} from '../../../../shared/bundle-config/folderScopeChanges.js';
import type { FolderScopeGraphSnapshot } from '../../../../../../../shared_code/types/folderScopeChanges.js';
import type {
  GraphFilterApplication,
  GraphFilterCombination,
  GraphInspectionScope,
} from '../../../../../../../shared_code/types/graphInspection.js';
import { describeWorkingGraph } from '../services/graphDescriptionService.js';
import { loadCustomFiltersForBundle } from './customFiltersRoutes.js';

const router = express.Router();

const loadAppConfig = () => loadAppConfigFromDisk(getConfigDirectory());

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
        notesDir = config.sourceDirectory;
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

    // Load the bundle-level source, role, and traversal policy.
    const configPath = getBundleConfigPath(bundleSlug);
    let notesDir = '';
    let bundleConfig: BundleConfig;
    let bundleAllowImagesToExtendToFrontier: boolean | undefined = undefined;
    try {
      if (!fs.existsSync(configPath)) {
        return res.status(500).json({ error: `bundle_config.yaml not found for slug ${bundleSlug}` });
      }
      const yamlContent = fs.readFileSync(configPath, 'utf8');
      bundleConfig = YAML.parse(yamlContent) as BundleConfig;
      if (typeof bundleConfig.sourceDirectory === 'string') {
        notesDir = bundleConfig.sourceDirectory;
      }
      if (typeof bundleConfig.allowImagesToExtendToFrontier === 'boolean') {
        bundleAllowImagesToExtendToFrontier = bundleConfig.allowImagesToExtendToFrontier;
      }
    } catch {
      return next(new Error(`Failed to load bundle configuration for ${bundleSlug}`));
    }
    if (!notesDir) {
      return res.status(500).json({ error: `Could not determine the notes directory for bundle ${bundleSlug}. Ensure bundle_config.yaml exists and contains a 'sourceDirectory' property.` });
    }

    const repairStatus = getFolderBundleRepairStatus(getBundleDirectory(bundleSlug));
    if (repairStatus.repairRequired) {
      return res.status(409).json({
        error: 'Selected folder repair required',
        repairRequired: true,
        missingSelectedFolders: repairStatus.missingSelectedFolders,
      });
    }

    // Load committed and optional draft configurations together so identity and
    // strong role invariants are checked before graph construction.
    let committedNodes: BundleNodeConfig[];
    let draftNodes: BundleNodeConfig[] | undefined;
    let bundleNodeConfigPath: string;
    try {
      const draftPath = getBundleConfigPath(bundleSlug, 'draft_bundle_node_config.yaml');
      const mainPath = getBundleConfigPath(bundleSlug, 'bundle_node_config.yaml');
      if (!fs.existsSync(mainPath)) {
        return next(new Error(`bundle_node_config.yaml not found for ${bundleSlug}`));
      }
      committedNodes = parseBundleNodeConfig(fs.readFileSync(mainPath, 'utf8'), mainPath);
      if (fs.existsSync(draftPath)) {
        draftNodes = parseBundleNodeConfig(fs.readFileSync(draftPath, 'utf8'), draftPath);
      }
      validateCanonicalBundleConfiguration({
        committedNodes,
        committedPath: mainPath,
        ...(draftNodes && { draftNodes, draftPath }),
        bundleConfig,
        bundleConfigPath: configPath,
      });
      bundleNodeConfigPath = draftNodes ? draftPath : mainPath;
    } catch (error) {
      return next(new Error(`Failed to load or validate bundle node configuration for ${bundleSlug}: ${error instanceof Error ? error.message : String(error)}`));
    }
    
    // Resolve allowImagesToExtendToFrontier: bundle config overrides app config, default true
    let allowImagesToExtendToFrontier = true;
    if (bundleAllowImagesToExtendToFrontier !== undefined) {
      allowImagesToExtendToFrontier = bundleAllowImagesToExtendToFrontier;
    } else {
      const appConfig = loadAppConfig();
      if (appConfig.allowImagesToExtendToFrontier !== undefined) {
        allowImagesToExtendToFrontier = appConfig.allowImagesToExtendToFrontier;
      }
    }

    type RustLinkResolvedInfo = { link_resolved_target_directory: string; link_resolved_target_path: string | null };
    type RustNode = {
      bundleNodeKey: string;
      bundleNodeId?: string;
      bundleNodeKind: 'file' | 'folder' | 'collection';
      bundleNodeName: string;
      sourceGraphSubdirectory?: string;
      fileType?: FileType;
      memberBundleNodeIds?: string[];
      effectiveBlacklistingBundleNodeId?: string;
      effectiveFolderPolicyBundleNodeId?: string;
      depth: number;
      remaining_depth: number;
      remaining_inlinks_depth: number;
      path: string[];
      traversal_details?: BundleNodeTraversalDetails;
      traversal_states?: Array<{ remaining_outlinks_depth: number; remaining_inlinks_depth: number }>;
      isFrontierNode?: boolean;
      isFrontierImageExtension?: boolean;
      is_sensitive: boolean;
      source_page_outlink_count?: number;
      source_page_inlink_count?: number;
    };
    type RustEdge = {
      source: string;
      target: string;
      bundleEdgeKind: 'semanticLink' | 'directoryContainment' | 'collectionMembership';
      isBidirectional: boolean;
    };
    type RustOutput = {
      nodes: RustNode[];
      edges: (RustEdge & { link_original_text: string })[];
      allLinkResolutionMaps: Record<string, Record<string, RustLinkResolvedInfo>>;
      allInlinkSources: Record<string, string[]>;
      allOutlinkTargets: Record<string, string[]>;
      folderScope?: FolderScopeGraphSnapshot['folderScope'];
    };

    let rustOutput: RustOutput;
    const runGraph = async (configFile: string): Promise<RustOutput> => {
      const raw = await runWorkingGraphRaw({
        graphRoot: notesDir,
        bundleNodeConfigPath: configFile,
        entryBundleNodeId: bundleConfig.entryBundleNodeId!,
        defaultTraversalBundleNodeId: bundleConfig.defaultTraversalBundleNodeId!,
        defaultOutlinksDepth: bundleConfig.defaultOutlinksDepth,
        defaultInlinksDepth: bundleConfig.defaultInlinksDepth,
        frontierDepth,
        allowImagesToExtendToFrontier,
        allowLowerDepths: false,
      });
      return JSON.parse(raw) as RustOutput;
    };
    try {
      rustOutput = await runGraph(bundleNodeConfigPath);
    } catch (err) {
      return next(new Error(`Failed to run working_graph for bundle ${bundleSlug}: ${err instanceof Error ? err.message : String(err)}`));
    }

    const snapshotFor = (output: RustOutput): FolderScopeGraphSnapshot => ({
      nodes: output.nodes.map(node => ({
        bundleNodeKey: node.bundleNodeKey,
        ...(node.bundleNodeId && { bundleNodeId: node.bundleNodeId }),
        bundleNodeKind: node.bundleNodeKind,
        bundleNodeName: node.bundleNodeName,
        ...(node.sourceGraphSubdirectory !== undefined && { sourceGraphSubdirectory: node.sourceGraphSubdirectory }),
        ...(node.fileType && { fileType: node.fileType }),
        ...(node.effectiveBlacklistingBundleNodeId && { effectiveBlacklistingBundleNodeId: node.effectiveBlacklistingBundleNodeId }),
        ...(node.effectiveFolderPolicyBundleNodeId && { effectiveFolderPolicyBundleNodeId: node.effectiveFolderPolicyBundleNodeId }),
        remaining_depth: node.remaining_depth,
        remaining_inlinks_depth: node.remaining_inlinks_depth,
      })),
      edges: output.edges.map(edge => ({ source: edge.source, target: edge.target, bundleEdgeKind: edge.bundleEdgeKind })),
      ...(output.folderScope && { folderScope: output.folderScope }),
    });
    let changeExplanations;
    if (rustOutput.folderScope) {
      const currentSnapshot = snapshotFor(rustOutput);
      const snapshotPath = join(getBundleRawDirectory(bundleSlug), 'folder_scope_snapshot.json');
      if (draftNodes) {
        const committedOutput = await runGraph(getBundleConfigPath(bundleSlug, 'bundle_node_config.yaml'));
        const committedSnapshot = snapshotFor(committedOutput);
        changeExplanations = explainFolderScopeChanges({
          previous: committedSnapshot,
          current: currentSnapshot,
          previousConfigs: committedNodes,
          currentConfigs: draftNodes,
          basis: 'committedDraft',
        });
        writeFolderScopeSnapshot(snapshotPath, committedSnapshot);
      } else {
        const previous = loadFolderScopeSnapshot(snapshotPath);
        changeExplanations = explainFolderScopeChanges({
          previous,
          current: currentSnapshot,
          previousConfigs: committedNodes,
          currentConfigs: committedNodes,
          basis: previous ? 'priorRebuild' : 'initial',
        });
        writeFolderScopeSnapshot(snapshotPath, currentSnapshot);
      }
    }

    const nodeDepthMap = new Map<string, number>(rustOutput.nodes.map(node => [node.bundleNodeKey, node.depth]));
    const linkResolutionMaps = rustOutput.allLinkResolutionMaps || {};

    const nodes: IBundleNode[] = rustOutput.nodes.map(node => {
      const common = {
        bundleNodeKey: node.bundleNodeKey as IBundleNode['bundleNodeKey'],
        ...(node.bundleNodeId && { bundleNodeId: node.bundleNodeId as IBundleNode['bundleNodeId'] }),
        label: node.bundleNodeName,
        bundleNodeName: node.bundleNodeName,
        depth: node.depth,
        remaining_depth: node.remaining_depth,
        remaining_inlinks_depth: node.remaining_inlinks_depth,
        path: node.path,
        traversal_details: node.traversal_details,
        traversal_states: node.traversal_states,
        ...(node.effectiveBlacklistingBundleNodeId && {
          effectiveBlacklistingBundleNodeId: node.effectiveBlacklistingBundleNodeId as IBundleNode['bundleNodeId'],
        }),
        ...(node.effectiveFolderPolicyBundleNodeId && {
          effectiveFolderPolicyBundleNodeId: node.effectiveFolderPolicyBundleNodeId as IBundleNode['bundleNodeId'],
        }),
        linkResolutionMap: linkResolutionMaps[node.bundleNodeKey],
        isFrontierNode: node.isFrontierNode,
        isFrontierImageExtension: node.isFrontierImageExtension,
        source_page_outlink_count: node.source_page_outlink_count,
        source_page_inlink_count: node.source_page_inlink_count,
        data: {
          bundleNodeName: node.bundleNodeName,
          sourceGraphSubdirectory: node.sourceGraphSubdirectory,
          fileType: node.fileType,
          is_sensitive: node.is_sensitive
        },
        getIdent: () => node.bundleNodeKey
      };
      if (node.bundleNodeKind === 'collection') {
        return {
          ...common,
          bundleNodeKind: 'collection',
          memberBundleNodeIds: (node.memberBundleNodeIds ?? []) as NonNullable<IBundleNode['bundleNodeId']>[],
        };
      }
      if (node.bundleNodeKind === 'folder') {
        return {
          ...common,
          bundleNodeKind: 'folder',
          sourceGraphSubdirectory: node.sourceGraphSubdirectory ?? '',
        };
      }
      if (!node.fileType) throw new Error(`File node ${node.bundleNodeKey} has no fileType`);
      return {
        ...common,
        bundleNodeKind: 'file',
        sourceGraphSubdirectory: node.sourceGraphSubdirectory ?? '',
        fileType: node.fileType,
      };
    });

    // Deduplicate edges to match existing API: one edge per page pair, mark bidirectional if reverse exists.
    const edgeMap = new Map<string, RustEdge>();
    for (const e of rustOutput.edges) {
      const forwardKey = `${e.bundleEdgeKind}:${e.source}->${e.target}`;
      const reverseKey = `${e.bundleEdgeKind}:${e.target}->${e.source}`;
      if (e.bundleEdgeKind === 'semanticLink' && edgeMap.has(reverseKey)) {
        const existing = edgeMap.get(reverseKey)!;
        existing.isBidirectional = existing.isBidirectional || e.isBidirectional || true;
      } else if (edgeMap.has(forwardKey)) {
        const existing = edgeMap.get(forwardKey)!;
        existing.isBidirectional = existing.isBidirectional || e.isBidirectional;
      } else {
        edgeMap.set(forwardKey, { ...e });
      }
    }

    const resultEdges = Array.from(edgeMap.values())
      .map(e => ({
        source: e.source,
        target: e.target,
        bundleEdgeKind: e.bundleEdgeKind,
        isBidirectional: e.isBidirectional ?? false,
        data: { fromDepth: nodeDepthMap.get(e.source) ?? 0, toDepth: nodeDepthMap.get(e.target) ?? 0 }
      }))
      .sort((a, b) => (a.source + '->' + a.target).localeCompare(b.source + '->' + b.target));

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
            allInlinkSources: rustOutput.allInlinkSources || {},
            allOutlinkTargets: rustOutput.allOutlinkTargets || {},
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
      allInlinkSources: rustOutput.allInlinkSources || {},
      allOutlinkTargets: rustOutput.allOutlinkTargets || {},
      folderScope: rustOutput.folderScope,
      changeExplanations,
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
