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
import type { BundleNodeConfig } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import type { FileType } from '../../../../../../../contracts/types/FileType.js';
import type { LinkResolvedInfo } from '../../../../../../../contracts/types/IBundleNode.js';
import { replaceOutsideCode } from '../html/markdown.js';
import { LINK_PATTERN } from '../html/constants.js';
import { isLinkTracked } from '../html/linkModificationService.js';
import { bundleNodeConfigToKey } from '../../../../shared/bundle-node/nodeKeys.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';

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

function configMatchesFileInfo(config: BundleNodeConfig, info: PageFileInfo): boolean {
  if (config.bundleNodeKind !== 'file') return false;
  const configFileType = config.fileType || 'md';
  return config.bundleNodeName === info.title &&
    (config.sourceGraphSubdirectory || '') === info.sourceGraphSubdirectory &&
    configFileType === info.fileType;
}

function findMatchingConfig(
  bundleNodeConfs: Record<string, BundleNodeConfig>,
  info: PageFileInfo
): BundleNodeConfig | undefined {
  return Object.values(bundleNodeConfs).find(conf => configMatchesFileInfo(conf, info));
}

function pageIdentForConfig(config: BundleNodeConfig): string {
  if (config.bundleNodeKind !== 'file') throw new Error(`Cannot create a source page identifier for ${config.bundleNodeKind} node ${config.bundleNodeId}`);
  const fileType = config.fileType || 'md';
  const sourceGraphSubdirectory = config.sourceGraphSubdirectory || '';
  const filename = `${config.bundleNodeName}.${fileType}`;
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
  bundleNodeConfigsForLinks: BundleNodeConfig[],
  linkResolutionMap?: LinkResolutionMap
): boolean {
  if (hasOwnLinkResolution(linkResolutionMap, linkText)) {
    const resolved = linkResolutionMap?.[linkText];
    if (!resolved?.link_resolved_target_path) {
      return false;
    }
  }

  return isLinkTracked(linkText, bundleNodeConfigsForLinks, linkResolutionMap);
}

/**
 * Replaces wiki-links and embeds to non-publishable pages/assets with
 * `_link not tracked_` in markdown content. Links inside fenced code blocks
 * and inline code spans are left unchanged.
 */
export function sanitizeMarkdownLinks(
  content: string,
  bundleNodeConfigsForLinks: BundleNodeConfig[],
  linkResolutionMap?: LinkResolutionMap,
  replacement: string = MARKDOWN_LINK_REPLACEMENT
): string {
  return replaceOutsideCode(content, WIKI_LINK_OR_EMBED_PATTERN, (match: string, linkText: string) => {
    if (isLinkSafeForSourceScrubbing(linkText, bundleNodeConfigsForLinks, linkResolutionMap)) {
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
  bundleNodeConfigsForLinks: BundleNodeConfig[],
  linkResolutionMap?: LinkResolutionMap
): boolean {
  return wikiLinkTextsIn(text).some(
    linkText => !isLinkSafeForSourceScrubbing(linkText, bundleNodeConfigsForLinks, linkResolutionMap)
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
  bundleNodeConfigsForLinks: BundleNodeConfig[],
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
    if (!hasUnsafeWikiLink(text, bundleNodeConfigsForLinks, linkResolutionMap)) {
      return line;
    }

    unsafeTextElementIds.add(elementId);
    return `${EXCALIDRAW_TEXT_REPLACEMENT}${suffix}`;
  });

  nextContent = replaceMarkdownSection(nextContent, 'Element Links', (line) => {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.+?)\s*$/);
    if (!match) return line;

    const [, elementId, linkText] = match;
    if (!hasUnsafeWikiLink(linkText, bundleNodeConfigsForLinks, linkResolutionMap)) {
      return line;
    }

    unsafeLinkedElementIds.add(elementId);
    return null;
  });

  nextContent = replaceMarkdownSection(nextContent, 'Embedded Files', (line) => {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.+?)\s*$/);
    if (!match) return line;

    const [, fileId, linkText] = match;
    if (!hasUnsafeWikiLink(linkText, bundleNodeConfigsForLinks, linkResolutionMap)) {
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
  bundleNodeConfigsForLinks: BundleNodeConfig[],
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
      if (inner && !isLinkSafeForSourceScrubbing(inner, bundleNodeConfigsForLinks, linkResolutionMap)) {
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
  bundleNodeConfigsForLinks: BundleNodeConfig[],
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
        bundleNodeConfigsForLinks,
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
  bundleNodeConfigsForLinks: BundleNodeConfig[],
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
        bundleNodeConfigsForLinks,
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
  bundleNodeConfigsForLinks: BundleNodeConfig[],
  linkResolutionMap?: LinkResolutionMap,
  replacement: string = MARKDOWN_LINK_REPLACEMENT
): string {
  const {
    content: contentWithSanitizedSections,
    unsafeTextElementIds,
    unsafeLinkedElementIds,
    unsafeEmbeddedFileIds,
  } = sanitizeExcalidrawMarkdownSections(content, bundleNodeConfigsForLinks, linkResolutionMap);

  const contentWithSanitizedCompressedScene = scrubCompressedExcalidrawBlocks(
    contentWithSanitizedSections,
    unsafeTextElementIds,
    unsafeLinkedElementIds,
    unsafeEmbeddedFileIds,
    bundleNodeConfigsForLinks,
    linkResolutionMap
  );

  const contentWithSanitizedScene = scrubJsonExcalidrawBlocks(
    contentWithSanitizedCompressedScene,
    unsafeTextElementIds,
    unsafeLinkedElementIds,
    unsafeEmbeddedFileIds,
    bundleNodeConfigsForLinks,
    linkResolutionMap
  );

  return sanitizeMarkdownLinks(contentWithSanitizedScene, bundleNodeConfigsForLinks, linkResolutionMap, replacement);
}

/**
 * Produces the safe source directory used by generated bundle files. The output
 * contains only whitelisted pages/assets reachable in the bundle graph, and its
 * text-content files have links to non-output pages scrubbed.
 */
export function prepareScrubbedSourceDirectory(
  sourceContentDir: string,
  scrubbedContentDir: string,
  traversablePageKeys: Set<string>,
  bundleNodeConfs: Record<string, BundleNodeConfig>,
  bundleNodeConfigsForLinks: BundleNodeConfig[],
  allLinkResolutionMaps?: AllLinkResolutionMaps
): void {
  if (fs.existsSync(scrubbedContentDir)) {
    fs.rmSync(scrubbedContentDir, { recursive: true, force: true });
  }
  fs.mkdirSync(scrubbedContentDir, { recursive: true });

  for (const config of Object.values(bundleNodeConfs)) {
    if (config.bundleNodeKind !== 'folder' || config.listType !== 'whitelist') continue;
    if (!traversablePageKeys.has(bundleNodeConfigToKey(config))) continue;
    const sourceFolder = config.sourceGraphSubdirectory
      ? path.join(sourceContentDir, ...config.sourceGraphSubdirectory.split('/'))
      : sourceContentDir;
    if (!fs.existsSync(sourceFolder) || !fs.statSync(sourceFolder).isDirectory()) continue;
    const outputFolder = config.sourceGraphSubdirectory
      ? path.join(scrubbedContentDir, ...config.sourceGraphSubdirectory.split('/'))
      : scrubbedContentDir;
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  const allFiles = walkFilesRecursively(sourceContentDir);

  for (const filePath of allFiles) {
    const relativePath = path.relative(sourceContentDir, filePath);
    const fileInfo = pageFileInfoForRelativePath(relativePath);
    if (!fileInfo) {
      logger.debug(`Source scrubbing: skipping unsupported file ${relativePath}`);
      continue;
    }

    const matchingConf = findMatchingConfig(bundleNodeConfs, fileInfo);
    if (!matchingConf) {
      logger.debug(`Source scrubbing: skipping untracked file ${relativePath}`);
      continue;
    }

    if (matchingConf.listType !== 'whitelist') {
      logger.debug(`Source scrubbing: skipping non-whitelisted file ${relativePath}`);
      continue;
    }

    const key = bundleNodeConfigToKey(matchingConf);
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
        ? sanitizeExcalidrawSource(content, bundleNodeConfigsForLinks, linkResolutionMap, HTML_LINK_NOT_TRACKED_REPLACEMENT)
        : sanitizeMarkdownLinks(content, bundleNodeConfigsForLinks, linkResolutionMap, HTML_LINK_NOT_TRACKED_REPLACEMENT);
      fs.writeFileSync(outputPath, scrubbedContent, 'utf-8');
    } else {
      fs.copyFileSync(filePath, outputPath);
    }
  }
}
