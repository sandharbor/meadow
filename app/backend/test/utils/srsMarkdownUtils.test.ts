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
import {
  ensureSrsCardGuidsInMarkdown,
  pageMatchesConfiguredSrsTags,
  removeSrsCommentsFromMarkdown,
  replaceSrsCardsWithCustomElements,
} from '../../src/utils/srsMarkdownUtils.js';

describe('srsMarkdownUtils', () => {
  it('matches configured tags from raw tags, nested tags, and rewritten tag links', () => {
    expect(pageMatchesConfiguredSrsTags('#srs\n\nPrompt::Answer\n', ['#srs'])).toBe(true);
    expect(pageMatchesConfiguredSrsTags('#flashcards/ka-quiz\n\nPrompt::Answer\n', ['#flashcards'])).toBe(true);
    expect(
      pageMatchesConfiguredSrsTags('[[tag--srs|#srs]]\n\nPrompt::Answer\n', ['#srs'])
    ).toBe(true);
    expect(pageMatchesConfiguredSrsTags('#notes\n\nPrompt::Answer\n', ['#srs'])).toBe(false);
  });

  it('inserts deterministic GUID comments after SR comments and is idempotent', () => {
    const original = [
      '#srs',
      '',
      'What color is the sky?::Blue',
      '<!--SR:!2026-03-12,3,250-->',
      '',
      'What is 2 + 2?:::4',
      '<!--SR:!2026-03-12,3,250-->',
    ].join('\n');

    const firstPass = ensureSrsCardGuidsInMarkdown(original, 'cards/example.md');
    expect(firstPass.changed).toBe(true);
    expect(firstPass.markdown).toMatch(/<!--SR:!2026-03-12,3,250-->\n\n<!--MEADOW_SR_GUID:[a-f0-9]{13}-->/);
    expect(firstPass.markdown.match(/<!--MEADOW_SR_GUID:/g)).toHaveLength(2);

    const secondPass = ensureSrsCardGuidsInMarkdown(firstPass.markdown, 'cards/example.md');
    expect(secondPass.changed).toBe(false);
    expect(secondPass.markdown).toBe(firstPass.markdown);
  });

  it('inserts GUIDs for multiline cards that use a ? separator and have blank lines before the SR comment', () => {
    const original = [
      '#srs',
      '',
      'What does [[Term -- The Town|The Town]] orchestrate?',
      '?',
      'All agents — workers, patrols, and management — across all [[Term -- Rigs|Rigs]].',
      '',
      '',
      '<!--SR:!2026-03-10,3,250-->',
    ].join('\n');

    const firstPass = ensureSrsCardGuidsInMarkdown(original, 'cards/multiline.md');
    expect(firstPass.changed).toBe(true);
    expect(firstPass.markdown).toContain('<!--MEADOW_SR_GUID:');
    expect(firstPass.markdown).toContain(
      'All agents — workers, patrols, and management — across all [[Term -- Rigs|Rigs]].\n\n\n<!--SR:!2026-03-10,3,250-->\n\n<!--MEADOW_SR_GUID:'
    );
    expect(firstPass.markdown).toContain('-->\n\n<!--MEADOW_SR_GUID:');
  });

  it('preserves blank lines after SR metadata when adding a missing GUID', () => {
    const original = [
      '#srs',
      '',
      'What color is the sky?::Blue',
      '',
      '<!--SR:!2026-03-12,3,250-->',
      '',
      'What is 2 + 2?::4',
      '<!--SR:!2026-03-13,4,250-->',
    ].join('\n');

    const firstPass = ensureSrsCardGuidsInMarkdown(original, 'cards/spacing.md');
    expect(firstPass.changed).toBe(true);
    expect(firstPass.markdown).toMatch(
      /What color is the sky\?::Blue\n\n<!--SR:!2026-03-12,3,250-->\n\n<!--MEADOW_SR_GUID:[a-f0-9]{13}-->\n\nWhat is 2 \+ 2\?::4/
    );
  });

  it('reorders existing MEADOW_SR_GUID comments to sit after SR comments', () => {
    const original = [
      'What color is the sky?::Blue',
      '<!--MEADOW_SR_GUID:123e4567f9012-->',
      '<!--SR:!2026-03-12,3,250-->',
    ].join('\n');

    const rewritten = ensureSrsCardGuidsInMarkdown(original, 'cards/reorder.md');
    expect(rewritten.changed).toBe(true);
    expect(rewritten.markdown).toBe([
      'What color is the sky?::Blue',
      '<!--SR:!2026-03-12,3,250-->',
      '',
      '<!--MEADOW_SR_GUID:123e4567f9012-->',
    ].join('\n'));
  });

  it('removes SR comments while preserving MEADOW_SR_GUID comments', () => {
    const markdown = [
      'Prompt::Answer',
      '<!--MEADOW_SR_GUID:123e4567f9012-->',
      '<!--SR:!2026-03-12,3,250-->',
      '',
      '```md',
      '<!--SR:keep-inside-code-->',
      '```',
    ].join('\n');

    const stripped = removeSrsCommentsFromMarkdown(markdown);
    expect(stripped).toContain('<!--MEADOW_SR_GUID:123e4567f9012-->');
    expect(stripped).not.toContain('<!--SR:!2026-03-12,3,250-->');
    expect(stripped).toContain('<!--SR:keep-inside-code-->');
  });

  it('converts GUID-backed cards into custom HTML elements', () => {
    const markdown = [
      'What color is [[the sky]]?::Blue',
      '',
      '<!--MEADOW_SR_GUID:123e4567f9012-->',
      '',
      'What is 2 + 2?:::4',
      '',
      '<!--MEADOW_SR_GUID:223e4567f9012-->',
    ].join('\n');

    const converted = replaceSrsCardsWithCustomElements(markdown, (fragment: string) => {
      if (fragment === 'What color is [[the sky]]?') {
        return 'What color is <a href="the%20sky.html">the sky</a>?';
      }
      return fragment;
    });

    expect(converted).toContain('<meadow-srs-card guid="123e4567f9012" kind="basic">');
    expect(converted).toContain('<meadow-srs-prompt>What color is <a href="the%20sky.html">the sky</a>?</meadow-srs-prompt>');
    expect(converted).toContain('<meadow-srs-answer>Blue</meadow-srs-answer>');
    expect(converted).toContain('<meadow-srs-card guid="223e4567f9012" kind="bidirectional">');
  });

  it('converts multiline cards with ? separators into custom HTML elements', () => {
    const markdown = [
      'What does [[Term -- The Town|The Town]] orchestrate?',
      '?',
      'All agents across all [[Term -- Rigs|Rigs]].',
      '',
      '<!--MEADOW_SR_GUID:323e4567f9012-->',
    ].join('\n');

    const converted = replaceSrsCardsWithCustomElements(markdown, (fragment: string) => {
      if (fragment === 'What does [[Term -- The Town|The Town]] orchestrate?') {
        return 'What does <a href="term-town.html">The Town</a> orchestrate?';
      }
      if (fragment === 'All agents across all [[Term -- Rigs|Rigs]].') {
        return 'All agents across all <a href="term-rigs.html">Rigs</a>.';
      }
      return fragment;
    });

    expect(converted).toContain('<meadow-srs-card guid="323e4567f9012" kind="multiline-basic">');
    expect(converted).toContain('<meadow-srs-prompt>What does <a href="term-town.html">The Town</a> orchestrate?</meadow-srs-prompt>');
    expect(converted).toContain('<meadow-srs-answer>All agents across all <a href="term-rigs.html">Rigs</a>.</meadow-srs-answer>');
  });

  it('converts multiline bidirectional cards with explicit end delimiters into custom HTML elements', () => {
    const markdown = [
      'State the TCP handshake in order.',
      '??',
      'SYN',
      '',
      'SYN-ACK',
      '',
      'ACK',
      '+++',
      '',
      '<!--MEADOW_SR_GUID:423e4567f9012-->',
    ].join('\n');

    const converted = replaceSrsCardsWithCustomElements(markdown, (fragment: string) => fragment);

    expect(converted).toContain('<meadow-srs-card guid="423e4567f9012" kind="multiline-bidirectional">');
    expect(converted).toContain('<meadow-srs-prompt>State the TCP handshake in order.</meadow-srs-prompt>');
    expect(converted).toContain('<meadow-srs-answer>SYN\n\nSYN-ACK\n\nACK</meadow-srs-answer>');
    expect(converted).not.toContain('+++');
  });

  it('converts simplified cloze cards into one custom element per deletion', () => {
    const markdown = [
      'Brazilians speak ==Portuguese== and Argentinians speak ==Spanish==.',
      '',
      '<!--MEADOW_SR_GUID:523e4567f9012-->',
    ].join('\n');

    const converted = replaceSrsCardsWithCustomElements(markdown, (fragment: string) => fragment);

    expect(converted).toContain('guid="523e4567f9012:cloze:1" kind="cloze" cloze-type="simplified" sibling-group="523e4567f9012"');
    expect(converted).toContain('guid="523e4567f9012:cloze:2" kind="cloze" cloze-type="simplified" sibling-group="523e4567f9012"');
    expect(converted).toContain('Brazilians speak <span class="meadow-srs-cloze-blank">...</span> and Argentinians speak Spanish.');
    expect(converted).toContain('Brazilians speak Portuguese and Argentinians speak <span class="meadow-srs-cloze-blank">...</span>.');
    expect(converted).toContain('<meadow-srs-answer>Brazilians speak Portuguese and Argentinians speak Spanish.</meadow-srs-answer>');
  });

  it('groups numbered cloze deletions into classic cards', () => {
    const markdown = [
      'The flag is ==red==[^1], ==white==[^1], and ==blue==[^2].',
      '',
      '<!--MEADOW_SR_GUID:623e4567f9012-->',
    ].join('\n');

    const converted = replaceSrsCardsWithCustomElements(markdown, (fragment: string) => fragment);

    expect(converted).toContain('guid="623e4567f9012:cloze:1" kind="cloze" cloze-type="classic" sibling-group="623e4567f9012"');
    expect(converted).toContain('The flag is <span class="meadow-srs-cloze-blank">...</span>, <span class="meadow-srs-cloze-blank">...</span>, and blue.');
    expect(converted).toContain('guid="623e4567f9012:cloze:2" kind="cloze" cloze-type="classic" sibling-group="623e4567f9012"');
    expect(converted).toContain('The flag is red, white, and <span class="meadow-srs-cloze-blank">...</span>.');
  });

  it('recognizes custom curly cloze syntax without mistaking it for a basic card separator', () => {
    const markdown = [
      'Brazilians speak {{c1::Portuguese}}.',
      '',
      '<!--MEADOW_SR_GUID:723e4567f9012-->',
    ].join('\n');

    const converted = replaceSrsCardsWithCustomElements(markdown, (fragment: string) => fragment);

    expect(converted).toContain('guid="723e4567f9012:cloze:1" kind="cloze" cloze-type="classic" sibling-group="723e4567f9012"');
    expect(converted).toContain('<meadow-srs-prompt>Brazilians speak <span class="meadow-srs-cloze-blank">...</span>.</meadow-srs-prompt>');
    expect(converted).not.toContain('kind="basic"');
  });

  it('emits a blank line after each card so marked() ends the HTML block', () => {
    const markdown = [
      'What is 2 + 2?',
      '?',
      'Four.',
      '',
      '<!--MEADOW_SR_GUID:blank123-->',
      '',
      'Some trailing markdown content',
    ].join('\n');

    const converted = replaceSrsCardsWithCustomElements(markdown, (fragment: string) => fragment);
    const lines = converted.split('\n');

    // Find the </meadow-srs-card> line
    const closeIdx = lines.findIndex(l => l === '</meadow-srs-card>');
    expect(closeIdx).toBeGreaterThan(-1);

    // The next line should be blank so marked() properly separates the HTML
    // block from any subsequent markdown content
    expect(lines[closeIdx + 1]).toBe('');
  });
});
