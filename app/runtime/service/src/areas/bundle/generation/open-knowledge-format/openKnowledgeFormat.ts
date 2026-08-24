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
import type { BundleNodeConfig } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import type { LinkResolvedInfo } from '../../../../../../../contracts/types/IBundleNode.js';
import { encodePathForUrl } from '../../../../../../../shared_code/utils/urlUtils.js';
import { FrontmatterUtils } from '../../../../shared/utils/frontmatterUtils.js';
import { replaceOutsideCode } from '../html/markdown.js';
import { linkTextToLinkInfo } from '../html/shared.js';
import {
  restoreGeneratedTagWikilinks,
  restoreMarkdownLinkNotTrackedMarkers
} from '../sources-export/sourcesExport.js';
import { BundleConfigPaths } from '../../../../../../../shared_code/paths/bundleConfigPaths.js';

type LinkResolutionMap = Record<string, LinkResolvedInfo>;
type AllLinkResolutionMaps = Map<string, LinkResolutionMap>;

export type OpenKnowledgeFormatLogSource =
  | { mode: 'auto' }
  | { mode: 'none' }
  | { mode: 'trackedPage'; sourceGraphPath: string };

export type OpenKnowledgeFormatIndexSource =
  | { mode: 'generated' }
  | { mode: 'trackedPage'; sourceGraphPath: string };

export interface OpenKnowledgeFormatRename {
  sourcePath: string;
  originalOutputPath: string;
  finalOutputPath: string;
  reason: 'reserved-filename';
}

export interface PrepareOpenKnowledgeFormatOptions {
  bundleNodeConfigs: BundleNodeConfig[];
  allLinkResolutionMaps?: AllLinkResolutionMaps;
  entryNodeName?: string;
  entrySourceGraphSubdirectory?: string;
  indexSource?: OpenKnowledgeFormatIndexSource;
  logSource?: OpenKnowledgeFormatLogSource;
  generatedIndexMarkdown?: string;
}

export interface PrepareOpenKnowledgeFormatResult {
  renames: OpenKnowledgeFormatRename[];
  indexOutputPath: string;
  logOutputPath: string | null;
}

const WIKI_LINK_OR_EMBED_PATTERN = /(!?)\[\[([^\]]+)\]\]/g;
const RESERVED_MARKDOWN_FILENAMES = new Set(['index.md', 'log.md']);
const DEFAULT_CONCEPT_TYPE = 'Knowledge Page';
const ROOT_INDEX_PATH = 'index.md';
const ROOT_LOG_PATH = 'log.md';
const OKF_FRONTMATTER_PREFIX = 'okf-';

function walkFilesSorted(dir: string, base = ''): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(path.join(dir, base), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = base ? path.join(base, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...walkFilesSorted(dir, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function outputPathToFilesystemPath(outputDir: string, outputPath: string): string {
  return path.join(outputDir, ...outputPath.split('/'));
}

function relativeDirFor(relativePath: string): string {
  const dir = path.posix.dirname(relativePath);
  return dir === '.' ? '' : dir;
}

function markdownTitleForSourcePath(sourcePath: string): string {
  const basename = path.posix.basename(sourcePath);
  if (basename.endsWith('.excalidraw.md')) {
    return basename.slice(0, -'.excalidraw.md'.length);
  }
  return basename.endsWith('.md') ? basename.slice(0, -'.md'.length) : basename;
}

function fileTypeForSourcePath(sourcePath: string): string {
  if (sourcePath.endsWith('.excalidraw.md')) return 'excalidraw';
  if (sourcePath.endsWith('.md')) return 'md';
  return path.posix.extname(sourcePath).slice(1);
}

function pageIdentForSourcePath(sourcePath: string): string {
  const dir = relativeDirFor(sourcePath);
  const title = markdownTitleForSourcePath(sourcePath);
  const fileType = fileTypeForSourcePath(sourcePath);
  const filename = `${title}.${fileType}`;
  return dir ? `${dir}/${filename}` : `/${filename}`;
}

function sourcePathForConfig(config: BundleNodeConfig): string {
  const fileType = config.fileType || 'md';
  const filename = fileType === 'excalidraw'
    ? `${config.bundleNodeName}.excalidraw.md`
    : `${config.bundleNodeName}.${fileType}`;
  const dir = config.sourceGraphSubdirectory || '';
  return dir ? `${dir}/${filename}` : filename;
}

function markdownLinkLabelFor(linkText: string): string {
  const linkInfo = linkTextToLinkInfo(linkText);
  if (linkInfo.alternative_name) return linkInfo.alternative_name;
  return path.posix.basename(linkInfo.filename);
}

function markdownLinkTargetFor(outputPath: string, section?: string): string {
  const encodedPath = encodePathForUrl(outputPath);
  if (!section) return `/${encodedPath}`;
  return `/${encodedPath}#${encodeURIComponent(section.trim())}`;
}

function escapeMarkdownLabel(label: string): string {
  return label.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

function restoreScrubbedMarkdown(content: string): string {
  return restoreMarkdownLinkNotTrackedMarkers(restoreGeneratedTagWikilinks(content));
}

function normalizeSourcePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

function findFallbackTargetSourcePath(linkText: string, sourcePathByTitleAndDir: Map<string, string>): string | null {
  const linkInfo = linkTextToLinkInfo(linkText);
  const rawFilename = linkInfo.filename.replace(/\\/g, '/').replace(/^\/+/, '');
  const explicitDir = path.posix.dirname(rawFilename);
  const dir = explicitDir === '.' ? '' : explicitDir;
  const base = path.posix.basename(rawFilename);
  const title = base.endsWith('.md') ? base.slice(0, -'.md'.length) : base;

  const exact = sourcePathByTitleAndDir.get(`${dir}\0${title}`);
  if (exact) return exact;

  const root = sourcePathByTitleAndDir.get(`\0${title}`);
  if (root) return root;

  const suffix = `\0${title}`;
  const matches = [...sourcePathByTitleAndDir.entries()]
    .filter(([key]) => key.endsWith(suffix))
    .map(([, sourcePath]) => sourcePath)
    .sort((a, b) => a.localeCompare(b));
  return matches[0] ?? null;
}

function convertWikiLinksToMarkdown(
  content: string,
  sourcePath: string,
  outputPathBySourcePath: Map<string, string>,
  sourcePathByTitleAndDir: Map<string, string>,
  allLinkResolutionMaps?: AllLinkResolutionMaps
): string {
  const linkResolutionMap = allLinkResolutionMaps?.get(pageIdentForSourcePath(sourcePath));

  return replaceOutsideCode(content, WIKI_LINK_OR_EMBED_PATTERN, (match: string, embedMarker: string, linkText: string) => {
    const linkInfo = linkTextToLinkInfo(linkText);
    const resolvedTarget = linkResolutionMap?.[linkText]?.link_resolved_target_path;
    const targetSourcePath = resolvedTarget
      ? normalizeSourcePath(resolvedTarget)
      : findFallbackTargetSourcePath(linkText, sourcePathByTitleAndDir);

    if (!targetSourcePath) return match;

    const targetOutputPath = outputPathBySourcePath.get(targetSourcePath);
    if (!targetOutputPath) return match;

    const target = markdownLinkTargetFor(targetOutputPath, linkInfo.section);
    const label = escapeMarkdownLabel(markdownLinkLabelFor(linkText));
    return embedMarker === '!' ? `![${label}](${target})` : `[${label}](${target})`;
  });
}

function uniquePathFor(baseOutputPath: string, occupied: Set<string>): string {
  if (!occupied.has(baseOutputPath)) {
    occupied.add(baseOutputPath);
    return baseOutputPath;
  }

  const dir = relativeDirFor(baseOutputPath);
  const basename = path.posix.basename(baseOutputPath);
  const ext = path.posix.extname(basename);
  const stem = ext ? basename.slice(0, -ext.length) : basename;
  let counter = 2;
  while (true) {
    const candidate = dir ? `${dir}/${stem}-${counter}${ext}` : `${stem}-${counter}${ext}`;
    if (!occupied.has(candidate)) {
      occupied.add(candidate);
      return candidate;
    }
    counter++;
  }
}

function reservedOriginalPathFor(sourcePath: string): string {
  const dir = relativeDirFor(sourcePath);
  const basename = path.posix.basename(sourcePath);
  const ext = path.posix.extname(basename);
  const stem = basename.slice(0, -ext.length);
  const renamed = `${stem}-original${ext}`;
  return dir ? `${dir}/${renamed}` : renamed;
}

function selectAutoReservedOpenKnowledgeFormatSource(
  markdownFiles: string[],
  initialSourcePath: string | null,
  rootPath: string
): string | null {
  const candidates = markdownFiles.filter(file => path.posix.basename(file) === rootPath);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const initialDir = initialSourcePath ? relativeDirFor(initialSourcePath) : '';
  const besideInitialPage = candidates.find(file => relativeDirFor(file) === initialDir);
  if (besideInitialPage) return besideInitialPage;

  const rootSource = candidates.find(file => file === rootPath);
  if (rootSource) return rootSource;

  return [...candidates].sort((a, b) => {
    const dirCompare = relativeDirFor(a).localeCompare(relativeDirFor(b));
    return dirCompare !== 0 ? dirCompare : a.localeCompare(b);
  })[0] ?? null;
}

export function selectAutoOpenKnowledgeFormatIndexSource(markdownFiles: string[], initialSourcePath: string | null): string | null {
  return selectAutoReservedOpenKnowledgeFormatSource(markdownFiles, initialSourcePath, ROOT_INDEX_PATH);
}

export function selectAutoOpenKnowledgeFormatLogSource(markdownFiles: string[], initialSourcePath: string | null): string | null {
  return selectAutoReservedOpenKnowledgeFormatSource(markdownFiles, initialSourcePath, ROOT_LOG_PATH);
}

function selectConfiguredLogSource(
  markdownFiles: string[],
  sourcePathByTitleAndDir: Map<string, string>,
  initialSourcePath: string | null,
  setting: OpenKnowledgeFormatLogSource
): string | null {
  if (setting.mode === 'none') return null;
  if (setting.mode === 'trackedPage') {
    const normalized = normalizeSourcePath(setting.sourceGraphPath);
    return markdownFiles.includes(normalized) ? normalized : null;
  }
  return selectAutoOpenKnowledgeFormatLogSource(markdownFiles, initialSourcePath);
}

function selectConfiguredIndexSource(
  markdownFiles: string[],
  setting: OpenKnowledgeFormatIndexSource
): string | null {
  if (setting.mode === 'trackedPage') {
    const normalized = normalizeSourcePath(setting.sourceGraphPath);
    return markdownFiles.includes(normalized) ? normalized : null;
  }
  return null;
}

function buildSourcePathByTitleAndDir(bundleNodeConfigs: BundleNodeConfig[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const config of bundleNodeConfigs) {
    if (config.bundleNodeKind !== 'file') continue;
    const fileType = config.fileType || 'md';
    if (fileType !== 'md' && fileType !== 'excalidraw') continue;
    const dir = config.sourceGraphSubdirectory || '';
    result.set(`${dir}\0${config.bundleNodeName}`, sourcePathForConfig(config));
  }
  return result;
}

function writeTextFile(outputDir: string, outputPath: string, content: string): void {
  const fullPath = outputPathToFilesystemPath(outputDir, outputPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

function writeBinaryFile(outputDir: string, outputPath: string, sourcePath: string): void {
  const fullPath = outputPathToFilesystemPath(outputDir, outputPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.copyFileSync(sourcePath, fullPath);
}

function frontmatterForOpenKnowledgeFormatBundle(sourceFrontmatter: Record<string, unknown>): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(sourceFrontmatter)) {
    if (!key.startsWith(OKF_FRONTMATTER_PREFIX) || key.length === OKF_FRONTMATTER_PREFIX.length) {
      frontmatter[key] = value;
    }
  }

  for (const [key, value] of Object.entries(sourceFrontmatter)) {
    if (key.startsWith(OKF_FRONTMATTER_PREFIX) && key.length > OKF_FRONTMATTER_PREFIX.length) {
      frontmatter[key.slice(OKF_FRONTMATTER_PREFIX.length)] = value;
    }
  }

  return frontmatter;
}

function conceptMarkdownFor(
  sourceMarkdown: string,
  sourcePath: string,
  outputPathBySourcePath: Map<string, string>,
  sourcePathByTitleAndDir: Map<string, string>,
  allLinkResolutionMaps?: AllLinkResolutionMaps
): string {
  const restoredMarkdown = restoreScrubbedMarkdown(sourceMarkdown);
  const parsed = FrontmatterUtils.parseFromText(restoredMarkdown);
  const sourceFrontmatter = frontmatterForOpenKnowledgeFormatBundle(parsed.frontmatter);
  const existingType = sourceFrontmatter.type;
  const title = markdownTitleForSourcePath(sourcePath);
  const frontmatter = {
    ...sourceFrontmatter,
    title: typeof sourceFrontmatter.title === 'string' && sourceFrontmatter.title.trim()
      ? sourceFrontmatter.title
      : title,
    type: typeof existingType === 'string' && existingType.trim() ? existingType : DEFAULT_CONCEPT_TYPE,
  };
  const convertedContent = convertWikiLinksToMarkdown(
    parsed.content,
    sourcePath,
    outputPathBySourcePath,
    sourcePathByTitleAndDir,
    allLinkResolutionMaps
  );
  return FrontmatterUtils.combineToText(frontmatter, convertedContent);
}

function convertedMarkdownFor(
  sourceMarkdown: string,
  sourcePath: string,
  outputPathBySourcePath: Map<string, string>,
  sourcePathByTitleAndDir: Map<string, string>,
  allLinkResolutionMaps?: AllLinkResolutionMaps
): { frontmatter: Record<string, unknown>; content: string } {
  const restoredMarkdown = restoreScrubbedMarkdown(sourceMarkdown);
  const parsed = FrontmatterUtils.parseFromText(restoredMarkdown);
  return {
    frontmatter: frontmatterForOpenKnowledgeFormatBundle(parsed.frontmatter),
    content: convertWikiLinksToMarkdown(
      parsed.content,
      sourcePath,
      outputPathBySourcePath,
      sourcePathByTitleAndDir,
      allLinkResolutionMaps
    ),
  };
}

function indexMarkdownFor(
  sourceMarkdown: string,
  sourcePath: string,
  outputPathBySourcePath: Map<string, string>,
  sourcePathByTitleAndDir: Map<string, string>,
  allLinkResolutionMaps?: AllLinkResolutionMaps
): string {
  const converted = convertedMarkdownFor(
    sourceMarkdown,
    sourcePath,
    outputPathBySourcePath,
    sourcePathByTitleAndDir,
    allLinkResolutionMaps
  );
  return FrontmatterUtils.combineToText(
    {
      ...converted.frontmatter,
      okf_version: '0.1',
    },
    converted.content
  );
}

function logMarkdownFor(
  sourceMarkdown: string,
  sourcePath: string,
  outputPathBySourcePath: Map<string, string>,
  sourcePathByTitleAndDir: Map<string, string>,
  allLinkResolutionMaps?: AllLinkResolutionMaps
): string {
  const converted = convertedMarkdownFor(
    sourceMarkdown,
    sourcePath,
    outputPathBySourcePath,
    sourcePathByTitleAndDir,
    allLinkResolutionMaps
  );
  return FrontmatterUtils.combineToText(converted.frontmatter, converted.content);
}

function rootIndexMarkdown(initialOutputPath: string | null, initialTitle: string | undefined): string {
  const frontmatter = '---\nokf_version: "0.1"\n---\n';
  if (!initialOutputPath) {
    return `${frontmatter}\n`;
  }
  const label = escapeMarkdownLabel(initialTitle || markdownTitleForSourcePath(initialOutputPath));
  return `${frontmatter}\n- [${label}](${markdownLinkTargetFor(initialOutputPath)})\n`;
}

export function prepareOpenKnowledgeFormatDirectoryFromScrubbedSourceDirectory(
  scrubbedContentDir: string,
  outputDir: string,
  options: PrepareOpenKnowledgeFormatOptions
): PrepareOpenKnowledgeFormatResult {
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  const files = walkFilesSorted(scrubbedContentDir)
    .map(toPosixPath)
    .filter(relativePath => relativePath.split('/')[0] !== BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR);
  const markdownFiles = files.filter(file => file.endsWith('.md'));
  const sourcePathByTitleAndDir = buildSourcePathByTitleAndDir(options.bundleNodeConfigs);
  const entrySourceGraphSubdirectory = options.entrySourceGraphSubdirectory || '';
  const initialSourcePath = options.entryNodeName
    ? sourcePathByTitleAndDir.get(`${entrySourceGraphSubdirectory}\0${options.entryNodeName}`) ?? null
    : null;
  const indexSourcePath = selectConfiguredIndexSource(
    markdownFiles,
    options.indexSource ?? { mode: 'generated' }
  );
  const logSourcePath = selectConfiguredLogSource(
    markdownFiles,
    sourcePathByTitleAndDir,
    initialSourcePath,
    options.logSource ?? { mode: 'auto' }
  );

  const occupied = new Set<string>([ROOT_INDEX_PATH]);
  if (logSourcePath) occupied.add(ROOT_LOG_PATH);
  const outputPathBySourcePath = new Map<string, string>();
  const renames: OpenKnowledgeFormatRename[] = [];

  for (const relativePath of files) {
    if (relativePath === indexSourcePath) continue;
    if (relativePath === logSourcePath) continue;
    if (relativePath.endsWith('.md') && RESERVED_MARKDOWN_FILENAMES.has(path.posix.basename(relativePath))) continue;
    outputPathBySourcePath.set(relativePath, uniquePathFor(relativePath, occupied));
  }

  for (const relativePath of markdownFiles) {
    if (relativePath === indexSourcePath) continue;
    if (relativePath === logSourcePath) continue;
    if (!RESERVED_MARKDOWN_FILENAMES.has(path.posix.basename(relativePath))) continue;

    const originalOutputPath = reservedOriginalPathFor(relativePath);
    const finalOutputPath = uniquePathFor(originalOutputPath, occupied);
    outputPathBySourcePath.set(relativePath, finalOutputPath);
    renames.push({
      sourcePath: relativePath,
      originalOutputPath,
      finalOutputPath,
      reason: 'reserved-filename',
    });
  }

  if (indexSourcePath) {
    outputPathBySourcePath.set(indexSourcePath, ROOT_INDEX_PATH);
  }
  if (logSourcePath && logSourcePath !== indexSourcePath) {
    outputPathBySourcePath.set(logSourcePath, ROOT_LOG_PATH);
  }

  for (const relativePath of files) {
    const sourcePath = path.join(scrubbedContentDir, ...relativePath.split('/'));
    if (relativePath.endsWith('.md')) {
      const content = fs.readFileSync(sourcePath, 'utf8');
      if (relativePath === indexSourcePath) {
        writeTextFile(outputDir, ROOT_INDEX_PATH, indexMarkdownFor(
          content,
          relativePath,
          outputPathBySourcePath,
          sourcePathByTitleAndDir,
          options.allLinkResolutionMaps
        ));
        if (relativePath === logSourcePath) {
          writeTextFile(outputDir, ROOT_LOG_PATH, logMarkdownFor(
            content,
            relativePath,
            outputPathBySourcePath,
            sourcePathByTitleAndDir,
            options.allLinkResolutionMaps
          ));
        }
        continue;
      }
      if (relativePath === logSourcePath) {
        writeTextFile(outputDir, ROOT_LOG_PATH, logMarkdownFor(
          content,
          relativePath,
          outputPathBySourcePath,
          sourcePathByTitleAndDir,
          options.allLinkResolutionMaps
        ));
        continue;
      }

      const outputPath = outputPathBySourcePath.get(relativePath);
      if (!outputPath) continue;
      const output = conceptMarkdownFor(content, relativePath, outputPathBySourcePath, sourcePathByTitleAndDir, options.allLinkResolutionMaps);
      writeTextFile(outputDir, outputPath, output);
    } else {
      const outputPath = outputPathBySourcePath.get(relativePath);
      if (!outputPath) continue;
      writeBinaryFile(outputDir, outputPath, sourcePath);
    }
  }

  const initialOutputPath = initialSourcePath ? outputPathBySourcePath.get(initialSourcePath) ?? null : null;
  if (!indexSourcePath) {
    writeTextFile(
      outputDir,
      ROOT_INDEX_PATH,
      options.generatedIndexMarkdown ?? rootIndexMarkdown(initialOutputPath, options.entryNodeName),
    );
  }

  return {
    renames,
    indexOutputPath: ROOT_INDEX_PATH,
    logOutputPath: logSourcePath ? ROOT_LOG_PATH : null,
  };
}
