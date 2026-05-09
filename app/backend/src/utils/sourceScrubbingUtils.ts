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
import LZString from 'lz-string';
import type { SitePageConfig } from '../../../shared_code/types/sitePageConfig.js';
import type { FileType } from '../../../shared_code/types/FileType.js';
import type { LinkResolvedInfo } from '../../../shared_code/types/ISitePage.js';
import { replaceOutsideCode } from '../html/markdown.js';
import { LINK_PATTERN } from '../html/constants.js';
import { isLinkTracked } from '../html/linkModificationService.js';
import { pageConfigToKey } from '../html/types.js';
import { logger } from './logging/backendLoggingUtils.js';

type LinkResolutionMap = Record<string, LinkResolvedInfo>;
type AllLinkResolutionMaps = Map<string, LinkResolutionMap>;

const WIKI_LINK_OR_EMBED_PATTERN = /!?\[\[(.*?)\]\]/g;
const EXCALIDRAW_TEXT_REPLACEMENT = 'link not tracked';
const MARKDOWN_LINK_REPLACEMENT = '_link not tracked_';
export const HTML_LINK_NOT_TRACKED_REPLACEMENT = '<span class="link-not-tracked">link not tracked</span>';

type PageFileInfo = {
  title: string;
  sourceGraphSubdirectory: string;
  fileType: FileType;
};

function walkFilesRecursively(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFilesRecursively(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function relativeDirFor(relativePath: string): string {
  const dir = path.dirname(relativePath);
  return dir === '.' ? '' : toPosixPath(dir);
}

function pageFileInfoForRelativePath(relativePath: string): PageFileInfo | null {
  const sourceGraphSubdirectory = relativeDirFor(relativePath);
  const basename = path.basename(relativePath);

  if (basename.endsWith('.excalidraw.md')) {
    return {
      title: basename.slice(0, -'.excalidraw.md'.length),
      sourceGraphSubdirectory,
      fileType: 'excalidraw',
    };
  }

  if (basename.endsWith('.md')) {
    return {
      title: basename.slice(0, -'.md'.length),
      sourceGraphSubdirectory,
      fileType: 'md',
    };
  }

  const ext = path.extname(basename).slice(1) as FileType;
  if (!ext) return null;
  return {
    title: path.basename(basename, path.extname(basename)),
    sourceGraphSubdirectory,
    fileType: ext,
  };
}

function configMatchesFileInfo(config: SitePageConfig, info: PageFileInfo): boolean {
  const configFileType = config.file_type || 'md';
  return config.title === info.title &&
    (config.source_graph_subdirectory || '') === info.sourceGraphSubdirectory &&
    configFileType === info.fileType;
}

function findMatchingConfig(
  sitePageConfs: Record<string, SitePageConfig>,
  info: PageFileInfo
): SitePageConfig | undefined {
  return Object.values(sitePageConfs).find(conf => configMatchesFileInfo(conf, info));
}

function pageIdentForConfig(config: SitePageConfig): string {
  const fileType = config.file_type || 'md';
  const sourceGraphSubdirectory = config.source_graph_subdirectory || '';
  const filename = `${config.title}.${fileType}`;
  return sourceGraphSubdirectory ? `${sourceGraphSubdirectory}/${filename}` : `/${filename}`;
}

function hasOwnLinkResolution(
  linkResolutionMap: LinkResolutionMap | undefined,
  linkText: string
): boolean {
  return !!linkResolutionMap && Object.prototype.hasOwnProperty.call(linkResolutionMap, linkText);
}

function isLinkSafeForSourceScrubbing(
  linkText: string,
  sitePageConfigsForLinks: SitePageConfig[],
  linkResolutionMap?: LinkResolutionMap
): boolean {
  if (hasOwnLinkResolution(linkResolutionMap, linkText)) {
    const resolved = linkResolutionMap?.[linkText];
    if (!resolved?.link_resolved_target_path) {
      return false;
    }
  }

  return isLinkTracked(linkText, sitePageConfigsForLinks, linkResolutionMap);
}

/**
 * Replaces wiki-links and embeds to non-publishable pages/assets with
 * `_link not tracked_` in markdown content. Links inside fenced code blocks
 * and inline code spans are left unchanged.
 */
export function sanitizeMarkdownLinks(
  content: string,
  sitePageConfigsForLinks: SitePageConfig[],
  linkResolutionMap?: LinkResolutionMap,
  replacement: string = MARKDOWN_LINK_REPLACEMENT
): string {
  return replaceOutsideCode(content, WIKI_LINK_OR_EMBED_PATTERN, (match: string, linkText: string) => {
    if (isLinkSafeForSourceScrubbing(linkText, sitePageConfigsForLinks, linkResolutionMap)) {
      return match;
    }
    return replacement;
  });
}

function wikiLinkTextsIn(text: string): string[] {
  const linkTexts: string[] = [];
  const pattern = new RegExp(LINK_PATTERN.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    linkTexts.push(match[1]);
  }
  return linkTexts;
}

function hasUnsafeWikiLink(
  text: string,
  sitePageConfigsForLinks: SitePageConfig[],
  linkResolutionMap?: LinkResolutionMap
): boolean {
  return wikiLinkTextsIn(text).some(
    linkText => !isLinkSafeForSourceScrubbing(linkText, sitePageConfigsForLinks, linkResolutionMap)
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceMarkdownSection(
  content: string,
  sectionTitle: string,
  transformLine: (line: string) => string | null
): string {
  const sectionPattern = new RegExp(
    `((?:^|\\n)#{1,6}\\s+${escapeRegExp(sectionTitle)}\\s*\\n)([\\s\\S]*?)(?=\\n#{1,6}\\s|\\n%%|(?![\\s\\S]))`
  );

  return content.replace(sectionPattern, (_match: string, heading: string, body: string) => {
    const transformed = body
      .split('\n')
      .map(transformLine)
      .filter((line): line is string => line !== null)
      .join('\n');
    return `${heading}${transformed}`;
  });
}

function sanitizeExcalidrawMarkdownSections(
  content: string,
  sitePageConfigsForLinks: SitePageConfig[],
  linkResolutionMap: LinkResolutionMap | undefined
): {
  content: string;
  unsafeTextElementIds: Set<string>;
  unsafeLinkedElementIds: Set<string>;
  unsafeEmbeddedFileIds: Set<string>;
} {
  const unsafeTextElementIds = new Set<string>();
  const unsafeLinkedElementIds = new Set<string>();
  const unsafeEmbeddedFileIds = new Set<string>();

  let nextContent = replaceMarkdownSection(content, 'Text Elements', (line) => {
    const match = line.match(/^(.*?)(\s+\^([A-Za-z0-9_-]+)\s*)$/);
    if (!match) return line;

    const [, text, suffix, elementId] = match;
    if (!hasUnsafeWikiLink(text, sitePageConfigsForLinks, linkResolutionMap)) {
      return line;
    }

    unsafeTextElementIds.add(elementId);
    return `${EXCALIDRAW_TEXT_REPLACEMENT}${suffix}`;
  });

  nextContent = replaceMarkdownSection(nextContent, 'Element Links', (line) => {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.+?)\s*$/);
    if (!match) return line;

    const [, elementId, linkText] = match;
    if (!hasUnsafeWikiLink(linkText, sitePageConfigsForLinks, linkResolutionMap)) {
      return line;
    }

    unsafeLinkedElementIds.add(elementId);
    return null;
  });

  nextContent = replaceMarkdownSection(nextContent, 'Embedded Files', (line) => {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.+?)\s*$/);
    if (!match) return line;

    const [, fileId, linkText] = match;
    if (!hasUnsafeWikiLink(linkText, sitePageConfigsForLinks, linkResolutionMap)) {
      return line;
    }

    unsafeEmbeddedFileIds.add(fileId);
    return null;
  });

  return { content: nextContent, unsafeTextElementIds, unsafeLinkedElementIds, unsafeEmbeddedFileIds };
}

function wikilinkInner(text: string): string | null {
  const match = text.match(/\[\[([^\]]+)\]\]/);
  return match ? match[1].trim() : null;
}

function sanitizeExcalidrawScene(
  scene: unknown,
  unsafeTextElementIds: Set<string>,
  unsafeLinkedElementIds: Set<string>,
  unsafeEmbeddedFileIds: Set<string>,
  sitePageConfigsForLinks: SitePageConfig[],
  linkResolutionMap: LinkResolutionMap | undefined
): { scene: unknown; changed: boolean } {
  if (!scene || typeof scene !== 'object') {
    return { scene, changed: false };
  }

  const maybeScene = scene as { elements?: unknown[]; files?: Record<string, unknown> };
  if (!Array.isArray(maybeScene.elements)) {
    return { scene, changed: false };
  }

  let changed = false;
  const filteredElements: unknown[] = [];
  for (const element of maybeScene.elements) {
    if (!element || typeof element !== 'object') {
      filteredElements.push(element);
      continue;
    }
    const mutableElement = element as {
      id?: string;
      fileId?: string;
      type?: string;
      text?: string;
      originalText?: string;
      link?: string | null;
      hasTextLink?: boolean;
    };
    const elementId = mutableElement.id;

    if (mutableElement.type === 'image' && mutableElement.fileId && unsafeEmbeddedFileIds.has(mutableElement.fileId)) {
      changed = true;
      continue;
    }

    filteredElements.push(element);
    if (!elementId) continue;

    if (unsafeTextElementIds.has(elementId)) {
      if (mutableElement.type === 'text') {
        mutableElement.text = EXCALIDRAW_TEXT_REPLACEMENT;
        mutableElement.originalText = EXCALIDRAW_TEXT_REPLACEMENT;
      }
      mutableElement.link = null;
      mutableElement.hasTextLink = false;
      changed = true;
      continue;
    }

    if (unsafeLinkedElementIds.has(elementId)) {
      mutableElement.link = null;
      changed = true;
      continue;
    }

    if (typeof mutableElement.link === 'string') {
      const inner = wikilinkInner(mutableElement.link);
      if (inner && !isLinkSafeForSourceScrubbing(inner, sitePageConfigsForLinks, linkResolutionMap)) {
        mutableElement.link = null;
        changed = true;
      }
    }
  }

  if (filteredElements.length !== maybeScene.elements.length) {
    maybeScene.elements = filteredElements;
    changed = true;
  }
  if (maybeScene.files && typeof maybeScene.files === 'object') {
    for (const fileId of unsafeEmbeddedFileIds) {
      if (Object.prototype.hasOwnProperty.call(maybeScene.files, fileId)) {
        delete maybeScene.files[fileId];
        changed = true;
      }
    }
  }

  return { scene, changed };
}

function scrubCompressedExcalidrawBlocks(
  content: string,
  unsafeTextElementIds: Set<string>,
  unsafeLinkedElementIds: Set<string>,
  unsafeEmbeddedFileIds: Set<string>,
  sitePageConfigsForLinks: SitePageConfig[],
  linkResolutionMap: LinkResolutionMap | undefined
): string {
  return content.replace(/```compressed-json\n([\s\S]*?)\n```/g, (match: string, compressed: string) => {
    const blob = compressed.replace(/\s+/g, '');
    const json = LZString.decompressFromBase64(blob);
    if (!json) return match;

    try {
      const parsed = JSON.parse(json) as unknown;
      const scrubbed = sanitizeExcalidrawScene(
        parsed,
        unsafeTextElementIds,
        unsafeLinkedElementIds,
        unsafeEmbeddedFileIds,
        sitePageConfigsForLinks,
        linkResolutionMap
      );
      if (!scrubbed.changed) return match;
      return `\`\`\`compressed-json\n${LZString.compressToBase64(JSON.stringify(scrubbed.scene))}\n\`\`\``;
    } catch (error) {
      logger.warn(`Source scrubbing: failed to scrub compressed Excalidraw JSON: ${error instanceof Error ? error.message : String(error)}`);
      return match;
    }
  });
}

function scrubJsonExcalidrawBlocks(
  content: string,
  unsafeTextElementIds: Set<string>,
  unsafeLinkedElementIds: Set<string>,
  unsafeEmbeddedFileIds: Set<string>,
  sitePageConfigsForLinks: SitePageConfig[],
  linkResolutionMap: LinkResolutionMap | undefined
): string {
  return content.replace(/```json\n([\s\S]*?)\n```/g, (match: string, json: string) => {
    try {
      const parsed = JSON.parse(json) as { type?: string };
      if (parsed.type !== 'excalidraw') return match;
      const scrubbed = sanitizeExcalidrawScene(
        parsed,
        unsafeTextElementIds,
        unsafeLinkedElementIds,
        unsafeEmbeddedFileIds,
        sitePageConfigsForLinks,
        linkResolutionMap
      );
      if (!scrubbed.changed) return match;
      return `\`\`\`json\n${JSON.stringify(scrubbed.scene, null, 2)}\n\`\`\``;
    } catch {
      return match;
    }
  });
}

export function sanitizeExcalidrawSource(
  content: string,
  sitePageConfigsForLinks: SitePageConfig[],
  linkResolutionMap?: LinkResolutionMap,
  replacement: string = MARKDOWN_LINK_REPLACEMENT
): string {
  const {
    content: contentWithSanitizedSections,
    unsafeTextElementIds,
    unsafeLinkedElementIds,
    unsafeEmbeddedFileIds,
  } = sanitizeExcalidrawMarkdownSections(content, sitePageConfigsForLinks, linkResolutionMap);

  const contentWithSanitizedCompressedScene = scrubCompressedExcalidrawBlocks(
    contentWithSanitizedSections,
    unsafeTextElementIds,
    unsafeLinkedElementIds,
    unsafeEmbeddedFileIds,
    sitePageConfigsForLinks,
    linkResolutionMap
  );

  const contentWithSanitizedScene = scrubJsonExcalidrawBlocks(
    contentWithSanitizedCompressedScene,
    unsafeTextElementIds,
    unsafeLinkedElementIds,
    unsafeEmbeddedFileIds,
    sitePageConfigsForLinks,
    linkResolutionMap
  );

  return sanitizeMarkdownLinks(contentWithSanitizedScene, sitePageConfigsForLinks, linkResolutionMap, replacement);
}

/**
 * Produces the safe source directory used by generated site files. The output
 * contains only whitelisted pages/assets reachable in the site graph, and its
 * text-content files have links to non-output pages scrubbed.
 */
export function prepareScrubbedSourceDirectory(
  sourceContentDir: string,
  scrubbedContentDir: string,
  traversablePageKeys: Set<string>,
  sitePageConfs: Record<string, SitePageConfig>,
  sitePageConfigsForLinks: SitePageConfig[],
  allLinkResolutionMaps?: AllLinkResolutionMaps
): void {
  if (fs.existsSync(scrubbedContentDir)) {
    fs.rmSync(scrubbedContentDir, { recursive: true, force: true });
  }
  fs.mkdirSync(scrubbedContentDir, { recursive: true });

  const allFiles = walkFilesRecursively(sourceContentDir);

  for (const filePath of allFiles) {
    const relativePath = path.relative(sourceContentDir, filePath);
    const fileInfo = pageFileInfoForRelativePath(relativePath);
    if (!fileInfo) {
      logger.debug(`Source scrubbing: skipping unsupported file ${relativePath}`);
      continue;
    }

    const matchingConf = findMatchingConfig(sitePageConfs, fileInfo);
    if (!matchingConf) {
      logger.debug(`Source scrubbing: skipping untracked file ${relativePath}`);
      continue;
    }

    if (matchingConf.config.list_type !== 'whitelist') {
      logger.debug(`Source scrubbing: skipping non-whitelisted file ${relativePath}`);
      continue;
    }

    const key = pageConfigToKey(matchingConf);
    if (!traversablePageKeys.has(key)) {
      logger.debug(`Source scrubbing: skipping non-traversable file ${relativePath}`);
      continue;
    }

    const outputPath = path.join(scrubbedContentDir, relativePath);
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (fileInfo.fileType === 'md' || fileInfo.fileType === 'excalidraw') {
      const pageIdent = pageIdentForConfig(matchingConf);
      const linkResolutionMap = allLinkResolutionMaps?.get(pageIdent);
      const content = fs.readFileSync(filePath, 'utf-8');
      const scrubbedContent = fileInfo.fileType === 'excalidraw'
        ? sanitizeExcalidrawSource(content, sitePageConfigsForLinks, linkResolutionMap, HTML_LINK_NOT_TRACKED_REPLACEMENT)
        : sanitizeMarkdownLinks(content, sitePageConfigsForLinks, linkResolutionMap, HTML_LINK_NOT_TRACKED_REPLACEMENT);
      fs.writeFileSync(outputPath, scrubbedContent, 'utf-8');
    } else {
      fs.copyFileSync(filePath, outputPath);
    }
  }
}
