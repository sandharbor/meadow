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
import { Parser } from 'htmlparser2';
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

const UNSEARCHABLE_TAGS = new Set(['script', 'style', 'template', 'noscript']);

function isUnsearchable(name: string, attributes: Record<string, string>): boolean {
  return UNSEARCHABLE_TAGS.has(name) || (attributes.class?.split(/\s+/).includes('meadow-media-toolbar') ?? false);
}

/**
 * The page's search document, read in one pass over its parse: the document
 * title (the first `<title>` in `<head>`), and the text of the first `<main>`
 * without its first `<h1>` (the page title, whose text is the fallback title)
 * or any script, style, template, noscript or media toolbar. The tree is the
 * one a DOM built from the same parser would have.
 */
export function searchDocumentFromHtml(
  html: string,
  relativeHtmlPath: string
): PublishedBundleSearchDocument | null {
  // One entry for each open element: whether it starts the region it names.
  type Open = { head: boolean; title: boolean; main: boolean; h1: boolean; excluded: boolean };
  const open: Open[] = [];
  let headSeen = false;
  let inHead = false;
  let titleState: 'before' | 'in' | 'done' = 'before';
  let mainState: 'before' | 'in' | 'done' = 'before';
  let h1State: 'before' | 'in' | 'done' = 'before';
  let excludedDepth = 0;
  const titleText: string[] = [];
  const headingText: string[] = [];
  const bodyText: string[] = [];

  const parser = new Parser({
    onopentag(name, attributes) {
      const entry: Open = { head: false, title: false, main: false, h1: false, excluded: false };
      if (open.length === 1 && !headSeen) {
        // The document's head is its root element's first element child.
        headSeen = true;
        entry.head = name === 'head';
        inHead = entry.head;
      }
      if (inHead && titleState === 'before' && name === 'title') {
        titleState = 'in';
        entry.title = true;
      }
      if (mainState === 'before' && name === 'main') {
        mainState = 'in';
        entry.main = true;
      } else if (mainState === 'in') {
        if (h1State === 'before' && name === 'h1') {
          h1State = 'in';
          entry.h1 = true;
        }
        if (entry.h1 || isUnsearchable(name, attributes)) {
          entry.excluded = true;
          excludedDepth += 1;
        }
      }
      open.push(entry);
    },
    ontext(text) {
      if (titleState === 'in') titleText.push(text);
      if (mainState !== 'in') return;
      if (h1State === 'in') headingText.push(text);
      if (excludedDepth === 0) bodyText.push(text);
    },
    onclosetag() {
      const entry = open.pop();
      if (!entry) return;
      if (entry.head) inHead = false;
      if (entry.title) titleState = 'done';
      if (entry.main) mainState = 'done';
      if (entry.h1) h1State = 'done';
      if (entry.excluded) excludedDepth -= 1;
    },
  }, { lowerCaseAttributeNames: false, decodeEntities: true, xmlMode: false });
  parser.write(html);
  parser.end();

  if (mainState === 'before') return null;
  const title = normalizeVisibleText(titleText.join(''))
    || normalizeVisibleText(headingText.join(''));
  if (!title) return null;

  return {
    t: title,
    p: encodePathForUrl(relativeHtmlPath.split(path.sep).join('/')),
    b: normalizeVisibleText(bodyText.join('')),
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
