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
import { findCodeRanges } from '../../../../../src/areas/bundle/generation/html/markdownCode.js';

/** The code found in `markdown`, as the exact text of each range. */
function codeIn(markdown: string): string[] {
  return findCodeRanges(markdown).map(range => markdown.slice(range.start, range.end));
}

describe('markdown code ranges', () => {
  it('finds a backtick fence', () => {
    expect(codeIn('before\n\n```txt\n[[link]]\n```\n\nafter')).toEqual(['```txt\n[[link]]\n```']);
  });

  it('finds a tilde fence', () => {
    expect(codeIn('~~~\n[[link]]\n~~~')).toEqual(['~~~\n[[link]]\n~~~']);
  });

  it('keeps a shorter fence inside a longer one as code', () => {
    expect(codeIn('````md\n```\n[[link]]\n```\n````')).toEqual(['````md\n```\n[[link]]\n```\n````']);
  });

  it('runs an unclosed fence to the end of the document', () => {
    expect(codeIn('```\n[[link]]\nmore')).toEqual(['```\n[[link]]\nmore']);
  });

  it('does not treat a backtick line with a backtick in its info string as a fence', () => {
    expect(codeIn('``` a ` b')).toEqual([]);
  });

  it('finds an indented code block after a blank line, including its inner blank lines', () => {
    expect(codeIn('para\n\n    one\n\n    two\n\nafter')).toEqual(['    one\n\n    two']);
  });

  it('treats an indented line that continues a paragraph as text', () => {
    expect(codeIn('para\n    still the paragraph')).toEqual([]);
  });

  it('treats indented lines under a list item or footnote as their continuation', () => {
    expect(codeIn('- item\n\n    more of the item')).toEqual([]);
    expect(codeIn('[^1]: note\n\n    more of the note')).toEqual([]);
  });

  it('finds inline code with single and double backticks', () => {
    expect(codeIn('a `[[x]]` b ``c ` d`` e')).toEqual(['`[[x]]`', '``c ` d``']);
  });

  it('leaves lone backticks in separate paragraphs as text', () => {
    expect(codeIn('press ` here\n\n[[link]]\n\nand ` there')).toEqual([]);
  });

  it('does not let inline code span two headings or list items', () => {
    expect(codeIn('# one `\n# two `')).toEqual([]);
    expect(codeIn('- one `\n- two `')).toEqual([]);
  });

  it('keeps an escaped wikilink, embed or tag verbatim', () => {
    expect(codeIn('\\[[Note]] and !\\[[Image.png]] and \\#tag')).toEqual(['\\[[Note]]', '\\[[Image.png]]', '\\#']);
  });

  it('does not treat a wikilink after an escaped backslash as escaped', () => {
    expect(codeIn('\\\\[[Note]]')).toEqual([]);
  });

  it('does not open inline code at an escaped backtick', () => {
    expect(codeIn('\\`not code\\` but `code`')).toEqual(['`code`']);
  });
});
