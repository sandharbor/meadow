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
import path from 'path';
import type { FileBundleNodeConfig, BundleNodeConfig } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import type { SourcePageFileInfo } from '../../../../../../../contracts/types/sourcePageFileInfo.js';
import { BundleConfigPaths } from '../../../../../../../shared_code/paths/bundleConfigPaths.js';
import {
  rankSourcePageCandidatesWithCount,
  recentSourcePageCandidatesWithCount
} from '../../../../../../../shared_code/utils/sourcePageSearchUtils.js';
import { bundleNodeConfigToKey, type BundleNodeConfigMap } from '../../../../shared/bundle-node/nodeKeys.js';
import { runWorkingGraphRaw } from '../../../../shared/utils/workingGraphUtils.js';
import { loadValidatedBundleNodeConfiguration } from '../../../../shared/bundle-node/bundleNodeConfigLoader.js';
import {
  selectAutoOpenKnowledgeFormatIndexSource,
  selectAutoOpenKnowledgeFormatLogSource
} from './openKnowledgeFormat.js';
import {
  normalizeOpenKnowledgeFormatIndexMode,
  normalizeOpenKnowledgeFormatLogMode,
  type OpenKnowledgeFormatIndexMode,
  type OpenKnowledgeFormatLogMode
} from './openKnowledgeFormatConfig.js';

type WorkingGraphOutput = {
  nodes: Array<{ bundleNodeKey: string }>;
};

export interface OpenKnowledgeFormatLogPageOptions {
  index: {
    mode: OpenKnowledgeFormatIndexMode;
    sourceGraphPath: string | null;
    defaultPage: SourcePageFileInfo | null;
    selectedPage: SourcePageFileInfo | null;
  };
  log: {
    mode: OpenKnowledgeFormatLogMode;
    sourceGraphPath: string | null;
    defaultPage: SourcePageFileInfo | null;
    selectedPage: SourcePageFileInfo | null;
  };
  pages: SourcePageFileInfo[];
  count: number;
}

function buildBundleNodeConfigMap(nodes: BundleNodeConfig[]): BundleNodeConfigMap {
  const result: BundleNodeConfigMap = {};
  for (const conf of nodes) {
    result[bundleNodeConfigToKey(conf)] = conf;
  }
  return result;
}

function sourcePathForConfig(config: FileBundleNodeConfig): string {
  const fileType = config.fileType || 'md';
  const filename = fileType === 'excalidraw'
    ? `${config.bundleNodeName}.excalidraw.md`
    : `${config.bundleNodeName}.${fileType}`;
  const dir = config.sourceGraphSubdirectory || '';
  return dir ? `${dir}/${filename}` : filename;
}

function pageInfoForConfig(config: FileBundleNodeConfig, trackedContentDir: string): SourcePageFileInfo {
  const fullPath = sourcePathForConfig(config);
  const absolutePath = path.join(trackedContentDir, ...fullPath.split('/'));
  let modifiedTimeMs = 0;
  if (fs.existsSync(absolutePath)) {
    modifiedTimeMs = fs.statSync(absolutePath).mtimeMs;
  }
  return {
    title: config.bundleNodeName,
    directory: config.sourceGraphSubdirectory || '',
    file_type: config.fileType,
    fullPath,
    modifiedTimeMs,
  };
}

async function reachableMarkdownPages(bundleDirectory: string): Promise<SourcePageFileInfo[]> {
  const { bundleConfig, nodes } = loadValidatedBundleNodeConfiguration(bundleDirectory);
  const bundleNodeConfPath = BundleConfigPaths.getBundleNodeConfigFile(bundleDirectory);
  const bundleNodeConfs = buildBundleNodeConfigMap(nodes);
  const trackedContentDir = BundleConfigPaths.getTrackedPageContentDir(bundleDirectory);
  const raw = await runWorkingGraphRaw({
    graphRoot: trackedContentDir,
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
  const reachableKeys = new Set<string>();
  for (const node of output.nodes) {
    reachableKeys.add(node.bundleNodeKey);
  }

  return Object.values(bundleNodeConfs)
    .filter((config): config is FileBundleNodeConfig => config.bundleNodeKind === 'file' && config.fileType === 'md')
    .filter(config => reachableKeys.has(bundleNodeConfigToKey(config)))
    .map(config => pageInfoForConfig(config, trackedContentDir));
}

export async function getOpenKnowledgeFormatLogPageOptions(
  bundleDirectory: string,
  options: { query?: string; limit?: number } = {}
): Promise<OpenKnowledgeFormatLogPageOptions> {
  const { bundleConfig, entryNode } = loadValidatedBundleNodeConfiguration(bundleDirectory);
  const allPages = await reachableMarkdownPages(bundleDirectory);
  const byPath = new Map(allPages.map(page => [page.fullPath, page]));
  const markdownPaths = allPages.map(page => page.fullPath);
  const entrySourcePath = entryNode.bundleNodeKind === 'file' ? sourcePathForConfig(entryNode) : null;
  const defaultIndexPath = selectAutoOpenKnowledgeFormatIndexSource(
    markdownPaths,
    entrySourcePath
  );
  const defaultIndexPage = defaultIndexPath ? byPath.get(defaultIndexPath) ?? null : null;
  const defaultLogPath = selectAutoOpenKnowledgeFormatLogSource(
    markdownPaths,
    entrySourcePath
  );
  const defaultPage = defaultLogPath ? byPath.get(defaultLogPath) ?? null : null;
  const configuredIndexMode = bundleConfig.generationOpenKnowledgeFormatIndexMode;
  const indexMode = configuredIndexMode === undefined && defaultIndexPage
    ? 'trackedPage'
    : normalizeOpenKnowledgeFormatIndexMode(configuredIndexMode);
  const configuredIndexPath = typeof bundleConfig.generationOpenKnowledgeFormatIndexSourcePath === 'string'
    ? bundleConfig.generationOpenKnowledgeFormatIndexSourcePath
    : null;
  const selectedIndexPage = indexMode === 'trackedPage' && configuredIndexPath
    ? byPath.get(configuredIndexPath) ?? null
    : indexMode === 'trackedPage'
      ? defaultIndexPage
      : null;
  const logMode = normalizeOpenKnowledgeFormatLogMode(bundleConfig.generationOpenKnowledgeFormatLogMode);
  const configuredLogPath = typeof bundleConfig.generationOpenKnowledgeFormatLogSourcePath === 'string'
    ? bundleConfig.generationOpenKnowledgeFormatLogSourcePath
    : null;
  const selectedLogPage = logMode === 'trackedPage' && configuredLogPath
    ? byPath.get(configuredLogPath) ?? null
    : defaultPage;

  const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 200) : 25;
  const query = options.query?.trim() || '';
  const ranked = query
    ? rankSourcePageCandidatesWithCount(query, allPages, limit)
    : recentSourcePageCandidatesWithCount(allPages, limit);

  return {
    index: {
      mode: indexMode,
      sourceGraphPath: configuredIndexPath,
      defaultPage: defaultIndexPage,
      selectedPage: selectedIndexPage,
    },
    log: {
      mode: logMode,
      sourceGraphPath: configuredLogPath,
      defaultPage,
      selectedPage: selectedLogPage,
    },
    pages: ranked.results.map(({ bucket: _bucket, ...page }) => page),
    count: ranked.totalCount,
  };
}
