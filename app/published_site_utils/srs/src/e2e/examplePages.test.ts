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

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { createMemoryPersistence } from '../core_logic';
import { initializeMeadowSrs } from '../ui/controller';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, '../..');

function loadExampleHtml(filename: string): string {
  return fs.readFileSync(path.join(packageRoot, 'examples', filename), 'utf8');
}

describe('example pages', () => {
  it('documents module imports in inline example and upgrades the page', () => {
    const html = loadExampleHtml('inline.html');
    expect(html).toContain(`import '/srs/ui/publicEntry.ts'`);
    expect(html).toContain('kind="bidirectional"');
    expect(html).toContain('kind="cloze"');
    expect(html).toContain('kind="multiline-basic"');

    document.body.innerHTML = `
      <main>
        <meadow-srs-card guid="623e4567f9012" kind="basic">
          <meadow-srs-prompt>Capital of France</meadow-srs-prompt>
          <meadow-srs-answer>Paris</meadow-srs-answer>
        </meadow-srs-card>
        <meadow-srs-card guid="623e4567f9013" kind="basic">
          <meadow-srs-prompt>The first programmable computer was</meadow-srs-prompt>
          <meadow-srs-answer>Analytical Engine</meadow-srs-answer>
        </meadow-srs-card>
      </main>
    `;

    const controller = initializeMeadowSrs({
      root: document,
      siteGuid: 'inline1',
      pageId: 'examples/inline.html',
      persistence: createMemoryPersistence(),
    });

    expect(document.querySelectorAll('.meadow-srs-card')).toHaveLength(2);
    controller.destroy();
  });

  it('shows explicit review launcher for the explicit example shape', () => {
    const html = loadExampleHtml('explicit.html');
    expect(html).toContain(`import '/srs/ui/publicEntry.ts'`);
    expect(html).toContain('kind="multiline-bidirectional"');
    expect(html).toContain('cloze-type="classic"');

    document.body.innerHTML = `
      <main>
        <h2>Networking</h2>
        <meadow-srs-card guid="723e4567f9012" kind="basic">
          <meadow-srs-prompt>HTTP stands for</meadow-srs-prompt>
          <meadow-srs-answer>HyperText Transfer Protocol</meadow-srs-answer>
        </meadow-srs-card>
        <meadow-srs-card guid="723e4567f9013" kind="basic">
          <meadow-srs-prompt>OSI has how many layers?</meadow-srs-prompt>
          <meadow-srs-answer>Seven</meadow-srs-answer>
        </meadow-srs-card>
      </main>
    `;

    const controller = initializeMeadowSrs({
      root: document,
      siteGuid: 'explicit1',
      pageId: 'examples/explicit.html',
      persistence: createMemoryPersistence(),
    });

    const launcher = document.querySelector<HTMLButtonElement>('.meadow-srs-launcher');
    expect(launcher).not.toBeNull();
    launcher?.click();
    expect(document.querySelector('.meadow-srs-overlay.is-open')).not.toBeNull();
    // Context only visible in site-scope overlay (all-pages tab), not in page-scope
    expect(document.querySelector('.meadow-srs-card__context')).toBeNull();
    controller.destroy();
  });

  it('supports overlay keyboard review shortcuts', () => {
    document.body.innerHTML = `
      <main>
        <meadow-srs-card guid="823e4567f9012" kind="basic">
          <meadow-srs-prompt>Capital of France</meadow-srs-prompt>
          <meadow-srs-answer>Paris</meadow-srs-answer>
        </meadow-srs-card>
      </main>
    `;

    const seededStore = {
      version: 1,
      cards: {
        '823e4567f9012': {
          cardId: '823e4567f9012',
          intervalMs: 60000,
          easeFactor: 2.5,
          dueAt: new Date(Date.now() - 60000).toISOString(),
          reviewCount: 1,
          lapseCount: 0,
        },
      },
    };
    const controller = initializeMeadowSrs({
      root: document,
      siteGuid: 'keyboard1',
      pageId: 'examples/keyboard.html',
      persistence: createMemoryPersistence({ 'meadow:srs:keyboard1': JSON.stringify(seededStore) }),
    });

    const launcher = document.querySelector<HTMLButtonElement>('.meadow-srs-launcher');
    launcher?.click();

    const overlay = document.querySelector<HTMLDivElement>('.meadow-srs-overlay');
    expect(overlay).not.toBeNull();
    overlay?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(document.querySelector('.meadow-srs-card__answer.is-visible')?.textContent).toContain('Paris');

    overlay?.dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true }));
    expect(controller.getStore().cards).toMatchObject({
      [controller.getRuntimeCards()[0].definition.id]: {
        reviewCount: 2,
      },
    });

    controller.destroy();
  });

  it('uses meadow-srs-card markup for discovery and debug metadata', () => {
    document.body.innerHTML = `
      <main>
        <h2>Networking</h2>
        <meadow-srs-card guid="923e4567f9012" kind="basic">
          <meadow-srs-prompt>What is the TCP three-way handshake?</meadow-srs-prompt>
          <meadow-srs-answer><ol><li>SYN</li><li>SYN-ACK</li><li>ACK</li></ol></meadow-srs-answer>
        </meadow-srs-card>
      </main>
    `;

    const controller = initializeMeadowSrs({
      root: document,
      siteGuid: 'blank1',
      pageId: 'examples/blank.html',
      persistence: createMemoryPersistence(),
    });

    expect(document.querySelectorAll('.meadow-srs-card')).toHaveLength(1);
    expect(controller.getReviewMode()).toBe('due');
    controller.setReviewMode('cram');
    expect(controller.getReviewMode()).toBe('cram');
    const debugGroup = controller.getDebugSourceGroups()[0];
    expect(debugGroup.sourceId).toBe('923e4567f9012');
    expect(debugGroup.contextPath).toEqual(['Networking']);
    expect(debugGroup.blocks[0].html).toContain('<meadow-srs-card guid="923e4567f9012" kind="basic">');
    controller.destroy();
  });

  it('renders cloze cards without kind labels', () => {
    document.body.innerHTML = `
      <main>
        <meadow-srs-card guid="cloze-1" kind="cloze" cloze-type="simplified" sibling-group="cloze-parent">
          <meadow-srs-prompt>Brazilians speak <span class="meadow-srs-cloze-blank">...</span>.</meadow-srs-prompt>
          <meadow-srs-answer>Brazilians speak Portuguese.</meadow-srs-answer>
        </meadow-srs-card>
      </main>
    `;

    const controller = initializeMeadowSrs({
      root: document,
      siteGuid: 'cloze1',
      pageId: 'examples/cloze.html',
      persistence: createMemoryPersistence(),
    });

    // Kind badges are not rendered
    expect(document.querySelector('.meadow-srs-card__kind')).toBeNull();

    const launcher = document.querySelector<HTMLButtonElement>('.meadow-srs-launcher');
    launcher?.click();
    expect(document.querySelector('.meadow-srs-card__kind')).toBeNull();
    controller.destroy();
  });
});
