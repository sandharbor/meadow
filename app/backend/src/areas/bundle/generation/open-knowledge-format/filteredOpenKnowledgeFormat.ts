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
import { BundleConfigPaths } from '../../../../../../shared_code/paths/bundleConfigPaths.js';
import { BundleNodeConfig } from '../../../../../../shared_code/types/bundleNodeConfig.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';
import { bundleNodeConfigToKey, BundleNodeConfigMap } from '../../../../shared/bundle-node/nodeKeys.js';
import { loadValidatedBundleNodeConfiguration } from '../../../../shared/bundle-node/bundleNodeConfigLoader.js';
import { runWorkingGraphRaw } from '../../../../shared/utils/workingGraphUtils.js';
import { prepareSrsRenderSourceDirectory } from '../render-source/srsMarkdown.js';
import { prepareScrubbedSourceDirectory } from '../source-material/sourceScrubbing.js';
import { prepareOpenKnowledgeFormatDirectoryFromScrubbedSourceDirectory } from './openKnowledgeFormat.js';
import {
  removeOpenKnowledgeFormatGenerationManifest,
  writeOpenKnowledgeFormatGenerationManifest
} from './openKnowledgeFormatGenerationManifest.js';
import {
  openKnowledgeFormatIndexSourceFromBundleConfig,
  openKnowledgeFormatLogSourceFromBundleConfig
} from './openKnowledgeFormatConfig.js';

type WorkingGraphOutput = {
  nodes: Array<{ bundleNodeKey: string }>;
  allLinkResolutionMaps?: Record<string, Record<string, {
    link_resolved_target_directory: string;
    link_resolved_target_path: string | null;
  }>>;
};

function buildBundleNodeConfigMap(nodes: BundleNodeConfig[]): BundleNodeConfigMap {
  const result: BundleNodeConfigMap = {};
  for (const conf of nodes) {
    result[bundleNodeConfigToKey(conf)] = conf;
  }
  return result;
}

export async function buildFilteredOpenKnowledgeFormatForBundle(bundleDirectory: string): Promise<string> {
  const { bundleConfig, nodes, entryNode } = loadValidatedBundleNodeConfiguration(bundleDirectory);
  const bundleNodeConfPath = BundleConfigPaths.getBundleNodeConfigFile(bundleDirectory);
  const bundleNodeConfs = buildBundleNodeConfigMap(nodes);
  const trackedContentDir = BundleConfigPaths.getTrackedPageContentDir(bundleDirectory);
  const renderSourceContentDir = BundleConfigPaths.getRenderSourceContentDir(bundleDirectory);
  const legacyRenderSourceContentDir = BundleConfigPaths.getLegacyRenderSourceContentDir(bundleDirectory);
  const scrubbedSourceDir = BundleConfigPaths.getScrubbedSourceContentDir(bundleDirectory);
  const okfDir = BundleConfigPaths.getOpenKnowledgeFormatDir(bundleDirectory);

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
        `buildFilteredOpenKnowledgeFormatForBundle: SRS render source failed (will use tracked content): ${err instanceof Error ? err.message : String(err)}`
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
        traversableNodeKeys.add(node.bundleNodeKey);
      }
    } catch (err) {
      logger.warn(
        `buildFilteredOpenKnowledgeFormatForBundle: working_graph traversal failed (will export an empty filtered set): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const bundleNodeConfigsArrayForLinks: BundleNodeConfig[] = Object.values(bundleNodeConfs).filter(
    conf => traversableNodeKeys.has(bundleNodeConfigToKey(conf))
  );

  prepareScrubbedSourceDirectory(
    sourceContentDir,
    scrubbedSourceDir,
    traversableNodeKeys,
    bundleNodeConfs,
    bundleNodeConfigsArrayForLinks,
    allLinkResolutionMaps
  );

  removeOpenKnowledgeFormatGenerationManifest(bundleDirectory);
  const result = prepareOpenKnowledgeFormatDirectoryFromScrubbedSourceDirectory(
    scrubbedSourceDir,
    okfDir,
    {
      bundleNodeConfigs: bundleNodeConfigsArrayForLinks,
      allLinkResolutionMaps,
      entryNodeName: entryNode.bundleNodeName,
      entrySourceGraphSubdirectory: entryNode.sourceGraphSubdirectory || '',
      indexSource: openKnowledgeFormatIndexSourceFromBundleConfig(bundleConfig),
      logSource: openKnowledgeFormatLogSourceFromBundleConfig(bundleConfig),
      generatedIndexMarkdown: entryNode.bundleNodeKind === 'file'
        ? undefined
        : `---\nokf_version: "0.1"\n---\n\n# ${entryNode.bundleNodeName}\n\n${entryNode.bundleNodeKind === 'collection'
            ? entryNode.memberBundleNodeIds
              .map(memberId => nodes.find(node => node.bundleNodeId === memberId)?.bundleNodeName)
              .filter((name): name is string => Boolean(name))
              .map(name => `- ${name}`)
              .join('\n')
            : ''}\n`,
    }
  );
  writeOpenKnowledgeFormatGenerationManifest(bundleDirectory, result);

  return okfDir;
}
