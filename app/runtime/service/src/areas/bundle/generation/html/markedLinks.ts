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

// The link renderer shared by page and transclusion rendering. External links
// open in a new tab; the link text is rendered as Markdown like any other
// inline content, so `[**bold**](…)` and image badges render correctly.
//
// While a page renders, links and images are first offered to that page's
// internal link renderer, which points links to other notes at their
// generated pages. marked has already resolved reference-style links, titles
// and angle brackets by then, so every standard form of link is handled.

import { Marked, type Links, type MarkedExtension, type Token } from 'marked';
import { escapeHtmlAttribute } from './shared.js';
import { blankOutCode } from './markdownCode.js';

/** Renders an internal link or image as HTML, or returns null to render it as written. */
export type InternalLinkRenderer = (link: { href: string; title?: string | null; textHtml: string; isImage: boolean }) => string | null;

let renderInternalLink: InternalLinkRenderer | undefined;

/** Runs a render of a page's Markdown, during which links are offered to `renderer` first. */
export function withInternalLinks<T>(renderer: InternalLinkRenderer, render: () => T): T {
  const outer = renderInternalLink;
  renderInternalLink = renderer;
  try {
    return render();
  } finally {
    renderInternalLink = outer;
  }
}

export const markdownLinks: MarkedExtension = {
  renderer: {
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const internal = renderInternalLink?.({ href, title, textHtml: text, isImage: false });
      if (internal != null) {
        return internal;
      }
      const titleAttr = title ? ` title="${escapeHtmlAttribute(title)}"` : '';
      const isExternal = href.startsWith('http://') || href.startsWith('https://');
      const externalAttrs = isExternal ? ' rel="noreferrer noopener" target="_blank"' : '';
      return `<a href="${href}"${titleAttr}${externalAttrs}>${text}</a>`;
    },
    image({ href, title, text }) {
      return renderInternalLink?.({ href, title, textHtml: text, isImage: true }) ?? false;
    }
  }
};

// Links are found with a plain marked instance of their own: the page
// renderer's extensions keep per-document state (footnote numbering, for one)
// that scanning must not disturb, and none of them change what a link is.
const linkScanner = new Marked({ gfm: true });

/** The page's `[label]: destination` definitions, for markdownLinkDestinations. */
export function referenceDefinitions(markdown: string): Links {
  return linkScanner.lexer(markdown).links;
}

/**
 * Markdown for `definitions`, to append to an excerpt of a page so its
 * reference-style links still resolve. Definitions render as nothing.
 */
export function referenceDefinitionMarkdown(definitions: Links): string {
  return Object.entries(definitions)
    .map(([label, { href, title }]) => `\n\n[${label}]: <${href}>${title ? ` "${title.replace(/"/g, '\\"')}"` : ''}`)
    .join('');
}

/**
 * The destinations of the links in `markdown` (not wikilinks), ignoring code.
 * Links are found as marked parses them, so reference-style links, titles and
 * angle brackets are included; `definitions` supplies reference definitions
 * written elsewhere on the page. Obsidian also accepts destinations with
 * unescaped spaces, which are not Markdown links, so those are found as text.
 */
export function markdownLinkDestinations(markdown: string, definitions: Links = {}): string[] {
  const destinations: string[] = [];
  const lexer = new linkScanner.Lexer(linkScanner.defaults);
  Object.assign(lexer.tokens.links, definitions);
  collectLinkDestinations(lexer.lex(markdown), destinations);
  // A destination with a space and no quotes (a quote would start a title).
  for (const match of blankOutCode(markdown).matchAll(/(?<!!)\[[^\]]+\]\(([^)<>"'\n]*\s[^)<>"'\n]*)\)/g)) {
    destinations.push(match[1].trim());
  }
  return destinations;
}

/**
 * The file name stems of the internal links in `markdown`: `my page` for
 * `[x](./dir/my%20page.md#heading)`. External and anchor-only links are skipped.
 */
export function markdownLinkStems(markdown: string, definitions: Links = {}): string[] {
  const stems: string[] = [];
  for (const href of markdownLinkDestinations(markdown, definitions)) {
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')) continue;
    const filename = decodePercentEncoding(href.split('#')[0].split('/').pop() ?? '');
    const stem = filename.replace(/\.[^.]+$/, '');
    if (stem && !stems.includes(stem)) stems.push(stem);
  }
  return stems;
}

/** `my%20page.md` as `my page.md`; text that is not valid percent-encoding is kept as is. */
function decodePercentEncoding(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function collectLinkDestinations(tokens: Token[], destinations: string[]): void {
  for (const token of tokens) {
    // `[^1]` is a footnote reference, even where it matches a definition.
    if (token.type === 'link' && !token.raw.startsWith('[^')) destinations.push(token.href);
    if ('tokens' in token && token.tokens) collectLinkDestinations(token.tokens, destinations);
    if (token.type === 'list') {
      for (const item of token.items) collectLinkDestinations(item.tokens, destinations);
    }
    if (token.type === 'table') {
      for (const cell of [...token.header, ...token.rows.flat()]) collectLinkDestinations(cell.tokens, destinations);
    }
  }
}
