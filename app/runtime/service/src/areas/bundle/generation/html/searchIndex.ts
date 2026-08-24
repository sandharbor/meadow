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

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { parseHTML } from 'linkedom';
import { encodePathForUrl } from '../../../../../../../shared_code/utils/urlUtils.js';
import { CUSTOMIZATION_ASSETS_DIRECTORY } from '../customizationAssets.js';

export const SEARCH_ASSETS_DIRECTORY = 'search';
export const SEARCH_INDEX_DIRECTORY = 'index';
export const SEARCH_SHARD_COUNT = 256;

export interface PublishedBundleSearchDocument {
  /** Normalized title shown on the generated page. */
  t: string;
  /** URL-encoded path relative to the generated-bundle root. */
  p: string;
  /** Visible main-content text, excluding the page-title heading. */
  b: string;
}

function walkHtmlFiles(rootDirectory: string): string[] {
  if (!fs.existsSync(rootDirectory)) return [];

  const files: string[] = [];
  const pending = [rootDirectory];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (filePath !== path.join(rootDirectory, '_mw_assets')) {
          pending.push(filePath);
        }
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
        files.push(filePath);
      }
    }
  }

  return files.sort();
}

function normalizeVisibleText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function searchDocumentFromHtml(
  html: string,
  relativeHtmlPath: string
): PublishedBundleSearchDocument | null {
  const { document } = parseHTML(html);
  const main = document.querySelector('main');
  if (!main) return null;

  const pageTitleHeading = main.querySelector('h1');
  // The document title is the normalized page name. The rendered h1 may also
  // contain interactive enhancements (for example, a semantic-title popup),
  // whose descendant text must not become part of the search-result title.
  const title = normalizeVisibleText(document.title ?? '')
    || normalizeVisibleText(pageTitleHeading?.textContent ?? '');
  if (!title) return null;

  const searchableMain = main.cloneNode(true) as typeof main;
  const clonedPageTitle = searchableMain.querySelector('h1');
  clonedPageTitle?.remove();
  searchableMain.querySelectorAll('script, style, template, noscript').forEach(element => element.remove());

  return {
    t: title,
    p: encodePathForUrl(relativeHtmlPath.split(path.sep).join('/')),
    b: normalizeVisibleText(searchableMain.textContent ?? ''),
  };
}

export function collectPublishedBundleSearchDocuments(
  generatedBundleDirectory: string
): PublishedBundleSearchDocument[] {
  return walkHtmlFiles(generatedBundleDirectory)
    .map(filePath => {
      const relativeHtmlPath = path.relative(generatedBundleDirectory, filePath);
      return searchDocumentFromHtml(fs.readFileSync(filePath, 'utf8'), relativeHtmlPath);
    })
    .filter((document): document is PublishedBundleSearchDocument => document !== null)
    .sort((left, right) => left.p.localeCompare(right.p));
}

export function searchShardId(relativeHtmlPath: string): string {
  const shardNumber = createHash('sha256').update(relativeHtmlPath).digest()[0] % SEARCH_SHARD_COUNT;
  return shardNumber.toString(16).padStart(2, '0');
}

export function copyPublishedBundleSearchAssets(
  sharedAssetsDirectory: string,
  generatedAssetsDirectory: string
): void {
  const searchAssetsDirectory = path.join(
    generatedAssetsDirectory,
    CUSTOMIZATION_ASSETS_DIRECTORY,
    SEARCH_ASSETS_DIRECTORY
  );
  fs.mkdirSync(searchAssetsDirectory, { recursive: true });

  for (const assetName of ['search.js', 'search.css']) {
    fs.copyFileSync(
      path.join(sharedAssetsDirectory, assetName),
      path.join(searchAssetsDirectory, assetName)
    );
  }
}

export function writePublishedBundleSearchIndex(
  generatedBundleDirectory: string,
  generatedAssetsDirectory: string
): { documentCount: number; shardCount: number } {
  const documents = collectPublishedBundleSearchDocuments(generatedBundleDirectory);
  const shards = new Map<string, PublishedBundleSearchDocument[]>();

  for (const document of documents) {
    const shardId = searchShardId(document.p);
    const shardDocuments = shards.get(shardId) ?? [];
    shardDocuments.push(document);
    shards.set(shardId, shardDocuments);
  }

  const indexDirectory = path.join(
    generatedAssetsDirectory,
    CUSTOMIZATION_ASSETS_DIRECTORY,
    SEARCH_ASSETS_DIRECTORY,
    SEARCH_INDEX_DIRECTORY
  );
  fs.rmSync(indexDirectory, { recursive: true, force: true });
  fs.mkdirSync(indexDirectory, { recursive: true });

  const shardIds = [...shards.keys()].sort();
  for (const shardId of shardIds) {
    const shardDocuments = shards.get(shardId)!;
    fs.writeFileSync(
      path.join(indexDirectory, `shard-${shardId}.js`),
      `window.__meadowSearchReceiveShard(${JSON.stringify(shardDocuments)});\n`,
      'utf8'
    );
  }

  fs.writeFileSync(
    path.join(indexDirectory, 'manifest.js'),
    `window.__meadowSearchReceiveManifest(${JSON.stringify({ version: 1, shards: shardIds })});\n`,
    'utf8'
  );

  return { documentCount: documents.length, shardCount: shardIds.length };
}
