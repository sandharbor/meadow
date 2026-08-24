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
import type { BundleConfig } from '../../../../../../contracts/types/bundleConfig.js';
import type { BundleNodeConfig, FileBundleNodeConfig } from '../../../../../../contracts/types/bundleNodeConfig.js';
import {
  CLI_MUTATION_BEHAVIORS,
  CLI_OPERATION_SCHEMA_VERSION,
  type CreateBundleCliResult,
} from '../../../../../../contracts/types/cliOperations.js';
import type { SourcePageFileInfo } from '../../../../../../contracts/types/sourcePageFileInfo.js';
import { generateBundleGuid } from '../../../../../../shared_code/utils/bundleGuidUtils.js';
import {
  generateBundleNodeId,
  parseBundleNodeConfig,
} from '../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { saveBundleNodeConfigDocument } from '../../../../../../shared_code/utils/bundleNodeConfigPersistence.js';
import { AppConfigGitUtils, GIT_AUTHORS } from '../../../../../../shared_code/utils/appConfigGitUtils.js';
import {
  getBundlesDirectory,
  getBundleDirectory,
  getConfigDirectory,
} from '../../../shared/bundle-config/bundleConfigPaths.js';
import {
  loadBundleConfig,
  saveBundleConfigToPath,
} from '../../../shared/utils/bundleConfigUtils.js';
import { clearBundleGuidCache, logBundleInfo } from '../../../shared/utils/logging/bundleLogger.js';
import { listMarkdownSourcePages } from '../../../shared/utils/sourcePageFileUtils.js';
import { syncTrackedSourceContent } from '../../../shared/bundle-node/trackedSourceContentSync.js';
import {
  applyTrackingEvidenceFromSnapshot,
  sourceFilePathForConfig,
} from '../../../shared/bundle-node/trackingEvidence.js';
import { FrontmatterUtils } from '../../../shared/utils/frontmatterUtils.js';

const DEFAULT_OUTLINKS_DEPTH = 3;
const DEFAULT_INLINKS_DEPTH = 1;

export interface CreatePageBundleOptions {
  sourceDirectory: string;
  entryPage: string;
  slug?: string;
  bundleNotes?: string;
  defaultOutlinksDepth?: number;
  defaultInlinksDepth?: number;
}

export class PageBundleOperationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PageBundleOperationError';
  }
}

function normalizeRelativePath(value: string): string {
  const portable = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!portable || path.posix.isAbsolute(portable) || /^[A-Za-z]:\//.test(portable)) {
    throw new PageBundleOperationError('Entry page must be a source-directory-relative path', 400);
  }
  const normalized = path.posix.normalize(portable);
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new PageBundleOperationError('Entry page must not leave the source directory', 400);
  }
  return normalized;
}

function normalizeSourceDirectory(value: string): string {
  const resolved = path.resolve(value);
  if (!fs.existsSync(resolved)) {
    throw new PageBundleOperationError(`Source directory does not exist: ${resolved}`, 404);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new PageBundleOperationError(`Source path is not a directory: ${resolved}`, 400);
  }
  return fs.realpathSync(resolved);
}

function slugFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) throw new PageBundleOperationError('The entry page title cannot produce a bundle slug; pass --slug', 400);
  return slug;
}

function validateSlug(slug: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new PageBundleOperationError('Bundle slug must contain lowercase letters, numbers, and single dashes', 400);
  }
  return slug;
}

function resolveDepth(value: number | undefined, fallback: number, option: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 0) {
    throw new PageBundleOperationError(`${option} must be a non-negative integer`, 400);
  }
  return resolved;
}

function sourcePageFilename(page: SourcePageFileInfo): string {
  if (page.fullPath) return page.fullPath.replace(/\\/g, '/');
  const filename = page.file_type === 'excalidraw'
    ? `${page.title}.excalidraw.md`
    : `${page.title}.${page.file_type}`;
  return page.directory ? `${page.directory}/${filename}` : filename;
}

async function resolveEntryPage(
  sourceDirectory: string,
  entryPageInput: string,
): Promise<SourcePageFileInfo> {
  const entryPage = normalizeRelativePath(entryPageInput);
  const pages = await listMarkdownSourcePages(sourceDirectory);
  const exact = pages.filter(page => sourcePageFilename(page) === entryPage);
  if (exact.length === 1) return exact[0];

  const folded = pages.filter(page => sourcePageFilename(page).toLowerCase() === entryPage.toLowerCase());
  if (folded.length === 1) return folded[0];

  const basename = path.posix.basename(entryPage)
    .replace(/\.excalidraw\.md$/i, '')
    .replace(/\.excalidraw$/i, '')
    .replace(/\.md$/i, '');
  const titleMatches = pages.filter(page => page.title.toLowerCase() === basename.toLowerCase());
  if (titleMatches.length === 1) return titleMatches[0];
  if (titleMatches.length > 1) {
    const candidates = titleMatches.map(sourcePageFilename).sort();
    throw new PageBundleOperationError(
      `Entry page is ambiguous. Pass one of these relative paths: ${candidates.join(', ')}`,
      409,
      { candidates },
    );
  }
  throw new PageBundleOperationError(
    `Entry page was not found under the source directory: ${entryPage}`,
    404,
  );
}

function loadEntryNode(bundleDirectory: string): BundleNodeConfig | null {
  try {
    const config = loadBundleConfig(bundleDirectory);
    const nodeConfigPath = path.join(bundleDirectory, 'config', 'bundle_node_config.yaml');
    const content = fs.readFileSync(nodeConfigPath, 'utf8');
    const parsed = parseBundleNodeConfig(content, nodeConfigPath);
    return parsed.find(node => node.bundleNodeId === config.entryBundleNodeId) ?? null;
  } catch {
    return null;
  }
}

function canonicalDirectory(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return fs.realpathSync(path.resolve(value));
  } catch {
    return path.resolve(value);
  }
}

function matchingImplicitBundle(options: {
  sourceDirectory: string;
  entry: SourcePageFileInfo;
  defaultOutlinksDepth: number;
  defaultInlinksDepth: number;
}): string | null {
  const bundlesDirectory = getBundlesDirectory();
  if (!fs.existsSync(bundlesDirectory)) return null;
  for (const entry of fs.readdirSync(bundlesDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const bundleDirectory = path.join(bundlesDirectory, entry.name);
    try {
      const config = loadBundleConfig(bundleDirectory);
      const entryNode = loadEntryNode(bundleDirectory);
      if (
        canonicalDirectory(config.sourceDirectory) === options.sourceDirectory
        && config.defaultOutlinksDepth === options.defaultOutlinksDepth
        && config.defaultInlinksDepth === options.defaultInlinksDepth
        && entryNode?.bundleNodeKind === 'file'
        && entryNode.bundleNodeName === options.entry.title
        && (entryNode.sourceGraphSubdirectory ?? '') === options.entry.directory
        && entryNode.fileType === options.entry.file_type
      ) {
        return entry.name;
      }
    } catch {
      // An unrelated invalid bundle is reported by its own inspection path.
    }
  }
  return null;
}

function resultFor(options: {
  slug: string;
  created: boolean;
  sourceDirectory: string;
  entry: SourcePageFileInfo;
  defaultOutlinksDepth: number;
  defaultInlinksDepth: number;
}): CreateBundleCliResult {
  return {
    schemaVersion: CLI_OPERATION_SCHEMA_VERSION,
    operation: 'bundles.create',
    slug: options.slug,
    created: options.created,
    changed: options.created,
    mutationBehavior: CLI_MUTATION_BEHAVIORS.createBundle,
    sourceDirectory: options.sourceDirectory,
    entryPage: sourcePageFilename(options.entry),
    entryPageTracked: true,
    defaults: {
      outlinksDepth: options.defaultOutlinksDepth,
      inlinksDepth: options.defaultInlinksDepth,
    },
    nextActions: [{
      operation: 'track-safe-nodes',
      args: ['bundle', 'track', options.slug, '--all-safe'],
      displayCommand: `meadow bundle track ${options.slug} --all-safe`,
    }],
  };
}

export async function createPageBundle(
  options: CreatePageBundleOptions,
): Promise<CreateBundleCliResult> {
  const sourceDirectory = normalizeSourceDirectory(options.sourceDirectory);
  const entry = await resolveEntryPage(sourceDirectory, options.entryPage);
  const defaultOutlinksDepth = resolveDepth(options.defaultOutlinksDepth, DEFAULT_OUTLINKS_DEPTH, 'defaultOutlinksDepth');
  const defaultInlinksDepth = resolveDepth(options.defaultInlinksDepth, DEFAULT_INLINKS_DEPTH, 'defaultInlinksDepth');
  const explicitSlug = options.slug !== undefined;
  const slug = validateSlug(options.slug ?? slugFromTitle(entry.title));

  if (!explicitSlug) {
    const existing = matchingImplicitBundle({
      sourceDirectory,
      entry,
      defaultOutlinksDepth,
      defaultInlinksDepth,
    });
    if (existing) {
      return resultFor({
        slug: existing,
        created: false,
        sourceDirectory,
        entry,
        defaultOutlinksDepth,
        defaultInlinksDepth,
      });
    }
  }

  const bundleDirectory = getBundleDirectory(slug);
  if (fs.existsSync(bundleDirectory)) {
    const recovery = explicitSlug
      ? `Choose a different --slug to create an intentional duplicate.`
      : `Retry with a distinct --slug to create an intentional duplicate.`;
    throw new PageBundleOperationError(`Bundle slug '${slug}' already exists. ${recovery}`, 409);
  }

  const entryBundleNodeId = generateBundleNodeId([]);
  const now = new Date().toISOString();
  const bundleConfig: BundleConfig = {
    bundleGuid: generateBundleGuid(),
    sourceDirectory,
    entryBundleNodeId,
    defaultTraversalBundleNodeId: entryBundleNodeId,
    defaultOutlinksDepth,
    defaultInlinksDepth,
    archivedAt: null,
    bundleCreatedAt: now,
    bundleUpdatedAt: now,
    bundleNotes: options.bundleNotes ?? '',
  };
  const entryNode: FileBundleNodeConfig = {
    bundleNodeName: entry.title,
    ...(entry.directory && { sourceGraphSubdirectory: entry.directory }),
    bundleNodeKind: 'file',
    fileType: entry.file_type,
    bundleNodeId: entryBundleNodeId,
    listType: 'whitelist',
  };
  const initialNodes: BundleNodeConfig[] = [entryNode];

  const stagingDirectory = path.join(
    getBundlesDirectory(),
    `.${slug}.creating-${generateBundleGuid()}`,
  );
  try {
    fs.mkdirSync(path.join(stagingDirectory, 'config'), { recursive: true });
    saveBundleConfigToPath(path.join(stagingDirectory, 'config', 'bundle_config.yaml'), bundleConfig);
    syncTrackedSourceContent({
      bundleDirectory: stagingDirectory,
      sourceDirectory,
      configs: initialNodes,
    });
    const entrySourcePath = sourceFilePathForConfig(sourceDirectory, entryNode);
    applyTrackingEvidenceFromSnapshot({
      bundleDirectory: stagingDirectory,
      configs: [entryNode],
      effectivelySensitiveByNodeId: new Map([[
        entryNode.bundleNodeId,
        entryNode.fileType === 'md' && FrontmatterUtils.getSensitiveProperty(entrySourcePath),
      ]]),
      trackedAt: now,
    });
    saveBundleNodeConfigDocument(
      path.join(stagingDirectory, 'config', 'bundle_node_config.yaml'),
      initialNodes,
    );
    fs.renameSync(stagingDirectory, bundleDirectory);
    const git = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, getConfigDirectory());
    await git.commitDirs([
      `bundles/${slug}/config`,
      `bundles/${slug}/raw`,
    ], `initial bundle config for ${slug}`);
    clearBundleGuidCache(slug);
    logBundleInfo(slug, 'Page-derived bundle created');
  } catch (error) {
    fs.rmSync(stagingDirectory, { recursive: true, force: true });
    if (fs.existsSync(bundleDirectory)) {
      fs.rmSync(bundleDirectory, { recursive: true, force: true });
    }
    throw error;
  }

  return resultFor({
    slug,
    created: true,
    sourceDirectory,
    entry,
    defaultOutlinksDepth,
    defaultInlinksDepth,
  });
}
