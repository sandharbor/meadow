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
import { findCodeRanges, type CodeScanOptions } from '../../../../../src/areas/bundle/generation/html/markdownCode.js';

/** The code found in `markdown`, as the exact text of each range. */
function codeIn(markdown: string, options: CodeScanOptions = {}): string[] {
  return findCodeRanges(markdown, options).map(range => markdown.slice(range.start, range.end));
}

/** The code and HTML blocks found in `markdown`, as passes that render Markdown syntax see them. */
function keptByRendering(markdown: string): string[] {
  return codeIn(markdown, { htmlBlocks: true });
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

  it('keeps an HTML block through the next blank line, where Markdown is not rendered', () => {
    expect(keptByRendering('para\n<div>\n[[link]]\n</div>\n\n[[after]]')).toEqual(['<div>\n[[link]]\n</div>']);
  });

  it('keeps a pre, script, style or textarea block through its closing tag, blank lines included', () => {
    expect(keptByRendering('<pre>\n[[link]]\n\n#tag\n</pre>\nafter')).toEqual(['<pre>\n[[link]]\n\n#tag\n</pre>']);
  });

  it('keeps an HTML comment block through its end', () => {
    expect(keptByRendering('<!-- [[link]]\n\nstill a comment -->\nafter')).toEqual(['<!-- [[link]]\n\nstill a comment -->']);
  });

  it('starts an HTML block at a line with only an inline tag, but not within a paragraph', () => {
    expect(keptByRendering('<span>\n[[link]]')).toEqual(['<span>\n[[link]]']);
    expect(keptByRendering('para\n<span>\n[[link]]')).toEqual([]);
  });

  it('reads HTML blocks for every other pass', () => {
    expect(codeIn('<div>\n[[link]]\n</div>')).toEqual([]);
  });

  it('treats a tag with text after it on the line as inline HTML in a paragraph', () => {
    expect(keptByRendering('<span>[[link]]</span> text')).toEqual([]);
  });
});
