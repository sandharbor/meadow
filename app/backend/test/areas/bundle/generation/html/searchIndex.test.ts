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

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  collectPublishedBundleSearchDocuments,
  searchDocumentFromHtml,
  searchShardId,
  writePublishedBundleSearchIndex,
} from '../../../../../src/areas/bundle/generation/html/searchIndex.js';

describe('published bundle search index', () => {
  const tempDirectories: string[] = [];

  const makeTempDirectory = () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-search-index-'));
    tempDirectories.push(directory);
    return directory;
  };

  const pageHtml = (title: string, body: string) => `<!doctype html>
    <html><head><title>${title}</title></head><body>
      <header>Navigation text is not searchable</header>
      <main><h1>${title}</h1><p>${body}</p></main>
      <footer>Backlink text is not searchable</footer>
    </body></html>`;

  afterEach(() => {
    for (const directory of tempDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('indexes the final visible title and main content separately', () => {
    expect(searchDocumentFromHtml(
      pageHtml('Hook-normalized title', 'A searchable phrase &amp; more.'),
      'nested/Hook-normalized title.html'
    )).toEqual({
      t: 'Hook-normalized title',
      p: 'nested/Hook-normalized%20title.html',
      b: 'A searchable phrase & more.',
    });
  });

  it('does not include nested heading enhancements in the page title', () => {
    const duplicateTitleHtml = `<!doctype html><html><head>
      <title>company brain -- concepts</title></head><body><main>
      <h1>company brain -- concepts<div class="semantic-title-popup">company brain -- concepts</div></h1>
      <p>Company concepts body.</p></main></body></html>`;
    const scrubbedLinkHtml = `<!doctype html><html><head>
      <title>distill learnings into general rules</title></head><body><main>
      <h1>distill learnings into general rules<div class="semantic-title-popup">link not tracked into general concepts</div></h1>
      <p>General rules body.</p></main></body></html>`;

    expect([
      searchDocumentFromHtml(duplicateTitleHtml, 'company brain -- concepts.html')?.t,
      searchDocumentFromHtml(scrubbedLinkHtml, 'distill learnings into general rules.html')?.t,
    ]).toEqual([
      'company brain -- concepts',
      'distill learnings into general rules',
    ]);
  });

  it('ignores HTML outside rendered page content and generated assets', () => {
    const bundleDirectory = makeTempDirectory();
    fs.mkdirSync(path.join(bundleDirectory, 'nested'), { recursive: true });
    fs.mkdirSync(path.join(bundleDirectory, '_mw_assets'), { recursive: true });
    fs.writeFileSync(path.join(bundleDirectory, 'Page one.html'), pageHtml('Page one', 'first body'));
    fs.writeFileSync(path.join(bundleDirectory, 'nested', 'Page two.html'), pageHtml('Page two', 'second body'));
    fs.writeFileSync(path.join(bundleDirectory, '_mw_assets', 'ignored.html'), pageHtml('Ignored', 'asset body'));

    const documents = collectPublishedBundleSearchDocuments(bundleDirectory);
    expect(documents).toHaveLength(2);
    expect(documents).toEqual(expect.arrayContaining([
      { t: 'Page one', p: 'Page%20one.html', b: 'first body' },
      { t: 'Page two', p: 'nested/Page%20two.html', b: 'second body' },
    ]));
  });

  it('changes only the stable page shard when page content changes', () => {
    const bundleDirectory = makeTempDirectory();
    const assetsDirectory = path.join(bundleDirectory, '_mw_assets');
    fs.mkdirSync(assetsDirectory, { recursive: true });
    fs.writeFileSync(path.join(bundleDirectory, 'Page one.html'), pageHtml('Page one', 'first body'));
    fs.writeFileSync(path.join(bundleDirectory, 'Page two.html'), pageHtml('Page two', 'second body'));

    writePublishedBundleSearchIndex(bundleDirectory, assetsDirectory);
    const indexDirectory = path.join(assetsDirectory, 'cust', 'search', 'index');
    const before = new Map(
      fs.readdirSync(indexDirectory).map(filename => [
        filename,
        fs.readFileSync(path.join(indexDirectory, filename), 'utf8'),
      ])
    );

    fs.writeFileSync(path.join(bundleDirectory, 'Page one.html'), pageHtml('Page one', 'changed first body'));
    writePublishedBundleSearchIndex(bundleDirectory, assetsDirectory);
    const after = new Map(
      fs.readdirSync(indexDirectory).map(filename => [
        filename,
        fs.readFileSync(path.join(indexDirectory, filename), 'utf8'),
      ])
    );

    const changedFiles = [...after.keys()].filter(filename => after.get(filename) !== before.get(filename));
    expect(changedFiles).toEqual([`shard-${searchShardId('Page%20one.html')}.js`]);
    expect(after.get('manifest.js')).toBe(before.get('manifest.js'));
  });
});
