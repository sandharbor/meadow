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
import { removeFrontmatter } from '../html/markdown.js';
import { blankOutCode } from '../html/markdownCode.js';

/**
 * Obsidian tags (per docs) generally allow:
 * - letters/numbers
 * - underscore, hyphen
 * - forward slash for nested tags (e.g. #parent/child)
 *
 * We treat tags as case-insensitive and reject tags that are all-numeric.
 */
const TAG_BODY_RE = /(^|[^A-Za-z0-9_/-])#([A-Za-z0-9][A-Za-z0-9_/-]*)/g;

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
 * Finds tags outside code, headings and wikilinks. Code and wikilinks are
 * blanked out first, so the offsets refer to the original content.
 */
function findTags(content: string): TagOccurrence[] {
  const tags: TagOccurrence[] = [];
  let lineStart = 0;
  for (const line of blankOutCode(content).split('\n')) {
    // Skip markdown headings (avoid confusing "# Heading" for a tag)
    if (!/^#{1,6}\s/.test(line.trimStart())) {
      const scannable = line.replace(/\[\[[^\]]*?\]\]/g, wikilink => ' '.repeat(wikilink.length));
      TAG_BODY_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = TAG_BODY_RE.exec(scannable)) !== null) {
        const body = match[2];
        if (!body || isAllNumeric(body)) continue;
        tags.push({ start: lineStart + match.index + match[1].length, body });
      }
    }
    lineStart += line.length + 1;
  }
  return tags;
}

export function extractObsidianTagsFromMarkdown(markdown: string): Map<string, string> {
  // Returns map tagKey -> exampleOriginalBody (for display)
  const tagKeyToExample = new Map<string, string>();
  for (const tag of findTags(removeFrontmatter(markdown))) {
    const key = normalizeTagToKey(tag.body);
    if (!tagKeyToExample.has(key)) {
      tagKeyToExample.set(key, tag.body);
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

  // If original markdown had frontmatter, preserve it.
  // removeFrontmatter only removed it from `content`, so we need to stitch it back.
  if (content !== markdown) {
    const fmMatch = markdown.match(/^---\n[\s\S]*?\n---\n/);
    if (fmMatch) {
      return fmMatch[0] + rewritten;
    }
  }
  return rewritten;
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

