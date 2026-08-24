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

import { BundleNodeConfig } from '../../../../../../../shared_code/types/bundleNodeConfig.js';
import { BundleConfigPaths } from '../../../../../../../shared_code/paths/bundleConfigPaths.js';
import { parseBundleNodeConfig } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { bundleNodeConfigToKey, BundleNodeConfigMap } from '../../../../shared/bundle-node/nodeKeys.js';
import { runWorkingGraphRaw } from '../../../../shared/utils/workingGraphUtils.js';
import { loadBundleConfig } from '../../../../shared/utils/bundleConfigUtils.js';
import { prepareSrsRenderSourceDirectory } from '../render-source/srsMarkdown.js';
import { prepareScrubbedSourceDirectory } from '../source-material/sourceScrubbing.js';
import { prepareSourcesExportFromScrubbedSourceDirectory } from './sourcesExport.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';
import fs from 'fs';

type WorkingGraphOutput = {
  nodes: Array<{ bundleNodeKey: string }>;
  allLinkResolutionMaps?: Record<string, Record<string, {
    link_resolved_target_directory: string;
    link_resolved_target_path: string | null;
  }>>;
};

function readBundleNodeConfigMap(bundleNodeConfPath: string): BundleNodeConfigMap {
  const result: BundleNodeConfigMap = {};
  if (!fs.existsSync(bundleNodeConfPath)) return result;
  const content = fs.readFileSync(bundleNodeConfPath, 'utf-8');
  const pageConfArray = parseBundleNodeConfig(content);
  for (const conf of pageConfArray) {
    result[bundleNodeConfigToKey(conf)] = conf;
  }
  return result;
}

/**
 * Builds the same scrubbed source directory that the bundle-publish path uses,
 * so the Advanced-tab "sources" download agrees with the
 * generated bundle on which pages/assets are safe to emit.
 *
 * Returns the absolute path to the built directory.
 */
export async function buildFilteredSourcesExportForBundle(bundleDirectory: string): Promise<string> {
  const bundleConfig = loadBundleConfig(bundleDirectory);
  const bundleNodeConfPath = BundleConfigPaths.getBundleNodeConfigFile(bundleDirectory);
  const bundleNodeConfs = readBundleNodeConfigMap(bundleNodeConfPath);
  const trackedContentDir = BundleConfigPaths.getTrackedPageContentDir(bundleDirectory);
  const renderSourceContentDir = BundleConfigPaths.getRenderSourceContentDir(bundleDirectory);
  const legacyRenderSourceContentDir = BundleConfigPaths.getLegacyRenderSourceContentDir(bundleDirectory);
  const scrubbedSourceDir = BundleConfigPaths.getScrubbedSourceContentDir(bundleDirectory);
  const sourcesExportDir = BundleConfigPaths.getSourcesExportDir(bundleDirectory);

  let sourceContentDir = trackedContentDir;
  if (bundleConfig.generationSpacedRepetitionEnabled) {
    try {
      prepareSrsRenderSourceDirectory(
        trackedContentDir,
        renderSourceContentDir,
        bundleConfig.generationSpacedRepetitionTags || []
      );
      if (fs.existsSync(renderSourceContentDir)) {
        sourceContentDir = renderSourceContentDir;
      }
    } catch (err) {
      logger.warn(
        `buildFilteredSourcesExportForBundle: SRS render source failed (will use tracked content): ${err instanceof Error ? err.message : String(err)}`
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
  if (bundleConfig.entryBundleNodeId && bundleConfig.defaultTraversalBundleNodeId) {
    try {
      const raw = await runWorkingGraphRaw({
        graphRoot: sourceContentDir,
        bundleNodeConfigPath: bundleNodeConfPath,
        entryBundleNodeId: bundleConfig.entryBundleNodeId,
        defaultTraversalBundleNodeId: bundleConfig.defaultTraversalBundleNodeId,
        defaultOutlinksDepth: bundleConfig.defaultOutlinksDepth,
        defaultInlinksDepth: bundleConfig.defaultInlinksDepth,
        frontierDepth: 0,
        allowImagesToExtendToFrontier: true,
        allowLowerDepths: false,
      });
      const output = JSON.parse(raw) as WorkingGraphOutput;
      allLinkResolutionMaps = new Map(Object.entries(output.allLinkResolutionMaps || {}));
      for (const node of output.nodes) {
        traversablePageKeys.add(node.bundleNodeKey);
      }
    } catch (err) {
      logger.warn(
        `buildFilteredSourcesExportForBundle: working_graph traversal failed (will export an empty filtered set): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const bundleNodeConfigsArrayForLinks: BundleNodeConfig[] = Object.values(bundleNodeConfs).filter(
    conf => traversablePageKeys.has(bundleNodeConfigToKey(conf))
  );

  prepareScrubbedSourceDirectory(
    sourceContentDir,
    scrubbedSourceDir,
    traversablePageKeys,
    bundleNodeConfs,
    bundleNodeConfigsArrayForLinks,
    allLinkResolutionMaps
  );

  prepareSourcesExportFromScrubbedSourceDirectory(scrubbedSourceDir, sourcesExportDir);

  return sourcesExportDir;
}
