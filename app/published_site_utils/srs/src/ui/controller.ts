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

import {
  burySiblingCards,
  clearStore,
  collectWaypoints,
  createLocalStoragePersistence,
  createSystemClock,
  getRuntimeCards,
  loadStore,
  mergeSrsSettings,
  parseCardElement,
  saveStore,
  scheduleNextReview,
} from '../core_logic';
import type {
  ParseContext,
  SrsCardDefinition,
  SrsClock,
  SrsPersistence,
  SrsReviewMode,
  SrsReviewRating,
  SrsRuntimeCard,
  SrsSettings,
  SrsSourceBlock,
  SrsStoreData,
  SrsWaypoint,
} from '../core_logic';

interface SrsCardGroup {
  mountElement: HTMLElement;
  sourceId: string;
  originalElements: HTMLElement[];
  blocks: SrsSourceBlock[];
  contextPath: string[];
  definitions: SrsCardDefinition[];
}

export interface InitializeSrsOptions {
  root?: ParentNode;
  siteGuid: string;
  pageId: string;
  clock?: SrsClock;
  persistence?: SrsPersistence;
  settings?: Partial<SrsSettings>;
  overlayContainer?: HTMLElement;
  onStateChange?: (store: SrsStoreData, runtimeCards: SrsRuntimeCard[]) => void;
}

export interface MeadowSrsController {
  destroy: () => void;
  refresh: () => void;
  clearState: () => void;
  setReviewMode: (mode: SrsReviewMode) => void;
  getReviewMode: () => SrsReviewMode;
  getStore: () => SrsStoreData;
  getRuntimeCards: () => SrsRuntimeCard[];
  getVisibleReviewCards: () => SrsRuntimeCard[];
  getWaypoints: () => SrsWaypoint[];
  getDebugSourceGroups: () => MeadowSrsDebugSourceGroup[];
  rateCard: (cardId: string, rating: SrsReviewRating) => void;
}

export interface MeadowSrsDebugSourceGroup {
  sourceId: string;
  mountElement: HTMLElement;
  contextPath: string[];
  blocks: SrsSourceBlock[];
  cardIds: string[];
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  return element;
}


function statusLabel(runtimeCard: SrsRuntimeCard): string | null {
  if (runtimeCard.buried) {
    return 'Buried until tomorrow';
  }
  if (runtimeCard.newCard) {
    return null;
  }
  if (runtimeCard.due) {
    return 'Due now';
  }

  const totalMinutes = Math.ceil(runtimeCard.dueInMs / (60 * 1000));
  if (totalMinutes < 60) {
    return `Due in ${totalMinutes} ${totalMinutes === 1 ? 'minute' : 'minutes'}`;
  }

  const totalHours = Math.ceil(totalMinutes / 60);
  if (totalHours < 24) {
    return `Due in ${totalHours} ${totalHours === 1 ? 'hour' : 'hours'}`;
  }

  const totalDays = Math.ceil(totalHours / 24);
  return `Due in ${totalDays} ${totalDays === 1 ? 'day' : 'days'}`;
}


function isHeading(element: Element): element is HTMLHeadingElement {
  return /^H[1-6]$/.test(element.tagName);
}

function trimHeadingContext(contextPath: string[], level: number): string[] {
  return [...contextPath.slice(0, Math.max(level - 1, 0))];
}

function extractBlocksFromElement(element: HTMLElement): SrsSourceBlock[] {
  return [{
    html: element.outerHTML,
    text: element.textContent?.trim() ?? '',
  }];
}

function createCandidate(
  siteGuid: string,
  pageId: string,
  sourceId: string,
  originalElements: HTMLElement[],
  blocks: SrsSourceBlock[],
  contextPath: string[],
): SrsCardGroup | null {
  const parseContext: ParseContext = {
    siteGuid,
    pageId,
    sourceId,
    contextPath,
  };

  const definitions = parseCardElement(parseContext, originalElements[0]);

  if (definitions.length === 0) {
    return null;
  }

  const mountElement = createElement('div', 'meadow-srs-upgraded');
  return {
    mountElement,
    sourceId,
    originalElements,
    blocks,
    contextPath,
    definitions,
  };
}

function discoverCardGroups(root: ParentNode, siteGuid: string, pageId: string): SrsCardGroup[] {
  const main = root.querySelector<HTMLElement>('main');
  if (!main) {
    return [];
  }

  const groups: SrsCardGroup[] = [];
  let contextPath: string[] = [];
  let sourceCounter = 0;

  const visit = (parent: Element) => {
    Array.from(parent.children).forEach((child) => {
      if (!(child instanceof HTMLElement)) {
        return;
      }

      if (isHeading(child)) {
        const level = Number.parseInt(child.tagName.slice(1), 10);
        const nextContext = trimHeadingContext(contextPath, level);
        nextContext[level - 1] = child.textContent?.trim() ?? '';
        contextPath = nextContext.filter(Boolean);
        return;
      }

      if (child.tagName === 'MEADOW-SRS-CARD') {
        const sourceId = child.getAttribute('guid')?.trim() || `source-${sourceCounter}`;
        const candidate = createCandidate(
          siteGuid,
          pageId,
          sourceId,
          [child],
          extractBlocksFromElement(child),
          [...contextPath],
        );
        sourceCounter += 1;
        if (candidate) {
          groups.push(candidate);
        }
        return;
      }

      visit(child);
    });
  };

  visit(main);

  groups.forEach((group) => {
    const firstElement = group.originalElements[0];
    if (firstElement.parentNode) {
      firstElement.parentNode.insertBefore(group.mountElement, firstElement);
    }
    group.originalElements.forEach((element) => {
      element.remove();
    });
  });

  return groups;
}

function readRuntimeOverrides(): Partial<SrsSettings> {
  const globalConfig = (globalThis as typeof globalThis & {
    __MEADOW_SRS_CONFIG__?: Partial<SrsSettings>;
  }).__MEADOW_SRS_CONFIG__;

  const bodyDataset = document.body.dataset;
  const datasetOverrides: Partial<SrsSettings> = {};
  if (bodyDataset.meadowSrsEndDelimiter) {
    datasetOverrides.endDelimiter = bodyDataset.meadowSrsEndDelimiter;
  }
  if (bodyDataset.meadowSrsReviewMode === 'due' || bodyDataset.meadowSrsReviewMode === 'cram') {
    datasetOverrides.defaultReviewMode = bodyDataset.meadowSrsReviewMode;
  }
  if (bodyDataset.meadowSrsBurySiblings === 'true' || bodyDataset.meadowSrsBurySiblings === 'false') {
    datasetOverrides.burySiblingCards = bodyDataset.meadowSrsBurySiblings === 'true';
  }

  return {
    ...globalConfig,
    ...datasetOverrides,
  };
}

function normalizeHtmlWhitespace(html: string): string {
  return html.replace(/\s+/g, ' ').trim();
}

function stripHtmlTags(html: string): string {
  return normalizeHtmlWhitespace(html.replace(/<[^>]+>/g, ' '));
}

function buildGlobalDefinition(
  context: ParseContext,
  id: string,
  siblingGroupKey: string,
  promptHtml: string,
  answerHtml: string,
  format: SrsCardDefinition['format'],
  direction: SrsCardDefinition['direction'],
): SrsCardDefinition {
  const normalizedPrompt = normalizeHtmlWhitespace(promptHtml);
  const normalizedAnswer = normalizeHtmlWhitespace(answerHtml);
  return {
    id,
    siteGuid: context.siteGuid,
    pageId: context.pageId,
    sourceId: context.sourceId,
    siblingGroupKey,
    format,
    direction,
    promptHtml: normalizedPrompt,
    answerHtml: normalizedAnswer,
    searchText: stripHtmlTags(normalizedPrompt),
    contextPath: context.contextPath ?? [],
  };
}

export function initializeMeadowSrs(options: InitializeSrsOptions): MeadowSrsController {
  const root = options.root ?? document;
  const clock = options.clock ?? createSystemClock();
  const persistence = options.persistence ?? createLocalStoragePersistence();
  const settings = mergeSrsSettings({
    ...readRuntimeOverrides(),
    ...options.settings,
  });
  const groups = discoverCardGroups(root, options.siteGuid, options.pageId);
  const definitions = groups.flatMap((group) => group.definitions);
  const store = loadStore(options.siteGuid, persistence);
  const revealState = new Set<string>();
  const expandedState = new Set<string>();
  let runtimeCards: SrsRuntimeCard[] = [];
  let reviewMode: SrsReviewMode = settings.defaultReviewMode;
  let reviewScope: 'page' | 'site' = 'page';
  let launcher: HTMLButtonElement | null = null;
  let overlay: HTMLDivElement | null = null;
  let overlayIndex = 0;

  let globalDefinitions: SrsCardDefinition[] | null = null;

  const loadGlobalCards = async (): Promise<void> => {
    if (globalDefinitions !== null) return;
    try {
      const depth = options.pageId.split('/').filter(Boolean).length - 1;
      const prefix = '../'.repeat(depth) + '_mw_assets/srs/';
      const response = await fetch(`${prefix}srs-all-cards.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      globalDefinitions = (data.cards as Array<{
        guid: string; kind: string; promptHtml: string; answerHtml: string;
        siblingGroup?: string; pageId: string; pageTitle: string;
      }>).flatMap(c => {
        const context: ParseContext = {
          siteGuid: options.siteGuid,
          pageId: c.pageId,
          sourceId: c.guid,
          contextPath: [c.pageTitle],
        };
        const siblingGroupKey = c.siblingGroup || c.guid;
        if (c.kind === 'basic' || c.kind === 'multiline-basic') {
          const format = c.kind === 'basic' ? 'single-basic' as const : 'multiline-basic' as const;
          return [buildGlobalDefinition(context, c.guid, siblingGroupKey, c.promptHtml, c.answerHtml, format, 'forward')];
        }
        if (c.kind === 'bidirectional' || c.kind === 'multiline-bidirectional') {
          const format = c.kind === 'bidirectional' ? 'single-bidirectional' as const : 'multiline-bidirectional' as const;
          return [
            buildGlobalDefinition(context, `${c.guid}:forward`, siblingGroupKey, c.promptHtml, c.answerHtml, format, 'forward'),
            buildGlobalDefinition(context, `${c.guid}:reverse`, siblingGroupKey, c.answerHtml, c.promptHtml, format, 'reverse'),
          ];
        }
        if (c.kind === 'cloze') {
          return [buildGlobalDefinition(context, c.guid, siblingGroupKey, c.promptHtml, c.answerHtml, 'cloze', 'cloze')];
        }
        return [];
      });
    } catch {
      globalDefinitions = [];
    }
  };

  const getActiveDefinitions = (): SrsCardDefinition[] => {
    if (reviewScope === 'page' || globalDefinitions === null) {
      return definitions;
    }
    const pageCardIds = new Set(definitions.map(d => d.id));
    const extra = globalDefinitions.filter(d => !pageCardIds.has(d.id));
    return [...definitions, ...extra];
  };

  const getVisibleReviewCards = (): SrsRuntimeCard[] => {
    const sorted = [...runtimeCards].sort((left, right) => {
      const leftScore = left.due && !left.newCard ? 0 : 1;
      const rightScore = right.due && !right.newCard ? 0 : 1;
      if (leftScore !== rightScore) {
        return leftScore - rightScore;
      }
      return left.definition.searchText.localeCompare(right.definition.searchText);
    });

    if (reviewMode === 'cram') {
      return sorted;
    }

    return sorted.filter((card) => !card.buried && card.due && !card.newCard);
  };

  const notifyStateChange = () => {
    options.onStateChange?.(store, runtimeCards);
  };

  const applyReview = (runtimeCard: SrsRuntimeCard, rating: SrsReviewRating) => {
    store.cards[runtimeCard.definition.id] = scheduleNextReview(runtimeCard.state, rating, clock.now());
    if (settings.burySiblingCards && reviewMode === 'due') {
      burySiblingCards(definitions, store, runtimeCard.definition.id, clock);
    }
    saveStore(options.siteGuid, persistence, store);
    revealState.delete(runtimeCard.definition.id);
    expandedState.delete(runtimeCard.definition.id);
    rerender();
  };

  const rerenderLauncher = () => {
    launcher?.remove();
    launcher = null;

    if (groups.length === 0) {
      return;
    }

    launcher = createElement('button', 'meadow-srs-launcher');
    launcher.type = 'button';
    launcher.textContent = 'Review';
    launcher.addEventListener('click', () => {
      if (!overlay) {
        overlay = renderOverlay();
        if (options.overlayContainer) {
          overlay.classList.add('meadow-srs-overlay--contained');
          options.overlayContainer.appendChild(overlay);
        } else {
          document.body.appendChild(overlay);
        }
      }
      overlay.classList.add('is-open');
      renderOverlayCard();
    });
    document.body.appendChild(launcher);
  };

  const renderCard = (runtimeCard: SrsRuntimeCard, overlayMode: boolean = false): HTMLElement => {
    const cardElement = createElement('article', 'meadow-srs-card');
    const isExpanded = overlayMode
      || ((!runtimeCard.buried) && (runtimeCard.due || runtimeCard.newCard))
      || expandedState.has(runtimeCard.definition.id);
    const isRevealed = revealState.has(runtimeCard.definition.id);

    if (isExpanded) {
      const statusText = statusLabel(runtimeCard);
      if (statusText) {
        const status = createElement('span', 'meadow-srs-card__status meadow-srs-card__status--float');
        status.textContent = statusText;
        cardElement.appendChild(status);
      }
    }

    if (!isExpanded) {
      cardElement.classList.add('meadow-srs-card--dormant');
      cardElement.style.cursor = 'pointer';
      cardElement.addEventListener('click', () => {
        expandedState.add(runtimeCard.definition.id);
        rerender();
      });
      if (runtimeCard.buried) {
        const dormantText = createElement('div', 'meadow-srs-card__dormant-text');
        dormantText.textContent = 'Temporarily buried by sibling review.';
        cardElement.appendChild(dormantText);
      } else {
        const dormantPrompt = createElement('div', 'meadow-srs-card__dormant-prompt');
        const dueLabel = createElement('span', 'meadow-srs-card__dormant-due');
        const dueText = statusLabel(runtimeCard) || 'Not yet due';
        dueLabel.textContent = dueText;
        dormantPrompt.appendChild(dueLabel);
        const questionPreview = createElement('span', 'meadow-srs-card__dormant-question');
        questionPreview.innerHTML = runtimeCard.definition.promptHtml;
        dormantPrompt.appendChild(questionPreview);
        cardElement.appendChild(dormantPrompt);
      }
      return cardElement;
    }

    if (overlayMode && reviewScope === 'site' && runtimeCard.definition.contextPath.length > 0) {
      const contextElement = createElement('div', 'meadow-srs-card__context');
      contextElement.textContent = runtimeCard.definition.contextPath.join(' > ');
      cardElement.appendChild(contextElement);
    }

    const prompt = createElement('div', 'meadow-srs-card__prompt');
    prompt.innerHTML = runtimeCard.definition.promptHtml;
    cardElement.appendChild(prompt);

    const answer = createElement('div', 'meadow-srs-card__answer');
    if (isRevealed) {
      answer.innerHTML = runtimeCard.definition.answerHtml;
      answer.classList.add('is-visible');
    }
    cardElement.appendChild(answer);

    const controls = createElement('div', 'meadow-srs-card__controls');
    if (!isRevealed) {
      const revealButton = createElement('button', 'meadow-srs-button');
      revealButton.type = 'button';
      revealButton.textContent = 'Show answer';
      revealButton.addEventListener('click', () => {
        revealState.add(runtimeCard.definition.id);
        rerender();
      });
      controls.appendChild(revealButton);
    } else {
      (['again', 'hard', 'good', 'easy'] as const satisfies readonly SrsReviewRating[]).forEach((rating) => {
        const button = createElement('button', `meadow-srs-button meadow-srs-button--${rating}`);
        button.type = 'button';
        button.textContent = rating[0].toUpperCase() + rating.slice(1);
        button.addEventListener('click', () => applyReview(runtimeCard, rating));
        controls.appendChild(button);
      });
    }
    cardElement.appendChild(controls);
    return cardElement;
  };

  const renderOverlay = (): HTMLDivElement => {
    const container = createElement('div', 'meadow-srs-overlay');
    const panel = createElement('div', 'meadow-srs-overlay__panel');

    const tabBar = createElement('div', 'meadow-srs-overlay__tab-bar');
    (['page', 'site'] as const).forEach((scope) => {
      const tab = createElement('button', 'meadow-srs-overlay__tab');
      tab.type = 'button';
      tab.dataset.scope = scope;
      tab.addEventListener('click', async () => {
        reviewScope = scope;
        if (scope === 'site') await loadGlobalCards();
        overlayIndex = 0;
        rerender();
      });
      tabBar.appendChild(tab);
    });

    // Eagerly load global cards so the "All pages" badge is accurate immediately
    loadGlobalCards().then(() => renderOverlayCard());

    const closeButton = createElement('button', 'meadow-srs-overlay__close');
    closeButton.type = 'button';
    closeButton.textContent = '\u00d7';
    closeButton.addEventListener('click', () => {
      container.classList.remove('is-open');
    });
    tabBar.appendChild(closeButton);

    const header = createElement('div', 'meadow-srs-overlay__header');
    const titleBlock = createElement('div', 'meadow-srs-overlay__title-block');
    const title = createElement('h2', 'meadow-srs-overlay__title');
    title.textContent = 'Prompt Review';
    const subtitle = createElement('div', 'meadow-srs-overlay__subtitle');
    subtitle.dataset.role = 'overlay-subtitle';
    titleBlock.append(title, subtitle);

    const modeToggle = createElement('div', 'meadow-srs-overlay__modes');
    (['due', 'cram'] as SrsReviewMode[]).forEach((mode) => {
      const button = createElement('button', 'meadow-srs-button meadow-srs-button--subtle');
      button.type = 'button';
      button.textContent = mode === 'due' ? 'Due' : 'Cram';
      button.dataset.mode = mode;
      button.addEventListener('click', () => {
        reviewMode = mode;
        overlayIndex = 0;
        renderOverlayCard();
      });
      modeToggle.appendChild(button);
    });

    header.append(titleBlock, modeToggle);

    const body = createElement('div', 'meadow-srs-overlay__body');
    body.dataset.role = 'overlay-body';

    const footer = createElement('div', 'meadow-srs-overlay__footer');
    const previousButton = createElement('button', 'meadow-srs-button meadow-srs-button--subtle');
    previousButton.type = 'button';
    previousButton.textContent = 'Previous';
    previousButton.addEventListener('click', () => {
      overlayIndex = Math.max(0, overlayIndex - 1);
      renderOverlayCard();
    });

    const nextButton = createElement('button', 'meadow-srs-button meadow-srs-button--subtle');
    nextButton.type = 'button';
    nextButton.textContent = 'Next';
    nextButton.addEventListener('click', () => {
      overlayIndex += 1;
      renderOverlayCard();
    });

    footer.append(previousButton, nextButton);
    panel.append(tabBar, header, body, footer);
    container.appendChild(panel);

    container.addEventListener('keydown', (event) => {
      if (!container.classList.contains('is-open')) {
        return;
      }

      const reviewCards = getVisibleReviewCards();
      const currentCard = reviewCards[Math.min(overlayIndex, Math.max(reviewCards.length - 1, 0))];
      if (!currentCard) {
        return;
      }

      if ((event.key === ' ' || event.key === 'Enter') && !revealState.has(currentCard.definition.id)) {
        event.preventDefault();
        revealState.add(currentCard.definition.id);
        rerender();
        return;
      }

      if (event.key === 'Escape') {
        container.classList.remove('is-open');
        return;
      }

      if (!revealState.has(currentCard.definition.id)) {
        return;
      }

      if (event.key === '1') {
        applyReview(currentCard, 'again');
      } else if (event.key === '2') {
        applyReview(currentCard, 'hard');
      } else if (event.key === '3') {
        applyReview(currentCard, 'good');
      } else if (event.key === '4') {
        applyReview(currentCard, 'easy');
      }
    });

    container.tabIndex = -1;
    return container;
  };

  const renderOverlayCard = () => {
    if (!overlay) {
      return;
    }

    const subtitle = overlay.querySelector<HTMLElement>('[data-role="overlay-subtitle"]');
    const body = overlay.querySelector<HTMLElement>('[data-role="overlay-body"]');
    if (!subtitle || !body) {
      return;
    }

    overlay.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.mode === reviewMode);
    });
    const pageRuntimeCards = getRuntimeCards(definitions, store, clock);
    const pageDueCount = pageRuntimeCards.filter((card) => !card.buried && card.due && !card.newCard).length;
    const pageNewCount = pageRuntimeCards.filter((card) => !card.buried && card.newCard).length;
    let siteDueCount: number | null = null;
    let siteNewCount: number | null = null;
    if (globalDefinitions !== null) {
      const pageCardIds = new Set(definitions.map(d => d.id));
      const allDefinitions = [...definitions, ...globalDefinitions.filter(d => !pageCardIds.has(d.id))];
      const siteRuntimeCards = getRuntimeCards(allDefinitions, store, clock);
      siteDueCount = siteRuntimeCards.filter((card) => !card.buried && card.due && !card.newCard).length;
      siteNewCount = siteRuntimeCards.filter((card) => !card.buried && card.newCard).length;
    }

    overlay.querySelectorAll<HTMLButtonElement>('.meadow-srs-overlay__tab').forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.scope === reviewScope);
      tab.replaceChildren();
      const label = document.createTextNode(tab.dataset.scope === 'page' ? 'This page' : 'All pages');
      tab.appendChild(label);
      const dueCount = tab.dataset.scope === 'page' ? pageDueCount : siteDueCount;
      const newCount = tab.dataset.scope === 'page' ? pageNewCount : siteNewCount;
      if (dueCount !== null) {
        const dueBadge = createElement('span', 'meadow-srs-tab-badge');
        dueBadge.textContent = `${dueCount} due`;
        tab.appendChild(dueBadge);
      }
      if (newCount !== null && newCount > 0) {
        const newBadge = createElement('span', 'meadow-srs-tab-badge meadow-srs-tab-badge--new');
        newBadge.textContent = `${newCount} new`;
        tab.appendChild(newBadge);
      }
    });

    const reviewCards = getVisibleReviewCards();
    if (reviewCards.length === 0) {
      if (reviewMode === 'due') {
        const newCardCount = runtimeCards.filter((card) => !card.buried && card.newCard).length;
        if (newCardCount > 0) {
          subtitle.textContent = `Nothing due right now. ${newCardCount} new ${newCardCount === 1 ? 'prompt' : 'prompts'} available in the material.`;
        } else {
          subtitle.textContent = 'Nothing due right now. Switch to Cram to walk every prompt.';
        }
      } else {
        subtitle.textContent = reviewScope === 'page'
          ? 'No prompts found on this page.'
          : 'No prompts found across the site.';
      }
      body.replaceChildren();
      return;
    }

    overlayIndex = Math.min(overlayIndex, reviewCards.length - 1);
    const currentCard = reviewCards[overlayIndex];
    subtitle.textContent = `${overlayIndex + 1} / ${reviewCards.length} in ${reviewMode === 'due' ? 'due review' : 'cram review'}`;
    body.replaceChildren(renderCard(currentCard, true));
    requestAnimationFrame(() => {
      overlay?.focus();
    });
  };

  const rerender = () => {
    runtimeCards = getRuntimeCards(getActiveDefinitions(), store, clock);
    saveStore(options.siteGuid, persistence, store);

    groups.forEach((group) => {
      group.mountElement.replaceChildren();
      runtimeCards
        .filter((card) => card.definition.sourceId === group.sourceId)
        .forEach((card) => {
          group.mountElement.appendChild(renderCard(card));
        });
    });

    rerenderLauncher();
    renderOverlayCard();
    notifyStateChange();
  };

  rerender();

  return {
    destroy: () => {
      groups.forEach((group) => {
        if (group.mountElement.parentNode) {
          group.originalElements.forEach((element) => {
            group.mountElement.parentNode?.insertBefore(element, group.mountElement);
          });
        }
        group.mountElement.remove();
      });
      launcher?.remove();
      overlay?.remove();
    },
    refresh: rerender,
    clearState: () => {
      clearStore(options.siteGuid, persistence);
      const empty = loadStore(options.siteGuid, persistence);
      Object.keys(store.cards).forEach((key) => {
        delete store.cards[key];
      });
      Object.assign(store, empty);
      revealState.clear();
      expandedState.clear();
      overlayIndex = 0;
      rerender();
    },
    setReviewMode: (mode) => {
      reviewMode = mode;
      overlayIndex = 0;
      renderOverlayCard();
    },
    getReviewMode: () => reviewMode,
    getStore: () => store,
    getRuntimeCards: () => runtimeCards,
    getVisibleReviewCards,
    getWaypoints: () => collectWaypoints(runtimeCards, clock.now()),
    getDebugSourceGroups: () => groups.map((group) => ({
      sourceId: group.sourceId,
      mountElement: group.mountElement,
      contextPath: [...group.contextPath],
      blocks: group.blocks.map((block) => ({ ...block })),
      cardIds: group.definitions.map((definition) => definition.id),
    })),
    rateCard: (cardId: string, rating: SrsReviewRating) => {
      const card = runtimeCards.find((c) => c.definition.id === cardId);
      if (card) {
        applyReview(card, rating);
      }
    },
  };
}

export function autoInitializeMeadowSrs(): MeadowSrsController | null {
  const siteGuid = document.body.dataset.meadowSrsSiteGuid;
  const pageId = document.body.dataset.meadowSrsPageId;
  if (!siteGuid || !pageId) {
    return null;
  }
  return initializeMeadowSrs({ siteGuid, pageId });
}
