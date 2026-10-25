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
import { createNoteRenderer } from '../../../../../src/areas/bundle/generation/html/htmlGenerator.js';

const note = 'A paragraph.\n\n## A heading\n\n- one\n\n- two\n  continued\n\n| a | b |\n| - | - |\n| c | d |\n\n```\ncode\n```\n\nThe end.\n';

function render(markdown: string): string {
  const renderer = createNoteRenderer({
    noteMarkdown: markdown,
    pageNameToPage: {},
    bundleConfig: {} as Parameters<typeof createNoteRenderer>[0]['bundleConfig'],
    bundleNodeConfigs: [],
    directory: '/nonexistent',
    outputFolder: '/nonexistent',
    currentOutputDirectory: '',
    processingMode: 'each-page',
    skipUninterestingLeafPages: false,
  });
  return renderer.renderBody(markdown, true);
}

const anchor = (id: string) => `<a id="block-${id}" class="block-anchor"></a>`;

describe('block anchors', () => {
  it('keep the ids each block has always had, which backlink contexts link to', () => {
    expect([...render(note).matchAll(/id="block-([^"]+)"/g)].map(match => match[1]))
      .toEqual(['1ed0c3e', '1713409', 'e872f30', '65b1198', 'ae6bbb0', 'dd28278', 'b610e2d']);
  });

  it('end a paragraph, and follow a heading, a table, or a code block', () => {
    const html = render(note);
    expect(html).toContain(`<p>A paragraph.\n${anchor('1ed0c3e')}</p>`);
    expect(html).toContain(`</h2>\n<p>${anchor('1713409')}</p>`);
    expect(html).toContain(`</table>\n<p>${anchor('ae6bbb0')}</p>`);
    expect(html).toContain(`</code></pre><p>${anchor('dd28278')}</p>`);
  });

  it('leave a loose list one list, with each item\'s anchor at the end of that item', () => {
    const html = render(note);
    expect(html.match(/<ul>/g)).toHaveLength(1);
    expect(html).toContain(`<li><p>one\n${anchor('e872f30')}</p>`);
    expect(html).toContain(`<li><p>two\ncontinued\n${anchor('65b1198')}</p>`);
  });

  it('add no row to a table', () => {
    expect(render(note).match(/<tr>/g)).toHaveLength(2);
  });
});
