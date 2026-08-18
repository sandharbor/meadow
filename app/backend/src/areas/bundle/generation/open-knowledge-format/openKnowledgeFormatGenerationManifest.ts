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
import {
  isPlainObject,
  jsonDocumentCodec,
  readDurableDocument,
  requireValidDocument,
  writeDurableDocument,
} from '../../../../../../shared_code/utils/durableDocument.js';

export const OPEN_KNOWLEDGE_FORMAT_GENERATION_MANIFEST_FILENAME = 'okf-generation-manifest.json';

export interface OpenKnowledgeFormatGenerationManifest {
  renames: OpenKnowledgeFormatRename[];
  indexOutputPath: string | null;
  logOutputPath: string | null;
}

const manifestCodec = jsonDocumentCodec<OpenKnowledgeFormatGenerationManifest>(value => {
  if (!isPlainObject(value)) return { valid: false, diagnostic: '$ must be an object' };
  const keys = Object.keys(value).sort().join(',');
  if (keys !== 'indexOutputPath,logOutputPath,renames') {
    return { valid: false, diagnostic: '$ must contain only indexOutputPath, logOutputPath, and renames' };
  }
  if (!Array.isArray(value.renames)) return { valid: false, diagnostic: '$.renames must be an array' };
  const renames: OpenKnowledgeFormatRename[] = [];
  for (const [index, rename] of value.renames.entries()) {
    if (!isPlainObject(rename)) return { valid: false, diagnostic: `$.renames[${index}] must be an object` };
    if (Object.keys(rename).sort().join(',') !== 'finalOutputPath,originalOutputPath,reason,sourcePath') {
      return { valid: false, diagnostic: `$.renames[${index}] contains unsupported fields` };
    }
    for (const field of ['sourcePath', 'originalOutputPath', 'finalOutputPath'] as const) {
      if (typeof rename[field] !== 'string') {
        return { valid: false, diagnostic: `$.renames[${index}].${field} must be a string` };
      }
    }
    if (rename.reason !== 'reserved-filename') {
      return { valid: false, diagnostic: `$.renames[${index}].reason must be reserved-filename` };
    }
    renames.push(rename as unknown as OpenKnowledgeFormatRename);
  }
  for (const field of ['indexOutputPath', 'logOutputPath'] as const) {
    if (value[field] !== null && typeof value[field] !== 'string') {
      return { valid: false, diagnostic: `$.${field} must be a string or null` };
    }
  }
  return {
    valid: true,
    value: {
      renames,
      indexOutputPath: value.indexOutputPath as string | null,
      logOutputPath: value.logOutputPath as string | null,
    },
  };
});

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
  writeDurableDocument({
    path: manifestPath,
    value: {
      renames: result.renames,
      indexOutputPath: result.indexOutputPath,
      logOutputPath: result.logOutputPath,
    },
    codec: manifestCodec,
  });
}

export function readOpenKnowledgeFormatGenerationManifest(
  bundleDirectory: string
): OpenKnowledgeFormatGenerationManifest {
  const manifestPath = getOpenKnowledgeFormatGenerationManifestPath(bundleDirectory);
  return requireValidDocument(
    readDurableDocument(manifestPath, manifestCodec),
    () => ({ renames: [], indexOutputPath: null, logOutputPath: null }),
  );
}

export function removeOpenKnowledgeFormatGenerationManifest(bundleDirectory: string): void {
  const manifestPath = getOpenKnowledgeFormatGenerationManifestPath(bundleDirectory);
  const current = readDurableDocument(manifestPath, manifestCodec);
  if (current.status === 'missing') return;
  requireValidDocument(current, () => ({ renames: [], indexOutputPath: null, logOutputPath: null }));
  fs.unlinkSync(manifestPath);
}
