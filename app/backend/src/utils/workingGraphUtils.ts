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
import { execFile } from 'child_process';
import { logger } from './logging/backendLoggingUtils.js';
import { resolveNativeRustBinaryPath } from '../../../shared_code/utils/nativeRustBinaryPath.js';

function execWorkingGraph(binaryPath: string, args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(
      binaryPath,
      args,
      { timeout: 60000, maxBuffer: 250 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const err = error as unknown as Error & { stderr?: string; stdout?: string };
          const message = `${err.message}${stderr ? `\n${stderr}` : ''}`;
          return reject(Object.assign(new Error(message), { cause: error }));
        }
        if (stderr && stderr.length > 0 && !stdout) return reject(new Error(stderr));
        resolve(stdout);
      }
    );
  });
}

/**
 * Gets the working_graph binary path, checking environment variable first then falling back to relative path.
 * Backend should fail fast if the release binary is missing (no cargo-run fallback).
 */
export function getWorkingGraphPath(): string {
  const binaryPath = resolveNativeRustBinaryPath({
    importMetaUrl: import.meta.url,
    upLevelsToApp: 3,
    cratePathSegments: ['working_graph', 'working_graph_code'],
    binaryName: 'working_graph_bin',
    envVar: 'WORKING_GRAPH_PATH'
  });
  if (!fs.existsSync(binaryPath)) {
    throw new Error(
      `working_graph_bin not found at ${binaryPath}. Build it with ` +
        '`cd app/native_utils/working_graph/working_graph_code && cargo build --release --bin working_graph_bin` ' +
        'or set WORKING_GRAPH_PATH.'
    );
  }
  return binaryPath;
}

export type WorkingGraphRunArgs = {
  graphRoot: string;
  sitePageConfigPath: string;
  initial: { title: string; directory: string; file_type: string };
  traversal: { title: string; directory: string; file_type: string };
  frontierDepth: number;
  allowImagesToExtendToFrontier: boolean;
  allowLowerDepths: boolean;
};

export async function runWorkingGraphRaw(runArgs: WorkingGraphRunArgs): Promise<string> {
  const binaryPath = getWorkingGraphPath();

  const args: string[] = [
    '--graph-root',
    runArgs.graphRoot,
    '--site-page-config',
    runArgs.sitePageConfigPath,
    '--initial-title',
    runArgs.initial.title,
    '--initial-directory',
    runArgs.initial.directory,
    '--initial-file-type',
    runArgs.initial.file_type,
    '--traversal-title',
    runArgs.traversal.title,
    '--traversal-directory',
    runArgs.traversal.directory,
    '--traversal-file-type',
    runArgs.traversal.file_type,
    '--frontier-depth',
    String(runArgs.frontierDepth),
    '--allow-images-to-extend-to-frontier',
    runArgs.allowImagesToExtendToFrontier ? 'true' : 'false',
  ];

  if (runArgs.allowLowerDepths) {
    args.push('--allow-lower-depths');
  }

  logger.debug(`Executing working_graph command: "${binaryPath}" ${args.map(a => JSON.stringify(a)).join(' ')}`);
  return await execWorkingGraph(binaryPath, args);
}


