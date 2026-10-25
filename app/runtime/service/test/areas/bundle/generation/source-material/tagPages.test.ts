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
import { extractObsidianTagsFromMarkdown, rewriteObsidianTagsToWikiLinks } from '../../../../../src/areas/bundle/generation/source-material/tagPages.js';

const tagPage = (body: string) => `tag ${body}`;

describe('tags in HTML blocks', () => {
  it('leaves a tag inside an HTML block as written, where Markdown is not rendered', () => {
    const markdown = '<div>\n#inside\n</div>\n\n#outside';
    expect(rewriteObsidianTagsToWikiLinks(markdown, tagPage)).toBe('<div>\n#inside\n</div>\n\n[[tag outside|#outside]]');
    expect([...extractObsidianTagsFromMarkdown(markdown).keys()]).toEqual(['outside']);
  });

  it('finds a tag in a paragraph that has inline HTML', () => {
    expect(rewriteObsidianTagsToWikiLinks('<span>x</span> #inline', tagPage)).toBe('<span>x</span> [[tag inline|#inline]]');
  });
});
