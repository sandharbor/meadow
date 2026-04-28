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

function extractTagsFromLineOutsideWikilinks(line: string): Array<{ body: string }> {
  const tags: Array<{ body: string }> = [];
  TAG_BODY_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_BODY_RE.exec(line)) !== null) {
    const body = match[2];
    if (!body || isAllNumeric(body)) continue;
    tags.push({ body });
  }
  return tags;
}

function stripInlineCodeSegments(line: string): string[] {
  // Split by backticks; even indices are outside inline code.
  return line.split('`').filter((_seg, idx) => idx % 2 === 0);
}

function splitOutsideWikiLinks(text: string): Array<{ type: 'text' | 'wikilink'; value: string }> {
  const parts: Array<{ type: 'text' | 'wikilink'; value: string }> = [];
  const re = /\[\[[^\]]*?\]\]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push({ type: 'text', value: text.slice(last, idx) });
    parts.push({ type: 'wikilink', value: m[0] });
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

export function extractObsidianTagsFromMarkdown(markdown: string): Map<string, string> {
  // Returns map tagKey -> exampleOriginalBody (for display)
  const tagKeyToExample = new Map<string, string>();
  const content = removeFrontmatter(markdown);
  const lines = content.split('\n');
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    // Skip markdown headings (avoid confusing "# Heading" for a tag)
    if (/^#{1,6}\s/.test(trimmed)) continue;

    for (const outsideInlineCode of stripInlineCodeSegments(line)) {
      const parts = splitOutsideWikiLinks(outsideInlineCode);
      for (const part of parts) {
        if (part.type !== 'text') continue;
        for (const tag of extractTagsFromLineOutsideWikilinks(part.value)) {
          const key = normalizeTagToKey(tag.body);
          if (!tagKeyToExample.has(key)) {
            tagKeyToExample.set(key, tag.body);
          }
        }
      }
    }
  }

  return tagKeyToExample;
}

function rewriteTagsInTextChunk(text: string, tagBodyToPageTitle: (tagBody: string) => string): string {
  TAG_BODY_RE.lastIndex = 0;
  return text.replace(TAG_BODY_RE, (full, prefix: string, body: string) => {
    if (!body || isAllNumeric(body)) return full;
    const pageTitle = tagBodyToPageTitle(body);
    // Preserve original case for display, but link to normalized page title.
    return `${prefix}[[${pageTitle}|#${body}]]`;
  });
}

export function rewriteObsidianTagsToWikiLinks(
  markdown: string,
  tagBodyToPageTitle: (tagBody: string) => string
): string {
  const content = removeFrontmatter(markdown);
  const lines = content.split('\n');
  let inCodeBlock = false;
  const out: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      out.push(line);
      continue;
    }
    if (inCodeBlock) {
      out.push(line);
      continue;
    }
    if (/^#{1,6}\s/.test(trimmed)) {
      out.push(line);
      continue;
    }

    const segments = line.split('`');
    for (let i = 0; i < segments.length; i++) {
      // Only rewrite outside inline code segments (even indices)
      if (i % 2 === 0) {
        const parts = splitOutsideWikiLinks(segments[i]);
        segments[i] = parts
          .map(p => (p.type === 'text' ? rewriteTagsInTextChunk(p.value, tagBodyToPageTitle) : p.value))
          .join('');
      }
    }
    out.push(segments.join('`'));
  }

  // If original markdown had frontmatter, preserve it.
  // removeFrontmatter only removed it from `content`, so we need to stitch it back.
  if (content !== markdown) {
    const fmMatch = markdown.match(/^---\n[\s\S]*?\n---\n/);
    if (fmMatch) {
      return fmMatch[0] + out.join('\n');
    }
  }
  return out.join('\n');
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


