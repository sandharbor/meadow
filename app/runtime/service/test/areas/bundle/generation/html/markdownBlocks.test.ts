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
import { splitMarkdownBlocks } from '../../../../../src/areas/bundle/generation/html/markdown.js';

/** The text of each block, as block anchors and backlink contexts see them. */
function blocksOf(markdown: string): string[] {
  return splitMarkdownBlocks(markdown).map(block => block.content);
}

describe('markdown blocks', () => {
  it('starts a heading block only at a heading, with a space after its #s', () => {
    expect(blocksOf('# Title\npara')).toEqual(['# Title', 'para']);
    expect(blocksOf('a line\n#tag on the next line')).toEqual(['a line\n#tag on the next line']);
  });

  it('keeps an HTML block whole, including lines that start with #', () => {
    expect(blocksOf('<div>\n#tag\n# not a heading here\n</div>')).toEqual(['<div>\n#tag\n# not a heading here\n</div>']);
  });

  it('keeps an HTML comment right after a paragraph line with that paragraph', () => {
    expect(blocksOf('Question?::Answer.\n<!--SR:!2026-03-10,3,250-->')).toEqual(['Question?::Answer.\n<!--SR:!2026-03-10,3,250-->']);
  });
});
