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

export type HtmlVisualDiffResult =
  | {
      kind: 'visual';
      /** Full HTML document string safe to load into an iframe via srcDoc. */
      html: string;
      /** True when any user-visible change was detected (text-level). */
      hasVisibleChanges: boolean;
      /** Added/removed token counts for display/debug. */
      stats: { added: number; removed: number };
      /** Non-fatal notes (e.g., "no visible changes"). */
      notes?: string[];
    }
  | {
      kind: 'unsupported';
      reason: string;
    };

type TokenType = 'text' | 'ws';

interface Token {
  type: TokenType;
  value: string;
}

interface LcsMatch {
  oldIndex: number;
  newIndex: number;
}

interface DiffToken {
  type: 'unchanged' | 'added' | 'removed';
  token: Token;
}

/**
 * HtmlVisualDiffer
 *
 * Goal: produce a *rendered* diff view for HTML that is user-friendly.
 *
 * Constraints / non-goals (initial version):
 * - Focus on *visible text* changes (ignores structural-only changes).
 * - Do not attempt full DOM structural diffing; that’s a much larger project.
 * - Output is a standalone HTML document meant for iframe `srcDoc`.
 */
export class HtmlVisualDiffer {
  // How much unchanged context to show around changes (token-based; tokens preserve whitespace).
  private static readonly CONTEXT_TOKENS = 20;
  // Minimum number of hidden tokens required to render a collapsible section.
  private static readonly MIN_COLLAPSE_TOKENS = 40;

  static diffToHtmlDocument(originalHtml: string | null, currentHtml: string): HtmlVisualDiffResult {
    if (originalHtml === null) {
      // New file: treat all visible text as added.
      const currentText = this.extractVisibleText(currentHtml);
      const tokens = this.tokenize(currentText);
      const doc = this.buildHtmlDocument(tokens.map((t) => ({ type: 'added', token: t })), {
        added: tokens.filter((t) => t.type === 'text').length,
        removed: 0,
      });
      return {
        kind: 'visual',
        html: doc,
        hasVisibleChanges: tokens.some((t) => t.type === 'text' && t.value.trim() !== ''),
        stats: { added: tokens.filter((t) => t.type === 'text').length, removed: 0 },
        notes: ['New file: showing all visible text as added.'],
      };
    }

    const oldText = this.extractVisibleText(originalHtml);
    const newText = this.extractVisibleText(currentHtml);

    // If visible text is identical, we still return a document but indicate no visible changes.
    if (oldText === newText) {
      const tokens = this.tokenize(newText);
      const doc = this.buildHtmlDocument(tokens.map((t) => ({ type: 'unchanged', token: t })), {
        added: 0,
        removed: 0,
      });
      return {
        kind: 'visual',
        html: doc,
        hasVisibleChanges: false,
        stats: { added: 0, removed: 0 },
        notes: ['No visible text changes detected. Try "Code" to see non-visible HTML/CSS changes.'],
      };
    }

    const diffTokens = this.diffTextTokens(oldText, newText);
    const stats = this.computeStats(diffTokens);
    const doc = this.buildHtmlDocument(diffTokens, stats);
    const hasVisibleChanges = stats.added > 0 || stats.removed > 0;

    return { kind: 'visual', html: doc, hasVisibleChanges, stats };
  }

  /**
   * Extracts "visible text" from HTML by parsing and walking text nodes,
   * skipping SCRIPT/STYLE/NOSCRIPT and hidden-ish content.
   *
   * Note: this is heuristic; exact visibility requires layout/CSS evaluation.
   */
  static extractVisibleText(html: string): string {
    // DOMParser is available in browsers; this code is used in the React frontend.
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // If parsing failed, browsers insert <parsererror> in XML mode; in text/html
    // it’s usually best-effort. Still: guard for missing body.
    const root = doc.body || doc.documentElement;
    if (!root) return '';

    const parts: string[] = [];
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    const isSkippableAncestor = (n: Node | null): boolean => {
      let cur: Node | null = n;
      while (cur) {
        if (cur.nodeType === Node.ELEMENT_NODE) {
          const el = cur as HTMLElement;
          const tag = el.tagName.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'noscript') return true;
          if (el.hasAttribute('hidden')) return true;
          const ariaHidden = el.getAttribute('aria-hidden');
          if (ariaHidden === 'true') return true;
          const style = el.getAttribute('style') || '';
          // Basic inline-style hiding heuristics
          if (/display\s*:\s*none/i.test(style)) return true;
          if (/visibility\s*:\s*hidden/i.test(style)) return true;
        }
        cur = cur.parentNode;
      }
      return false;
    };

    let node: Node | null = walker.nextNode();
    while (node) {
      if (!isSkippableAncestor(node.parentNode)) {
        const text = node.nodeValue ?? '';
        // Keep whitespace, but normalize CRLF.
        parts.push(text.replace(/\r\n/g, '\n'));
      }
      node = walker.nextNode();
    }

    // Normalize: collapse runs of whitespace into single spaces/newlines,
    // but preserve newlines for block-ish separation.
    const joined = parts.join(' ');
    return joined
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  static tokenize(text: string): Token[] {
    if (!text) return [];
    // Split into runs of whitespace vs non-whitespace, preserving both.
    // This yields a decent inline diff experience while preserving word boundaries.
    const tokens: Token[] = [];
    const re = /(\s+|[^\s]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const v = m[0];
      tokens.push({ type: /^\s+$/.test(v) ? 'ws' : 'text', value: v });
    }
    return tokens;
  }

  static diffTextTokens(oldText: string, newText: string): DiffToken[] {
    const oldTokens = this.tokenize(oldText);
    const newTokens = this.tokenize(newText);

    const lcs = this.computeLcs(oldTokens, newTokens);
    const out: DiffToken[] = [];

    let oldIdx = 0;
    let newIdx = 0;

    for (const match of lcs) {
      while (oldIdx < match.oldIndex) {
        out.push({ type: 'removed', token: oldTokens[oldIdx] });
        oldIdx++;
      }
      while (newIdx < match.newIndex) {
        out.push({ type: 'added', token: newTokens[newIdx] });
        newIdx++;
      }
      out.push({ type: 'unchanged', token: oldTokens[oldIdx] });
      oldIdx++;
      newIdx++;
    }

    while (oldIdx < oldTokens.length) {
      out.push({ type: 'removed', token: oldTokens[oldIdx] });
      oldIdx++;
    }
    while (newIdx < newTokens.length) {
      out.push({ type: 'added', token: newTokens[newIdx] });
      newIdx++;
    }

    // Optional cleanup: coalesce sequences like removed ws then added ws to unchanged
    // only if both are whitespace. This reduces noise when whitespace shifts.
    return this.simplifyWhitespaceDiff(out);
  }

  private static simplifyWhitespaceDiff(tokens: DiffToken[]): DiffToken[] {
    const simplified: DiffToken[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const cur = tokens[i];
      const next = tokens[i + 1];
      if (
        cur &&
        next &&
        cur.type === 'removed' &&
        next.type === 'added' &&
        cur.token.type === 'ws' &&
        next.token.type === 'ws'
      ) {
        // Replace with unchanged ws (prefer new whitespace)
        simplified.push({ type: 'unchanged', token: next.token });
        i++; // skip next
        continue;
      }
      simplified.push(cur);
    }
    return simplified;
  }

  static computeLcs(oldTokens: Token[], newTokens: Token[]): LcsMatch[] {
    const m = oldTokens.length;
    const n = newTokens.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (this.tokensEqual(oldTokens[i - 1], newTokens[j - 1])) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const matches: LcsMatch[] = [];
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
      if (this.tokensEqual(oldTokens[i - 1], newTokens[j - 1])) {
        matches.unshift({ oldIndex: i - 1, newIndex: j - 1 });
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }
    return matches;
  }

  private static tokensEqual(a: Token, b: Token): boolean {
    return a.type === b.type && a.value === b.value;
  }

  private static computeStats(diff: DiffToken[]): { added: number; removed: number } {
    let added = 0;
    let removed = 0;
    for (const d of diff) {
      if (d.token.type !== 'text') continue;
      const trimmed = d.token.value.trim();
      if (!trimmed) continue;
      if (d.type === 'added') added++;
      if (d.type === 'removed') removed++;
    }
    return { added, removed };
  }

  private static escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private static buildHtmlDocument(diffTokens: DiffToken[], stats: { added: number; removed: number }): string {
    const bodyHtml = this.renderDiffWithCollapsibleUnchanged(diffTokens);

    const summary = `+${stats.added} \u00A0 \u2212${stats.removed}`;

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Visual Diff</title>
    <style>
      :root { color-scheme: light; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; margin: 0; padding: 12px; color: #111827; background: #ffffff; }
      .meadow-header { position: sticky; top: 0; background: rgba(255,255,255,0.95); backdrop-filter: blur(6px); border-bottom: 1px solid #e5e7eb; padding: 10px 0; margin-bottom: 12px; }
      .meadow-header-inner { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
      .meadow-title { font-weight: 600; font-size: 14px; color: #374151; }
      .meadow-summary { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; color: #6b7280; }
      .meadow-content { line-height: 1.6; font-size: 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
      ins.meadow-ins { background: #dcfce7; color: inherit; text-decoration: none; border-radius: 3px; padding: 0 1px; }
      del.meadow-del { background: #fee2e2; color: inherit; text-decoration: line-through; border-radius: 3px; padding: 0 1px; }
      details.meadow-details { display: inline; }
      details.meadow-details > summary {
        display: inline;
        cursor: pointer;
        user-select: none;
        color: #374151;
        background: #f3f4f6;
        border: 1px solid #d1d5db;
        border-radius: 9999px;
        padding: 1px 8px;
        margin: 0 3px;
        font-size: 12px;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        white-space: nowrap;
      }
      details.meadow-details[open] > summary { background: #e5e7eb; }
    </style>
  </head>
  <body>
    <div class="meadow-header">
      <div class="meadow-header-inner">
        <div class="meadow-title">Rendered changes</div>
        <div class="meadow-summary">${this.escapeHtml(summary)}</div>
      </div>
    </div>
    <div class="meadow-content">${bodyHtml || '<span style="color:#6b7280">(No visible text)</span>'}</div>
  </body>
</html>`;
  }

  private static renderDiffWithCollapsibleUnchanged(diffTokens: DiffToken[]): string {
    const chunks = this.groupIntoChunks(diffTokens);
    const rendered: string[] = [];

    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      if (chunk.type === 'changes') {
        rendered.push(this.renderTokens(chunk.tokens));
        continue;
      }

      const isFirst = idx === 0;
      const isLast = idx === chunks.length - 1;
      const total = chunk.tokens.length;
      const showAtStart = isFirst ? 0 : this.CONTEXT_TOKENS;
      const showAtEnd = isLast ? 0 : this.CONTEXT_TOKENS;
      const minToShow = Math.min(total, showAtStart + showAtEnd);
      const hiddenCount = total - minToShow;
      const shouldCollapse = hiddenCount >= this.MIN_COLLAPSE_TOKENS;

      if (!shouldCollapse) {
        rendered.push(this.renderTokens(chunk.tokens));
        continue;
      }

      const startTokens = chunk.tokens.slice(0, showAtStart);
      const endTokens = chunk.tokens.slice(total - showAtEnd);
      const hiddenTokens = chunk.tokens.slice(showAtStart, total - showAtEnd);

      const hiddenTextCount = hiddenTokens.filter((t) => t.token.type === 'text' && t.token.value.trim() !== '').length;
      const label = hiddenTextCount > 0 ? `${hiddenTextCount} unchanged word${hiddenTextCount === 1 ? '' : 's'}` : `${hiddenTokens.length} unchanged tokens`;

      rendered.push(this.renderTokens(startTokens));
      rendered.push(
        `<details class="meadow-details"><summary>Show ${this.escapeHtml(label)}</summary>${this.renderTokens(hiddenTokens)}</details>`
      );
      rendered.push(this.renderTokens(endTokens));
    }

    return rendered.join('');
  }

  private static groupIntoChunks(diffTokens: DiffToken[]): Array<{ type: 'changes' | 'unchanged'; tokens: DiffToken[] }> {
    const chunks: Array<{ type: 'changes' | 'unchanged'; tokens: DiffToken[] }> = [];
    let current: { type: 'changes' | 'unchanged'; tokens: DiffToken[] } | null = null;

    for (const t of diffTokens) {
      const chunkType = t.type === 'unchanged' ? 'unchanged' : 'changes';
      if (!current || current.type !== chunkType) {
        if (current) chunks.push(current);
        current = { type: chunkType, tokens: [] };
      }
      current.tokens.push(t);
    }
    if (current) chunks.push(current);
    return chunks;
  }

  private static renderTokens(tokens: DiffToken[]): string {
    return tokens
      .map((d) => {
        const v = this.escapeHtml(d.token.value);
        if (d.type === 'added') return `<ins class="meadow-ins">${v}</ins>`;
        if (d.type === 'removed') return `<del class="meadow-del">${v}</del>`;
        return v;
      })
      .join('');
  }
}


