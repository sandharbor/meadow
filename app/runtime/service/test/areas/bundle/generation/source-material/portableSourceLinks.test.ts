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
  reliesOnObsidianLookup,
  rewriteObsidianLookupLinks,
} from '../../../../../src/areas/bundle/generation/source-material/portableSourceLinks.js';

const resolved = (target: string) => ({ link_resolved_target_directory: '', link_resolved_target_path: target });

describe('Markdown links that rely on Obsidian\'s lookup', () => {
  it('are those whose file is not at the path written, read from the linking file', () => {
    expect(reliesOnObsidianLookup('Far.md', 'nested/A.md', '/other/Far.md')).toBe(true);
    expect(reliesOnObsidianLookup('Both.md', 'nested/A.md', '/Both.md')).toBe(true);
    expect(reliesOnObsidianLookup('my%20note.md#Heading', 'A.md', '/notes/my note.md')).toBe(true);
    expect(reliesOnObsidianLookup('sub/Deep.md', 'nested/A.md', '/nested/sub/Deep.md')).toBe(false);
    expect(reliesOnObsidianLookup('./Far.md', 'nested/A.md', '/other/Far.md')).toBe(false);
    expect(reliesOnObsidianLookup('/Far.md', 'nested/A.md', '/Far.md')).toBe(false);
  });

  it('are rewritten to the file\'s path, keeping the anchor, and every other link is left as written', () => {
    const content = '[a](Far.md#Heading) [b](sub/Deep.md) [c](https://example.com/Far.md) [d](Missing.md)';
    const resolutions = {
      'Far.md#Heading': resolved('/other/Far.md'),
      'sub/Deep.md': resolved('/nested/sub/Deep.md'),
      'Missing.md': { link_resolved_target_directory: '', link_resolved_target_path: null },
    };
    expect(rewriteObsidianLookupLinks(content, 'nested/A.md', 'nested/A.md', resolutions))
      .toBe('[a](../other/Far.md#Heading) [b](sub/Deep.md) [c](https://example.com/Far.md) [d](Missing.md)');
    expect(rewriteObsidianLookupLinks(content, 'nested/A.md', 'nested/A.md', resolutions, source => source, true))
      .toBe('[a](/other/Far.md#Heading) [b](sub/Deep.md) [c](https://example.com/Far.md) [d](Missing.md)');
  });
});
