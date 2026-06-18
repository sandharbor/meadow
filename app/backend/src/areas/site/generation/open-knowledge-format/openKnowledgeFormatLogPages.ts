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
import type { FileType } from '../../../../../../shared_code/types/FileType.js';
import type { SiteConfig } from '../../../../../../shared_code/types/siteConfig.js';
import type { SitePageConfig } from '../../../../../../shared_code/types/sitePageConfig.js';
import type { SourcePageFileInfo } from '../../../../../../shared_code/types/sourcePageFileInfo.js';
import { SiteConfigPaths } from '../../../../../../shared_code/paths/siteConfigPaths.js';
import { parsePageConfig } from '../../../../../../shared_code/utils/sitePageConfigUtils.js';
import {
  rankSourcePageCandidatesWithCount,
  recentSourcePageCandidatesWithCount
} from '../../../../../../shared_code/utils/sourcePageSearchUtils.js';
import { pageConfigToKey, type SitePageConfigs } from '../../../../shared/site-page/pageKeys.js';
import { runWorkingGraphRaw } from '../../../../shared/utils/workingGraphUtils.js';
import { loadSiteConfig } from '../../../../shared/utils/siteConfigUtils.js';
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

type WorkingGraphPage = {
  title: string;
  sourceGraphSubdirectory: string;
  file_type: FileType;
};

type WorkingGraphOutput = {
  pages: WorkingGraphPage[];
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

function readSitePageConfigs(sitePageConfPath: string): SitePageConfigs {
  const result: SitePageConfigs = {};
  if (!fs.existsSync(sitePageConfPath)) return result;
  const content = fs.readFileSync(sitePageConfPath, 'utf-8');
  const pageConfArray = parsePageConfig(content);
  for (const conf of pageConfArray) {
    result[pageConfigToKey(conf)] = conf;
  }
  return result;
}

function sourcePathForConfig(config: SitePageConfig): string {
  const fileType = config.file_type || 'md';
  const filename = fileType === 'excalidraw'
    ? `${config.title}.excalidraw.md`
    : `${config.title}.${fileType}`;
  const dir = config.source_graph_subdirectory || '';
  return dir ? `${dir}/${filename}` : filename;
}

function pageInfoForConfig(config: SitePageConfig, trackedContentDir: string): SourcePageFileInfo {
  const fullPath = sourcePathForConfig(config);
  const absolutePath = path.join(trackedContentDir, ...fullPath.split('/'));
  let modifiedTimeMs = 0;
  if (fs.existsSync(absolutePath)) {
    modifiedTimeMs = fs.statSync(absolutePath).mtimeMs;
  }
  return {
    title: config.title,
    directory: config.source_graph_subdirectory || '',
    file_type: config.file_type || 'md',
    fullPath,
    modifiedTimeMs,
  };
}

function initialSourcePath(siteConfig: SiteConfig, sitePageConfs: SitePageConfigs): string | null {
  const initialTitle = siteConfig.initialSitePageTitle || '';
  const initialDirectory = siteConfig.initialSitePageDirectory || '';
  if (!initialTitle) return null;
  const initialConfig = Object.values(sitePageConfs).find(
    config => config.title === initialTitle && (config.source_graph_subdirectory || '') === initialDirectory
  );
  return initialConfig ? sourcePathForConfig(initialConfig) : null;
}

async function reachableMarkdownPages(siteDirectory: string): Promise<SourcePageFileInfo[]> {
  const siteConfig = loadSiteConfig(siteDirectory);
  const sitePageConfPath = SiteConfigPaths.getSitePageConfigFile(siteDirectory);
  const sitePageConfs = readSitePageConfigs(sitePageConfPath);
  const trackedContentDir = SiteConfigPaths.getTrackedPageContentDir(siteDirectory);
  const initialTitle = siteConfig.initialSitePageTitle || '';
  const initialDirectory = siteConfig.initialSitePageDirectory || '';

  if (!initialTitle) return [];

  const initialConfig = Object.values(sitePageConfs).find(
    config => config.title === initialTitle && (config.source_graph_subdirectory || '') === initialDirectory
  );
  const initialFileType: FileType = initialConfig?.file_type || 'md';
  const raw = await runWorkingGraphRaw({
    graphRoot: trackedContentDir,
    sitePageConfigPath: sitePageConfPath,
    initial: { title: initialTitle, directory: initialDirectory, file_type: initialFileType },
    traversal: { title: initialTitle, directory: initialDirectory, file_type: initialFileType },
    frontierDepth: 0,
    allowImagesToExtendToFrontier: true,
    allowLowerDepths: false,
  });
  const output = JSON.parse(raw) as WorkingGraphOutput;
  const reachableKeys = new Set<string>();
  for (const page of output.pages) {
    reachableKeys.add(pageConfigToKey({
      title: page.title,
      source_graph_subdirectory: page.sourceGraphSubdirectory,
      file_type: page.file_type,
      config: { list_type: 'whitelist' },
    }));
  }

  return Object.values(sitePageConfs)
    .filter(config => (config.file_type || 'md') === 'md')
    .filter(config => config.config.tracked !== false)
    .filter(config => reachableKeys.has(pageConfigToKey(config)))
    .map(config => pageInfoForConfig(config, trackedContentDir));
}

export async function getOpenKnowledgeFormatLogPageOptions(
  siteDirectory: string,
  options: { query?: string; limit?: number } = {}
): Promise<OpenKnowledgeFormatLogPageOptions> {
  const siteConfig = loadSiteConfig(siteDirectory);
  const sitePageConfPath = SiteConfigPaths.getSitePageConfigFile(siteDirectory);
  const sitePageConfs = readSitePageConfigs(sitePageConfPath);
  const allPages = await reachableMarkdownPages(siteDirectory);
  const byPath = new Map(allPages.map(page => [page.fullPath, page]));
  const markdownPaths = allPages.map(page => page.fullPath);
  const initialPath = initialSourcePath(siteConfig, sitePageConfs);
  const defaultIndexPath = selectAutoOpenKnowledgeFormatIndexSource(
    markdownPaths,
    initialPath
  );
  const defaultIndexPage = defaultIndexPath ? byPath.get(defaultIndexPath) ?? null : null;
  const defaultLogPath = selectAutoOpenKnowledgeFormatLogSource(
    markdownPaths,
    initialPath
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
