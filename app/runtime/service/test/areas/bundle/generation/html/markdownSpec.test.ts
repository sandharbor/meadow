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

// Renders every CommonMark example, and every GitHub Flavored Markdown
// extension example, the way a note's page is rendered, and compares the
// result with plain GFM marked. Meadow adds Obsidian syntax on top of
// standard Markdown, so a difference means a Meadow pass changed what
// standard Markdown means, unless it is one Meadow intends.
//
// Every difference is listed below, with its reason: those Meadow intends,
// and bugs, each with an id from the coverage gap list. Fixing a bug removes
// its examples here, and any new difference fails the test.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Marked } from 'marked';
import { createNoteRenderer } from '../../../../../src/areas/bundle/generation/html/htmlGenerator.js';
import { removeComments, removeFrontmatter } from '../../../../../src/areas/bundle/generation/html/markdown.js';

const DELIBERATE: Record<string, string[]> = {
  'A note that starts with `---` has frontmatter there, as in Obsidian': ['cm-96', 'cm-98'],
  'Scripts are removed from notes, as Obsidian\'s reading view runs none': ['cm-170', 'cm-178'],
  '`[[…]]` is a wikilink, so it takes the place of bracketed link text': ['cm-548', 'cm-559', 'cm-590'],
  'A link to a local file that is not in the bundle shows "link not tracked"':
    ['cm-484', 'cm-517', 'cm-531', 'cm-573', 'cm-576', 'cm-577', 'cm-578', 'cm-579'],
};

const BUGS: Record<string, string[]> = {
  'G26a: block anchors, added at blank lines, split loose lists and move a list item\'s later paragraphs out of it': [
    'cm-4', 'cm-5', 'cm-108', 'cm-109', 'cm-254', 'cm-256', 'cm-258', 'cm-262', 'cm-263', 'cm-264', 'cm-270',
    'cm-271', 'cm-273', 'cm-274', 'cm-277', 'cm-278', 'cm-286', 'cm-287', 'cm-288', 'cm-290', 'cm-306', 'cm-307',
    'cm-309', 'cm-311', 'cm-313', 'cm-314', 'cm-315', 'cm-316', 'cm-317', 'cm-318', 'cm-319', 'cm-321', 'cm-324',
    'cm-325', 'cm-326',
  ],
  'G26b: a block anchor after a table adds an empty row to it': ['gfm-198', 'gfm-199', 'gfm-200', 'gfm-202', 'gfm-204', 'gfm-205'],
  'G26c: a block anchor after a code fence that is not closed by its own line shows inside the code':
    ['cm-126', 'cm-127', 'cm-137', 'cm-139', 'cm-237'],
  'G26d: a block anchor after a line ending in a hard break turns the break into a visible one': ['cm-226', 'cm-644', 'cm-645'],
  'G26e: a block anchor after an empty link reference definition becomes its destination': ['cm-199'],
};

interface Example { id: string; markdown: string }

const specDirectory = path.join(__dirname, 'markdown-spec');

function commonmarkExamples(): Example[] {
  const examples: { example: number; markdown: string }[] =
    JSON.parse(fs.readFileSync(path.join(specDirectory, 'commonmark-0.31.2-spec.json'), 'utf8'));
  return examples.map(example => ({ id: `cm-${example.example}`, markdown: example.markdown }));
}

/** The GFM extension examples (tables, task lists, strikethrough, autolinks, raw HTML); the rest repeat CommonMark. */
function gfmExtensionExamples(): Example[] {
  const fence = '`'.repeat(32);
  const example = new RegExp(`^${fence} example( \\S+)?\\n([\\s\\S]*?)^\\.\\n[\\s\\S]*?^${fence}$`, 'gm');
  const spec = fs.readFileSync(path.join(specDirectory, 'gfm-spec.txt'), 'utf8');
  return [...spec.matchAll(example)]
    .map((match, index) => ({ id: `gfm-${index + 1}`, extension: match[1], markdown: match[2].replace(/→/g, '\t') }))
    .filter(example => example.extension)
    .map(({ id, markdown }) => ({ id, markdown }));
}

/** A note's body as its page renders it: frontmatter and comments removed, then the body with block anchors. */
function meadowHtml(markdown: string): string {
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
  return renderer.renderBody(removeComments(removeFrontmatter(markdown)), true);
}

const plainMarked = new Marked({ gfm: true });

/**
 * Removes what Meadow adds to every page, so only differences in meaning
 * remain: block anchors (and the paragraphs left empty by them), heading ids,
 * external-link attributes, code highlighting, and whitespace between tags.
 */
function normalize(html: string): string {
  return html
    .replace(/<a id="block-[^"]*" class="block-anchor"><\/a>/g, '')
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/(<h[1-6]) id="[^"]*"/g, '$1')
    .replace(/ rel="noreferrer noopener" target="_blank"/g, '')
    .replace(/<code class="hljs language-([^"]*)">([\s\S]*?)<\/code>/g,
      (_match, language: string, code: string) => `<code class="language-${language}">${code.replace(/<\/?span[^>]*>/g, '')}</code>`)
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .replace(/\s+(?=<\/(?:p|li|h[1-6]|blockquote|td|th)>)/g, '')
    .trim();
}

describe('CommonMark and GFM examples rendered as a note', () => {
  it('differ from plain marked only where listed', () => {
    const listed = new Map(Object.entries({ ...DELIBERATE, ...BUGS }).flatMap(([reason, ids]) => ids.map(id => [id, reason])));
    const differing = [...commonmarkExamples(), ...gfmExtensionExamples()]
      .filter(example => normalize(meadowHtml(example.markdown)) !== normalize(plainMarked.parse(example.markdown) as string))
      .map(example => example.id);
    expect({
      unexpected: differing.filter(id => !listed.has(id)),
      noLongerDiffering: [...listed.keys()].filter(id => !differing.includes(id)),
    }).toEqual({ unexpected: [], noLongerDiffering: [] });
  });
});
