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

import { describe, expect, it } from 'vitest';
import { parseCardElement, parseCardMarkup } from '../parseCardMarkup';

const context = {
  siteGuid: 'site1234',
  pageId: 'docs/example.html',
  sourceId: 'source-1',
};

describe('parseCardElement', () => {
  it('parses meadow-srs-card basic cards', () => {
    document.body.innerHTML = `
      <meadow-srs-card guid="123e4567f9012" kind="basic">
        <meadow-srs-prompt>Capital of France</meadow-srs-prompt>
        <meadow-srs-answer>Paris</meadow-srs-answer>
      </meadow-srs-card>
    `;

    const card = document.querySelector('meadow-srs-card');
    expect(card).not.toBeNull();

    const cards = parseCardElement(context, card!);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('123e4567f9012');
    expect(cards[0].promptHtml).toBe('Capital of France');
    expect(cards[0].answerHtml).toBe('Paris');
  });

  it('preserves rendered link HTML in prompt and answer', () => {
    document.body.innerHTML = `
      <meadow-srs-card guid="923e4567f9015" kind="basic">
        <meadow-srs-prompt>What color is <a href="some/path/to/the-sky.html">the sky</a>?</meadow-srs-prompt>
        <meadow-srs-answer><strong>Blue</strong></meadow-srs-answer>
      </meadow-srs-card>
    `;

    const card = document.querySelector('meadow-srs-card');
    const cards = parseCardElement(context, card!);
    expect(cards[0].promptHtml).toContain('<a href="some/path/to/the-sky.html">the sky</a>');
    expect(cards[0].answerHtml).toBe('<strong>Blue</strong>');
    expect(cards[0].searchText).toBe('What color is the sky ?');
  });

  it('parses bidirectional cards into forward and reverse definitions', () => {
    document.body.innerHTML = `
      <meadow-srs-card guid="bidi-1" kind="bidirectional">
        <meadow-srs-prompt>Prompt</meadow-srs-prompt>
        <meadow-srs-answer>Answer</meadow-srs-answer>
      </meadow-srs-card>
    `;

    const card = document.querySelector('meadow-srs-card');
    const cards = parseCardElement(context, card!);

    expect(cards).toHaveLength(2);
    expect(cards[0].id).toBe('bidi-1:forward');
    expect(cards[0].direction).toBe('forward');
    expect(cards[0].siblingGroupKey).toBe('bidi-1');
    expect(cards[1].id).toBe('bidi-1:reverse');
    expect(cards[1].direction).toBe('reverse');
    expect(cards[1].promptHtml).toBe('Answer');
    expect(cards[1].answerHtml).toBe('Prompt');
  });

  it('parses multiline and cloze cards', () => {
    document.body.innerHTML = `
      <meadow-srs-card guid="multi-1" kind="multiline-bidirectional">
        <meadow-srs-prompt><p>Prompt</p><p>Again</p></meadow-srs-prompt>
        <meadow-srs-answer><p>Answer</p><p>Again</p></meadow-srs-answer>
      </meadow-srs-card>
      <meadow-srs-card guid="cloze-1" kind="cloze" sibling-group="cloze-parent">
        <meadow-srs-prompt>What color is <span class="meadow-srs-cloze-blank">...</span>?</meadow-srs-prompt>
        <meadow-srs-answer>What color is the sky?</meadow-srs-answer>
      </meadow-srs-card>
    `;

    const cards = Array.from(document.querySelectorAll('meadow-srs-card')).flatMap((card) => parseCardElement(context, card));
    expect(cards).toHaveLength(3);
    expect(cards[0].format).toBe('multiline-bidirectional');
    expect(cards[1].direction).toBe('reverse');
    expect(cards[2].format).toBe('cloze');
    expect(cards[2].direction).toBe('cloze');
    expect(cards[2].siblingGroupKey).toBe('cloze-parent');
  });

  it('ignores cards with missing fields', () => {
    document.body.innerHTML = `
      <meadow-srs-card guid="" kind="basic">
        <meadow-srs-prompt>Prompt</meadow-srs-prompt>
      </meadow-srs-card>
    `;

    const cards = Array.from(document.querySelectorAll('meadow-srs-card')).flatMap((card) => parseCardElement(context, card));
    expect(cards).toEqual([]);
  });
});

describe('parseCardMarkup', () => {
  it('parses meadow-srs-card markup strings', () => {
    const cards = parseCardMarkup(context, `
      <meadow-srs-card guid="123e4567f9012" kind="basic">
        <meadow-srs-prompt>Prompt</meadow-srs-prompt>
        <meadow-srs-answer>Answer</meadow-srs-answer>
      </meadow-srs-card>
    `);

    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('123e4567f9012');
  });
});
