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
import { createHash } from 'crypto';
import {
  extractObsidianTagsFromMarkdown,
  listMarkdownFilesRecursive,
  normalizeTagToKey
} from './tagPagesUtils.js';

const GUID_COMMENT_RE = /^<!--MEADOW_SR_GUID:([^>]+)-->$/;
const SR_COMMENT_RE = /^<!--SR:[\s\S]*-->$/;
const REWRITTEN_TAG_WIKILINK_RE = /\[\[tag--[^\]|]+?\|#([A-Za-z0-9][A-Za-z0-9_/-]*)\]\]/g;

export interface PreparedSrsMarkdownResult {
  matchedPageRelativePaths: Set<string>;
  updatedRawFiles: string[];
}

type SrsInlineCardKind = 'basic' | 'bidirectional';

export type SrsCustomCardKind =
  | SrsInlineCardKind
  | 'multiline-basic'
  | 'multiline-bidirectional'
  | 'cloze';

export type SrsClozeType = 'simplified' | 'classic' | 'overlapping';

export interface ParsedSrsCardLine {
  kind: SrsInlineCardKind;
  promptMarkdown: string;
  answerMarkdown: string;
}

interface ParsedSrsCardSpanBase {
  startIndex: number;
  contentEndIndex: number;
  nextIndex: number;
  guid: string | null;
  srCommentLine: string | null;
  sourceMarkdown: string;
}

interface ParsedSrsQuestionAnswerCardSpan extends ParsedSrsCardSpanBase {
  kind: SrsInlineCardKind | 'multiline-basic' | 'multiline-bidirectional';
  promptMarkdown: string;
  answerMarkdown: string;
}

interface ParsedSrsClozeCard {
  key: string;
  clozeType: SrsClozeType;
  promptMarkdown: string;
  answerMarkdown: string;
}

interface ParsedSrsClozeCardSpan extends ParsedSrsCardSpanBase {
  kind: 'cloze';
  cards: ParsedSrsClozeCard[];
}

type ParsedSrsCardSpan = ParsedSrsQuestionAnswerCardSpan | ParsedSrsClozeCardSpan;

interface ParsedClozeTextSegment {
  type: 'text';
  value: string;
}

interface ParsedClozeDeletionSegment {
  type: 'deletion';
  answerMarkdown: string;
  hint?: string;
  groupKey?: string;
  actions?: string;
}

type ParsedClozeSegment = ParsedClozeTextSegment | ParsedClozeDeletionSegment;

const SRS_END_DELIMITER = '+++';

function isFenceDelimiter(line: string): boolean {
  return /^\s*(```|~~~)/.test(line);
}

function normalizeConfiguredSrsTag(tag: string): string | null {
  const trimmed = tag.trim();
  if (!trimmed) {
    return null;
  }

  const withoutHashes = trimmed.replace(/^#+/, '');
  if (!withoutHashes) {
    return null;
  }

  return normalizeTagToKey(withoutHashes);
}

export function normalizeConfiguredSrsTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const key = normalizeConfiguredSrsTag(tag);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(key);
  }

  return normalized;
}

function extractRewrittenTagKeys(markdown: string): Set<string> {
  const keys = new Set<string>();
  REWRITTEN_TAG_WIKILINK_RE.lastIndex = 0;

  for (const match of markdown.matchAll(REWRITTEN_TAG_WIKILINK_RE)) {
    const tagBody = match[1];
    if (!tagBody) {
      continue;
    }
    keys.add(normalizeTagToKey(tagBody));
  }

  return keys;
}

function extractPageTagKeys(markdown: string): Set<string> {
  const keys = new Set<string>(extractObsidianTagsFromMarkdown(markdown).keys());

  for (const tagKey of extractRewrittenTagKeys(markdown)) {
    keys.add(tagKey);
  }

  return keys;
}

function tagMatchesConfiguredTag(pageTagKey: string, configuredTagKey: string): boolean {
  return pageTagKey === configuredTagKey || pageTagKey.startsWith(`${configuredTagKey}/`);
}

export function pageMatchesConfiguredSrsTags(markdown: string, configuredTags: string[]): boolean {
  const normalizedTags = normalizeConfiguredSrsTags(configuredTags);
  if (normalizedTags.length === 0) {
    return false;
  }

  const pageTagKeys = extractPageTagKeys(markdown);
  if (pageTagKeys.size === 0) {
    return false;
  }

  for (const pageTagKey of pageTagKeys) {
    for (const configuredTagKey of normalizedTags) {
      if (tagMatchesConfiguredTag(pageTagKey, configuredTagKey)) {
        return true;
      }
    }
  }

  return false;
}

function isMetadataLine(line: string): boolean {
  return line.startsWith('<!--MEADOW_SR_GUID:') || line.startsWith('<!--SR:');
}

function isEndDelimiterLine(line: string): boolean {
  return line === SRS_END_DELIMITER;
}

function findSeparatorOutsideInlineCode(line: string, separator: ':::' | '::'): number {
  let inInlineCode = false;

  for (let i = 0; i <= line.length - separator.length; i++) {
    const char = line[i];
    if (char === '`') {
      inInlineCode = !inInlineCode;
      continue;
    }

    if (!inInlineCode && line.startsWith('{{', i)) {
      const customClozeEnd = line.indexOf('}}', i + 2);
      if (customClozeEnd >= 0) {
        i = customClozeEnd + 1;
        continue;
      }
    }

    if (!inInlineCode && line.startsWith(separator, i)) {
      return i;
    }
  }

  return -1;
}

function parseMultilineSeparatorKind(line: string): 'multiline-basic' | 'multiline-bidirectional' | null {
  const trimmed = line.trim();
  if (trimmed === '?') {
    return 'multiline-basic';
  }
  if (trimmed === '??') {
    return 'multiline-bidirectional';
  }
  return null;
}

function trimBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start].trim() === '') {
    start += 1;
  }

  while (end > start && lines[end - 1].trim() === '') {
    end -= 1;
  }

  return lines.slice(start, end);
}

function markdownFromLines(lines: string[]): string {
  return trimBlankLines(lines).join('\n').trim();
}

export function parseSrsCardLine(line: string): ParsedSrsCardLine | null {
  if (line.trimStart().startsWith('<!--')) {
    return null;
  }

  const separators: Array<{ separator: ':::' | '::'; kind: SrsInlineCardKind }> = [
    { separator: ':::', kind: 'bidirectional' },
    { separator: '::', kind: 'basic' },
  ];

  for (const candidate of separators) {
    const separatorIndex = findSeparatorOutsideInlineCode(line, candidate.separator);
    if (separatorIndex < 0) {
      continue;
    }

    const promptMarkdown = line.slice(0, separatorIndex).trim();
    const answerMarkdown = line.slice(separatorIndex + candidate.separator.length).trim();
    if (!promptMarkdown || !answerMarkdown) {
      continue;
    }

    return {
      kind: candidate.kind,
      promptMarkdown,
      answerMarkdown,
    };
  }

  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function findExplicitEndDelimiterIndex(lines: string[], startIndex: number): number | null {
  for (let i = startIndex; i < lines.length; i++) {
    if (isFenceDelimiter(lines[i])) {
      return null;
    }

    const trimmed = lines[i].trim();
    if (isEndDelimiterLine(trimmed)) {
      return i;
    }

    if (i > startIndex && isMetadataLine(trimmed)) {
      return null;
    }
  }

  return null;
}

function findImplicitCardBoundaryIndex(lines: string[], startIndex: number): number {
  for (let i = startIndex; i < lines.length; i++) {
    if (isFenceDelimiter(lines[i])) {
      return i;
    }

    const trimmed = lines[i].trim();
    if (trimmed === '' || isMetadataLine(trimmed)) {
      return i;
    }
  }

  return lines.length;
}

function normalizeCustomClozeToken(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }

  const withoutPrefix = trimmed.replace(/^c/i, '');
  if (/^\d+$/.test(withoutPrefix)) {
    return withoutPrefix;
  }

  if (/^[ahs]+$/i.test(withoutPrefix)) {
    return withoutPrefix.toLowerCase();
  }

  return null;
}

function buildClozeDeletion(
  answerMarkdown: string,
  hint: string | undefined,
  token: string | undefined,
): ParsedClozeDeletionSegment | null {
  const normalizedAnswer = answerMarkdown.trim();
  if (!normalizedAnswer) {
    return null;
  }

  const normalizedHint = hint?.trim() || undefined;
  if (!token) {
    return {
      type: 'deletion',
      answerMarkdown: normalizedAnswer,
      hint: normalizedHint,
    };
  }

  if (/^\d+$/.test(token)) {
    return {
      type: 'deletion',
      answerMarkdown: normalizedAnswer,
      hint: normalizedHint,
      groupKey: token,
    };
  }

  if (/^[ahs]+$/.test(token)) {
    return {
      type: 'deletion',
      answerMarkdown: normalizedAnswer,
      hint: normalizedHint,
      actions: token,
    };
  }

  return null;
}

function parseHighlightedCloze(markdown: string, startIndex: number): { segment: ParsedClozeDeletionSegment; nextIndex: number } | null {
  if (!markdown.startsWith('==', startIndex)) {
    return null;
  }

  const closingIndex = markdown.indexOf('==', startIndex + 2);
  if (closingIndex < 0) {
    return null;
  }

  const answerMarkdown = markdown.slice(startIndex + 2, closingIndex);
  let cursor = closingIndex + 2;
  let hint: string | undefined;
  let token: string | undefined;

  if (markdown.startsWith('^[', cursor)) {
    const hintEndIndex = markdown.indexOf(']', cursor + 2);
    if (hintEndIndex >= 0) {
      hint = markdown.slice(cursor + 2, hintEndIndex);
      cursor = hintEndIndex + 1;
    }
  }

  if (markdown.startsWith('[^', cursor)) {
    const tokenEndIndex = markdown.indexOf(']', cursor + 2);
    if (tokenEndIndex >= 0) {
      const maybeToken = markdown.slice(cursor + 2, tokenEndIndex).trim();
      if (/^\d+$/.test(maybeToken) || /^[ahs]+$/i.test(maybeToken)) {
        token = maybeToken.toLowerCase();
        cursor = tokenEndIndex + 1;
      }
    }
  }

  const segment = buildClozeDeletion(answerMarkdown, hint, token);
  if (!segment) {
    return null;
  }

  return {
    segment,
    nextIndex: cursor,
  };
}

function parseCustomCloze(markdown: string, startIndex: number): { segment: ParsedClozeDeletionSegment; nextIndex: number } | null {
  if (!markdown.startsWith('{{', startIndex)) {
    return null;
  }

  const closingIndex = markdown.indexOf('}}', startIndex + 2);
  if (closingIndex < 0) {
    return null;
  }

  const body = markdown.slice(startIndex + 2, closingIndex).trim();
  const parts = body.split('::');
  let answerMarkdown = '';
  let hint: string | undefined;
  let token: string | undefined;

  if (parts.length === 1) {
    answerMarkdown = parts[0] ?? '';
  } else if (parts.length === 2) {
    const maybeToken = normalizeCustomClozeToken(parts[0] ?? '');
    if (maybeToken) {
      token = maybeToken;
      answerMarkdown = parts[1] ?? '';
    } else {
      answerMarkdown = parts[0] ?? '';
      hint = parts[1] ?? '';
    }
  } else if (parts.length === 3) {
    const maybeToken = normalizeCustomClozeToken(parts[0] ?? '');
    if (!maybeToken) {
      return null;
    }
    token = maybeToken;
    answerMarkdown = parts[1] ?? '';
    hint = parts[2] ?? '';
  } else {
    return null;
  }

  const segment = buildClozeDeletion(answerMarkdown, hint, token);
  if (!segment) {
    return null;
  }

  return {
    segment,
    nextIndex: closingIndex + 2,
  };
}

function parseClozeSegments(markdown: string): ParsedClozeSegment[] | null {
  const segments: ParsedClozeSegment[] = [];
  let cursor = 0;
  let foundDeletion = false;

  while (cursor < markdown.length) {
    const highlightIndex = markdown.indexOf('==', cursor);
    const customIndex = markdown.indexOf('{{', cursor);
    const nextIndex = [highlightIndex, customIndex]
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0];

    if (nextIndex === undefined) {
      const tail = markdown.slice(cursor);
      if (tail) {
        segments.push({ type: 'text', value: tail });
      }
      break;
    }

    if (nextIndex > cursor) {
      segments.push({ type: 'text', value: markdown.slice(cursor, nextIndex) });
    }

    const parsed = markdown.startsWith('==', nextIndex)
      ? parseHighlightedCloze(markdown, nextIndex)
      : parseCustomCloze(markdown, nextIndex);

    if (!parsed) {
      segments.push({ type: 'text', value: markdown.slice(nextIndex, nextIndex + 1) });
      cursor = nextIndex + 1;
      continue;
    }

    segments.push(parsed.segment);
    cursor = parsed.nextIndex;
    foundDeletion = true;
  }

  return foundDeletion ? segments : null;
}

function createClozePlaceholder(segment: ParsedClozeDeletionSegment): string {
  const label = segment.hint?.trim() || '...';
  return `<span class="meadow-srs-cloze-blank">${escapeHtml(label)}</span>`;
}

function renderClozeMarkdown(
  segments: ParsedClozeSegment[],
  visibilityForDeletion: (segment: ParsedClozeDeletionSegment, index: number) => 'show' | 'hide',
): string {
  let deletionIndex = 0;

  return segments.map((segment) => {
    if (segment.type === 'text') {
      return segment.value;
    }

    const visibility = visibilityForDeletion(segment, deletionIndex);
    deletionIndex += 1;
    return visibility === 'show' ? segment.answerMarkdown : createClozePlaceholder(segment);
  }).join('');
}

function parseClozeMarkdown(markdown: string): { cards: ParsedSrsClozeCard[] } | null {
  const segments = parseClozeSegments(markdown);
  if (!segments) {
    return null;
  }

  const deletions = segments.filter(
    (segment): segment is ParsedClozeDeletionSegment => segment.type === 'deletion'
  );
  if (deletions.length === 0) {
    return null;
  }

  const hasOverlapping = deletions.some((segment) => segment.actions !== undefined);
  const hasClassic = deletions.some((segment) => segment.groupKey !== undefined);

  if (hasOverlapping && (hasClassic || deletions.some((segment) => segment.actions === undefined))) {
    return null;
  }

  if (hasClassic && deletions.some((segment) => segment.groupKey === undefined || segment.actions !== undefined)) {
    return null;
  }

  if (hasOverlapping) {
    const actionCounts = new Set(deletions.map((segment) => segment.actions?.length ?? 0));
    if (actionCounts.size !== 1) {
      return null;
    }

    const actionCount = deletions[0]?.actions?.length ?? 0;
    if (actionCount === 0) {
      return null;
    }

    const cards: ParsedSrsClozeCard[] = [];
    for (let cardIndex = 0; cardIndex < actionCount; cardIndex += 1) {
      const promptMarkdown = renderClozeMarkdown(segments, (segment) => {
        const action = segment.actions?.[cardIndex] ?? 's';
        return action === 'a' || action === 'h' ? 'hide' : 'show';
      });
      const answerMarkdown = renderClozeMarkdown(segments, (segment) => {
        const action = segment.actions?.[cardIndex] ?? 's';
        return action === 'h' ? 'hide' : 'show';
      });

      cards.push({
        key: String(cardIndex + 1),
        clozeType: 'overlapping',
        promptMarkdown,
        answerMarkdown,
      });
    }

    return { cards };
  }

  if (hasClassic) {
    const orderedGroups = Array.from(new Set(
      deletions.map((segment) => segment.groupKey).filter((groupKey): groupKey is string => Boolean(groupKey))
    )).sort((left, right) => Number(left) - Number(right));

    return {
      cards: orderedGroups.map((groupKey) => ({
        key: groupKey,
        clozeType: 'classic',
        promptMarkdown: renderClozeMarkdown(segments, (segment) => (
          segment.groupKey === groupKey ? 'hide' : 'show'
        )),
        answerMarkdown: renderClozeMarkdown(segments, () => 'show'),
      })),
    };
  }

  return {
    cards: deletions.map((target, index) => ({
      key: String(index + 1),
      clozeType: 'simplified',
      promptMarkdown: renderClozeMarkdown(segments, (segment, deletionIndex) => (
        segment === target && deletionIndex === index ? 'hide' : 'show'
      )),
      answerMarkdown: renderClozeMarkdown(segments, () => 'show'),
    })),
  };
}

function readCardMetadata(
  lines: string[],
  startIndex: number
): { nextIndex: number; guid: string | null; srCommentLine: string | null; metadataFound: boolean } {
  let nextIndex = startIndex;
  let guid: string | null = null;
  let srCommentLine: string | null = null;
  let metadataFound = false;

  while (nextIndex < lines.length && lines[nextIndex].trim() === '') {
    nextIndex += 1;
  }

  let cursor = nextIndex;
  while (cursor < lines.length) {
    while (cursor < lines.length && lines[cursor].trim() === '') {
      cursor += 1;
    }

    if (cursor >= lines.length) {
      break;
    }

    const trimmed = lines[cursor].trim();
    const guidMatch = trimmed.match(GUID_COMMENT_RE);
    if (guidMatch && guid === null) {
      const parsedGuid = guidMatch[1]?.trim();
      if (parsedGuid) {
        guid = parsedGuid;
      }
      metadataFound = true;
      cursor += 1;
      continue;
    }

    if (SR_COMMENT_RE.test(trimmed) && srCommentLine === null) {
      srCommentLine = trimmed;
      metadataFound = true;
      cursor += 1;
      continue;
    }

    break;
  }

  return {
    nextIndex: metadataFound ? cursor : startIndex,
    guid,
    srCommentLine,
    metadataFound,
  };
}

function createDeterministicGuid(pageRelativePath: string, cardLine: string, cardIndex: number): string {
  return createHash('sha1')
    .update(`${pageRelativePath}\n${cardIndex}\n${cardLine.trim()}`)
    .digest('hex')
    .slice(0, 13);
}

function sameLines(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((line, index) => line === right[index]);
}

function findInlineSrsCard(lines: string[], startIndex: number): ParsedSrsQuestionAnswerCardSpan | null {
  const line = lines[startIndex];
  const parsedCard = parseSrsCardLine(line);
  if (!parsedCard) {
    return null;
  }

  const metadata = readCardMetadata(lines, startIndex + 1);
  return {
    ...parsedCard,
    startIndex,
    contentEndIndex: startIndex + 1,
    nextIndex: metadata.nextIndex,
    guid: metadata.guid,
    srCommentLine: metadata.srCommentLine,
    sourceMarkdown: line,
  };
}

function findMultilineSrsCard(lines: string[], startIndex: number): ParsedSrsQuestionAnswerCardSpan | null {
  const firstLine = lines[startIndex];
  if (
    firstLine.trim() === ''
    || firstLine.trimStart().startsWith('<!--')
    || isEndDelimiterLine(firstLine.trim())
    || parseMultilineSeparatorKind(firstLine) !== null
  ) {
    return null;
  }

  const explicitEndIndex = findExplicitEndDelimiterIndex(lines, startIndex);
  const scanLimit = explicitEndIndex ?? findImplicitCardBoundaryIndex(lines, startIndex);

  let separatorIndex = -1;
  let kind: 'multiline-basic' | 'multiline-bidirectional' | null = null;
  for (let i = startIndex + 1; i < scanLimit; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (explicitEndIndex === null && trimmed === '') {
      return null;
    }

    if (isMetadataLine(trimmed)) {
      return null;
    }

    const separatorKind = parseMultilineSeparatorKind(line);
    if (separatorKind) {
      separatorIndex = i;
      kind = separatorKind;
      break;
    }
  }

  if (separatorIndex < 0 || !kind) {
    return null;
  }

  const promptMarkdown = markdownFromLines(lines.slice(startIndex, separatorIndex));
  if (!promptMarkdown) {
    return null;
  }

  const answerMarkdown = markdownFromLines(lines.slice(separatorIndex + 1, scanLimit));
  if (!answerMarkdown) {
    return null;
  }

  const contentEndIndex = explicitEndIndex !== null ? explicitEndIndex + 1 : scanLimit;
  const metadata = readCardMetadata(lines, contentEndIndex);
  return {
    kind,
    promptMarkdown,
    answerMarkdown,
    startIndex,
    contentEndIndex,
    nextIndex: metadata.nextIndex,
    guid: metadata.guid,
    srCommentLine: metadata.srCommentLine,
    sourceMarkdown: lines.slice(startIndex, contentEndIndex).join('\n'),
  };
}

function findClozeSrsCard(lines: string[], startIndex: number): ParsedSrsClozeCardSpan | null {
  const firstLine = lines[startIndex];
  if (
    firstLine.trim() === ''
    || firstLine.trimStart().startsWith('<!--')
    || isEndDelimiterLine(firstLine.trim())
    || parseMultilineSeparatorKind(firstLine) !== null
  ) {
    return null;
  }

  const explicitEndIndex = findExplicitEndDelimiterIndex(lines, startIndex);
  const scanLimit = explicitEndIndex ?? findImplicitCardBoundaryIndex(lines, startIndex);
  const sourceLines = lines.slice(startIndex, scanLimit);
  const sourceMarkdown = markdownFromLines(sourceLines);
  if (!sourceMarkdown) {
    return null;
  }

  const parsedCloze = parseClozeMarkdown(sourceMarkdown);
  if (!parsedCloze) {
    return null;
  }

  const contentEndIndex = explicitEndIndex !== null ? explicitEndIndex + 1 : scanLimit;
  const metadata = readCardMetadata(lines, contentEndIndex);
  return {
    kind: 'cloze',
    cards: parsedCloze.cards,
    startIndex,
    contentEndIndex,
    nextIndex: metadata.nextIndex,
    guid: metadata.guid,
    srCommentLine: metadata.srCommentLine,
    sourceMarkdown: lines.slice(startIndex, contentEndIndex).join('\n'),
  };
}

function findSrsCardAt(lines: string[], startIndex: number): ParsedSrsCardSpan | null {
  return findInlineSrsCard(lines, startIndex)
    ?? findMultilineSrsCard(lines, startIndex)
    ?? findClozeSrsCard(lines, startIndex);
}

export function ensureSrsCardGuidsInMarkdown(
  markdown: string,
  pageRelativePath: string
): { markdown: string; changed: boolean; cardCount: number } {
  const lines = markdown.split('\n');
  const rewrittenLines: string[] = [];
  let inFence = false;
  let changed = false;
  let cardCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isFenceDelimiter(line)) {
      inFence = !inFence;
      rewrittenLines.push(line);
      continue;
    }

    if (inFence) {
      rewrittenLines.push(line);
      continue;
    }

    const parsedCard = findSrsCardAt(lines, i);
    if (!parsedCard) {
      rewrittenLines.push(line);
      continue;
    }

    const originalCardLines = lines.slice(parsedCard.startIndex, parsedCard.nextIndex);
    const guid = parsedCard.guid || createDeterministicGuid(pageRelativePath, parsedCard.sourceMarkdown, cardCount);
    const metadataStartOffset = parsedCard.contentEndIndex - parsedCard.startIndex;
    const rewrittenCardLines: string[] = [];
    let lastSrLineIndex: number | null = null;

    for (let lineIndex = 0; lineIndex < originalCardLines.length; lineIndex += 1) {
      const originalLine = originalCardLines[lineIndex];
      const trimmed = originalLine.trim();

      if (lineIndex >= metadataStartOffset && trimmed.startsWith('<!--MEADOW_SR_GUID:')) {
        while (rewrittenCardLines.length > 0 && rewrittenCardLines[rewrittenCardLines.length - 1].trim() === '') {
          rewrittenCardLines.pop();
        }
        continue;
      }

      if (lineIndex >= metadataStartOffset && SR_COMMENT_RE.test(trimmed)) {
        lastSrLineIndex = rewrittenCardLines.length;
      }

      rewrittenCardLines.push(originalLine);
    }

    const insertAt = lastSrLineIndex !== null ? lastSrLineIndex + 1 : metadataStartOffset;
    rewrittenCardLines.splice(insertAt, 0, '', `<!--MEADOW_SR_GUID:${guid}-->`);

    if (!sameLines(originalCardLines, rewrittenCardLines)) {
      changed = true;
    }

    rewrittenLines.push(...rewrittenCardLines);
    i = parsedCard.nextIndex - 1;
    cardCount += 1;
  }

  return {
    markdown: rewrittenLines.join('\n'),
    changed,
    cardCount,
  };
}

export function removeSrsCommentsFromMarkdown(markdown: string): string {
  const lines = markdown.split('\n');
  const rewrittenLines: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (isFenceDelimiter(line)) {
      inFence = !inFence;
      rewrittenLines.push(line);
      continue;
    }

    if (!inFence && SR_COMMENT_RE.test(line.trim())) {
      continue;
    }

    rewrittenLines.push(line);
  }

  return rewrittenLines.join('\n');
}

function toPosixRelativePath(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

export function prepareModifiedSrsMarkdownDirectory(
  rawTrackedContentDir: string,
  modifiedContentDir: string,
  configuredTags: string[]
): PreparedSrsMarkdownResult {
  const matchedPageRelativePaths = new Set<string>();
  const updatedRawFiles: string[] = [];

  if (!fs.existsSync(rawTrackedContentDir)) {
    return { matchedPageRelativePaths, updatedRawFiles };
  }

  const rawMarkdownFiles = listMarkdownFilesRecursive(rawTrackedContentDir);
  for (const markdownFile of rawMarkdownFiles) {
    const relativePath = toPosixRelativePath(rawTrackedContentDir, markdownFile);
    const originalMarkdown = fs.readFileSync(markdownFile, 'utf8');
    if (!pageMatchesConfiguredSrsTags(originalMarkdown, configuredTags)) {
      continue;
    }

    matchedPageRelativePaths.add(relativePath);

    const withGuids = ensureSrsCardGuidsInMarkdown(originalMarkdown, relativePath);
    if (withGuids.changed) {
      fs.writeFileSync(markdownFile, withGuids.markdown, 'utf8');
      updatedRawFiles.push(relativePath);
    }
  }

  if (fs.existsSync(modifiedContentDir)) {
    fs.rmSync(modifiedContentDir, { recursive: true, force: true });
  }
  fs.cpSync(rawTrackedContentDir, modifiedContentDir, { recursive: true });

  const modifiedMarkdownFiles = listMarkdownFilesRecursive(modifiedContentDir);
  for (const markdownFile of modifiedMarkdownFiles) {
    const relativePath = toPosixRelativePath(modifiedContentDir, markdownFile);
    if (!matchedPageRelativePaths.has(relativePath)) {
      continue;
    }

    const originalMarkdown = fs.readFileSync(markdownFile, 'utf8');
    const withoutSrComments = removeSrsCommentsFromMarkdown(originalMarkdown);
    if (withoutSrComments !== originalMarkdown) {
      fs.writeFileSync(markdownFile, withoutSrComments, 'utf8');
    }
  }

  return { matchedPageRelativePaths, updatedRawFiles };
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function derivedClozeGuid(baseGuid: string, key: string): string {
  return `${baseGuid}:cloze:${key}`;
}

export function replaceSrsCardsWithCustomElements(
  markdown: string,
  renderMarkdownFragmentToHtml: (fragment: string) => string,
  onCardEmitted?: (card: { guid: string; kind: string; promptHtml: string; answerHtml: string; siblingGroup?: string }) => void
): string {
  const lines = markdown.split('\n');
  const rewrittenLines: string[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isFenceDelimiter(line)) {
      inFence = !inFence;
      rewrittenLines.push(line);
      continue;
    }

    if (inFence) {
      rewrittenLines.push(line);
      continue;
    }

    const parsedCard = findSrsCardAt(lines, i);
    if (!parsedCard) {
      rewrittenLines.push(line);
      continue;
    }

    if (!parsedCard.guid) {
      rewrittenLines.push(...lines.slice(parsedCard.startIndex, parsedCard.nextIndex));
      i = parsedCard.nextIndex - 1;
      continue;
    }

    if (parsedCard.kind === 'cloze') {
      parsedCard.cards.forEach((card) => {
        const promptHtml = renderMarkdownFragmentToHtml(card.promptMarkdown).trim();
        const answerHtml = renderMarkdownFragmentToHtml(card.answerMarkdown).trim();
        rewrittenLines.push(
          `<meadow-srs-card guid="${escapeAttribute(derivedClozeGuid(parsedCard.guid!, card.key))}" kind="cloze" cloze-type="${escapeAttribute(card.clozeType)}" sibling-group="${escapeAttribute(parsedCard.guid!)}">`
        );
        rewrittenLines.push(`  <meadow-srs-prompt>${promptHtml}</meadow-srs-prompt>`);
        rewrittenLines.push(`  <meadow-srs-answer>${answerHtml}</meadow-srs-answer>`);
        rewrittenLines.push('</meadow-srs-card>');
        // Blank line so marked() ends the HTML block and resumes markdown parsing
        rewrittenLines.push('');
        onCardEmitted?.({ guid: derivedClozeGuid(parsedCard.guid!, card.key), kind: 'cloze', promptHtml, answerHtml, siblingGroup: parsedCard.guid! });
      });
      i = parsedCard.nextIndex - 1;
      continue;
    }

    const promptHtml = renderMarkdownFragmentToHtml(parsedCard.promptMarkdown).trim();
    const answerHtml = renderMarkdownFragmentToHtml(parsedCard.answerMarkdown).trim();

    rewrittenLines.push(`<meadow-srs-card guid="${escapeAttribute(parsedCard.guid)}" kind="${escapeAttribute(parsedCard.kind)}">`);
    rewrittenLines.push(`  <meadow-srs-prompt>${promptHtml}</meadow-srs-prompt>`);
    rewrittenLines.push(`  <meadow-srs-answer>${answerHtml}</meadow-srs-answer>`);
    rewrittenLines.push('</meadow-srs-card>');
    // Blank line so marked() ends the HTML block and resumes markdown parsing
    rewrittenLines.push('');
    onCardEmitted?.({ guid: parsedCard.guid, kind: parsedCard.kind, promptHtml, answerHtml });

    i = parsedCard.nextIndex - 1;
  }

  return rewrittenLines.join('\n');
}
