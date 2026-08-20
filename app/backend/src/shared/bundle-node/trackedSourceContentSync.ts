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
import { BundleConfigPaths } from '../../../../shared_code/paths/bundleConfigPaths.js';
import type { BundleNodeConfig, FileBundleNodeConfig } from '../../../../shared_code/types/bundleNodeConfig.js';
import {
  canonicalPageFilename,
  sourceFileCandidateFilenames,
} from '../../../../shared_code/utils/fileTypeUtils.js';

/**
 * Copy source material into Meadow-owned tracked state. Source graphs may be
 * deliberately read-only, but downstream preparation must be able to rewrite
 * its own copies (for example, when materializing generated tag links).
 */
export function copySourceFileToTrackedSnapshot(sourcePath: string, targetPath: string): void {
  fs.copyFileSync(sourcePath, targetPath);
  const sourceMode = fs.statSync(sourcePath).mode & 0o777;
  fs.chmodSync(targetPath, sourceMode | 0o200);
}

/**
 * Replace a bundle's tracked source snapshot from canonical curation records.
 * The caller owns persistence and commit boundaries; this function either
 * installs the complete snapshot or throws so that caller can roll back.
 */
export function syncTrackedSourceContent(options: {
  bundleDirectory: string;
  sourceDirectory: string;
  configs: BundleNodeConfig[];
}): { copiedFiles: string[] } {
  const targetDirectory = BundleConfigPaths.getTrackedPageContentDir(options.bundleDirectory);
  fs.rmSync(targetDirectory, { recursive: true, force: true });
  fs.mkdirSync(targetDirectory, { recursive: true });

  for (const config of options.configs) {
    if (config.bundleNodeKind !== 'folder') continue;
    const sourceFolder = config.sourceGraphSubdirectory
      ? path.join(options.sourceDirectory, ...config.sourceGraphSubdirectory.split('/'))
      : options.sourceDirectory;
    if (!fs.existsSync(sourceFolder) || !fs.statSync(sourceFolder).isDirectory()) {
      throw new Error(`Tracked source folder no longer exists: ${config.sourceGraphSubdirectory}`);
    }
    const targetFolder = config.sourceGraphSubdirectory
      ? path.join(targetDirectory, ...config.sourceGraphSubdirectory.split('/'))
      : targetDirectory;
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  const copiedFiles: string[] = [];
  const fileConfigs = options.configs.filter(
    (config): config is FileBundleNodeConfig => config.bundleNodeKind === 'file',
  );
  for (const config of fileConfigs) {
    const subdirectory = config.sourceGraphSubdirectory ?? '';
    const sourcePath = sourceFileCandidateFilenames(config.bundleNodeName, config.fileType)
      .map(filename => path.join(options.sourceDirectory, subdirectory, filename))
      .find(candidate => fs.existsSync(candidate));
    if (!sourcePath) {
      const expected = path.join(
        options.sourceDirectory,
        subdirectory,
        canonicalPageFilename(config.bundleNodeName, config.fileType),
      );
      throw new Error(`Tracked source file no longer exists: ${expected}`);
    }
    const relativePath = path.join(
      subdirectory,
      canonicalPageFilename(config.bundleNodeName, config.fileType),
    );
    const targetPath = path.join(targetDirectory, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    copySourceFileToTrackedSnapshot(sourcePath, targetPath);
    copiedFiles.push(relativePath.split(path.sep).join('/'));
  }
  copiedFiles.sort();
  return { copiedFiles };
}
