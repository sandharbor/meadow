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

import type { MarkedExtension } from 'marked';
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

let renderingPageHeadings = false;

/** Runs a render of the page's own Markdown, during which headings receive ids. */
export function withPageHeadingIds<T>(render: () => T): T {
  renderingPageHeadings = true;
  try {
    return render();
  } finally {
    renderingPageHeadings = false;
  }
}

export const headingIds: MarkedExtension = {
  renderer: {
    heading({ tokens, depth, text }) {
      const id = headingSlug(text);
      if (!renderingPageHeadings || !id) {
        return false;
      }
      return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    }
  }
};

/**
 * Styles block identifiers (e.g. ` ^foo-bar`) as small superscript text. With
 * `linkable`, the identifier also becomes the element's id.
 */
export function styleBlockIds(markdown: string, { linkable }: { linkable: boolean }): string {
  return replaceOutsideCode(
    markdown,
    / \^([a-zA-Z0-9][a-zA-Z0-9_-]*)/g,
    (_match: string, id: string) => linkable
      ? ` <sup class="block-id" id="^${id}">^${id}</sup>`
      : ` <sup class="block-id">^${id}</sup>`
  );
}
