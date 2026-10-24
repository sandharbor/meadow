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
import * as yaml from 'js-yaml';
import { removeFrontmatter } from '../html/markdown.js';
import { splitFrontmatter } from '../../../../shared/utils/frontmatterUtils.js';
import { blankOutCode } from '../html/markdownCode.js';

/**
 * Obsidian tags (per docs) generally allow:
 * - letters and numbers in any script, and emoji
 * - underscore, hyphen
 * - forward slash for nested tags (e.g. #parent/child)
 *
 * A tag can follow any character that cannot be part of a tag, so `(#tag)` and
 * `**#tag**` are tags. A `#` inside a Markdown link destination, an HTML tag or
 * an HTML entity (`](#heading)`, `href="#top"`, `&#x27;`) is not; findTags
 * blanks those out before searching.
 *
 * We treat tags as case-insensitive and reject tags that are all-numeric.
 */
const TAG_CHARACTERS = String.raw`\p{L}\p{M}\p{N}\p{Extended_Pictographic}`;
/** A tag's body, without the `#`. Regexes built from it need the `u` flag. */
export const TAG_BODY_PATTERN = String.raw`[${TAG_CHARACTERS}][${TAG_CHARACTERS}\u200d_/-]*`;
const TAG_BODY_RE = new RegExp(String.raw`(^|[^${TAG_CHARACTERS}_/-])#(${TAG_BODY_PATTERN})`, 'gu');

/** Text in which a `#` is never a tag, on a single line. */
const NOT_TAG_TEXT = [
  /\[\[[^\]]*?\]\]/g, // wikilinks
  /\]\([^)]*\)/g, // Markdown link destinations
  /<\/?[A-Za-z][^>]*>/g, // HTML tags, including their attributes
  /&(?:#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g, // HTML entities
  /\{#[^}\s]*\}/g, // a custom heading id: `## Heading {#id}`
];

export function normalizeTagToKey(tagBody: string): string {
  return tagBody.toLowerCase();
}

export function tagKeyToPageTitle(tagKey: string): string {
  // Keep a stable, filesystem/URL-safe title that is unlikely to collide with user notes.
  // Nested tags use "/" which we map to "--" so the page title stays a single segment.
  return `tag--${tagKey.split('/').join('--')}`;
}

function isAllNumeric(tagBody: string): boolean {
  return /^[0-9]+$/.test(tagBody);
}

interface TagOccurrence {
  /** Offset of the tag's `#` in the content. */
  start: number;
  body: string;
}

/**
 * Finds tags outside code and NOT_TAG_TEXT. Those are blanked out first, so
 * the offsets refer to the original content. A heading may contain tags; its
 * own `#` marks are followed by a space, so they are never tags.
 */
function findTags(content: string): TagOccurrence[] {
  const tags: TagOccurrence[] = [];
  let lineStart = 0;
  for (const line of blankOutCode(content).split('\n')) {
    const scannable = NOT_TAG_TEXT.reduce((text, pattern) => text.replace(pattern, found => ' '.repeat(found.length)), line);
    TAG_BODY_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TAG_BODY_RE.exec(scannable)) !== null) {
      const body = match[2];
      if (!body || isAllNumeric(body)) continue;
      tags.push({ start: lineStart + match.index + match[1].length, body });
    }
    lineStart += line.length + 1;
  }
  return tags;
}

const WHOLE_TAG = new RegExp(`^${TAG_BODY_PATTERN}$`, 'u');

/**
 * The tags in a note's `tags` frontmatter property: a list, or a string of
 * tags separated by commas or spaces, each with or without `#`. Excalidraw
 * drawings are skipped, since their Markdown is the drawing's data.
 */
function frontmatterTags(markdown: string): string[] {
  const split = splitFrontmatter(markdown);
  if (!split || /^excalidraw-plugin:/m.test(split.yaml)) return [];
  let data: unknown;
  try {
    data = yaml.load(split.yaml);
  } catch {
    return [];
  }
  const value = data && typeof data === 'object' ? (data as Record<string, unknown>).tags : undefined;
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,]+/) : [];
  return values
    .map(tag => String(tag).trim().replace(/^#/, ''))
    .filter(tag => WHOLE_TAG.test(tag) && !isAllNumeric(tag));
}

export function extractObsidianTagsFromMarkdown(markdown: string): Map<string, string> {
  // Returns map tagKey -> exampleOriginalBody (for display)
  const tagKeyToExample = new Map<string, string>();
  const bodies = [...frontmatterTags(markdown), ...findTags(removeFrontmatter(markdown)).map(tag => tag.body)];
  for (const body of bodies) {
    const key = normalizeTagToKey(body);
    if (!tagKeyToExample.has(key)) {
      tagKeyToExample.set(key, body);
    }
  }
  return tagKeyToExample;
}

export function rewriteObsidianTagsToWikiLinks(
  markdown: string,
  tagBodyToPageTitle: (tagBody: string) => string
): string {
  const content = removeFrontmatter(markdown);
  let rewritten = '';
  let cursor = 0;
  for (const tag of findTags(content)) {
    const pageTitle = tagBodyToPageTitle(tag.body);
    // Preserve original case for display, but link to normalized page title.
    rewritten += `${content.slice(cursor, tag.start)}[[${pageTitle}|#${tag.body}]]`;
    cursor = tag.start + 1 + tag.body.length;
  }
  rewritten += content.slice(cursor);

  // Frontmatter tags do not appear in the text, so they are shown, as
  // Obsidian shows them, as a line of tag links at the top of the note.
  const fromFrontmatter = frontmatterTags(markdown);
  if (fromFrontmatter.length) {
    const links = fromFrontmatter.map(tag => `[[${tagBodyToPageTitle(tag)}|#${tag}]]`).join(' ');
    rewritten = `${links}\n\n${rewritten}`;
  }

  // `content` is `markdown` without its frontmatter; put the frontmatter back unchanged.
  return markdown.slice(0, markdown.length - content.length) + rewritten;
}

export function listMarkdownFilesRecursive(rootDir: string, opts?: { excludeDirNames?: Set<string> }): string[] {
  const exclude = opts?.excludeDirNames ?? new Set<string>();
  const results: string[] = [];
  const stack: string[] = [rootDir];

  while (stack.length) {
    const dir = stack.pop()!;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const fullPath = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!exclude.has(ent.name)) stack.push(fullPath);
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

