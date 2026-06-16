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
import { SiteConfigPaths } from '../../../../../../shared_code/paths/siteConfigPaths.js';
import type {
  OpenKnowledgeFormatRename,
  PrepareOpenKnowledgeFormatResult
} from './openKnowledgeFormat.js';

export const OPEN_KNOWLEDGE_FORMAT_GENERATION_MANIFEST_FILENAME = 'okf-generation-manifest.json';

export interface OpenKnowledgeFormatGenerationManifest {
  renames: OpenKnowledgeFormatRename[];
  logOutputPath: string | null;
}

export function getOpenKnowledgeFormatGenerationManifestPath(siteDirectory: string): string {
  return path.join(
    SiteConfigPaths.getBuildDir(siteDirectory),
    OPEN_KNOWLEDGE_FORMAT_GENERATION_MANIFEST_FILENAME
  );
}

export function writeOpenKnowledgeFormatGenerationManifest(
  siteDirectory: string,
  result: PrepareOpenKnowledgeFormatResult
): void {
  const manifestPath = getOpenKnowledgeFormatGenerationManifestPath(siteDirectory);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      renames: result.renames,
      logOutputPath: result.logOutputPath,
    }, null, 2),
    'utf8'
  );
}

export function readOpenKnowledgeFormatGenerationManifest(
  siteDirectory: string
): OpenKnowledgeFormatGenerationManifest {
  const manifestPath = getOpenKnowledgeFormatGenerationManifestPath(siteDirectory);
  if (!fs.existsSync(manifestPath)) {
    return { renames: [], logOutputPath: null };
  }

  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Partial<OpenKnowledgeFormatGenerationManifest>;
  return {
    renames: Array.isArray(parsed.renames) ? parsed.renames : [],
    logOutputPath: typeof parsed.logOutputPath === 'string' ? parsed.logOutputPath : null,
  };
}

export function removeOpenKnowledgeFormatGenerationManifest(siteDirectory: string): void {
  const manifestPath = getOpenKnowledgeFormatGenerationManifestPath(siteDirectory);
  if (fs.existsSync(manifestPath)) {
    fs.unlinkSync(manifestPath);
  }
}
