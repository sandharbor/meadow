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

import { describe, it, expect } from 'vitest';
import {
  markdownLinkStems,
  referenceDefinitions,
} from '../../../../../src/areas/bundle/generation/html/markedLinks.js';

describe('markdown link stems', () => {
  it('finds an inline link, decoding its percent-encoding and dropping its anchor', () => {
    expect(markdownLinkStems('[x](./dir/my%20page.md#heading)')).toEqual(['my page']);
  });

  it('finds a link with a title or with its destination in angle brackets', () => {
    expect(markdownLinkStems('[x](titled.md "A title")\n\n[y](<my page.md>)')).toEqual(['titled', 'my page']);
  });

  it('finds a reference-style link using a definition from elsewhere on the page', () => {
    const page = 'Intro.\n\n[x][the page]\n\n[the page]: ./target.md\n';
    expect(markdownLinkStems('[x][the page]', referenceDefinitions(page))).toEqual(['target']);
  });

  it('finds an Obsidian-style destination with unescaped spaces', () => {
    expect(markdownLinkStems('[x](./dir/my page.md)')).toEqual(['my page']);
  });

  it('skips external links, anchor-only links and links inside code', () => {
    expect(markdownLinkStems('[a](https://example.com/a.md) [b](#heading) `[c](c.md)`')).toEqual([]);
  });
});
