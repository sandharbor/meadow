/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';
import { expect, it, vi } from 'vitest';

const runtime = readFileSync(new URL(
  '../../../../../src/areas/bundle/generation/html/shared/meadow-excalidraw.js',
  import.meta.url,
), 'utf8');

interface DrawingElement { id: string; type: string; hasTextLink?: boolean; link?: string | null; text?: string }

// Runs the browser renderer on one drawing and returns the elements it hands
// to Excalidraw's exportToSvg.
async function renderedElements(textElement: string, links: Record<string, { href: string }>): Promise<DrawingElement[]> {
  const { document } = parseHTML(`<html><body>
    <span class="meadow-excalidraw-embed" data-meadow-excalidraw-src="Sketch.excalidraw.md"></span>
  </body></html>`);
  document.querySelector('span')!.setAttribute('data-meadow-excalidraw-links', JSON.stringify(links));
  const scene = { elements: [{ id: 'abc', type: 'text', hasTextLink: true, text: textElement }] };
  const md = `## Text Elements\n${textElement} ^abc\n\n%%\n## Drawing\n\`\`\`compressed-json\nscene\n\`\`\`\n%%\n`;
  const exportToSvg = vi.fn(async () => document.createElement('svg'));
  runInNewContext(runtime, {
    document,
    URLSearchParams,
    console,
    fetch: async () => ({ ok: true, text: async () => md }),
    window: {
      location: { search: '' },
      addEventListener: () => {},
      MeadowExcalidraw: { LZString: { decompressFromBase64: () => JSON.stringify(scene) }, exportToSvg },
    },
  });
  await vi.waitFor(() => expect(exportToSvg).toHaveBeenCalled());
  return (exportToSvg.mock.calls[0] as unknown as [{ elements: DrawingElement[] }])[0].elements;
}

// Obsidian ends a wikilink at the first `]]`, so its display text may hold a `]`.
it('follows a drawing link whose display text holds a ]', async () => {
  const [element] = await renderedElements('[[Page|a ] b]]', { 'Page|a ] b': { href: 'Page.html' } });
  expect(element.link).toBe('Page.html');
});

it('follows a plain drawing link', async () => {
  const [element] = await renderedElements('[[Page]]', { Page: { href: 'Page.html' } });
  expect(element.link).toBe('Page.html');
});
