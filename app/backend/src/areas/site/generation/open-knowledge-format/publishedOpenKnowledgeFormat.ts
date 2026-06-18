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
import type { SitePageConfig } from '../../../../../../shared_code/types/sitePageConfig.js';
import type { LinkResolvedInfo } from '../../../../../../shared_code/types/ISitePage.js';
import { SiteConfigPaths } from '../../../../../../shared_code/paths/siteConfigPaths.js';
import {
  prepareOpenKnowledgeFormatDirectoryFromScrubbedSourceDirectory,
  type OpenKnowledgeFormatIndexSource,
  type OpenKnowledgeFormatLogSource
} from './openKnowledgeFormat.js';
import {
  createOpenKnowledgeFormatZip,
  getOpenKnowledgeFormatDownloadFilename,
  OPEN_KNOWLEDGE_FORMAT_ASSETS_DIR,
  OPEN_KNOWLEDGE_FORMAT_BUNDLE_DIR,
  writeOpenKnowledgeFormatManifest
} from './openKnowledgeFormatArchive.js';
import {
  removeOpenKnowledgeFormatGenerationManifest,
  writeOpenKnowledgeFormatGenerationManifest
} from './openKnowledgeFormatGenerationManifest.js';

type LinkResolutionMap = Record<string, LinkResolvedInfo>;
type AllLinkResolutionMaps = Map<string, LinkResolutionMap>;

export interface GeneratePublishedOpenKnowledgeFormatOptions {
  siteDirectory: string;
  assetsDirectory: string;
  scrubbedSourceContentDirectory: string;
  sitePageConfigs: SitePageConfig[];
  allLinkResolutionMaps?: AllLinkResolutionMaps;
  initialPageTitle?: string;
  initialPageDirectory?: string;
  indexSource?: OpenKnowledgeFormatIndexSource;
  logSource?: OpenKnowledgeFormatLogSource;
  archiveRootDirectory: string;
}

export interface GeneratePublishedOpenKnowledgeFormatResult {
  enabled: boolean;
  zipFilename: string | null;
}

export async function generatePublishedOpenKnowledgeFormatArtifacts(
  options: GeneratePublishedOpenKnowledgeFormatOptions
): Promise<GeneratePublishedOpenKnowledgeFormatResult> {
  const okfDir = SiteConfigPaths.getOpenKnowledgeFormatDir(options.siteDirectory);
  removeOpenKnowledgeFormatGenerationManifest(options.siteDirectory);
  if (fs.existsSync(okfDir)) {
    fs.rmSync(okfDir, { recursive: true, force: true });
  }

  const result = prepareOpenKnowledgeFormatDirectoryFromScrubbedSourceDirectory(
    options.scrubbedSourceContentDirectory,
    okfDir,
    {
      sitePageConfigs: options.sitePageConfigs,
      allLinkResolutionMaps: options.allLinkResolutionMaps,
      initialPageTitle: options.initialPageTitle,
      initialPageDirectory: options.initialPageDirectory,
      indexSource: options.indexSource,
      logSource: options.logSource,
    }
  );
  writeOpenKnowledgeFormatGenerationManifest(options.siteDirectory, result);

  const okfOutputDir = path.join(options.assetsDirectory, OPEN_KNOWLEDGE_FORMAT_ASSETS_DIR);
  if (fs.existsSync(okfOutputDir)) {
    fs.rmSync(okfOutputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(okfOutputDir, { recursive: true });

  const okfBundleDir = path.join(okfOutputDir, OPEN_KNOWLEDGE_FORMAT_BUNDLE_DIR);
  fs.cpSync(okfDir, okfBundleDir, { recursive: true });

  const zipFilename = await createOpenKnowledgeFormatZip(okfDir, okfOutputDir, {
    archiveRootDirectory: options.archiveRootDirectory,
  });
  writeOpenKnowledgeFormatManifest(okfOutputDir, zipFilename, {
    downloadFilename: getOpenKnowledgeFormatDownloadFilename(options.archiveRootDirectory),
  });

  return {
    enabled: zipFilename !== null,
    zipFilename,
  };
}

export function cleanupPublishedOpenKnowledgeFormatArtifacts(options: {
  siteDirectory: string;
  assetsDirectory: string;
}): void {
  const okfOutputDir = path.join(options.assetsDirectory, OPEN_KNOWLEDGE_FORMAT_ASSETS_DIR);
  if (fs.existsSync(okfOutputDir)) {
    fs.rmSync(okfOutputDir, { recursive: true, force: true });
  }
  const okfDir = SiteConfigPaths.getOpenKnowledgeFormatDir(options.siteDirectory);
  if (fs.existsSync(okfDir)) {
    fs.rmSync(okfDir, { recursive: true, force: true });
  }
  removeOpenKnowledgeFormatGenerationManifest(options.siteDirectory);
}
