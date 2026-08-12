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
import { parseSiteNodeConfig, validateCanonicalSiteConfiguration } from '../../../../../../shared_code/utils/siteNodeConfigUtils.js';
import { canonicalPageFilename, sourceFileCandidateFilenames } from '../../../../../../shared_code/utils/fileTypeUtils.js';
import { SiteNodeConfig } from '../../../../../../shared_code/types/siteNodeConfig.js';
import { FileType } from '../../../../../../shared_code/types/FileType.js';
import { ISiteNode } from '../../../../../../shared_code/types/ISiteNode.js';
import type { SiteConfig } from '../../../../../../shared_code/types/siteConfig.js';
import { loadAppConfig as loadAppConfigFromDisk } from '../../../../../../shared_code/utils/appConfigUtils.js';
import type { SiteNodeTraversalDetails } from '../../../../../../shared_code/types/siteNodeGraph.js';
import { getConfigDirectory, getSiteDirectory, getSiteConfigPath, getSiteRawDirectory } from '../../../../shared/site-config/siteConfigPaths.js';
import { runWorkingGraphRaw } from '../../../../shared/utils/workingGraphUtils.js';
import { commitChangesNative } from '../../../../shared/utils/configDirectory/gitUtils/gitStatusUtils.js';
import { FrontmatterUtils } from '../../../../shared/utils/frontmatterUtils.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';
import { getFolderSiteRepairStatus } from '../../../../shared/site-config/folderSiteRepair.js';
import {
  explainFolderScopeChanges,
  loadFolderScopeSnapshot,
  writeFolderScopeSnapshot,
} from '../../../../shared/site-config/folderScopeChanges.js';
import type { FolderScopeGraphSnapshot } from '../../../../../../shared_code/types/folderScopeChanges.js';

const router = express.Router();

const loadAppConfig = () => loadAppConfigFromDisk(getConfigDirectory());

// Copy tracked pages to site's tracked_page_content directory
router.post('/sites/:siteSlug/curation/copy-tracked-pages', (req, res, next) => {
  (async () => {
    const { siteSlug } = req.params;
    const { trackedNodes, commitMessage } = req.body as {
      trackedNodes?: Array<{ sourceGraphSubdirectory: string; title: string; fileType: string }>;
      commitMessage?: string;
    };
    
    if (!siteSlug) {
      return res.status(400).json({ error: 'siteSlug is required' });
    }

    if (!trackedNodes || !Array.isArray(trackedNodes)) {
      return res.status(400).json({ error: 'trackedNodes array is required' });
    }

    if (trackedNodes.length === 0) {
      return res.json({ message: 'No tracked nodes provided', copiedFiles: [] });
    }

    // Load site config to get notesDir (base directory)
    const configPath = getSiteConfigPath(siteSlug);
    let notesDir = '';
    try {
      if (!fs.existsSync(configPath)) {
        return res.status(500).json({ error: `site_config.yaml not found for slug ${siteSlug}` });
      }
      const yamlContent = fs.readFileSync(configPath, 'utf8');
      const config = YAML.parse(yamlContent) as { sourceDirectory?: string };
      if (config && typeof config.sourceDirectory === 'string') {
        notesDir = config.sourceDirectory;
      }
    } catch {
      return next(new Error(`Failed to load site configuration for ${siteSlug}`));
    }
    if (!notesDir) {
      return res.status(500).json({ error: `Could not determine the notes directory for site ${siteSlug}. Ensure site_config.yaml exists and contains a 'directory' property.` });
    }

    // Create target directory if it doesn't exist
    const targetDir = join(getSiteRawDirectory(siteSlug), 'tracked_page_content');
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

    // Commit both the site_node_config.yaml and tracked_page_content as a single commit
    // This ensures the configuration and its tracked content are versioned together
    try {
      const confDir = join(getSiteDirectory(siteSlug), 'conf');
      const dirsToCommit = [confDir, targetDir];
      
      const sha = await commitChangesNative(
        dirsToCommit,
        commitMessage || 'update site page configuration',
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

router.get('/sites/:siteSlug/curation/working-graph', (req, res, next) => {
  (async () => {
    const { siteSlug } = req.params;
    const frontierDepthQuery = req.query.frontierDepth as string | undefined;
    const frontierDepth = frontierDepthQuery ? parseInt(frontierDepthQuery, 10) : 0;

    // Load the site-level source, role, and traversal policy.
    const configPath = getSiteConfigPath(siteSlug);
    let notesDir = '';
    let siteConfig: SiteConfig;
    let siteAllowImagesToExtendToFrontier: boolean | undefined = undefined;
    try {
      if (!fs.existsSync(configPath)) {
        return res.status(500).json({ error: `site_config.yaml not found for slug ${siteSlug}` });
      }
      const yamlContent = fs.readFileSync(configPath, 'utf8');
      siteConfig = YAML.parse(yamlContent) as SiteConfig;
      if (typeof siteConfig.sourceDirectory === 'string') {
        notesDir = siteConfig.sourceDirectory;
      }
      if (typeof siteConfig.allowImagesToExtendToFrontier === 'boolean') {
        siteAllowImagesToExtendToFrontier = siteConfig.allowImagesToExtendToFrontier;
      }
    } catch {
      return next(new Error(`Failed to load site configuration for ${siteSlug}`));
    }
    if (!notesDir) {
      return res.status(500).json({ error: `Could not determine the notes directory for site ${siteSlug}. Ensure site_config.yaml exists and contains a 'sourceDirectory' property.` });
    }

    const repairStatus = getFolderSiteRepairStatus(getSiteDirectory(siteSlug));
    if (repairStatus.repairRequired) {
      return res.status(409).json({
        error: 'Selected folder repair required',
        repairRequired: true,
        missingSelectedFolders: repairStatus.missingSelectedFolders,
      });
    }

    // Load committed and optional draft configurations together so identity and
    // strong role invariants are checked before graph construction.
    let committedNodes: SiteNodeConfig[];
    let draftNodes: SiteNodeConfig[] | undefined;
    let siteNodeConfigPath: string;
    try {
      const draftPath = getSiteConfigPath(siteSlug, 'draft_site_node_config.yaml');
      const mainPath = getSiteConfigPath(siteSlug, 'site_node_config.yaml');
      if (!fs.existsSync(mainPath)) {
        return next(new Error(`site_node_config.yaml not found for ${siteSlug}`));
      }
      committedNodes = parseSiteNodeConfig(fs.readFileSync(mainPath, 'utf8'), mainPath);
      if (fs.existsSync(draftPath)) {
        draftNodes = parseSiteNodeConfig(fs.readFileSync(draftPath, 'utf8'), draftPath);
      }
      validateCanonicalSiteConfiguration({
        committedNodes,
        committedPath: mainPath,
        ...(draftNodes && { draftNodes, draftPath }),
        siteConfig,
        siteConfigPath: configPath,
      });
      siteNodeConfigPath = draftNodes ? draftPath : mainPath;
    } catch (error) {
      return next(new Error(`Failed to load or validate site node configuration for ${siteSlug}: ${error instanceof Error ? error.message : String(error)}`));
    }
    
    // Resolve allowImagesToExtendToFrontier: site config overrides app config, default true
    let allowImagesToExtendToFrontier = true;
    if (siteAllowImagesToExtendToFrontier !== undefined) {
      allowImagesToExtendToFrontier = siteAllowImagesToExtendToFrontier;
    } else {
      const appConfig = loadAppConfig();
      if (appConfig.allowImagesToExtendToFrontier !== undefined) {
        allowImagesToExtendToFrontier = appConfig.allowImagesToExtendToFrontier;
      }
    }

    type RustLinkResolvedInfo = { link_resolved_target_directory: string; link_resolved_target_path: string | null };
    type RustNode = {
      siteNodeKey: string;
      siteNodeId?: string;
      siteNodeKind: 'file' | 'folder' | 'collection';
      siteNodeName: string;
      sourceGraphSubdirectory?: string;
      fileType?: FileType;
      memberSiteNodeIds?: string[];
      effectiveBlacklistingSiteNodeId?: string;
      effectiveFolderPolicySiteNodeId?: string;
      depth: number;
      remaining_depth: number;
      remaining_inlinks_depth: number;
      path: string[];
      traversal_details?: SiteNodeTraversalDetails;
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
      siteEdgeKind: 'semanticLink' | 'directoryContainment' | 'collectionMembership';
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
        siteNodeConfigPath: configFile,
        entrySiteNodeId: siteConfig.entrySiteNodeId!,
        defaultTraversalSiteNodeId: siteConfig.defaultTraversalSiteNodeId!,
        defaultOutlinksDepth: siteConfig.defaultOutlinksDepth,
        defaultInlinksDepth: siteConfig.defaultInlinksDepth,
        frontierDepth,
        allowImagesToExtendToFrontier,
        allowLowerDepths: false,
      });
      return JSON.parse(raw) as RustOutput;
    };
    try {
      rustOutput = await runGraph(siteNodeConfigPath);
    } catch (err) {
      return next(new Error(`Failed to run working_graph for site ${siteSlug}: ${err instanceof Error ? err.message : String(err)}`));
    }

    const snapshotFor = (output: RustOutput): FolderScopeGraphSnapshot => ({
      nodes: output.nodes.map(node => ({
        siteNodeKey: node.siteNodeKey,
        ...(node.siteNodeId && { siteNodeId: node.siteNodeId }),
        siteNodeKind: node.siteNodeKind,
        siteNodeName: node.siteNodeName,
        ...(node.sourceGraphSubdirectory !== undefined && { sourceGraphSubdirectory: node.sourceGraphSubdirectory }),
        ...(node.fileType && { fileType: node.fileType }),
        ...(node.effectiveBlacklistingSiteNodeId && { effectiveBlacklistingSiteNodeId: node.effectiveBlacklistingSiteNodeId }),
        ...(node.effectiveFolderPolicySiteNodeId && { effectiveFolderPolicySiteNodeId: node.effectiveFolderPolicySiteNodeId }),
        remaining_depth: node.remaining_depth,
        remaining_inlinks_depth: node.remaining_inlinks_depth,
      })),
      edges: output.edges.map(edge => ({ source: edge.source, target: edge.target, siteEdgeKind: edge.siteEdgeKind })),
      ...(output.folderScope && { folderScope: output.folderScope }),
    });
    let changeExplanations;
    if (rustOutput.folderScope) {
      const currentSnapshot = snapshotFor(rustOutput);
      const snapshotPath = join(getSiteRawDirectory(siteSlug), 'folder_scope_snapshot.json');
      if (draftNodes) {
        const committedOutput = await runGraph(getSiteConfigPath(siteSlug, 'site_node_config.yaml'));
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

    const nodeDepthMap = new Map<string, number>(rustOutput.nodes.map(node => [node.siteNodeKey, node.depth]));
    const linkResolutionMaps = rustOutput.allLinkResolutionMaps || {};

    const nodes: ISiteNode[] = rustOutput.nodes.map(node => {
      const common = {
        siteNodeKey: node.siteNodeKey as ISiteNode['siteNodeKey'],
        ...(node.siteNodeId && { siteNodeId: node.siteNodeId as ISiteNode['siteNodeId'] }),
        label: node.siteNodeName,
        siteNodeName: node.siteNodeName,
        depth: node.depth,
        remaining_depth: node.remaining_depth,
        remaining_inlinks_depth: node.remaining_inlinks_depth,
        path: node.path,
        traversal_details: node.traversal_details,
        traversal_states: node.traversal_states,
        ...(node.effectiveBlacklistingSiteNodeId && {
          effectiveBlacklistingSiteNodeId: node.effectiveBlacklistingSiteNodeId as ISiteNode['siteNodeId'],
        }),
        ...(node.effectiveFolderPolicySiteNodeId && {
          effectiveFolderPolicySiteNodeId: node.effectiveFolderPolicySiteNodeId as ISiteNode['siteNodeId'],
        }),
        linkResolutionMap: linkResolutionMaps[node.siteNodeKey],
        isFrontierNode: node.isFrontierNode,
        isFrontierImageExtension: node.isFrontierImageExtension,
        source_page_outlink_count: node.source_page_outlink_count,
        source_page_inlink_count: node.source_page_inlink_count,
        data: {
          siteNodeName: node.siteNodeName,
          sourceGraphSubdirectory: node.sourceGraphSubdirectory,
          fileType: node.fileType,
          is_sensitive: node.is_sensitive
        },
        getIdent: () => node.siteNodeKey
      };
      if (node.siteNodeKind === 'collection') {
        return {
          ...common,
          siteNodeKind: 'collection',
          memberSiteNodeIds: (node.memberSiteNodeIds ?? []) as NonNullable<ISiteNode['siteNodeId']>[],
        };
      }
      if (node.siteNodeKind === 'folder') {
        return {
          ...common,
          siteNodeKind: 'folder',
          sourceGraphSubdirectory: node.sourceGraphSubdirectory ?? '',
        };
      }
      if (!node.fileType) throw new Error(`File node ${node.siteNodeKey} has no fileType`);
      return {
        ...common,
        siteNodeKind: 'file',
        sourceGraphSubdirectory: node.sourceGraphSubdirectory ?? '',
        fileType: node.fileType,
      };
    });

    // Deduplicate edges to match existing API: one edge per page pair, mark bidirectional if reverse exists.
    const edgeMap = new Map<string, RustEdge>();
    for (const e of rustOutput.edges) {
      const forwardKey = `${e.siteEdgeKind}:${e.source}->${e.target}`;
      const reverseKey = `${e.siteEdgeKind}:${e.target}->${e.source}`;
      if (e.siteEdgeKind === 'semanticLink' && edgeMap.has(reverseKey)) {
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
        siteEdgeKind: e.siteEdgeKind,
        isBidirectional: e.isBidirectional ?? false,
        data: { fromDepth: nodeDepthMap.get(e.source) ?? 0, toDepth: nodeDepthMap.get(e.target) ?? 0 }
      }))
      .sort((a, b) => (a.source + '->' + a.target).localeCompare(b.source + '->' + b.target));

    res.json({
      nodes,
      edges: resultEdges,
      allInlinkSources: rustOutput.allInlinkSources || {},
      allOutlinkTargets: rustOutput.allOutlinkTargets || {},
      folderScope: rustOutput.folderScope,
      changeExplanations,
    });
  })().catch(next);
});

// Mark page as sensitive/non-sensitive
router.patch('/sites/:siteSlug/curation/page/:pageTitle/sensitive', (req, res, next) => {
  try {
    const { siteSlug, pageTitle } = req.params;
    const { isSensitive } = req.body as { isSensitive: boolean };

    if (!siteSlug || !pageTitle) {
      return res.status(400).json({ error: 'siteSlug and pageTitle are required' });
    }

    if (typeof isSensitive !== 'boolean') {
      return res.status(400).json({ error: 'isSensitive must be a boolean' });
    }

    // Get site configuration to find the source directory
    const siteDirectory = getSiteDirectory(siteSlug);
    if (!fs.existsSync(siteDirectory)) {
      return res.status(404).json({ error: `Site '${siteSlug}' not found` });
    }

    const configPath = getSiteConfigPath(siteSlug);
    let notesDir = '';
    try {
      if (!fs.existsSync(configPath)) {
        return res.status(500).json({ error: `site_config.yaml not found for slug ${siteSlug}` });
      }
      const yamlContent = fs.readFileSync(configPath, 'utf8');
      const config = YAML.parse(yamlContent) as { sourceDirectory?: string };
      if (config && typeof config.sourceDirectory === 'string') {
        notesDir = config.sourceDirectory;
      }
    } catch {
      return res.status(500).json({ error: `Failed to load site configuration for ${siteSlug}` });
    }

    if (!notesDir) {
      return res.status(500).json({ error: `Could not determine source directory for site ${siteSlug}` });
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
