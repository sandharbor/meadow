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

import { SitePageConfig } from '../../../shared_code/types/sitePageConfig.js';
import { FileType } from '../../../shared_code/types/FileType.js';
import { SiteConfigPaths } from '../../../shared_code/paths/siteConfigPaths.js';
import { parsePageConfig } from '../../../shared_code/utils/sitePageConfigUtils.js';
import { pageConfigToKey, SitePageConfigs } from '../html/types.js';
import { runWorkingGraphRaw } from './workingGraphUtils.js';
import { loadSiteConfig } from './siteConfigUtils.js';
import { prepareMarkdownExportDirectory } from './markdownExportUtils.js';
import { logger } from './logging/backendLoggingUtils.js';
import fs from 'fs';

type WorkingGraphPage = {
  title: string;
  sourceGraphSubdirectory: string;
  file_type: FileType;
};

type WorkingGraphOutput = { pages: WorkingGraphPage[] };

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

/**
 * Builds the same filtered markdown export directory that the site-publish
 * path produces, so the Advanced-tab "tracked raw markdown" download agrees
 * with the site-publish output on which pages are "tracked & in graph".
 *
 * Returns the absolute path to the built directory.
 */
export async function buildFilteredMarkdownExportForSite(siteDirectory: string): Promise<string> {
  const siteConfig = loadSiteConfig(siteDirectory);
  const sitePageConfPath = SiteConfigPaths.getSitePageConfigFile(siteDirectory);
  const sitePageConfs = readSitePageConfigs(sitePageConfPath);
  const trackedContentDir = SiteConfigPaths.getTrackedPageContentDir(siteDirectory);
  const exportDir = SiteConfigPaths.getMarkdownExportDir(siteDirectory);

  const traversablePageKeys = new Set<string>();
  const initialTitle = siteConfig.initialSitePageTitle || '';
  const initialDirectory = siteConfig.initialSitePageDirectory || '';

  if (initialTitle) {
    const initialConf = Object.values(sitePageConfs).find(
      c => c.title === initialTitle && (c.source_graph_subdirectory || '') === initialDirectory
    );
    const initialFileType: FileType = initialConf?.file_type || 'md';

    try {
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
      for (const page of output.pages) {
        const key = pageConfigToKey({
          title: page.title,
          source_graph_subdirectory: page.sourceGraphSubdirectory,
          file_type: page.file_type,
          config: { list_type: 'whitelist' },
        });
        traversablePageKeys.add(key);
      }
    } catch (err) {
      logger.warn(
        `buildFilteredMarkdownExportForSite: working_graph traversal failed (will export an empty filtered set): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const sitePageConfigsArrayForLinks: SitePageConfig[] = Object.values(sitePageConfs).filter(
    conf => traversablePageKeys.has(pageConfigToKey(conf))
  );

  prepareMarkdownExportDirectory(
    trackedContentDir,
    siteConfig.sourceDirectory || undefined,
    exportDir,
    traversablePageKeys,
    sitePageConfs,
    sitePageConfigsArrayForLinks
  );

  return exportDir;
}
