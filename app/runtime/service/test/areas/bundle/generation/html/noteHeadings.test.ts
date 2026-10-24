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
import { findHeading, noteHeadings, pageLinkFragment } from '../../../../../src/areas/bundle/generation/html/pageAnchors.js';

const note = [
  '# Guide {#start}',
  '',
  '## Setup ##',
  '',
  '```bash',
  '# not a heading',
  '```',
  '',
  'Notes',
  '-----',
  '',
  '## Q&A: common questions',
  '',
  '### Notes',
  '',
].join('\n');

describe('note headings', () => {
  it('lists headings with the ids the page renderer gives them', () => {
    expect(noteHeadings(note).map(h => [h.depth, h.text, h.id])).toEqual([
      [1, 'Guide', 'start'],
      [2, 'Setup', 'setup'],
      [2, 'Notes', 'notes'],
      [2, 'Q&A: common questions', 'qa-common-questions'],
      [3, 'Notes', 'notes-1'],
    ]);
  });

  it('finds a heading regardless of letter case and punctuation left out of links', () => {
    expect(findHeading(noteHeadings(note), ['qa common questions'])?.id).toBe('qa-common-questions');
  });

  it('follows a chain of headings to the right one of two with the same text', () => {
    expect(findHeading(noteHeadings(note), ['Q&A common questions', 'Notes'])?.id).toBe('notes-1');
  });

  it('gives a section from its heading to the next heading at the same level or higher', () => {
    const setup = findHeading(noteHeadings(note), ['Setup'])!;
    expect(note.slice(setup.section!.start, setup.section!.end).trim()).toBe('## Setup ##\n\n```bash\n# not a heading\n```');
  });

  it('builds a link fragment from the target note when it is known', () => {
    expect(pageLinkFragment('Q&A common questions#Notes', note)).toBe('#notes-1');
    expect(pageLinkFragment('Missing Heading', note)).toBe('#missing-heading');
    expect(pageLinkFragment('^a-block', note)).toBe('#^a-block');
  });
});
