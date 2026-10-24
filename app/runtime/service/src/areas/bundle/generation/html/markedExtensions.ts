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

// Custom marked extensions for extended-syntax features that don't have a
// mainstream marked plugin: highlight (==text==), subscript (~text~),
// superscript (^text^), definition lists, callouts, and math (LaTeX).
//
// See app/shared_data/source_graphs/meadow-test-bundles-data/t025 - extended syntax.md
// for the comprehensive enumeration of extended-syntax variations we test against.

import type { MarkedExtension, Token } from 'marked';
import katex from 'katex';
import { escapeHtmlAttribute } from './shared.js';
import 'katex/contrib/mhchem';

interface SimpleToken {
  type: string;
  raw: string;
  text: string;
  tokens?: Token[];
}

function inlineWrap(tagName: string, startMarker: string, pattern: RegExp): MarkedExtension {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokenizer = function (this: any, src: string): SimpleToken | undefined {
    const match = pattern.exec(src);
    if (!match) return undefined;
    const tokens: Token[] = [];
    this.lexer.inline(match[1], tokens);
    return {
      type: tagName,
      raw: match[0],
      text: match[1],
      tokens
    };
  };

  return {
    extensions: [
      {
        name: tagName,
        level: 'inline',
        start(src: string) {
          return src.indexOf(startMarker);
        },
        tokenizer,
        renderer(token) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const inner = (this as any).parser.parseInline(token.tokens);
          return `<${tagName}>${inner}</${tagName}>`;
        }
      }
    ]
  };
}

// ==highlighted text==
const highlight = inlineWrap('mark', '==', /^==(?=\S)([\s\S]*?\S)==/);

// H~2~O — single-tilde, no spaces, no tildes inside (avoids clashing with GFM strikethrough ~~...~~)
const subscript = inlineWrap('sub', '~', /^~([^~\s]+)~/);

// X^2^ — caret, no spaces, no carets inside
const superscript = inlineWrap('sup', '^', /^\^([^\^\s]+)\^/);

// Definition lists:
//   Term
//   : Definition line
//   : Another definition
//
// Any number of definitions (each starting with `: `) may follow a term line.
// Multiple term/definition groups can stack with blank-line separators between groups.
const DEF_LIST_RE = /^((?:[^\n]+\n(?::[ \t]+[^\n]+\n?)+)+)/;

const definitionList: MarkedExtension = {
  extensions: [
    {
      name: 'defList',
      level: 'block',
      start(src: string) {
        const m = /\n:[ \t]+/.exec(src);
        return m ? m.index : undefined;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tokenizer(this: any, src: string) {
        const match = DEF_LIST_RE.exec(src);
        if (!match) return undefined;
        const block = match[1];

        // Parse term/definition groups out of the block. Terms and definitions
        // are inline Markdown, so bold, code and links render as usual.
        const groups: { term: Token[]; defs: Token[][] }[] = [];
        const inline = (text: string) => {
          const tokens: Token[] = [];
          this.lexer.inline(text, tokens);
          return tokens;
        };
        const lines = block.split('\n');
        let i = 0;
        while (i < lines.length) {
          const line = lines[i];
          if (!line) {
            i++;
            continue;
          }
          if (line.startsWith(':')) {
            // Definition without a preceding term — bail out rather than guess.
            return undefined;
          }
          const term = inline(line);
          const defs: Token[][] = [];
          i++;
          while (i < lines.length && /^:[ \t]+/.test(lines[i])) {
            defs.push(inline(lines[i].replace(/^:[ \t]+/, '')));
            i++;
          }
          if (defs.length === 0) return undefined;
          groups.push({ term, defs });
        }

        return {
          type: 'defList',
          raw: block,
          // Marked requires `text` on custom tokens; unused here.
          text: block,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          groups: groups as any
        };
      },
      renderer(token) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const groups = (token as any).groups as { term: Token[]; defs: Token[][] }[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parser = (this as any).parser;
        const parts: string[] = ['<dl>'];
        for (const { term, defs } of groups) {
          parts.push(`<dt>${parser.parseInline(term)}</dt>`);
          for (const d of defs) parts.push(`<dd>${parser.parseInline(d)}</dd>`);
        }
        parts.push('</dl>');
        return parts.join('');
      }
    }
  ]
};

function escapeInline(text: string): string {
  // Minimal escape for math that KaTeX could not render, shown as code.
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Obsidian-style callouts: > [!type] Title
// Converts blockquotes with callout syntax into styled callout divs.
// Supports all Obsidian callout types and their aliases. As in any block
// quote, the space after `>` is optional. The title is inline Markdown, and the
// type is only a name: it is escaped wherever it appears in the HTML.
const CALLOUT_ALIASES: Record<string, string> = {
  summary: 'abstract', tldr: 'abstract',
  hint: 'tip', important: 'tip',
  check: 'success', done: 'success',
  help: 'question', faq: 'question',
  caution: 'warning', attention: 'warning',
  fail: 'failure', missing: 'failure',
  error: 'danger',
  cite: 'quote',
};

const callout: MarkedExtension = {
  extensions: [
    {
      name: 'callout',
      level: 'block',
      start(src: string) {
        const m = /^>[ \t]?\[!/.exec(src);
        return m ? m.index : undefined;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tokenizer(this: any, src: string) {
        // Match callout: > [!type] optional title\n followed by optional > continuation lines
        // Use [ \t]* instead of \s* so we don't accidentally consume the newline.
        const match = /^(?:>[ \t]?\[!([^\]]+)\]([-+])?[ \t]*(.*?)?(?:\n|$))((?:>.*\n?)*)/.exec(src);
        if (!match) return undefined;

        const rawType = match[1].toLowerCase();
        const foldMarker = match[2] || '';
        const titleText = match[3] || '';
        const bodyRaw = match[4] || '';

        const calloutType = CALLOUT_ALIASES[rawType] || rawType;
        const title = titleText || rawType.charAt(0).toUpperCase() + rawType.slice(1);
        const titleTokens: Token[] = [];
        this.lexer.inline(title, titleTokens);

        // Strip leading > from body lines
        const bodyLines = bodyRaw.split('\n')
          .map(line => line.replace(/^>\s?/, ''))
          .join('\n')
          .trim();

        // Tokenize the body as block-level markdown
        const tokens: Token[] = [];
        if (bodyLines) {
          this.lexer.blockTokens(bodyLines, tokens);
        }

        return {
          type: 'callout',
          raw: match[0],
          text: bodyLines,
          tokens,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          calloutType: calloutType as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          titleTokens: titleTokens as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          foldable: (foldMarker === '+' || foldMarker === '-') as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          defaultOpen: (foldMarker !== '-') as any,
        };
      },
      renderer(token) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const t = token as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bodyHtml = t.tokens?.length ? (this as any).parser.parse(t.tokens) : '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const titleHtml = (this as any).parser.parseInline(t.titleTokens);
        const typeClass = `callout-${escapeHtmlAttribute(t.calloutType)}`;
        const foldableClass = t.foldable ? ' callout-foldable' : '';
        const openAttr = t.foldable && !t.defaultOpen ? '' : ' open';
        if (t.foldable) {
          return `<div class="callout ${typeClass}${foldableClass}">\n` +
            `<details${openAttr}>\n<summary class="callout-title">${titleHtml}</summary>\n` +
            `<div class="callout-content">\n${bodyHtml}</div>\n</details>\n</div>\n`;
        }
        return `<div class="callout ${typeClass}">\n` +
          `<div class="callout-title">${titleHtml}</div>\n` +
          `<div class="callout-content">\n${bodyHtml}</div>\n</div>\n`;
      }
    }
  ]
};

function renderMathToHtml(text: string, displayMode: boolean, fallbackTag: 'code' | 'pre'): string {
  try {
    return katex.renderToString(text.trim(), { displayMode, output: 'mathml', throwOnError: true });
  } catch {
    const escaped = escapeInline(text);
    if (fallbackTag === 'pre') {
      return `<pre><code>${escaped}</code></pre>`;
    }
    return `<code>${escaped}</code>`;
  }
}

// Math (LaTeX) support via KaTeX, rendered to MathML for zero-CSS rendering.
// Inline: $expr$ or \(expr\) — Block: $$expr$$ or \[expr\]
const mathBlock: MarkedExtension = {
  extensions: [
    {
      name: 'mathBlock',
      level: 'block',
      start(src: string) {
        return src.indexOf('$$');
      },
      tokenizer(src: string) {
        const match = /^\$\$([\s\S]+?)\$\$/.exec(src);
        if (!match) return undefined;
        return {
          type: 'mathBlock',
          raw: match[0],
          text: match[1].trim(),
        };
      },
      renderer(token) {
        return renderMathToHtml(token.text, true, 'pre');
      }
    }
  ]
};

const mathBracketBlock: MarkedExtension = {
  extensions: [
    {
      name: 'mathBracketBlock',
      level: 'block',
      start(src: string) {
        return src.indexOf('\\[');
      },
      tokenizer(src: string) {
        const match = /^\\\[([\s\S]+?)\\\]/.exec(src);
        if (!match) return undefined;
        return {
          type: 'mathBracketBlock',
          raw: match[0],
          text: match[1].trim(),
        };
      },
      renderer(token) {
        return renderMathToHtml(token.text, true, 'pre');
      }
    }
  ]
};

const mathInline: MarkedExtension = {
  extensions: [
    {
      name: 'mathInline',
      level: 'inline',
      start(src: string) {
        return src.indexOf('$');
      },
      tokenizer(src: string) {
        // Single $ delimiters, not preceded/followed by space, not $$
        const match = /^\$(?!\$)(\S(?:[^$]*?\S)?)\$(?!\d)/.exec(src);
        if (!match) return undefined;
        return {
          type: 'mathInline',
          raw: match[0],
          text: match[1],
        };
      },
      renderer(token) {
        return renderMathToHtml(token.text, false, 'code');
      }
    }
  ]
};

const mathParenInline: MarkedExtension = {
  extensions: [
    {
      name: 'mathParenInline',
      level: 'inline',
      start(src: string) {
        return src.indexOf('\\(');
      },
      tokenizer(src: string) {
        const match = /^\\\((?=[^\n]*\S)([^\n]+?)\\\)/.exec(src);
        if (!match) return undefined;
        return {
          type: 'mathParenInline',
          raw: match[0],
          text: match[1],
        };
      },
      renderer(token) {
        return renderMathToHtml(token.text, false, 'code');
      }
    }
  ]
};

// Obsidian task statuses: a list item starting with any single character
// between brackets (`- [?]`, `- [-]`) is a completed task, like `- [x]`.
// marked recognizes only `[ ]` and `[x]`, so this marks the others.
const taskStatuses: MarkedExtension = {
  walkTokens(token) {
    if (token.type !== 'list_item' || token.task) return;
    const first = token.tokens?.[0];
    if (!first || !('text' in first)) return;
    const status = /^\[([^\]\s])\] /.exec(first.text);
    if (!status) return;
    const prefix = status[0];
    token.task = true;
    token.checked = true;
    first.text = first.text.slice(prefix.length);
    first.raw = first.raw.replace(prefix, '');
    const inner = 'tokens' in first ? first.tokens?.[0] : undefined;
    if (inner && 'text' in inner) {
      inner.text = inner.text.slice(prefix.length);
      inner.raw = inner.raw.replace(prefix, '');
    }
  }
};

export const extendedSyntaxExtensions: MarkedExtension[] = [
  taskStatuses,
  highlight,
  subscript,
  superscript,
  definitionList,
  callout,
  mathBlock,
  mathBracketBlock,
  mathInline,
  mathParenInline,
];
