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

import { devSamplePages } from './samplePages';

interface GlobalCardEntry {
  guid: string;
  kind: string;
  promptHtml: string;
  answerHtml: string;
  siblingGroup?: string;
  pageId: string;
  pageTitle: string;
}

function extractCardsFromHtml(bodyHtml: string, pageId: string, pageTitle: string): GlobalCardEntry[] {
  const template = document.createElement('template');
  template.innerHTML = bodyHtml;
  const cardElements = template.content.querySelectorAll('meadow-srs-card');
  const cards: GlobalCardEntry[] = [];

  cardElements.forEach((el) => {
    const guid = el.getAttribute('guid')?.trim();
    const kind = el.getAttribute('kind')?.trim();
    if (!guid || !kind) return;

    const promptEl = el.querySelector('meadow-srs-prompt');
    const answerEl = el.querySelector('meadow-srs-answer');
    if (!promptEl || !answerEl) return;

    const card: GlobalCardEntry = {
      guid,
      kind,
      promptHtml: promptEl.innerHTML.trim(),
      answerHtml: answerEl.innerHTML.trim(),
      pageId,
      pageTitle,
    };

    const siblingGroup = el.getAttribute('sibling-group')?.trim();
    if (siblingGroup) {
      card.siblingGroup = siblingGroup;
    }

    cards.push(card);
  });

  return cards;
}

/**
 * Build a mock srs-all-cards.json payload for a given siteGuid.
 * Includes cards from ALL sample pages (including the current one,
 * since the controller deduplicates page-local cards).
 * Also adds some extra "other page" cards so the All pages tab
 * visibly has more cards than This page.
 */
export function devGlobalCards(siteGuid: string): { version: number; siteGuid: string; cards: GlobalCardEntry[] } {
  // Extract cards from all sample pages
  const allCards: GlobalCardEntry[] = [];
  for (const page of devSamplePages) {
    allCards.push(...extractCardsFromHtml(page.bodyHtml, page.pageId, page.title));
  }

  // Add extra cards that don't exist on any sample page
  allCards.push(
    {
      guid: 'global-extra-001',
      kind: 'basic',
      promptHtml: 'What is the speed of light?',
      answerHtml: 'Approximately 299,792,458 m/s',
      pageId: 'other/physics.html',
      pageTitle: 'Physics fundamentals',
    },
    {
      guid: 'global-extra-002',
      kind: 'basic',
      promptHtml: 'Who wrote <em>1984</em>?',
      answerHtml: 'George Orwell',
      pageId: 'other/literature.html',
      pageTitle: 'Literature',
    },
    {
      guid: 'global-extra-003',
      kind: 'bidirectional',
      promptHtml: 'HTTP',
      answerHtml: 'HyperText Transfer Protocol',
      pageId: 'other/networking.html',
      pageTitle: 'Networking glossary',
    },
    {
      guid: 'global-extra-004',
      kind: 'basic',
      promptHtml: 'What year did the Berlin Wall fall?',
      answerHtml: '1989',
      pageId: 'other/history.html',
      pageTitle: 'History',
    },
  );

  return { version: 1, siteGuid, cards: allCards };
}
