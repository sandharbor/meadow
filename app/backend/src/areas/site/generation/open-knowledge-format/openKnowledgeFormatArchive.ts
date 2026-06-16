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

import path from 'path';
import {
  createContentAddressedZip,
  writeDownloadManifest
} from '../../../../shared/utils/zipUtils.js';

export const OPEN_KNOWLEDGE_FORMAT_ASSETS_DIR = 'okf';
export const OPEN_KNOWLEDGE_FORMAT_BUNDLE_DIR = 'bundle';
export const OPEN_KNOWLEDGE_FORMAT_MANIFEST_FILENAME = 'okf-download-manifest.json';

interface CreateOpenKnowledgeFormatZipOptions {
  archiveRootDirectory?: string;
}

interface WriteOpenKnowledgeFormatManifestOptions {
  downloadFilename?: string;
}

export function getOpenKnowledgeFormatDownloadFilename(siteSlug: string): string {
  return `${siteSlug}-okf.zip`;
}

export async function createOpenKnowledgeFormatZip(
  openKnowledgeFormatDir: string,
  outputDir: string,
  options: CreateOpenKnowledgeFormatZipOptions = {}
): Promise<string | null> {
  return createContentAddressedZip(openKnowledgeFormatDir, outputDir, {
    archiveRootDirectory: options.archiveRootDirectory,
    filenamePrefix: 'okf',
  });
}

export function writeOpenKnowledgeFormatManifest(
  outputDir: string,
  zipFilename: string | null,
  options: WriteOpenKnowledgeFormatManifestOptions = {}
): void {
  writeDownloadManifest(
    path.join(outputDir, OPEN_KNOWLEDGE_FORMAT_MANIFEST_FILENAME),
    zipFilename,
    options
  );
}
