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
import type { BundleNodeConfig } from '../../../../../../shared_code/types/bundleNodeConfig.js';
import { BundleConfigPaths } from '../../../../../../shared_code/paths/bundleConfigPaths.js';
import { replaceOutsideCode } from '../html/markdown.js';
import {
  HTML_LINK_NOT_TRACKED_REPLACEMENT,
  prepareScrubbedSourceDirectory,
  sanitizeMarkdownLinks
} from '../source-material/sourceScrubbing.js';

export { sanitizeMarkdownLinks };

const GENERATED_TAG_WIKILINK_RE = /\[\[tag--[^\]|]+?\|#([A-Za-z0-9][A-Za-z0-9_/-]*)\]\]/g;
const MARKDOWN_LINK_NOT_TRACKED_REPLACEMENT = '_link not tracked_';

function walkFilesRecursively(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFilesRecursively(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

export function restoreGeneratedTagWikilinks(markdown: string): string {
  return replaceOutsideCode(
    markdown,
    GENERATED_TAG_WIKILINK_RE,
    (_match: string, tagBody: string) => `#${tagBody}`
  );
}

export function restoreMarkdownLinkNotTrackedMarkers(markdown: string): string {
  return markdown.split(HTML_LINK_NOT_TRACKED_REPLACEMENT).join(MARKDOWN_LINK_NOT_TRACKED_REPLACEMENT);
}

/**
 * Builds the Obsidian-compatible download/export directory from the already
 * scrubbed source boundary. Generated tag pages are omitted because they are
 * HTML-navigation artifacts, and generated tag wikilinks are restored to
 * normal Obsidian `#tag` text for local use.
 */
export function prepareSourcesExportFromScrubbedSourceDirectory(
  scrubbedContentDir: string,
  exportDir: string
): void {
  if (fs.existsSync(exportDir)) {
    fs.rmSync(exportDir, { recursive: true, force: true });
  }
  fs.mkdirSync(exportDir, { recursive: true });

  for (const filePath of walkFilesRecursively(scrubbedContentDir)) {
    const relativePath = path.relative(scrubbedContentDir, filePath);
    const topDir = relativePath.split(path.sep)[0];
    if (topDir === BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR) {
      continue;
    }

    const outputPath = path.join(exportDir, relativePath);
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (filePath.endsWith('.md')) {
      const content = fs.readFileSync(filePath, 'utf-8');
      fs.writeFileSync(
        outputPath,
        restoreMarkdownLinkNotTrackedMarkers(restoreGeneratedTagWikilinks(content)),
        'utf-8'
      );
    } else {
      fs.copyFileSync(filePath, outputPath);
    }
  }
}

/**
 * Backward-compatible wrapper for the sources export build. The sources export
 * uses the same scrubbed source stage as generated bundle files.
 */
export function prepareSourcesExportDirectory(
  trackedContentDir: string,
  _sourceContentDir: string | undefined,
  exportDir: string,
  traversablePageKeys: Set<string>,
  bundleNodeConfs: Record<string, BundleNodeConfig>,
  bundleNodeConfigsForLinks: BundleNodeConfig[]
): void {
  const scrubbedTempDir = `${exportDir}.scrubbed_tmp`;
  prepareScrubbedSourceDirectory(
    trackedContentDir,
    scrubbedTempDir,
    traversablePageKeys,
    bundleNodeConfs,
    bundleNodeConfigsForLinks
  );
  prepareSourcesExportFromScrubbedSourceDirectory(scrubbedTempDir, exportDir);
  fs.rmSync(scrubbedTempDir, { recursive: true, force: true });
}
