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

import type { MarkedExtension, Token } from 'marked';
import { replaceOutsideCode } from './markdown.js';

export function headingSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** The URL fragment for the part of a wikilink or Markdown link after `#`. */
export function pageLinkFragment(anchor: string): string {
  const trimmed = anchor.trim();
  if (trimmed.startsWith('^')) {
    return `#${trimmed}`;
  }
  return `#${encodeURIComponent(headingSlug(trimmed))}`;
}

/** Like pageLinkFragment, for the still-percent-encoded fragment of a Markdown link href. */
export function markdownHrefFragment(encodedAnchor: string): string {
  try {
    return pageLinkFragment(decodeURIComponent(encodedAnchor));
  } catch {
    return pageLinkFragment(encodedAnchor);
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
function plainText(tokens: Token[]): string {
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
