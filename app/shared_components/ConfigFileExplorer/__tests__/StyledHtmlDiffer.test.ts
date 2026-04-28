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

import { describe, it, expect } from 'vitest';
import { StyledHtmlDiffer } from '../StyledHtmlDiffer';

describe('StyledHtmlDiffer', () => {
  const differ = new StyledHtmlDiffer();

  // Helper to create a minimal HTML document
  const makeHtml = (body: string, style = ''): string => `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Test</title>
        ${style ? `<style>${style}</style>` : ''}
      </head>
      <body>${body}</body>
    </html>
  `;

  describe('basic diff detection', () => {
    it('should detect no changes when documents are identical', () => {
      const html = makeHtml('<p>Hello world</p>');
      const result = differ.diff(html, html);
      
      expect(result.kind).toBe('styled');
      expect(result.hasVisibleChanges).toBe(false);
      expect(result.stats.added).toBe(0);
      expect(result.stats.removed).toBe(0);
    });

    it('should handle new file (null original)', () => {
      const current = makeHtml('<p>Hello world</p>');
      const result = differ.diff(null, current);
      
      expect(result.kind).toBe('styled');
      expect(result.hasVisibleChanges).toBe(true);
      expect(result.stats.added).toBeGreaterThan(0);
      expect(result.stats.removed).toBe(0);
      expect(result.notes).toContain('New file: showing all content as added.');
    });

    it('should detect text additions', () => {
      const original = makeHtml('<p>Hello</p>');
      const current = makeHtml('<p>Hello world</p>');
      const result = differ.diff(original, current);
      
      expect(result.hasVisibleChanges).toBe(true);
      expect(result.stats.added).toBeGreaterThan(0);
    });

    it('should detect text removals', () => {
      const original = makeHtml('<p>Hello world</p>');
      const current = makeHtml('<p>Hello</p>');
      const result = differ.diff(original, current);
      
      expect(result.hasVisibleChanges).toBe(true);
      expect(result.stats.removed).toBeGreaterThan(0);
    });

    it('should detect text modifications', () => {
      const original = makeHtml('<p>Hello world</p>');
      const current = makeHtml('<p>Hello universe</p>');
      const result = differ.diff(original, current);
      
      expect(result.hasVisibleChanges).toBe(true);
      expect(result.stats.added).toBeGreaterThan(0);
      expect(result.stats.removed).toBeGreaterThan(0);
    });
  });

  describe('HTML output structure', () => {
    it('should produce valid HTML document', () => {
      const original = makeHtml('<p>Hello</p>');
      const current = makeHtml('<p>Hello world</p>');
      const result = differ.diff(original, current);
      
      expect(result.html).toContain('<!DOCTYPE html>');
      expect(result.html).toContain('<html');
      expect(result.html).toContain('</html>');
    });

    it('should inject diff styles', () => {
      const original = makeHtml('<p>Hello</p>');
      const current = makeHtml('<p>Hello world</p>');
      const result = differ.diff(original, current);
      
      expect(result.html).toContain('.meadow-diff-ins');
      expect(result.html).toContain('.meadow-diff-del');
    });

    it('should include diff header with stats', () => {
      const original = makeHtml('<p>Hello</p>');
      const current = makeHtml('<p>Hello world</p>');
      const result = differ.diff(original, current);
      
      expect(result.html).toContain('meadow-diff-header');
      expect(result.html).toContain('Styled Diff');
    });

    it('should preserve original CSS links', () => {
      const style = 'body { font-family: serif; }';
      const original = makeHtml('<p>Hello</p>', style);
      const current = makeHtml('<p>Hello world</p>', style);
      const result = differ.diff(original, current);
      
      expect(result.html).toContain('font-family: serif');
    });
  });

  describe('inline diff markers', () => {
    it('should wrap added text in <ins> tags', () => {
      const original = makeHtml('<p>Hello</p>');
      const current = makeHtml('<p>Hello world</p>');
      const result = differ.diff(original, current);
      
      expect(result.html).toContain('<ins class="meadow-diff-ins">world</ins>');
    });

    it('should wrap removed text in <del> tags', () => {
      const original = makeHtml('<p>Hello world</p>');
      const current = makeHtml('<p>Hello</p>');
      const result = differ.diff(original, current);
      
      expect(result.html).toContain('<del class="meadow-diff-del">world</del>');
    });

    it('should show both added and removed for modifications', () => {
      const original = makeHtml('<p>I like cats</p>');
      const current = makeHtml('<p>I like dogs</p>');
      const result = differ.diff(original, current);
      
      expect(result.html).toContain('<del class="meadow-diff-del">cats</del>');
      expect(result.html).toContain('<ins class="meadow-diff-ins">dogs</ins>');
    });
  });

  describe('block-level handling', () => {
    it('should detect added blocks', () => {
      const original = makeHtml('<p>First paragraph</p>');
      const current = makeHtml('<p>First paragraph</p><p>Second paragraph</p>');
      const result = differ.diff(original, current);
      
      expect(result.hasVisibleChanges).toBe(true);
      expect(result.html).toContain('meadow-diff-added-block');
    });

    it('should detect removed blocks', () => {
      const original = makeHtml('<p>First paragraph</p><p>Second paragraph</p>');
      const current = makeHtml('<p>First paragraph</p>');
      const result = differ.diff(original, current);
      
      expect(result.hasVisibleChanges).toBe(true);
      expect(result.html).toContain('meadow-diff-removed-block');
    });

    it('should handle modified blocks', () => {
      const original = makeHtml('<p>Hello world</p>');
      const current = makeHtml('<p>Hello universe</p>');
      const result = differ.diff(original, current);
      
      expect(result.html).toContain('meadow-diff-modified-block');
    });
  });

  describe('collapsible unchanged sections', () => {
    it('should make large unchanged sections collapsible', () => {
      // Create content with many words
      const largeContent = 'word '.repeat(50);
      const original = makeHtml(`<p>${largeContent}</p><p>Change this</p>`);
      const current = makeHtml(`<p>${largeContent}</p><p>Changed text</p>`);
      const result = differ.diff(original, current);
      
      expect(result.html).toContain('meadow-diff-unchanged-details');
      expect(result.html).toContain('meadow-diff-unchanged-summary');
      expect(result.html).toContain('unchanged words');
    });

    it('should NOT collapse small unchanged sections', () => {
      // Use content with fewer words than minCollapsibleWords (default: 15)
      const smallContent = 'This is a short sentence with only ten words total.';
      const original = makeHtml(`<p>${smallContent}</p><p>Change this text here</p>`);
      const current = makeHtml(`<p>${smallContent}</p><p>Modified this text now</p>`);
      const result = differ.diff(original, current);
      
      // Small sections (under 15 words) should not be collapsible
      // We check that the small content paragraph is NOT wrapped in details
      // It should appear directly, not inside a collapsible
      expect(result.html).toContain(smallContent);
      
      // The collapsible sections, if any, should only be for large blocks
      // Since our test paragraph has ~10 words (under the 15-word threshold), 
      // it should not be collapsed
      const summaryMatches = result.html.match(/unchanged words/g);
      // Either null (no collapses) or the count should not match our small paragraph
      if (summaryMatches) {
        // If there are collapsible sections, they shouldn't contain our small content
        expect(result.html).not.toMatch(/10 unchanged words/);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty body', () => {
      const original = makeHtml('');
      const current = makeHtml('');
      const result = differ.diff(original, current);
      
      expect(result.kind).toBe('styled');
      expect(result.hasVisibleChanges).toBe(false);
    });

    it('should ignore script tags', () => {
      const original = makeHtml('<script>console.log("old")</script><p>Hello</p>');
      const current = makeHtml('<script>console.log("new")</script><p>Hello</p>');
      const result = differ.diff(original, current);
      
      // Script changes should not count as visible changes
      expect(result.hasVisibleChanges).toBe(false);
    });

    it('should ignore style tags', () => {
      const original = makeHtml('<style>.old { color: red; }</style><p>Hello</p>');
      const current = makeHtml('<style>.new { color: blue; }</style><p>Hello</p>');
      const result = differ.diff(original, current);
      
      expect(result.hasVisibleChanges).toBe(false);
    });

    it('should handle whitespace-only changes gracefully', () => {
      const original = makeHtml('<p>Hello  world</p>');
      const current = makeHtml('<p>Hello world</p>');
      const result = differ.diff(original, current);
      
      // Whitespace normalization should make these equivalent
      expect(result.hasVisibleChanges).toBe(false);
    });

    it('should handle special HTML characters', () => {
      const original = makeHtml('<p>2 &lt; 3</p>');
      const current = makeHtml('<p>2 &lt; 4</p>');
      const result = differ.diff(original, current);
      
      expect(result.hasVisibleChanges).toBe(true);
      expect(result.html).not.toContain('undefined');
    });

    it('should handle nested structures', () => {
      const original = makeHtml('<div><p>Hello <strong>world</strong></p></div>');
      const current = makeHtml('<div><p>Hello <strong>universe</strong></p></div>');
      const result = differ.diff(original, current);
      
      expect(result.hasVisibleChanges).toBe(true);
    });
  });

  describe('complex documents', () => {
    it('should handle realistic HTML structure', () => {
      const original = makeHtml(`
        <header>
          <nav>Home > Page</nav>
        </header>
        <main>
          <h1>My Page Title</h1>
          <p>This is the first paragraph with some content.</p>
          <p>This is the second paragraph.</p>
        </main>
        <footer>
          <p>Footer content</p>
        </footer>
      `);
      
      const current = makeHtml(`
        <header>
          <nav>Home > Page</nav>
        </header>
        <main>
          <h1>My Page Title</h1>
          <p>This is the first paragraph with different content.</p>
          <p>This is a new paragraph.</p>
        </main>
        <footer>
          <p>Footer content</p>
        </footer>
      `);
      
      const result = differ.diff(original, current);
      
      expect(result.hasVisibleChanges).toBe(true);
      expect(result.html).toContain('<!DOCTYPE html>');
    });

    it('should preserve links and anchors', () => {
      const original = makeHtml('<p><a href="page.html">Click here</a></p>');
      const current = makeHtml('<p><a href="page.html">Click now</a></p>');
      const result = differ.diff(original, current);
      
      // The link structure should be preserved
      expect(result.html).toContain('href="page.html"');
      // The change should be detected
      expect(result.hasVisibleChanges).toBe(true);
      // The element should be marked as modified
      expect(result.html).toContain('meadow-diff-modified-block');
    });

    it('should handle transcluded content blocks', () => {
      const original = makeHtml(`
        <div class="transcluded">
          <div class="transcluded-content">
            <p>Original transcluded text</p>
          </div>
        </div>
      `);
      const current = makeHtml(`
        <div class="transcluded">
          <div class="transcluded-content">
            <p>Modified transcluded text</p>
          </div>
        </div>
      `);
      const result = differ.diff(original, current);
      
      expect(result.hasVisibleChanges).toBe(true);
    });
  });

  describe('configuration options', () => {
    it('should respect custom minCollapsibleWords', () => {
      const customDiffer = new StyledHtmlDiffer({ minCollapsibleWords: 5 });
      const content = 'one two three four five six seven eight nine ten';
      const original = makeHtml(`<p>${content}</p><p>Change this</p>`);
      const current = makeHtml(`<p>${content}</p><p>Changed text</p>`);
      
      const result = customDiffer.diff(original, current);
      
      // With lower threshold, the 10-word paragraph should be collapsible
      expect(result.html).toContain('meadow-diff-unchanged-details');
    });
  });

  describe('filePath option for relative URLs', () => {
    it('should inject a base tag when filePath is provided', () => {
      const original = makeHtml('<p>Hello</p>');
      const current = makeHtml('<p>Hello world</p>');
      const result = differ.diff(original, current, { filePath: '/path/to/preview/page.html' });
      
      // Should have a base tag with the directory path
      expect(result.html).toContain('<base href="file:///path/to/preview/"');
    });

    it('should not inject a base tag when filePath is not provided', () => {
      const original = makeHtml('<p>Hello</p>');
      const current = makeHtml('<p>Hello world</p>');
      const result = differ.diff(original, current);
      
      // Should not have a base tag
      expect(result.html).not.toContain('<base');
    });

    it('should handle filePath for new files', () => {
      const current = makeHtml('<p>Hello world</p>');
      const result = differ.diff(null, current, { filePath: '/path/to/preview/page.html' });
      
      // Should still have a base tag for new files
      expect(result.html).toContain('<base href="file:///path/to/preview/"');
    });
  });
});
