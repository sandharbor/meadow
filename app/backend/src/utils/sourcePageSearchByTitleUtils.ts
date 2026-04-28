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

import { exec } from 'child_process';
import type { SourcePageFileInfo } from '../../../shared_code/types/sourcePageFileInfo.js';
import { logger } from './logging/backendLoggingUtils.js';
import { resolveNativeRustBinaryPath } from '../../../shared_code/utils/nativeRustBinaryPath.js';

function execCommand(command: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    exec(command, { timeout: 120000, maxBuffer: 250 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const err = error as unknown as Error & { stderr?: string; stdout?: string };
        const message = `${err.message}${stderr ? `\n${stderr}` : ''}`;
        return reject(Object.assign(new Error(message), { cause: error }));
      }
      if (stderr && stderr.length > 0 && !stdout) return reject(new Error(stderr));
      resolve(stdout);
    });
  });
}

/**
 * Gets the source_page_search_by_title binary path, checking environment variable first then
 * falling back to relative path.
 *
 * Note: Electron production build sets SOURCE_PAGE_SEARCH_BY_TITLE_PATH explicitly.
 */
export function getSourcePageSearchByTitlePath(): string {
  return resolveNativeRustBinaryPath({
    importMetaUrl: import.meta.url,
    upLevelsToApp: 3,
    cratePathSegments: ['source_page_search_by_title', 'source_page_search_by_title_code'],
    binaryName: 'source_page_search_by_title_bin',
    envVar: 'SOURCE_PAGE_SEARCH_BY_TITLE_PATH'
  });
}

export async function runSourcePageSearchByTitleRaw(sourceDirectory: string): Promise<string> {
  const binaryPath = getSourcePageSearchByTitlePath();
  const command = `"${binaryPath}" --root "${sourceDirectory}"`;
  logger.debug(`Executing source_page_search_by_title command: ${command}`);
  return await execCommand(command);
}

export async function runSourcePageSearchByTitle(sourceDirectory: string): Promise<SourcePageFileInfo[]> {
  const out = await runSourcePageSearchByTitleRaw(sourceDirectory);
  return JSON.parse(out) as SourcePageFileInfo[];
}
