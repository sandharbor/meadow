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
import type { SiteNodeConfig } from '../../../../../../shared_code/types/siteNodeConfig.js';
import type { SourcePageFileInfo } from '../../../../../../shared_code/types/sourcePageFileInfo.js';
import { SiteConfigPaths } from '../../../../../../shared_code/paths/siteConfigPaths.js';
import {
  rankSourcePageCandidatesWithCount,
  recentSourcePageCandidatesWithCount
} from '../../../../../../shared_code/utils/sourcePageSearchUtils.js';
import { siteNodeConfigToKey, type SiteNodeConfigMap } from '../../../../shared/site-node/nodeKeys.js';
import { runWorkingGraphRaw } from '../../../../shared/utils/workingGraphUtils.js';
import { loadValidatedSiteNodeConfiguration } from '../../../../shared/site-node/siteNodeConfigLoader.js';
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
  nodes: Array<{ siteNodeKey: string }>;
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

function buildSiteNodeConfigMap(nodes: SiteNodeConfig[]): SiteNodeConfigMap {
  const result: SiteNodeConfigMap = {};
  for (const conf of nodes) {
    result[siteNodeConfigToKey(conf)] = conf;
  }
  return result;
}

function sourcePathForConfig(config: SiteNodeConfig): string {
  const fileType = config.fileType || 'md';
  const filename = fileType === 'excalidraw'
    ? `${config.siteNodeName}.excalidraw.md`
    : `${config.siteNodeName}.${fileType}`;
  const dir = config.sourceGraphSubdirectory || '';
  return dir ? `${dir}/${filename}` : filename;
}

function pageInfoForConfig(config: SiteNodeConfig, trackedContentDir: string): SourcePageFileInfo {
  const fullPath = sourcePathForConfig(config);
  const absolutePath = path.join(trackedContentDir, ...fullPath.split('/'));
  let modifiedTimeMs = 0;
  if (fs.existsSync(absolutePath)) {
    modifiedTimeMs = fs.statSync(absolutePath).mtimeMs;
  }
  return {
    title: config.siteNodeName,
    directory: config.sourceGraphSubdirectory || '',
    file_type: config.fileType,
    fullPath,
    modifiedTimeMs,
  };
}

async function reachableMarkdownPages(siteDirectory: string): Promise<SourcePageFileInfo[]> {
  const { siteConfig, nodes } = loadValidatedSiteNodeConfiguration(siteDirectory);
  const siteNodeConfPath = SiteConfigPaths.getSiteNodeConfigFile(siteDirectory);
  const siteNodeConfs = buildSiteNodeConfigMap(nodes);
  const trackedContentDir = SiteConfigPaths.getTrackedPageContentDir(siteDirectory);
  const raw = await runWorkingGraphRaw({
    graphRoot: trackedContentDir,
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
  const reachableKeys = new Set<string>();
  for (const node of output.nodes) {
    reachableKeys.add(node.siteNodeKey);
  }

  return Object.values(siteNodeConfs)
    .filter(config => (config.fileType || 'md') === 'md')
    .filter(config => reachableKeys.has(siteNodeConfigToKey(config)))
    .map(config => pageInfoForConfig(config, trackedContentDir));
}

export async function getOpenKnowledgeFormatLogPageOptions(
  siteDirectory: string,
  options: { query?: string; limit?: number } = {}
): Promise<OpenKnowledgeFormatLogPageOptions> {
  const { siteConfig, entryNode } = loadValidatedSiteNodeConfiguration(siteDirectory);
  const allPages = await reachableMarkdownPages(siteDirectory);
  const byPath = new Map(allPages.map(page => [page.fullPath, page]));
  const markdownPaths = allPages.map(page => page.fullPath);
  const entrySourcePath = sourcePathForConfig(entryNode);
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
  const configuredIndexMode = siteConfig.generationOpenKnowledgeFormatIndexMode;
  const indexMode = configuredIndexMode === undefined && defaultIndexPage
    ? 'trackedPage'
    : normalizeOpenKnowledgeFormatIndexMode(configuredIndexMode);
  const configuredIndexPath = typeof siteConfig.generationOpenKnowledgeFormatIndexSourcePath === 'string'
    ? siteConfig.generationOpenKnowledgeFormatIndexSourcePath
    : null;
  const selectedIndexPage = indexMode === 'trackedPage' && configuredIndexPath
    ? byPath.get(configuredIndexPath) ?? null
    : indexMode === 'trackedPage'
      ? defaultIndexPage
      : null;
  const logMode = normalizeOpenKnowledgeFormatLogMode(siteConfig.generationOpenKnowledgeFormatLogMode);
  const configuredLogPath = typeof siteConfig.generationOpenKnowledgeFormatLogSourcePath === 'string'
    ? siteConfig.generationOpenKnowledgeFormatLogSourcePath
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
