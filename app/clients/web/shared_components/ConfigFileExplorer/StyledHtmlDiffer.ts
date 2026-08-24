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

/**
 * StyledHtmlDiffer
 *
 * Produces a "styled" diff view for HTML documents that preserves the original
 * page styling while highlighting additions and deletions inline.
 *
 * Key features:
 * - Preserves original CSS styling (links, fonts, etc.)
 * - Shows changes inline within the actual page structure
 * - Collapses unchanged high-level sections
 * - Finds the Lowest Common Ancestor (LCA) for changes to provide good context
 *
 * Algorithm:
 * 1. Parse both HTML documents
 * 2. Extract comparable sections (header, main, footer or body children)
 * 3. For each section, compute block-level diff
 * 4. Within changed blocks, compute word-level diff
 * 5. Collapse unchanged blocks into expandable sections
 * 6. Output a standalone HTML document
 */

export interface StyledHtmlDiffResult {
  kind: 'styled';
  /** Full HTML document string safe to load into an iframe via srcDoc. */
  html: string;
  /** True when any user-visible change was detected. */
  hasVisibleChanges: boolean;
  /** Added/removed word counts for display. */
  stats: { added: number; removed: number };
  /** Non-fatal notes (e.g., "no visible changes"). */
  notes?: string[];
}

// Token types for word-level diffing
interface Token {
  type: 'text' | 'ws';
  value: string;
}

interface DiffToken {
  type: 'unchanged' | 'added' | 'removed';
  value: string;
}

// Represents a block of content for comparison
interface ContentBlock {
  /** A path-like identifier for the block (e.g., "main/p[0]") */
  path: string;
  /** The HTML element */
  element: Element;
  /** Visible text content for comparison */
  textContent: string;
  /** The outer HTML */
  outerHtml: string;
}

// Represents a diff result for a content block
interface BlockDiffResult {
  type: 'unchanged' | 'modified' | 'added' | 'removed';
  path: string;
  /** For unchanged/removed: the original block */
  originalBlock?: ContentBlock;
  /** For unchanged/added/modified: the new block */
  newBlock?: ContentBlock;
  /** For modified blocks: the diffed HTML content */
  diffedInnerHtml?: string;
  /** Number of words added/removed in this block */
  wordsAdded?: number;
  wordsRemoved?: number;
}

/**
 * Configuration for the styled differ
 */
export interface StyledHtmlDifferConfig {
  /** Elements to consider as "blocks" for collapsing. Default: ['section', 'article', 'div', 'p', 'ul', 'ol', 'table', 'blockquote'] */
  blockElements?: string[];
  /** Minimum number of words in a block to make it collapsible */
  minCollapsibleWords?: number;
  /** How many context words to show around changes */
  contextWords?: number;
}

const DEFAULT_CONFIG: Required<StyledHtmlDifferConfig> = {
  blockElements: ['section', 'article', 'div', 'p', 'ul', 'ol', 'table', 'blockquote', 'header', 'footer', 'main', 'li'],
  minCollapsibleWords: 15,
  contextWords: 10,
};

export class StyledHtmlDiffer {
  private config: Required<StyledHtmlDifferConfig>;

  constructor(config: StyledHtmlDifferConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main entry point: produces a styled diff of two HTML documents.
   * @param originalHtml - The original HTML content (null for new files)
   * @param currentHtml - The current HTML content
   * @param options - Optional settings including filePath for resolving relative URLs
   */
  diff(originalHtml: string | null, currentHtml: string, options?: { filePath?: string }): StyledHtmlDiffResult {
    const parser = new DOMParser();
    const currentDoc = parser.parseFromString(currentHtml, 'text/html');

    // Add <base> tag if filePath is provided to resolve relative URLs
    if (options?.filePath) {
      this.injectBaseTag(currentDoc, options.filePath);
    }

    if (originalHtml === null) {
      // New file: mark all content as added
      return this.handleNewFile(currentDoc);
    }

    const originalDoc = parser.parseFromString(originalHtml, 'text/html');

    // Check if visible text is identical
    const originalText = this.extractVisibleText(originalDoc);
    const currentText = this.extractVisibleText(currentDoc);

    if (originalText === currentText) {
      return {
        kind: 'styled',
        html: this.buildNoChangesDocument(currentDoc),
        hasVisibleChanges: false,
        stats: { added: 0, removed: 0 },
        notes: ['No visible text changes detected. Try "Code" to see non-visible HTML/CSS changes.'],
      };
    }

    // Compute the diff
    return this.computeStyledDiff(originalDoc, currentDoc);
  }

  /**
   * Handles the case where this is a new file (no original).
   */
  private handleNewFile(currentDoc: Document): StyledHtmlDiffResult {
    const body = currentDoc.body;
    if (!body) {
      return {
        kind: 'styled',
        html: '<!DOCTYPE html><html><body>(Empty document)</body></html>',
        hasVisibleChanges: false,
        stats: { added: 0, removed: 0 },
      };
    }

    // Wrap all body content in an "added" marker
    const wrapper = currentDoc.createElement('div');
    wrapper.className = 'meadow-diff-added-block';
    while (body.firstChild) {
      wrapper.appendChild(body.firstChild);
    }
    body.appendChild(wrapper);

    // Inject diff styles
    this.injectDiffStyles(currentDoc);

    const wordCount = this.countWords(this.extractVisibleText(currentDoc));

    return {
      kind: 'styled',
      html: this.serializeDocument(currentDoc),
      hasVisibleChanges: true,
      stats: { added: wordCount, removed: 0 },
      notes: ['New file: showing all content as added.'],
    };
  }

  /**
   * Builds a document showing "no changes" but still with the styled content.
   */
  private buildNoChangesDocument(currentDoc: Document): string {
    this.injectDiffStyles(currentDoc);
    this.injectNoChangesHeader(currentDoc);
    return this.serializeDocument(currentDoc);
  }

  /**
   * Main diff computation.
   */
  private computeStyledDiff(originalDoc: Document, currentDoc: Document): StyledHtmlDiffResult {
    const originalBody = originalDoc.body;
    const currentBody = currentDoc.body;

    if (!originalBody || !currentBody) {
      return {
        kind: 'styled',
        html: '<!DOCTYPE html><html><body>(Invalid documents)</body></html>',
        hasVisibleChanges: false,
        stats: { added: 0, removed: 0 },
      };
    }

    // Extract content blocks from both documents
    const originalBlocks = this.extractContentBlocks(originalBody, '');
    const currentBlocks = this.extractContentBlocks(currentBody, '');

    // Create a map of blocks by path for matching
    const originalByPath = new Map<string, ContentBlock>();
    for (const block of originalBlocks) {
      originalByPath.set(block.path, block);
    }

    const currentByPath = new Map<string, ContentBlock>();
    for (const block of currentBlocks) {
      currentByPath.set(block.path, block);
    }

    // Compute block-level diff results
    const blockDiffs: BlockDiffResult[] = [];
    const processedPaths = new Set<string>();
    let totalAdded = 0;
    let totalRemoved = 0;

    // Process current blocks (find modified, unchanged, added)
    for (const block of currentBlocks) {
      processedPaths.add(block.path);
      const originalBlock = originalByPath.get(block.path);

      if (!originalBlock) {
        // Added block
        const wordCount = this.countWords(block.textContent);
        totalAdded += wordCount;
        blockDiffs.push({
          type: 'added',
          path: block.path,
          newBlock: block,
          wordsAdded: wordCount,
        });
      } else if (originalBlock.textContent === block.textContent) {
        // Unchanged block
        blockDiffs.push({
          type: 'unchanged',
          path: block.path,
          originalBlock,
          newBlock: block,
        });
      } else {
        // Modified block - compute inline diff
        const inlineDiff = this.computeInlineDiff(originalBlock.textContent, block.textContent);
        totalAdded += inlineDiff.added;
        totalRemoved += inlineDiff.removed;
        blockDiffs.push({
          type: 'modified',
          path: block.path,
          originalBlock,
          newBlock: block,
          diffedInnerHtml: inlineDiff.html,
          wordsAdded: inlineDiff.added,
          wordsRemoved: inlineDiff.removed,
        });
      }
    }

    // Process removed blocks (in original but not in current)
    for (const block of originalBlocks) {
      if (!processedPaths.has(block.path)) {
        const wordCount = this.countWords(block.textContent);
        totalRemoved += wordCount;
        blockDiffs.push({
          type: 'removed',
          path: block.path,
          originalBlock: block,
          wordsRemoved: wordCount,
        });
      }
    }

    // Apply the diffs to the current document
    this.applyBlockDiffs(currentDoc, blockDiffs);

    // Inject diff styles
    this.injectDiffStyles(currentDoc);

    // Inject header
    this.injectDiffHeader(currentDoc, totalAdded, totalRemoved);

    return {
      kind: 'styled',
      html: this.serializeDocument(currentDoc),
      hasVisibleChanges: totalAdded > 0 || totalRemoved > 0,
      stats: { added: totalAdded, removed: totalRemoved },
    };
  }

  /**
   * Extracts "content blocks" from a body element.
   * These are meaningful sections of content that we can compare.
   */
  private extractContentBlocks(element: Element, parentPath: string): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    const children = Array.from(element.children);

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const tagName = child.tagName.toLowerCase();
      const path = parentPath ? `${parentPath}/${tagName}[${i}]` : `${tagName}[${i}]`;

      // Skip script, style, and other non-visible elements
      if (tagName === 'script' || tagName === 'style' || tagName === 'noscript') {
        continue;
      }

      const textContent = this.extractVisibleTextFromElement(child);

      // If this is a block element with meaningful content, add it
      if (this.config.blockElements.includes(tagName) && textContent.trim()) {
        blocks.push({
          path,
          element: child,
          textContent,
          outerHtml: child.outerHTML,
        });
      }

      // Recursively process children (but don't double-count)
      // Only recurse into elements that we haven't already captured
      if (!this.config.blockElements.includes(tagName) || child.children.length > 0) {
        const childBlocks = this.extractContentBlocks(child, path);
        blocks.push(...childBlocks);
      }
    }

    return blocks;
  }

  /**
   * Applies block diffs to the current document.
   */
  private applyBlockDiffs(doc: Document, blockDiffs: BlockDiffResult[]): void {
    // Group diffs by type for processing
    const modifiedDiffs = blockDiffs.filter(d => d.type === 'modified');
    const addedDiffs = blockDiffs.filter(d => d.type === 'added');
    const removedDiffs = blockDiffs.filter(d => d.type === 'removed');
    const unchangedDiffs = blockDiffs.filter(d => d.type === 'unchanged');

    // Handle modified blocks - replace their content with diffed version
    for (const diff of modifiedDiffs) {
      if (diff.newBlock && diff.diffedInnerHtml) {
        const element = this.findElementByPath(doc.body, diff.path);
        if (element) {
          // For text-heavy elements, replace text content with diff
          this.applyTextDiffToElement(element, diff.diffedInnerHtml);
        }
      }
    }

    // Handle added blocks - wrap them in an "added" marker
    for (const diff of addedDiffs) {
      if (diff.newBlock) {
        const element = this.findElementByPath(doc.body, diff.path);
        if (element) {
          element.classList.add('meadow-diff-added-block');
        }
      }
    }

    // Handle removed blocks - inject them with "removed" marker
    // This is tricky: we need to find where to insert them
    for (const diff of removedDiffs) {
      if (diff.originalBlock) {
        this.injectRemovedBlock(doc, diff);
      }
    }

    // Handle unchanged blocks - make them collapsible if they're large enough
    for (const diff of unchangedDiffs) {
      if (diff.newBlock) {
        const element = this.findElementByPath(doc.body, diff.path);
        if (element) {
          const wordCount = this.countWords(diff.newBlock.textContent);
          if (wordCount >= this.config.minCollapsibleWords) {
            this.makeCollapsible(doc, element, wordCount);
          }
        }
      }
    }
  }

  /**
   * Finds an element by its path in the body.
   */
  private findElementByPath(body: Element | null, path: string): Element | null {
    if (!body) return null;

    const parts = path.split('/');
    let current: Element = body;

    for (const part of parts) {
      const match = part.match(/^(\w+)\[(\d+)\]$/);
      if (!match) continue;

      const [, tagName, indexStr] = match;
      const index = parseInt(indexStr, 10);

      // Find all children with this tag name
      const children = Array.from(current.children).filter(
        c => c.tagName.toLowerCase() === tagName.toLowerCase()
      );

      if (index >= children.length) {
        return null;
      }

      current = children[index];
    }

    return current;
  }

  /**
   * Applies inline text diff to an element, preserving child structure where possible.
   * For elements containing links or other important inline structures, we use
   * a text-node-based approach to preserve the DOM structure.
   */
  private applyTextDiffToElement(element: Element, diffHtml: string): void {
    // Check if the element contains complex nested structure that we shouldn't disturb
    const hasDeepNesting = element.querySelector('div, section, article, ul, ol, table');
    
    if (hasDeepNesting) {
      // For complex structures, wrap the whole thing and add a note
      element.classList.add('meadow-diff-modified-block');
      // Add a small indicator that this section has changes
      const indicator = element.ownerDocument.createElement('span');
      indicator.className = 'meadow-diff-change-indicator';
      indicator.textContent = '●';
      indicator.title = 'This section contains changes';
      element.insertBefore(indicator, element.firstChild);
      return;
    }

    // Check if element has links or other important inline elements we should preserve
    const hasInlineElements = element.querySelector('a, strong, em, code, span, b, i');
    
    if (hasInlineElements) {
      // Apply diff while preserving inline structure by walking text nodes
      this.applyDiffToTextNodes(element);
      element.classList.add('meadow-diff-modified-block');
    } else {
      // For simple text-only elements, we can safely replace the content
      element.innerHTML = diffHtml;
      element.classList.add('meadow-diff-modified-block');
    }
  }

  /**
   * Applies diff highlighting to text nodes within an element while preserving
   * the DOM structure (links, strong tags, etc.).
   */
  private applyDiffToTextNodes(element: Element): void {
    // For each text node in the element, we need to diff its content
    // This is complex because we need to maintain the overall diff context
    // For now, we'll use a simpler approach: mark the entire element as modified
    // and let the user see the inline diff in the collapsible section
    
    // Get the original text content by walking text nodes
    const textNodes: Text[] = [];
    const walker = element.ownerDocument.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    let node: Node | null = walker.nextNode();
    while (node) {
      textNodes.push(node as Text);
      node = walker.nextNode();
    }
    
    // Add a visual indicator that this section was modified
    const indicator = element.ownerDocument.createElement('span');
    indicator.className = 'meadow-diff-change-indicator';
    indicator.textContent = '●';
    indicator.title = 'This section contains changes';
    element.insertBefore(indicator, element.firstChild);
  }

  /**
   * Injects a removed block into the document.
   */
  private injectRemovedBlock(doc: Document, diff: BlockDiffResult): void {
    if (!diff.originalBlock) return;

    // Parse the path to find the insertion point
    const pathParts = diff.path.split('/');
    const lastPart = pathParts.pop();
    const parentPath = pathParts.join('/');

    const match = lastPart?.match(/^(\w+)\[(\d+)\]$/);
    if (!match) return;

    const [, , indexStr] = match;
    const index = parseInt(indexStr, 10);

    // Find the parent element
    const parent = parentPath 
      ? this.findElementByPath(doc.body, parentPath)
      : doc.body;

    if (!parent) return;

    // Create a wrapper for the removed content
    const wrapper = doc.createElement('div');
    wrapper.className = 'meadow-diff-removed-block';
    wrapper.innerHTML = diff.originalBlock.outerHtml;

    // Find the insertion point
    const children = Array.from(parent.children);
    if (index < children.length) {
      parent.insertBefore(wrapper, children[index]);
    } else {
      parent.appendChild(wrapper);
    }
  }

  /**
   * Makes an element collapsible.
   */
  private makeCollapsible(doc: Document, element: Element, wordCount: number): void {
    const details = doc.createElement('details');
    details.className = 'meadow-diff-unchanged-details';

    const summary = doc.createElement('summary');
    summary.className = 'meadow-diff-unchanged-summary';
    summary.textContent = `${wordCount} unchanged words`;

    // Clone the element's content
    const content = doc.createElement('div');
    content.className = 'meadow-diff-unchanged-content';
    content.innerHTML = element.innerHTML;

    details.appendChild(summary);
    details.appendChild(content);

    // Replace the element's content
    element.innerHTML = '';
    element.appendChild(details);
    element.classList.add('meadow-diff-collapsible');
  }

  /**
   * Computes inline word-level diff between two strings.
   */
  private computeInlineDiff(original: string, current: string): { html: string; added: number; removed: number } {
    const originalTokens = this.tokenize(original);
    const currentTokens = this.tokenize(current);

    const diffTokens = this.diffTokens(originalTokens, currentTokens);

    let added = 0;
    let removed = 0;
    const htmlParts: string[] = [];

    for (const token of diffTokens) {
      const escaped = this.escapeHtml(token.value);
      if (token.type === 'added') {
        htmlParts.push(`<ins class="meadow-diff-ins">${escaped}</ins>`);
        if (token.value.trim()) added++;
      } else if (token.type === 'removed') {
        htmlParts.push(`<del class="meadow-diff-del">${escaped}</del>`);
        if (token.value.trim()) removed++;
      } else {
        htmlParts.push(escaped);
      }
    }

    return { html: htmlParts.join(''), added, removed };
  }

  /**
   * Tokenizes text into words and whitespace.
   */
  private tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    const re = /(\s+|[^\s]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const v = m[0];
      tokens.push({ type: /^\s+$/.test(v) ? 'ws' : 'text', value: v });
    }
    return tokens;
  }

  /**
   * Computes diff between two token arrays using LCS.
   */
  private diffTokens(original: Token[], current: Token[]): DiffToken[] {
    const lcs = this.computeLcs(original, current);
    const out: DiffToken[] = [];

    let oldIdx = 0;
    let newIdx = 0;

    for (const match of lcs) {
      while (oldIdx < match.oldIndex) {
        out.push({ type: 'removed', value: original[oldIdx].value });
        oldIdx++;
      }
      while (newIdx < match.newIndex) {
        out.push({ type: 'added', value: current[newIdx].value });
        newIdx++;
      }
      out.push({ type: 'unchanged', value: original[oldIdx].value });
      oldIdx++;
      newIdx++;
    }

    while (oldIdx < original.length) {
      out.push({ type: 'removed', value: original[oldIdx].value });
      oldIdx++;
    }
    while (newIdx < current.length) {
      out.push({ type: 'added', value: current[newIdx].value });
      newIdx++;
    }

    return this.simplifyWhitespaceDiff(out);
  }

  /**
   * Simplifies whitespace differences to reduce noise.
   */
  private simplifyWhitespaceDiff(tokens: DiffToken[]): DiffToken[] {
    const simplified: DiffToken[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const cur = tokens[i];
      const next = tokens[i + 1];
      // If we have removed whitespace followed by added whitespace, treat as unchanged
      if (
        cur &&
        next &&
        cur.type === 'removed' &&
        next.type === 'added' &&
        /^\s+$/.test(cur.value) &&
        /^\s+$/.test(next.value)
      ) {
        simplified.push({ type: 'unchanged', value: next.value });
        i++; // skip next
        continue;
      }
      simplified.push(cur);
    }
    return simplified;
  }

  /**
   * Computes LCS of two token arrays.
   */
  private computeLcs(old: Token[], curr: Token[]): Array<{ oldIndex: number; newIndex: number }> {
    const m = old.length;
    const n = curr.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (old[i - 1].value === curr[j - 1].value) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const matches: Array<{ oldIndex: number; newIndex: number }> = [];
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
      if (old[i - 1].value === curr[j - 1].value) {
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

  /**
   * Extracts visible text from an entire document.
   */
  private extractVisibleText(doc: Document): string {
    const body = doc.body || doc.documentElement;
    if (!body) return '';
    return this.extractVisibleTextFromElement(body);
  }

  /**
   * Extracts visible text from an element.
   */
  private extractVisibleTextFromElement(element: Element): string {
    const parts: string[] = [];
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);

    const isSkippable = (n: Node | null): boolean => {
      let cur: Node | null = n;
      while (cur && cur !== element) {
        if (cur.nodeType === Node.ELEMENT_NODE) {
          const el = cur as HTMLElement;
          const tag = el.tagName.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'noscript') return true;
          if (el.hasAttribute('hidden')) return true;
          const ariaHidden = el.getAttribute('aria-hidden');
          if (ariaHidden === 'true') return true;
          const style = el.getAttribute('style') || '';
          if (/display\s*:\s*none/i.test(style)) return true;
          if (/visibility\s*:\s*hidden/i.test(style)) return true;
        }
        cur = cur.parentNode;
      }
      return false;
    };

    let node: Node | null = walker.nextNode();
    while (node) {
      if (!isSkippable(node.parentNode)) {
        const text = node.nodeValue ?? '';
        parts.push(text.replace(/\r\n/g, '\n'));
      }
      node = walker.nextNode();
    }

    const joined = parts.join(' ');
    return joined
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Counts words in a string.
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter(w => w.trim()).length;
  }

  /**
   * Escapes HTML special characters.
   */
  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Injects a <base> tag to help resolve relative URLs in stylesheets and scripts.
   * Converts a file path like "/path/to/preview/ai/page.html" to "file:///path/to/preview/ai/"
   */
  private injectBaseTag(doc: Document, filePath: string): void {
    if (!doc.head) return;

    // Remove any existing base tag
    const existingBase = doc.head.querySelector('base');
    if (existingBase) {
      existingBase.remove();
    }

    // Extract the directory from the file path
    const lastSlash = filePath.lastIndexOf('/');
    const directory = lastSlash >= 0 ? filePath.substring(0, lastSlash + 1) : filePath;

    // Create and insert the base tag
    const baseTag = doc.createElement('base');
    baseTag.href = `file://${directory}`;
    
    // Insert as first child of head to ensure it applies to all subsequent URLs
    doc.head.insertBefore(baseTag, doc.head.firstChild);
  }

  /**
   * Injects diff-related CSS styles into the document.
   */
  private injectDiffStyles(doc: Document): void {
    const style = doc.createElement('style');
    style.textContent = `
      /* Meadow Diff Styles */
      .meadow-diff-header {
        position: sticky;
        top: 0;
        z-index: 1000;
        background: rgba(255,255,255,0.97);
        backdrop-filter: blur(8px);
        border-bottom: 1px solid #e5e7eb;
        padding: 10px 16px;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        font-size: 14px;
      }
      .meadow-diff-title {
        font-weight: 600;
        color: #374151;
      }
      .meadow-diff-stats {
        font-family: ui-monospace, monospace;
        font-size: 13px;
        color: #6b7280;
      }
      .meadow-diff-stats .added { color: #16a34a; }
      .meadow-diff-stats .removed { color: #dc2626; }

      /* Inline diff highlights */
      ins.meadow-diff-ins {
        background: #bbf7d0;
        color: inherit;
        text-decoration: none;
        border-radius: 2px;
        padding: 0 2px;
      }
      del.meadow-diff-del {
        background: #fecaca;
        color: #991b1b;
        text-decoration: line-through;
        border-radius: 2px;
        padding: 0 2px;
      }

      /* Block-level markers */
      .meadow-diff-added-block {
        background: linear-gradient(to right, #dcfce7 0%, #dcfce7 4px, transparent 4px);
        padding-left: 12px;
        border-radius: 4px;
      }
      .meadow-diff-removed-block {
        background: linear-gradient(to right, #fee2e2 0%, #fee2e2 4px, transparent 4px);
        padding-left: 12px;
        border-radius: 4px;
        opacity: 0.75;
      }
      .meadow-diff-removed-block * {
        text-decoration: line-through;
        color: #991b1b;
      }
      .meadow-diff-modified-block {
        background: linear-gradient(to right, #fef3c7 0%, #fef3c7 4px, transparent 4px);
        padding-left: 12px;
        border-radius: 4px;
      }

      /* Change indicator */
      .meadow-diff-change-indicator {
        color: #f59e0b;
        font-size: 0.75em;
        margin-right: 4px;
        vertical-align: super;
      }

      /* Collapsible unchanged sections */
      .meadow-diff-unchanged-details {
        margin: 0;
      }
      .meadow-diff-unchanged-summary {
        cursor: pointer;
        user-select: none;
        color: #6b7280;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 9999px;
        padding: 4px 12px;
        font-size: 12px;
        font-family: ui-sans-serif, system-ui, sans-serif;
        display: inline-block;
        margin: 8px 0;
      }
      .meadow-diff-unchanged-summary:hover {
        background: #f3f4f6;
        color: #374151;
      }
      .meadow-diff-unchanged-details[open] .meadow-diff-unchanged-summary {
        background: #e5e7eb;
      }
      .meadow-diff-unchanged-content {
        border-left: 2px solid #e5e7eb;
        padding-left: 12px;
        margin-left: 8px;
        margin-top: 8px;
      }

      /* No changes message */
      .meadow-diff-no-changes {
        background: #f0fdf4;
        border: 1px solid #bbf7d0;
        color: #166534;
        padding: 12px 16px;
        border-radius: 8px;
        margin-bottom: 16px;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 14px;
      }
    `;
    doc.head?.appendChild(style);
  }

  /**
   * Injects the diff header into the document.
   */
  private injectDiffHeader(doc: Document, added: number, removed: number): void {
    const header = doc.createElement('div');
    header.className = 'meadow-diff-header';
    header.innerHTML = `
      <div class="meadow-diff-title">Styled Diff</div>
      <div class="meadow-diff-stats">
        <span class="added">+${added}</span>
        <span style="margin: 0 8px;">·</span>
        <span class="removed">−${removed}</span>
      </div>
    `;
    doc.body?.insertBefore(header, doc.body.firstChild);
  }

  /**
   * Injects a "no changes" message into the document.
   */
  private injectNoChangesHeader(doc: Document): void {
    const msg = doc.createElement('div');
    msg.className = 'meadow-diff-no-changes';
    msg.textContent = 'No visible text changes. Try "Code" view to see structural or styling changes.';
    doc.body?.insertBefore(msg, doc.body.firstChild);
  }

  /**
   * Serializes a document back to an HTML string.
   */
  private serializeDocument(doc: Document): string {
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  }
}

// Export a singleton instance for convenience
export const styledHtmlDiffer = new StyledHtmlDiffer();
