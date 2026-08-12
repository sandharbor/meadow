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

import { SiteNodeConfig } from '../../../../../../shared_code/types/siteNodeConfig.js';
import { SiteConfigPaths } from '../../../../../../shared_code/paths/siteConfigPaths.js';
import { parseSiteNodeConfig } from '../../../../../../shared_code/utils/siteNodeConfigUtils.js';
import { siteNodeConfigToKey, SiteNodeConfigMap } from '../../../../shared/site-node/nodeKeys.js';
import { runWorkingGraphRaw } from '../../../../shared/utils/workingGraphUtils.js';
import { loadSiteConfig } from '../../../../shared/utils/siteConfigUtils.js';
import { prepareSrsRenderSourceDirectory } from '../render-source/srsMarkdown.js';
import { prepareScrubbedSourceDirectory } from '../source-material/sourceScrubbing.js';
import { prepareSourcesExportFromScrubbedSourceDirectory } from './sourcesExport.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';
import fs from 'fs';

type WorkingGraphOutput = {
  nodes: Array<{ siteNodeKey: string }>;
  allLinkResolutionMaps?: Record<string, Record<string, {
    link_resolved_target_directory: string;
    link_resolved_target_path: string | null;
  }>>;
};

function readSiteNodeConfigMap(siteNodeConfPath: string): SiteNodeConfigMap {
  const result: SiteNodeConfigMap = {};
  if (!fs.existsSync(siteNodeConfPath)) return result;
  const content = fs.readFileSync(siteNodeConfPath, 'utf-8');
  const pageConfArray = parseSiteNodeConfig(content);
  for (const conf of pageConfArray) {
    result[siteNodeConfigToKey(conf)] = conf;
  }
  return result;
}

/**
 * Builds the same scrubbed source directory that the site-publish path uses,
 * so the Advanced-tab "sources" download agrees with the
 * generated site on which pages/assets are safe to emit.
 *
 * Returns the absolute path to the built directory.
 */
export async function buildFilteredSourcesExportForSite(siteDirectory: string): Promise<string> {
  const siteConfig = loadSiteConfig(siteDirectory);
  const siteNodeConfPath = SiteConfigPaths.getSiteNodeConfigFile(siteDirectory);
  const siteNodeConfs = readSiteNodeConfigMap(siteNodeConfPath);
  const trackedContentDir = SiteConfigPaths.getTrackedPageContentDir(siteDirectory);
  const renderSourceContentDir = SiteConfigPaths.getRenderSourceContentDir(siteDirectory);
  const legacyRenderSourceContentDir = SiteConfigPaths.getLegacyRenderSourceContentDir(siteDirectory);
  const scrubbedSourceDir = SiteConfigPaths.getScrubbedSourceContentDir(siteDirectory);
  const sourcesExportDir = SiteConfigPaths.getSourcesExportDir(siteDirectory);

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
        `buildFilteredSourcesExportForSite: SRS render source failed (will use tracked content): ${err instanceof Error ? err.message : String(err)}`
      );
      sourceContentDir = trackedContentDir;
    }
  }

  if (fs.existsSync(legacyRenderSourceContentDir)) {
    fs.rmSync(legacyRenderSourceContentDir, { recursive: true, force: true });
  }

  const traversablePageKeys = new Set<string>();
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
        traversablePageKeys.add(node.siteNodeKey);
      }
    } catch (err) {
      logger.warn(
        `buildFilteredSourcesExportForSite: working_graph traversal failed (will export an empty filtered set): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const siteNodeConfigsArrayForLinks: SiteNodeConfig[] = Object.values(siteNodeConfs).filter(
    conf => traversablePageKeys.has(siteNodeConfigToKey(conf))
  );

  prepareScrubbedSourceDirectory(
    sourceContentDir,
    scrubbedSourceDir,
    traversablePageKeys,
    siteNodeConfs,
    siteNodeConfigsArrayForLinks,
    allLinkResolutionMaps
  );

  prepareSourcesExportFromScrubbedSourceDirectory(scrubbedSourceDir, sourcesExportDir);

  return sourcesExportDir;
}
