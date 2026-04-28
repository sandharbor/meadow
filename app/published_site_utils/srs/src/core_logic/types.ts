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

export type SrsCardFormat =
  | 'single-basic'
  | 'single-bidirectional'
  | 'multiline-basic'
  | 'multiline-bidirectional'
  | 'cloze';

export type SrsCardDirection = 'forward' | 'reverse' | 'cloze';
export type SrsReviewRating = 'again' | 'hard' | 'good' | 'easy';
export type SrsReviewMode = 'due' | 'cram';

export interface SrsSettings {
  singleLineSeparator: string;
  bidirectionalSeparator: string;
  multilineSeparator: string;
  multilineBidirectionalSeparator: string;
  endDelimiter: string;
  clozePatterns: string[];
  burySiblingCards: boolean;
  showContext: boolean;
  defaultReviewMode: SrsReviewMode;
}

export interface SrsCardDefinition {
  id: string;
  siteGuid: string;
  pageId: string;
  sourceId: string;
  siblingGroupKey: string;
  format: SrsCardFormat;
  direction: SrsCardDirection;
  promptHtml: string;
  answerHtml: string;
  searchText: string;
  contextPath: string[];
  hint?: string;
}

export interface SrsCardState {
  cardId: string;
  intervalMs: number;
  easeFactor: number;
  dueAt: string;
  lastReviewedAt?: string;
  reviewCount: number;
  lapseCount: number;
  buriedUntil?: string;
}

export interface SrsStoreData {
  version: 1;
  cards: Record<string, SrsCardState>;
}

export interface SrsRuntimeCard {
  definition: SrsCardDefinition;
  state: SrsCardState;
  due: boolean;
  dueInMs: number;
  newCard: boolean;
  buried: boolean;
}

export interface SrsPersistence {
  load: (key: string) => string | null;
  save: (key: string, value: string) => void;
  clear: (key: string) => void;
}

export interface SrsClock {
  now: () => Date;
}

export interface SrsWaypoint {
  atMs: number;
  label: string;
  cardId?: string;
}
