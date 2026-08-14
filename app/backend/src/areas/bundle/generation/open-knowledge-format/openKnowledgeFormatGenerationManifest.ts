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
import { BundleConfigPaths } from '../../../../../../shared_code/paths/bundleConfigPaths.js';
import type {
  OpenKnowledgeFormatRename,
  PrepareOpenKnowledgeFormatResult
} from './openKnowledgeFormat.js';

export const OPEN_KNOWLEDGE_FORMAT_GENERATION_MANIFEST_FILENAME = 'okf-generation-manifest.json';

export interface OpenKnowledgeFormatGenerationManifest {
  renames: OpenKnowledgeFormatRename[];
  indexOutputPath: string | null;
  logOutputPath: string | null;
}

export function getOpenKnowledgeFormatGenerationManifestPath(bundleDirectory: string): string {
  return path.join(
    BundleConfigPaths.getBuildDir(bundleDirectory),
    OPEN_KNOWLEDGE_FORMAT_GENERATION_MANIFEST_FILENAME
  );
}

export function writeOpenKnowledgeFormatGenerationManifest(
  bundleDirectory: string,
  result: PrepareOpenKnowledgeFormatResult
): void {
  const manifestPath = getOpenKnowledgeFormatGenerationManifestPath(bundleDirectory);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      renames: result.renames,
      indexOutputPath: result.indexOutputPath,
      logOutputPath: result.logOutputPath,
    }, null, 2),
    'utf8'
  );
}

export function readOpenKnowledgeFormatGenerationManifest(
  bundleDirectory: string
): OpenKnowledgeFormatGenerationManifest {
  const manifestPath = getOpenKnowledgeFormatGenerationManifestPath(bundleDirectory);
  if (!fs.existsSync(manifestPath)) {
    return { renames: [], indexOutputPath: null, logOutputPath: null };
  }

  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Partial<OpenKnowledgeFormatGenerationManifest>;
  return {
    renames: Array.isArray(parsed.renames) ? parsed.renames : [],
    indexOutputPath: typeof parsed.indexOutputPath === 'string' ? parsed.indexOutputPath : null,
    logOutputPath: typeof parsed.logOutputPath === 'string' ? parsed.logOutputPath : null,
  };
}

export function removeOpenKnowledgeFormatGenerationManifest(bundleDirectory: string): void {
  const manifestPath = getOpenKnowledgeFormatGenerationManifestPath(bundleDirectory);
  if (fs.existsSync(manifestPath)) {
    fs.unlinkSync(manifestPath);
  }
}
