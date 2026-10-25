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

// Block anchors (`<a id="block-…" class="block-anchor"></a>`) mark the end of
// each block of a note, for backlinks' "see in context" links. They are added
// to the document marked has read, never to the Markdown, so they cannot
// change how it is read: a table gains no row and a loose list stays one list.
//
// An anchor goes where the Markdown it was once written into put it:
// - at the end of a paragraph, or of a block quote's last paragraph;
// - at the end of an HTML block that runs to the next blank line (`<div>`);
// - after anything else (a heading, a code block, a table, a list, an HTML
//   comment), as a paragraph of its own. So does the anchor of a block marked
//   leaves out of its document, a link reference definition.
// A list holding several blocks (a loose list) has each block's anchor at the
// end of the item where the block ends.

import type { MarkedExtension, Token, Tokens } from 'marked';

/** An anchor and the offset in the rendered Markdown where its block ends. */
export interface BlockAnchor {
  end: number;
  html: string;
}

let pendingAnchors: { markdown: string; anchors: BlockAnchor[] } | undefined;

/** Runs `render`, during which marked adds `anchors` to the document it reads from `markdown`. */
export function withBlockAnchors<T>(markdown: string, anchors: BlockAnchor[], render: () => T): T {
  const outer = pendingAnchors;
  pendingAnchors = { markdown, anchors };
  try {
    return render();
  } finally {
    pendingAnchors = outer;
  }
}

export const blockAnchorPlacement: MarkedExtension = {
  hooks: {
    processAllTokens(tokens) {
      const pending = pendingAnchors;
      // Only the note itself: Markdown rendered while it renders has no anchors.
      pendingAnchors = undefined;
      if (pending) placeAnchors(tokens as Token[], pending.markdown, pending.anchors);
      return tokens;
    },
  },
};

// CommonMark's HTML blocks that end on a line of their own (a comment, `<pre>`,
// `<script>`, `<style>`, `<textarea>`, `<?…?>`, `<!…>`, CDATA), rather than at
// the next blank line.
const SELF_ENDING_HTML_BLOCK = /^ {0,3}<(?:!--|\?|![A-Za-z]|!\[CDATA\[|(?:script|pre|style|textarea)(?:\s|>|$))/i;

function inlineHtml(html: string): Tokens.HTML {
  return { type: 'html', raw: html, text: html, block: false, pre: false };
}

function anchorParagraph(html: string): Tokens.Paragraph {
  return { type: 'paragraph', raw: '', text: html, tokens: [inlineHtml(html)] };
}

/** Ends `token` with `html`, as a last line of its text, if it ends in a paragraph. */
function appendToText(token: Token, html: string): boolean {
  if (token.type === 'paragraph' || (token.type === 'text' && 'tokens' in token && token.tokens)) {
    (token as Tokens.Paragraph).tokens.push({ type: 'text', raw: '\n', text: '\n' }, inlineHtml(html));
    return true;
  }
  if (token.type === 'blockquote') {
    const last = (token as Tokens.Blockquote).tokens.at(-1);
    return last !== undefined && appendToText(last, html);
  }
  return false;
}

/** Ends a list item with `html`: in its last paragraph, or as a paragraph of its own. */
function appendToItem(item: Tokens.ListItem, html: string): void {
  const last = item.tokens.at(-1);
  if (last?.type === 'list') {
    appendToItem((last as Tokens.List).items.at(-1)!, html);
  } else if (!last || !appendToText(last, html)) {
    item.tokens.push(anchorParagraph(html));
  }
}

/** Where each top-level token's raw text lies in `markdown`: marked leaves out link reference definitions. */
function tokenSpans(tokens: Token[], markdown: string): { index: number; start: number; end: number }[] {
  const spans: { index: number; start: number; end: number }[] = [];
  let cursor = 0;
  tokens.forEach((token, index) => {
    if (token.type === 'space' || token.type === 'footnotes' || !token.raw) return;
    const start = markdown.indexOf(token.raw, cursor);
    if (start < 0) return;
    spans.push({ index, start, end: start + token.raw.length });
    cursor = start + token.raw.length;
  });
  return spans;
}

interface TokenAnchors {
  /** Anchors of blocks ending inside the token. */
  within: BlockAnchor[];
  /** Anchors of blocks ending after it, in text marked left out. */
  following: BlockAnchor[];
}

function placeAnchors(tokens: Token[], markdown: string, anchors: BlockAnchor[]): void {
  const spans = tokenSpans(tokens, markdown);
  const byToken = new Map<number, TokenAnchors>();
  const entry = (index: number) => byToken.get(index) ?? byToken.set(index, { within: [], following: [] }).get(index)!;
  for (const anchor of anchors) {
    const last = anchor.end - 1; // the block's last character
    const containing = spans.find(span => span.start <= last && last < span.end);
    if (containing) {
      entry(containing.index).within.push(anchor);
    } else {
      // Index -1 for text before the first token.
      entry(spans.filter(span => span.end <= last).at(-1)?.index ?? -1).following.push(anchor);
    }
  }
  // From the end, so inserting a token leaves earlier indexes in place.
  for (const [index, { within, following }] of [...byToken.entries()].sort((a, b) => b[0] - a[0])) {
    const after: Token[] = [];
    const token = tokens[index];
    if (token?.type === 'list' && within.length > 1) {
      placeInListItems(token as Tokens.List, spans.find(span => span.index === index)!.start, within);
    } else {
      for (const anchor of within) {
        const html = token as Tokens.HTML;
        if (token.type === 'html' && !SELF_ENDING_HTML_BLOCK.test(html.text)) {
          // The anchor's own line, last in the note if the block was.
          const trailing = index === spans.at(-1)!.index ? '' : html.text.match(/\n*$/)![0];
          html.text = `${html.text.replace(/\n*$/, '')}\n${anchor.html}${trailing}`;
        } else if (!appendToText(token, anchor.html)) {
          // An anchor written after an HTML block was on the very next line.
          if (token.type === 'html') html.text = html.text.replace(/\n*$/, '\n');
          after.push(anchorParagraph(anchor.html));
        }
      }
    }
    after.push(...following.map(anchor => anchorParagraph(anchor.html)));
    tokens.splice(index + 1, 0, ...after);
  }
}

/** Each anchor at the end of the list item where its block ends. */
function placeInListItems(list: Tokens.List, start: number, anchors: BlockAnchor[]): void {
  let itemStart = start;
  const itemEnds = list.items.map(item => (itemStart += item.raw.length));
  for (const anchor of anchors) {
    const index = itemEnds.findIndex(end => anchor.end - 1 < end);
    appendToItem(list.items[index < 0 ? list.items.length - 1 : index], anchor.html);
  }
}
