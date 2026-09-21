/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import path from 'node:path';
import type { LinkResolvedInfo } from '../../../../../../../contracts/types/IBundleNode.js';
import { encodePathForUrl } from '../../../../../../../shared_code/utils/urlUtils.js';
import { replaceOutsideCode } from '../html/markdown.js';

export function exportedSourcePath(target: string): string {
  const relative = target.replace(/^\//, '');
  return relative.endsWith('.excalidraw') ? `${relative}.md` : relative;
}

/** URL links in downloadable material address files, including format-specific renames. */
export function rewriteResolvedSourceUrls(content: string, sourceOutputPath: string, resolutions: Record<string, LinkResolvedInfo> | undefined,
  outputPathForSource: (source: string) => string | undefined = source => source, rootRelative = false): string {
  const rewrite = (url: string) => {
    const target = resolutions?.[url]?.link_resolved_target_path;
    if (!target) return undefined;
    const output = outputPathForSource(exportedSourcePath(target));
    if (!output) return undefined;
    const relative = rootRelative ? `/${output}` : path.posix.relative(path.posix.dirname(sourceOutputPath), output);
    return `${encodePathForUrl(relative)}${url.match(/[?#].*$/)?.[0] ?? ''}`;
  };
  let result = replaceOutsideCode(content, /(!?)\[([^\]]+)\]\(([^)]+)\)/g,
    (match: string, embed: string, label: string, url: string) => {
      const target = rewrite(url);
      return target ? `${embed}[${label}](${target})` : match;
    });
  result = replaceOutsideCode(result, /\b(href|src)(\s*=\s*)(["'])(.*?)\3/gi,
    (match: string, attribute: string, assignment: string, quote: string, url: string) => {
      const target = rewrite(url);
      return target ? `${attribute}${assignment}${quote}${target}${quote}` : match;
    });
  return result;
}

/** Obsidian exports use unambiguous paths within the downloaded vault. */
export function rewritePortableSourceWikilinks(content: string, resolutions?: Record<string, LinkResolvedInfo>): string {
  return replaceOutsideCode(content, /(!?)\[\[([^\]]+)\]\]/g, (match: string, embed: string, text: string) => {
    const target = resolutions?.[text]?.link_resolved_target_path;
    if (!target) return match;
    let suffix = text.search(/[#^|]/);
    if (suffix > 0 && text[suffix - 1] === '\\') suffix--;
    return `${embed}[[${exportedSourcePath(target)}${suffix < 0 ? '' : text.slice(suffix)}]]`;
  });
}
