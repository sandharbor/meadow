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

import fs from 'fs';
import { SiteConfigPaths } from '../../../../../../shared_code/paths/siteConfigPaths.js';
import { SiteNodeConfig } from '../../../../../../shared_code/types/siteNodeConfig.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';
import { siteNodeConfigToKey, SiteNodeConfigMap } from '../../../../shared/site-node/nodeKeys.js';
import { loadValidatedSiteNodeConfiguration } from '../../../../shared/site-node/siteNodeConfigLoader.js';
import { runWorkingGraphRaw } from '../../../../shared/utils/workingGraphUtils.js';
import { prepareSrsRenderSourceDirectory } from '../render-source/srsMarkdown.js';
import { prepareScrubbedSourceDirectory } from '../source-material/sourceScrubbing.js';
import { prepareOpenKnowledgeFormatDirectoryFromScrubbedSourceDirectory } from './openKnowledgeFormat.js';
import {
  removeOpenKnowledgeFormatGenerationManifest,
  writeOpenKnowledgeFormatGenerationManifest
} from './openKnowledgeFormatGenerationManifest.js';
import {
  openKnowledgeFormatIndexSourceFromSiteConfig,
  openKnowledgeFormatLogSourceFromSiteConfig
} from './openKnowledgeFormatConfig.js';

type WorkingGraphOutput = {
  nodes: Array<{ siteNodeKey: string }>;
  allLinkResolutionMaps?: Record<string, Record<string, {
    link_resolved_target_directory: string;
    link_resolved_target_path: string | null;
  }>>;
};

function buildSiteNodeConfigMap(nodes: SiteNodeConfig[]): SiteNodeConfigMap {
  const result: SiteNodeConfigMap = {};
  for (const conf of nodes) {
    result[siteNodeConfigToKey(conf)] = conf;
  }
  return result;
}

export async function buildFilteredOpenKnowledgeFormatForSite(siteDirectory: string): Promise<string> {
  const { siteConfig, nodes, entryNode } = loadValidatedSiteNodeConfiguration(siteDirectory);
  const siteNodeConfPath = SiteConfigPaths.getSiteNodeConfigFile(siteDirectory);
  const siteNodeConfs = buildSiteNodeConfigMap(nodes);
  const trackedContentDir = SiteConfigPaths.getTrackedPageContentDir(siteDirectory);
  const renderSourceContentDir = SiteConfigPaths.getRenderSourceContentDir(siteDirectory);
  const legacyRenderSourceContentDir = SiteConfigPaths.getLegacyRenderSourceContentDir(siteDirectory);
  const scrubbedSourceDir = SiteConfigPaths.getScrubbedSourceContentDir(siteDirectory);
  const okfDir = SiteConfigPaths.getOpenKnowledgeFormatDir(siteDirectory);

  let sourceContentDir = trackedContentDir;
  if (siteConfig.generationSpacedRepetitionEnabled) {
    try {
      prepareSrsRenderSourceDirectory(
        trackedContentDir,
        renderSourceContentDir,
        siteConfig.generationSpacedRepetitionTags || []
      );
      if (fs.existsSync(renderSourceContentDir)) {
        sourceContentDir = renderSourceContentDir;
      }
    } catch (err) {
      logger.warn(
        `buildFilteredOpenKnowledgeFormatForSite: SRS render source failed (will use tracked content): ${err instanceof Error ? err.message : String(err)}`
      );
      sourceContentDir = trackedContentDir;
    }
  }

  if (fs.existsSync(legacyRenderSourceContentDir)) {
    fs.rmSync(legacyRenderSourceContentDir, { recursive: true, force: true });
  }

  const traversableNodeKeys = new Set<string>();
  let allLinkResolutionMaps: Map<string, Record<string, {
    link_resolved_target_directory: string;
    link_resolved_target_path: string | null;
  }>> = new Map();
  if (siteConfig.entrySiteNodeId && siteConfig.defaultTraversalSiteNodeId) {
    try {
      const raw = await runWorkingGraphRaw({
        graphRoot: sourceContentDir,
        siteNodeConfigPath: siteNodeConfPath,
        entrySiteNodeId: siteConfig.entrySiteNodeId,
        defaultTraversalSiteNodeId: siteConfig.defaultTraversalSiteNodeId,
        defaultOutlinksDepth: siteConfig.defaultOutlinksDepth,
        defaultInlinksDepth: siteConfig.defaultInlinksDepth,
        frontierDepth: 0,
        allowImagesToExtendToFrontier: true,
        allowLowerDepths: false,
      });
      const output = JSON.parse(raw) as WorkingGraphOutput;
      allLinkResolutionMaps = new Map(Object.entries(output.allLinkResolutionMaps || {}));
      for (const node of output.nodes) {
        traversableNodeKeys.add(node.siteNodeKey);
      }
    } catch (err) {
      logger.warn(
        `buildFilteredOpenKnowledgeFormatForSite: working_graph traversal failed (will export an empty filtered set): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const siteNodeConfigsArrayForLinks: SiteNodeConfig[] = Object.values(siteNodeConfs).filter(
    conf => traversableNodeKeys.has(siteNodeConfigToKey(conf))
  );

  prepareScrubbedSourceDirectory(
    sourceContentDir,
    scrubbedSourceDir,
    traversableNodeKeys,
    siteNodeConfs,
    siteNodeConfigsArrayForLinks,
    allLinkResolutionMaps
  );

  removeOpenKnowledgeFormatGenerationManifest(siteDirectory);
  const result = prepareOpenKnowledgeFormatDirectoryFromScrubbedSourceDirectory(
    scrubbedSourceDir,
    okfDir,
    {
      siteNodeConfigs: siteNodeConfigsArrayForLinks,
      allLinkResolutionMaps,
      entryNodeName: entryNode.siteNodeName,
      entrySourceGraphSubdirectory: entryNode.sourceGraphSubdirectory || '',
      indexSource: openKnowledgeFormatIndexSourceFromSiteConfig(siteConfig),
      logSource: openKnowledgeFormatLogSourceFromSiteConfig(siteConfig),
    }
  );
  writeOpenKnowledgeFormatGenerationManifest(siteDirectory, result);

  return okfDir;
}
