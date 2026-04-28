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

import type { SrsCardDefinition } from './types';

export interface ParseContext {
  siteGuid: string;
  pageId: string;
  sourceId: string;
  contextPath?: string[];
}

export interface SrsSourceBlock {
  html: string;
  text: string;
}

function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, ' ').trim();
}

function stripTags(html: string): string {
  return normalizeHtml(html.replace(/<[^>]+>/g, ' '));
}

function createCard(
  context: ParseContext,
  id: string,
  siblingGroupKey: string,
  frontHtml: string,
  backHtml: string,
  format: SrsCardDefinition['format'],
  direction: SrsCardDefinition['direction'],
): SrsCardDefinition {
  const promptHtml = normalizeHtml(frontHtml);
  const answerHtml = normalizeHtml(backHtml);
  const searchText = stripTags(promptHtml);

  return {
    id,
    siteGuid: context.siteGuid,
    pageId: context.pageId,
    sourceId: context.sourceId,
    siblingGroupKey,
    format,
    direction,
    promptHtml,
    answerHtml,
    searchText,
    contextPath: context.contextPath ?? [],
  };
}

function readTrimmedAttribute(element: Element, name: string): string {
  return element.getAttribute(name)?.trim() ?? '';
}

function readSiblingGroupKey(element: Element, guid: string): string {
  return readTrimmedAttribute(element, 'sibling-group') || guid;
}

export function parseCardElement(
  context: ParseContext,
  element: Element,
): SrsCardDefinition[] {
  if (element.tagName !== 'MEADOW-SRS-CARD') {
    return [];
  }

  const guid = readTrimmedAttribute(element, 'guid');
  const kind = readTrimmedAttribute(element, 'kind');
  if (!guid) {
    return [];
  }

  const siblingGroupKey = readSiblingGroupKey(element, guid);

  const promptElement = element.querySelector('meadow-srs-prompt');
  const answerElement = element.querySelector('meadow-srs-answer');
  if (!promptElement || !answerElement) {
    return [];
  }

  const promptHtml = promptElement.innerHTML.trim();
  const answerHtml = answerElement.innerHTML.trim();
  if (!promptHtml || !answerHtml) {
    return [];
  }

  if (kind === 'basic') {
    return [createCard(context, guid, siblingGroupKey, promptHtml, answerHtml, 'single-basic', 'forward')];
  }

  if (kind === 'bidirectional') {
    return [
      createCard(context, `${guid}:forward`, siblingGroupKey, promptHtml, answerHtml, 'single-bidirectional', 'forward'),
      createCard(context, `${guid}:reverse`, siblingGroupKey, answerHtml, promptHtml, 'single-bidirectional', 'reverse'),
    ];
  }

  if (kind === 'multiline-basic') {
    return [createCard(context, guid, siblingGroupKey, promptHtml, answerHtml, 'multiline-basic', 'forward')];
  }

  if (kind === 'multiline-bidirectional') {
    return [
      createCard(context, `${guid}:forward`, siblingGroupKey, promptHtml, answerHtml, 'multiline-bidirectional', 'forward'),
      createCard(context, `${guid}:reverse`, siblingGroupKey, answerHtml, promptHtml, 'multiline-bidirectional', 'reverse'),
    ];
  }

  if (kind === 'cloze') {
    return [createCard(context, guid, siblingGroupKey, promptHtml, answerHtml, 'cloze', 'cloze')];
  }

  return [];
}

export function parseBlockCardGroup(
  context: ParseContext,
  blocks: SrsSourceBlock[],
): SrsCardDefinition[] {
  const markup = blocks.map((block) => block.html).join('\n').trim();
  return parseCardMarkup(context, markup);
}

export function parseCardMarkup(
  context: ParseContext,
  html: string,
): SrsCardDefinition[] {
  const normalized = html.trim();
  if (!normalized) {
    return [];
  }

  const template = document.createElement('template');
  template.innerHTML = normalized;
  const cards = Array.from(template.content.querySelectorAll('meadow-srs-card'));
  if (cards.length === 0) {
    return [];
  }

  return cards.flatMap((card, index) => parseCardElement({
    ...context,
    sourceId: cards.length === 1 ? context.sourceId : `${context.sourceId}-${index}`,
  }, card));
}
