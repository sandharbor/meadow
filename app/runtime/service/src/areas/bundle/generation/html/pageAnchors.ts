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

// Anchors inside a rendered page, shared by the page renderer and the link
// renderer so that `[[Note#Heading]]` and `[[Note#^block-id]]` point at ids
// the target page actually emits.
//
// - A heading gets a GitHub-style slug: `### Section 2` -> `id="section-2"`.
// - A block identifier keeps its Obsidian spelling: `^a-block` -> `id="^a-block"`.
//
// Only a page's own headings and blocks receive ids. Transcluded content is
// rendered without them, because those anchors belong to the embedded page.

import { Marked, type MarkedExtension, type Token } from 'marked';
import { replaceOutsideCode } from './markdown.js';

export function headingSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/**
 * The URL fragment for the part of a wikilink or Markdown link after `#`: a
 * block (`^id`), a heading, or a chain of headings (`Heading#Subheading`).
 * Given the target note's Markdown, a heading is found among its actual
 * headings (see findHeading), so the fragment is the id that heading has on
 * its page; otherwise it is the slug of the last heading named.
 */
export function pageLinkFragment(anchor: string, targetMarkdown?: string): string {
  const trimmed = anchor.trim();
  if (trimmed.startsWith('^')) {
    return `#${trimmed}`;
  }
  const chain = trimmed.split('#');
  const heading = targetMarkdown === undefined ? undefined : findHeading(noteHeadings(targetMarkdown), chain);
  return `#${encodeURIComponent(heading?.id || headingSlug(chain[chain.length - 1]))}`;
}

/** Like pageLinkFragment, for the still-percent-encoded fragment of a Markdown link href. */
export function markdownHrefFragment(encodedAnchor: string, targetMarkdown?: string): string {
  try {
    return pageLinkFragment(decodeURIComponent(encodedAnchor), targetMarkdown);
  } catch {
    return pageLinkFragment(encodedAnchor, targetMarkdown);
  }
}

/** Slugs used so far on the page being rendered; undefined outside a page render. */
let pageHeadingSlugs: Map<string, number> | undefined;

/**
 * Runs a render of the page's own Markdown, during which headings receive ids.
 * A heading whose slug is already used on the page gets `-1`, `-2`, … so each
 * can be linked to; a link to the heading text reaches the first, as in
 * Obsidian.
 */
export function withPageHeadingIds<T>(render: () => T): T {
  pageHeadingSlugs = new Map();
  try {
    return render();
  } finally {
    pageHeadingSlugs = undefined;
  }
}

/** A heading's text as a reader sees it: link text without its address, no markup. */
export function plainText(tokens: Token[]): string {
  return tokens.map(token => {
    if ('tokens' in token && token.tokens?.length) return plainText(token.tokens);
    if (token.type === 'html' || token.type === 'image') return '';
    return 'text' in token ? token.text : '';
  }).join('');
}

export const headingIds: MarkedExtension = {
  renderer: {
    heading({ tokens, depth }) {
      const slug = headingSlug(plainText(tokens));
      if (!pageHeadingSlugs || !slug) {
        return false;
      }
      const repeats = pageHeadingSlugs.get(slug) ?? 0;
      pageHeadingSlugs.set(slug, repeats + 1);
      const id = repeats === 0 ? slug : `${slug}-${repeats}`;
      return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    }
  }
};

/**
 * Styles block identifiers as small superscript text. With `linkable`, the
 * identifier also becomes the element's id. As in Obsidian, an identifier
 * ends its line, after a space (` ^foo-bar`) or on a line of its own after a
 * table, list or quote; a caret elsewhere in a sentence is ordinary text.
 */
export function styleBlockIds(markdown: string, { linkable }: { linkable: boolean }): string {
  return replaceOutsideCode(
    markdown,
    /(^|[ \t])\^([a-zA-Z0-9][a-zA-Z0-9_-]*)(?=[ \t]*$)/gm,
    (_match: string, before: string, id: string) => linkable
      ? `${before}<sup class="block-id" id="^${id}">^${id}</sup>`
      : `${before}<sup class="block-id">^${id}</sup>`
  );
}

export interface NoteHeading {
  depth: number;
  /** The heading's text as a reader sees it. */
  text: string;
  /** Its id on the rendered page ('' when it has none). */
  id: string;
  /**
   * For a heading at the top level of the note (not inside a quote or list),
   * its section: from the heading up to the next heading of the same or a
   * higher level. Offsets are into the note with `\r\n` read as `\n`.
   */
  section?: { start: number; end: number };
}

// marked-custom-heading-id's syntax for an explicit id: `## Heading {#id}`.
const CUSTOM_HEADING_ID = /(?: +|^)\{#([a-z][\w-]*)\}(?: +|$)/i;

// Headings are found with a plain marked instance, so finding them never
// disturbs the page renderer's extensions.
const headingLexer = new Marked({ gfm: true });

/**
 * A note's headings in order, with the ids the page renderer gives them: an
 * explicit `{#id}`, or the heading's slug, numbered `-1`, `-2`, … when repeated.
 */
export function noteHeadings(markdown: string): NoteHeading[] {
  const text = markdown.replace(/\r\n?/g, '\n');
  const headings: NoteHeading[] = [];
  const slugs = new Map<string, number>();
  const visit = (tokens: Token[], topLevel: boolean, offset: number) => {
    for (const token of tokens) {
      if (token.type === 'heading') {
        const custom = CUSTOM_HEADING_ID.exec(token.text);
        let id = custom?.[1] ?? '';
        const visible = plainText(token.tokens ?? []).replace(CUSTOM_HEADING_ID, '').trim();
        if (!custom) {
          const slug = headingSlug(visible);
          const repeats = slugs.get(slug) ?? 0;
          if (slug) slugs.set(slug, repeats + 1);
          id = !slug ? '' : repeats === 0 ? slug : `${slug}-${repeats}`;
        }
        headings.push({
          depth: token.depth,
          text: visible,
          id,
          section: topLevel ? { start: offset, end: text.length } : undefined,
        });
      } else if ('tokens' in token && token.tokens) {
        visit(token.tokens, false, offset);
      } else if (token.type === 'list') {
        for (const item of token.items) visit(item.tokens, false, offset);
      }
      if (topLevel) offset += token.raw.length;
    }
  };
  visit(headingLexer.lexer(text), true, 0);

  // A top-level section ends at the next top-level heading of the same or a higher level.
  headings.forEach((heading, index) => {
    if (!heading.section) return;
    const next = headings.slice(index + 1).find(h => h.section && h.depth <= heading.depth);
    if (next?.section) heading.section.end = next.section.start;
  });
  return headings;
}

/**
 * The heading a link names, as Obsidian finds it: by text, regardless of
 * letter case and of punctuation that Obsidian leaves out of links (`:`, `#`,
 * …). A chain (`['Heading', 'Subheading']`) looks for each heading among
 * the ones under the previous one. The first match wins.
 */
export function findHeading(headings: NoteHeading[], chain: string[]): NoteHeading | undefined {
  let scope = headings;
  let found: NoteHeading | undefined;
  for (const name of chain) {
    const slug = headingSlug(name);
    found = scope.find(heading => headingSlug(heading.text) === slug);
    if (!found) return undefined;
    const under: NoteHeading[] = [];
    for (const heading of headings.slice(headings.indexOf(found) + 1)) {
      if (heading.depth <= found.depth) break;
      under.push(heading);
    }
    scope = under;
  }
  return found;
}
