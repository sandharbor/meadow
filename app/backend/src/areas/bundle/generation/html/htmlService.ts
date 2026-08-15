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

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';
import { setTimeout as delay } from 'timers/promises';
import { Page } from './page.js';
import { renderPageToHtml, renderExcalidrawPageToHtml, renderGeneratedBundleNodeToHtml, renderSimpleBacklinksHtml, CollectedSrsCard } from './htmlGenerator.js';
import { buildExcalidrawClientEmbeddedFileData, buildExcalidrawClientLinkData, copyExcalidrawEmbeddedFiles } from './linkModificationService.js';
import { calculateRelativePath, markdownContentToPageLinkFilenames, normalizePageTitle } from './shared.js';
import {
  FolderNavigationPage,
  BundleNodeConfigMap,
  InverseLinks,
  PageNameToPage,
  bundleNodeConfigToKey
} from './types.js';
import { getBundlesDirectory, getConfigDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { parseBundleNodeConfig, resolveBundleNodeRoles } from '../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { BundleConfig } from '../../../../../../shared_code/types/bundleConfig.js';
import { FileType } from '../../../../../../shared_code/types/FileType.js';
import { BundleConfigPaths } from '../../../../../../shared_code/paths/bundleConfigPaths.js';
import { loadBundleConfig, getLatestGeneratedBundleVersionWithFallback } from '../../../../shared/utils/bundleConfigUtils.js';
import { generateVersionId, recordGeneratedBundleVersion } from '../services/generatedBundleVersions.js';
import { loadAppConfig } from '../../../../../../shared_code/utils/appConfigUtils.js';
import { resolveEffectiveGenerationOptions } from '../../../../../../shared_code/utils/generationOptionsUtils.js';
import { runWorkingGraphRaw } from '../../../../shared/utils/workingGraphUtils.js';
import type { LinkResolvedInfo } from '../../../../../../shared_code/types/IBundleNode.js';
import type { IBundleNode } from '../../../../../../shared_code/types/IBundleNode.js';
import type { IEdge } from '../../../../../../shared_code/types/graph.js';
import type { BundleNodeId, BundleNodeKey } from '../../../../../../shared_code/types/bundleNodeConfig.js';
import { buildVisibleStructuralProjection, type VisibleStructuralProjection } from '../../../../../../shared_code/utils/structuralProjection.js';
import { hashAndRenameStaticAssets, type PrecompressedAssetSource } from './staticAssets.js';
import { createRequire } from 'module';
import { createHash } from 'crypto';

// Load highlight.js github-light theme once at module load so the preset
// stylesheet pipeline can append it to style.css (scoping the theme to code
// blocks rendered via marked-highlight).
const require_ = createRequire(import.meta.url);
const HLJS_THEME_CSS: string = (() => {
  try {
    const cssPath = require_.resolve('highlight.js/styles/github.min.css');
    return fs.readFileSync(cssPath, 'utf8');
  } catch {
    return '';
  }
})();
import {
  createSourcesExportZip,
  getSourcesExportDownloadFilename,
  writeSourcesExportManifest
} from '../../../../shared/utils/zipUtils.js';
import { backfillSrsGuidsInMarkdownDirectory, prepareSrsRenderSourceDirectory } from '../render-source/srsMarkdown.js';
import { prepareSourcesExportFromScrubbedSourceDirectory } from '../sources-export/sourcesExport.js';
import {
  cleanupPublishedOpenKnowledgeFormatArtifacts,
  generatePublishedOpenKnowledgeFormatArtifacts
} from '../open-knowledge-format/publishedOpenKnowledgeFormat.js';
import {
  openKnowledgeFormatIndexSourceFromBundleConfig,
  openKnowledgeFormatLogSourceFromBundleConfig
} from '../open-knowledge-format/openKnowledgeFormatConfig.js';
import { prepareScrubbedSourceDirectory } from '../source-material/sourceScrubbing.js';
import { prepareGenerationSourceMaterial } from '../source-material/trackedPageContent.js';
import type { StaticAssetNames } from './types.js';
import { encodePathForUrl } from '../../../../../../shared_code/utils/urlUtils.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';
import { getEffectivePresetIdForBundleDirectory, getPresetAssetsPath } from '../utils/stylePresetsLoader.js';
import { resolveCustomAssets } from '../utils/customAssetsLoader.js';
import { recordTimingMetric, timeAsync, timeSync } from '../../../../shared/telemetry/timingMetrics.js';
import { copyPublishedBundleSearchAssets, writePublishedBundleSearchIndex } from './searchIndex.js';
import { renderFolderNavigationDataScript } from './folderNavigation.js';
import {
  CUSTOMIZATION_ASSETS_DIRECTORY,
  SOURCES_EXPORT_ASSETS_DIRECTORY,
  SPACED_REPETITION_ASSETS_DIRECTORY,
} from '../customizationAssets.js';
import { planBundleRoutes, routeForBundleNode } from './bundleRoutePlanner.js';
import { canonicalPageFilename, isImageFileType } from '../../../../../../shared_code/utils/fileTypeUtils.js';
import { rewriteNativeHtmlUrls } from './nativeHtml.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dev constant: pause after each HTML file is generated to make progress more visible on small datasets.
// Should always be 0 in production.
const AFTER_HTML_GENERATION_PAUSE_MS = 0;

const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;

interface GzipMetadata {
  source?: unknown;
  sourceSha256?: unknown;
  gzip?: unknown;
  gzipSha256?: unknown;
}

function generationMode(options: { publish?: boolean; publishNewVersion?: boolean; preview?: boolean }): string {
  if (options.publishNewVersion) return 'publish_new_version';
  if (options.publish) return 'publish';
  if (options.preview) return 'preview';
  return 'generate';
}

function getPublishedBundleSrsAssetsPath(): string {
  if (process.env.NODE_ENV === 'production' && __dirname.includes('Resources')) {
    return path.join(__dirname, 'published_bundle_utils', 'srs');
  }

  return path.join(__dirname, 'published_bundle_utils', 'srs');
}

function loadPrecompressedExcalidrawVendorAsset(sharedDirectory: string): PrecompressedAssetSource | null {
  const assetBasename = 'excalidraw-vendor.js';
  const gzipBasename = `${assetBasename}.gz`;
  const gzipPath = path.join(sharedDirectory, gzipBasename);
  const metadataPath = `${gzipPath}.meta.json`;

  if (!fs.existsSync(gzipPath) || !fs.existsSync(metadataPath)) {
    return null;
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as GzipMetadata;
    if (
      metadata.source !== assetBasename ||
      metadata.gzip !== gzipBasename ||
      typeof metadata.sourceSha256 !== 'string' ||
      !SHA256_HEX_RE.test(metadata.sourceSha256)
    ) {
      logger.warn(`Invalid Excalidraw vendor gzip metadata at ${metadataPath}`);
      return null;
    }

    if (metadata.gzipSha256 !== undefined && (typeof metadata.gzipSha256 !== 'string' || !SHA256_HEX_RE.test(metadata.gzipSha256))) {
      logger.warn(`Invalid Excalidraw vendor gzip checksum metadata at ${metadataPath}`);
      return null;
    }

    return {
      sourceSha256: metadata.sourceSha256.toLowerCase(),
      gzipPath,
      gzipSha256: typeof metadata.gzipSha256 === 'string' ? metadata.gzipSha256.toLowerCase() : undefined,
    };
  } catch (error) {
    logger.warn(`Unable to read Excalidraw vendor gzip metadata at ${metadataPath}: ${String(error)}`);
    return null;
  }
}

// TODO: feels like we could get this from the bundleConfig?
function extractBundleSlugFromDirectory(bundleDirectory: string): string | null {
  const bundlesDir = getBundlesDirectory();
  if (bundleDirectory.startsWith(bundlesDir + path.sep)) {
    const relativePath = bundleDirectory.substring(bundlesDir.length + 1);
    // Return the first directory component (the bundle slug)
    const parts = relativePath.split(path.sep);
    return parts[0] || null;
  }
  return null;
}

function getArtifactArchiveSlug(bundleDirectory: string, bundleConfig: BundleConfig): string {
  const configuredSlug = bundleConfig.publishSlug;
  if (typeof configuredSlug === 'string' && configuredSlug.trim()) {
    return configuredSlug.trim();
  }
  return extractBundleSlugFromDirectory(bundleDirectory) ?? path.basename(bundleDirectory);
}

// Re-export for backward compatibility
export { generateVersionId, createOrUpdateGeneratedBundleVersions } from '../services/generatedBundleVersions.js';

/**
 * Wait for a file to exist on disk with polling.
 * This helps avoid race conditions where we signal "file ready" before the OS has flushed writes.
 */
async function waitForFileExists(filePath: string, maxWaitMs: number = 2000, pollIntervalMs: number = 50): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    if (fs.existsSync(filePath)) {
      return true;
    }
    await delay(pollIntervalMs);
  }
  return false;
}

export function publishToVersionedDirectory(
  bundleDirectory: string,
  bundleConfig: BundleConfig
): { version: string; directory: string } {
  const generatedHtmlDirectory = BundleConfigPaths.getGeneratedHtmlDir(bundleDirectory);

  // Get the latest version or create a new one if none exists
  let latestVersion = getLatestGeneratedBundleVersionWithFallback(bundleDirectory, bundleConfig);

  if (!latestVersion) {
    latestVersion = generateVersionId();
  }

  // Create the versioned directory
  const versionedDirectory = path.join(BundleConfigPaths.getGeneratedBundleVersionsDir(bundleDirectory), latestVersion);

  // Remove existing version directory if it exists
  if (fs.existsSync(versionedDirectory)) {
    fs.rmSync(versionedDirectory, { recursive: true, force: true });
  }

  // Copy from preview to versioned directory
  fs.cpSync(generatedHtmlDirectory, versionedDirectory, { recursive: true });

  // Record the version (ensures generatedBundleVersions in bundle_config.yaml + generated_bundle_versions.yaml)
  recordGeneratedBundleVersion(bundleDirectory, latestVersion, { bundleConfig });

  return { version: latestVersion, directory: versionedDirectory };
}

export function publishToNewVersion(
  bundleDirectory: string,
  bundleConfig: BundleConfig,
  notes: string = ''
): { version: string; directory: string } {
  const generatedHtmlDirectory = BundleConfigPaths.getGeneratedHtmlDir(bundleDirectory);

  // Always create a new version
  const newVersion = generateVersionId();

  // Create the versioned directory
  const versionedDirectory = path.join(BundleConfigPaths.getGeneratedBundleVersionsDir(bundleDirectory), newVersion);

  // Copy from preview to versioned directory
  fs.cpSync(generatedHtmlDirectory, versionedDirectory, { recursive: true });

  // Record the version (ensures generatedBundleVersions in bundle_config.yaml + generated_bundle_versions.yaml)
  recordGeneratedBundleVersion(bundleDirectory, newVersion, { isNewVersion: true, notes, bundleConfig });

  return { version: newVersion, directory: versionedDirectory };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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

function toPosixRelativePath(relPath: string): string {
  return relPath.split(path.sep).join('/');
}

/**
 * Updates older published versions by injecting a "new version" pointer banner into each page.
 *
 * - If the corresponding page exists in the new version, link to that page in the new version.
 * - If it does not exist, show a warning message and link to the new version's initial page instead.
 */
export function updateOlderVersionsWithPointer(
  bundleDirectory: string,
  newVersionId: string,
  newVersionBaseUrl: string,
  olderVersionIds: string[],
  entryNodeName: string,
  entryPagePath: string
): { filesUpdated: number; pagesNotInNewVersion: number } {
  const publishedRoot = BundleConfigPaths.getGeneratedBundleVersionsDir(bundleDirectory);
  const newVersionDir = path.join(publishedRoot, newVersionId);

  const newVersionHtmlFiles = walkFilesRecursively(newVersionDir)
    .filter((f) => f.toLowerCase().endsWith('.html'))
    .map((f) => toPosixRelativePath(path.relative(newVersionDir, f)));
  const newVersionHtmlSet = new Set(newVersionHtmlFiles);

  const trimmedBaseUrl = newVersionBaseUrl.replace(/\/+$/, '');
  const initialHref = `${trimmedBaseUrl}/${encodePathForUrl(entryPagePath)}`;
  const initialTitleEscaped = escapeHtml(entryNodeName || 'Home');

  let filesUpdated = 0;
  let pagesNotInNewVersion = 0;

  for (const olderVersionId of olderVersionIds) {
    if (!olderVersionId || olderVersionId === newVersionId) continue;
    const olderVersionDir = path.join(publishedRoot, olderVersionId);
    if (!fs.existsSync(olderVersionDir)) continue;

    const olderHtmlFiles = walkFilesRecursively(olderVersionDir).filter((f) => f.toLowerCase().endsWith('.html'));

    for (const filePath of olderHtmlFiles) {
      const rel = toPosixRelativePath(path.relative(olderVersionDir, filePath));

      const existsInNewVersion = newVersionHtmlSet.has(rel);
      const newPageHref = `${trimmedBaseUrl}/${encodePathForUrl(rel)}`;

      const bannerHtml = existsInNewVersion
        ? `<div id="new-version-pointer" class="new-version-pointer"><strong>New version available:</strong> <a href="${newPageHref}">Open this page in the newer version</a>.</div>`
        : `<div id="new-version-pointer" class="new-version-pointer page-removed"><strong>New version available:</strong> This page does not exist in the newer version. Go to <a href="${initialHref}">${initialTitleEscaped}</a> instead.</div>`;

      const original = fs.readFileSync(filePath, 'utf8');

      // Replace existing placeholder or previously injected banner.
      const replaced = original.replace(
        /<div\s+id="new-version-pointer"[^>]*>[\s\S]*?<\/div>/,
        bannerHtml
      );

      if (replaced !== original) {
        fs.writeFileSync(filePath, replaced, 'utf8');
        filesUpdated += 1;
        if (!existsInNewVersion) pagesNotInNewVersion += 1;
      }
    }
  }

  return { filesUpdated, pagesNotInNewVersion };
}

export function loadBundleNodeConfigMap(bundleNodeConfigFile: string): BundleNodeConfigMap {
  const nodeConfigs: BundleNodeConfigMap = {};

  if (!fs.existsSync(bundleNodeConfigFile)) {
    throw new Error(`Bundle node config file not found: ${bundleNodeConfigFile}`);
  }

  const content = fs.readFileSync(bundleNodeConfigFile, 'utf-8');

  const configs = parseBundleNodeConfig(content, bundleNodeConfigFile);
  for (const config of configs) {
    const key = bundleNodeConfigToKey(config);
    nodeConfigs[key] = config;
  }

  return nodeConfigs;
}

type RustLinkResolvedInfo = { link_resolved_target_directory: string; link_resolved_target_path: string | null };
type RustNode = {
  bundleNodeKey: string;
  bundleNodeId?: string;
  bundleNodeKind: 'file' | 'folder' | 'collection';
  bundleNodeName: string;
  sourceGraphSubdirectory?: string;
  fileType?: FileType;
  memberBundleNodeIds?: string[];
  effectiveBlacklistingBundleNodeId?: string;
  depth: number;
  remaining_depth: number;
  remaining_inlinks_depth?: number;
  path?: string[];
};
type RustEdge = { source: string; target: string; bundleEdgeKind: IEdge['bundleEdgeKind']; isBidirectional?: boolean };
type RustOutput = {
  nodes: RustNode[];
  edges: RustEdge[];
  allLinkResolutionMaps?: Record<string, Record<string, RustLinkResolvedInfo>>;
};

async function loadWorkingGraphData(options: {
  graphRoot: string;
  bundleNodeConfigPath: string;
  bundleConfig: BundleConfig;
  breadcrumbsEnabled: boolean;
}): Promise<{
  breadcrumbPaths: { [pageKey: string]: string[] };
  breadcrumbNodeKeysByNodeKey: Map<BundleNodeKey, BundleNodeKey[]>;
  allLinkResolutionMaps: Map<string, Record<string, LinkResolvedInfo>>;
  traversablePageKeys: Set<string>;
  graphNodes: IBundleNode[];
  graphEdges: IEdge[];
}> {
  const {
    graphRoot,
    bundleNodeConfigPath,
    bundleConfig,
    breadcrumbsEnabled,
  } = options;

  const breadcrumbPaths: { [pageKey: string]: string[] } = {};
  const breadcrumbNodeKeysByNodeKey = new Map<BundleNodeKey, BundleNodeKey[]>();
  let allLinkResolutionMaps: Map<string, Record<string, LinkResolvedInfo>> = new Map();
  const traversablePageKeys: Set<string> = new Set();
  let graphNodes: IBundleNode[] = [];
  let graphEdges: IEdge[] = [];

  if (!bundleConfig.entryBundleNodeId || !bundleConfig.defaultTraversalBundleNodeId) {
    return { breadcrumbPaths, breadcrumbNodeKeysByNodeKey, allLinkResolutionMaps, traversablePageKeys, graphNodes, graphEdges };
  }

  const raw = await runWorkingGraphRaw({
    graphRoot,
    bundleNodeConfigPath,
    entryBundleNodeId: bundleConfig.entryBundleNodeId,
    defaultTraversalBundleNodeId: bundleConfig.defaultTraversalBundleNodeId,
    defaultOutlinksDepth: bundleConfig.defaultOutlinksDepth,
    defaultInlinksDepth: bundleConfig.defaultInlinksDepth,
    frontierDepth: 0,
    allowImagesToExtendToFrontier: true,
    allowLowerDepths: false,
  });
  const output = JSON.parse(raw) as RustOutput;

  graphNodes = output.nodes.map(node => {
    const common = {
      bundleNodeKey: node.bundleNodeKey as BundleNodeKey,
      ...(node.bundleNodeId && { bundleNodeId: node.bundleNodeId as BundleNodeId }),
      label: node.bundleNodeName,
      bundleNodeName: node.bundleNodeName,
      depth: node.depth,
      remaining_depth: node.remaining_depth,
      remaining_inlinks_depth: node.remaining_inlinks_depth,
      path: node.path,
      ...(node.effectiveBlacklistingBundleNodeId && { effectiveBlacklistingBundleNodeId: node.effectiveBlacklistingBundleNodeId as BundleNodeId }),
      getIdent: () => node.bundleNodeKey,
    };
    if (node.bundleNodeKind === 'collection') {
      return { ...common, bundleNodeKind: 'collection', memberBundleNodeIds: (node.memberBundleNodeIds ?? []) as BundleNodeId[] };
    }
    if (node.bundleNodeKind === 'folder') {
      return { ...common, bundleNodeKind: 'folder', sourceGraphSubdirectory: node.sourceGraphSubdirectory ?? '' };
    }
    if (!node.fileType) throw new Error(`Working graph file node ${node.bundleNodeKey} has no fileType`);
    return { ...common, bundleNodeKind: 'file', sourceGraphSubdirectory: node.sourceGraphSubdirectory ?? '', fileType: node.fileType };
  });
  graphEdges = (output.edges ?? []).map(edge => ({ ...edge }));
  const graphNodeByKey = new Map(output.nodes.map(node => [node.bundleNodeKey, node]));

  allLinkResolutionMaps = new Map(Object.entries(output.allLinkResolutionMaps || {}));

  for (const graphNode of output.nodes) {
    traversablePageKeys.add(graphNode.bundleNodeKey);

    if (breadcrumbsEnabled && graphNode.path) {
      const nodeKeys = graphNode.path as BundleNodeKey[];
      breadcrumbNodeKeysByNodeKey.set(graphNode.bundleNodeKey as BundleNodeKey, nodeKeys);
      const titlePath = graphNode.path.map(ident => {
        const pathNode = graphNodeByKey.get(ident);
        if (pathNode) return pathNode.bundleNodeName;
        const lastSlash = ident.lastIndexOf('/');
        const titleWithExt = lastSlash >= 0 ? ident.substring(lastSlash + 1) : ident;
        const lastDot = titleWithExt.lastIndexOf('.');
        return lastDot >= 0 ? titleWithExt.substring(0, lastDot) : titleWithExt;
      });
      breadcrumbPaths[graphNode.bundleNodeKey] = titlePath;
    }
  }

  return { breadcrumbPaths, breadcrumbNodeKeysByNodeKey, allLinkResolutionMaps, traversablePageKeys, graphNodes, graphEdges };
}

export async function generateHtmlForBundle(
  bundleDirectory: string,
  options: {
    publish?: boolean;
    publishNewVersion?: boolean;
    preview?: boolean;
    startPage?: { title: string; directory?: string };
    startPagePath?: string; // relative HTML path to prioritize (e.g., "subdir/Page Name.html")
    onStartPageRendered?: (info: { title: string; directory: string; relativeHtmlPath: string }) => void;
    shouldCancel?: () => boolean;
    onProgress?: (info: {
      stage: 'preparing' | 'copying-shared' | 'scanning-links' | 'computing-breadcrumbs' | 'rendering-pages' | 'complete';
      message: string;
      current?: number;
      total?: number;
      percent?: number;
    }) => void;
  } = {}
): Promise<void> {
  logger.info(`Processing bundle: ${bundleDirectory}`);

  const emitProgress = (info: {
    stage: 'preparing' | 'copying-shared' | 'scanning-links' | 'computing-breadcrumbs' | 'rendering-pages' | 'complete';
    message: string;
    current?: number;
    total?: number;
    percent?: number;
  }) => {
    try {
      options.onProgress?.(info);
    } catch (err) {
      logger.warn(`[generateHtmlForBundle] onProgress callback threw (ignored): ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  emitProgress({ stage: 'preparing', message: 'Preparing HTML render...' });
  
  // Extract the bundle slug from the directory path
  const bundleSlug = extractBundleSlugFromDirectory(bundleDirectory);
  const mode = generationMode(options);
  const timingLabels = { mode, bundle_slug: bundleSlug ?? 'unknown' };
  const recordStageTiming = (stage: string, startMs: number, extra?: Record<string, string | number | boolean>) => {
    recordTimingMetric('bundle.generation.stage', performance.now() - startMs, {
      ...timingLabels,
      stage,
      ...extra,
    });
  };
  
  // Load bundle configuration
  const bundleConfig = timeSync('bundle.generation.stage', { ...timingLabels, stage: 'load_bundle_config' }, () =>
    loadBundleConfig(bundleDirectory)
  );
  
  const trackedPageContentDirectory = BundleConfigPaths.getTrackedPageContentDir(bundleDirectory);
  const renderSourceContentDirectory = BundleConfigPaths.getRenderSourceContentDir(bundleDirectory);
  const legacyRenderSourceContentDirectory = BundleConfigPaths.getLegacyRenderSourceContentDir(bundleDirectory);
  const scrubbedSourceContentDirectory = BundleConfigPaths.getScrubbedSourceContentDir(bundleDirectory);
  
  // Use html/generated for the current artifact and html/generated_bundle_versions/<version> for immutable versions.
  const generatedHtmlDirectory = BundleConfigPaths.getGeneratedHtmlDir(bundleDirectory);
  
  const generationOptions = timeSync('bundle.generation.stage', { ...timingLabels, stage: 'resolve_generation_options' }, () => {
    const appConfig = loadAppConfig(getConfigDirectory());
    return resolveEffectiveGenerationOptions(appConfig, bundleConfig);
  });

  if (generationOptions.tagsEnabled && generationOptions.spacedRepetitionEnabled) {
    try {
      timeSync('bundle.generation.stage', { ...timingLabels, stage: 'backfill_srs_guids' }, () => {
        backfillSrsGuidsInMarkdownDirectory(
          trackedPageContentDirectory,
          generationOptions.spacedRepetitionTags
        );
      });
    } catch (error) {
      logger.warn(`Error backfilling SRS GUIDs before source preparation: ${String(error)}`);
    }
  }

  const preparedSourceMaterial = timeSync('bundle.generation.stage', { ...timingLabels, stage: 'prepare_generation_source_material' }, () =>
    prepareGenerationSourceMaterial(bundleDirectory, { tagsEnabled: generationOptions.tagsEnabled })
  );
  let sourceContentDirectory = preparedSourceMaterial.sourceContentDirectory;

  const bundleNodeConfPath = preparedSourceMaterial.bundleNodeConfigPath;
  const bundleNodeConfs = timeSync('bundle.generation.stage', { ...timingLabels, stage: 'parse_bundle_node_config' }, () =>
    loadBundleNodeConfigMap(bundleNodeConfPath)
  );
  const bundleNodeConfigsArray = Object.values(bundleNodeConfs);
  const { entryNode, defaultTraversalNode } = resolveBundleNodeRoles(
    bundleNodeConfigsArray,
    bundleConfig,
    BundleConfigPaths.getBundleConfigFile(bundleDirectory),
  );
  const routePlan = planBundleRoutes(bundleNodeConfigsArray, bundleConfig, bundleSlug || undefined);

  if (generationOptions.spacedRepetitionEnabled) {
    try {
      timeSync('bundle.generation.stage', { ...timingLabels, stage: 'prepare_srs_render_source' }, () => {
        prepareSrsRenderSourceDirectory(
          sourceContentDirectory,
          renderSourceContentDirectory,
          generationOptions.spacedRepetitionTags
        );
        if (fs.existsSync(renderSourceContentDirectory)) {
          sourceContentDirectory = renderSourceContentDirectory;
        }
      });
    } catch (error) {
      logger.error(`Error preparing SRS render source: ${String(error)}`);
      sourceContentDirectory = preparedSourceMaterial.sourceContentDirectory;
    }
  } else if (fs.existsSync(renderSourceContentDirectory)) {
    timeSync('bundle.generation.stage', { ...timingLabels, stage: 'remove_srs_render_source' }, () => {
      fs.rmSync(renderSourceContentDirectory, { recursive: true, force: true });
    });
  }

  if (fs.existsSync(legacyRenderSourceContentDirectory)) {
    timeSync('bundle.generation.stage', { ...timingLabels, stage: 'remove_legacy_srs_render_source' }, () => {
      fs.rmSync(legacyRenderSourceContentDirectory, { recursive: true, force: true });
    });
  }
  
  // Markdown pages use Meadow's renderer. Native HTML pages are emitted by a
  // separate pass below so their document structure remains intact.
  const whitelistedMdPageKeys = Object.keys(bundleNodeConfs).filter(key => {
    const conf = bundleNodeConfs[key];
    return conf.bundleNodeKind === 'file' && conf.listType === 'whitelist' && conf.fileType === 'md';
  });

  const entryNodeName = entryNode.bundleNodeName;
  const entryNodeSourceGraphSubdirectory = entryNode.sourceGraphSubdirectory || '';
  const breadcrumbsEnabled = generationOptions.breadcrumbsEnabled;

  // Meadow processing stage -- bundle files generation -- source scrubbing.
  // Everything downstream of this point reads from scrubbed_source_content,
  // which contains only publishable traversable files with unsafe links removed.
  let scrubbedTraversablePageKeys: Set<string> = new Set();
  let scrubbedAllLinkResolutionMaps: Map<string, Record<string, LinkResolvedInfo>> = new Map();
  let sourceStructuralProjection: VisibleStructuralProjection | null = null;
  let sourceGraphNodes: IBundleNode[] = [];
  try {
    emitProgress({ stage: 'preparing', message: 'Preparing scrubbed source content...' });
    const sourceGraphData = await timeAsync(
      'bundle.generation.stage',
      { ...timingLabels, stage: 'load_scrub_working_graph' },
      () => loadWorkingGraphData({
        graphRoot: sourceContentDirectory,
        bundleNodeConfigPath: bundleNodeConfPath,
        bundleConfig,
        breadcrumbsEnabled: false,
      })
    );
    scrubbedTraversablePageKeys = sourceGraphData.traversablePageKeys;
    scrubbedAllLinkResolutionMaps = sourceGraphData.allLinkResolutionMaps;
    sourceGraphNodes = sourceGraphData.graphNodes;
    if (routePlan.folderDerived) {
      sourceStructuralProjection = buildVisibleStructuralProjection(
        sourceGraphData.graphNodes,
        sourceGraphData.graphEdges,
        bundleNodeConfigsArray,
        bundleConfig.entryBundleNodeId!,
      );
    }

    const bundleNodeConfigsArrayForScrubbing = bundleNodeConfigsArray.filter(conf => {
      const key = bundleNodeConfigToKey(conf);
      return conf.bundleNodeKind === 'file' && scrubbedTraversablePageKeys.has(key);
    });

    timeSync('bundle.generation.stage', { ...timingLabels, stage: 'prepare_scrubbed_source' }, () => {
      prepareScrubbedSourceDirectory(
        sourceContentDirectory,
        scrubbedSourceContentDirectory,
        scrubbedTraversablePageKeys,
        bundleNodeConfs,
        bundleNodeConfigsArrayForScrubbing,
        scrubbedAllLinkResolutionMaps
      );
    });
    logger.debug(`Prepared scrubbed source content at ${scrubbedSourceContentDirectory}`);
  } catch (err) {
    if (routePlan.folderDerived) throw err;
    logger.warn(`Could not prepare scrubbed source content (will render an empty publishable set): ${err instanceof Error ? err.message : String(err)}`);
    timeSync('bundle.generation.stage', { ...timingLabels, stage: 'prepare_empty_scrubbed_source' }, () => {
      prepareScrubbedSourceDirectory(
        sourceContentDirectory,
        scrubbedSourceContentDirectory,
        new Set(),
        bundleNodeConfs,
        [],
        new Map()
      );
    });
  }

  const renderContentDirectory = scrubbedSourceContentDirectory;
  

  // Create and clean the current generated HTML directory.
  const prepareOutputStart = performance.now();
  if (fs.existsSync(generatedHtmlDirectory)) {
    fs.rmSync(generatedHtmlDirectory, { recursive: true, force: true });
  }
  fs.mkdirSync(generatedHtmlDirectory, { recursive: true });

  const assetsDirectory = path.join(generatedHtmlDirectory, '_mw_assets');
  fs.mkdirSync(assetsDirectory, { recursive: true });
  recordStageTiming('prepare_output_directories', prepareOutputStart);

  // Get the effective style preset for this bundle
  const effectivePresetId = getEffectivePresetIdForBundleDirectory(bundleDirectory);
  const presetDirectory = getPresetAssetsPath(effectivePresetId);

  logger.debug(`Using style preset: ${effectivePresetId}`);
  logger.debug(`Preset directory: ${presetDirectory}`);
  logger.debug(`Preset directory exists: ${fs.existsSync(presetDirectory)}`);

  emitProgress({ stage: 'copying-shared', message: 'Copying shared assets...' });

  // Copy preset assets (style.css, javascript.js, fonts/)
  // Skip style.css or javascript.js if base is disabled
  const copyAssetsStart = performance.now();
  if (fs.existsSync(presetDirectory)) {
    try {
      const items = fs.readdirSync(presetDirectory);
      logger.debug(`Found preset items: ${items.join(', ')}`);

      for (const item of items) {
        // Skip base CSS/JS if disabled
        if (generationOptions.baseStyleCssDisabled && item === 'style.css') {
          logger.debug(`Skipping base style.css (disabled)`);
          continue;
        }
        if (generationOptions.baseJavascriptJsDisabled && item === 'javascript.js') {
          logger.debug(`Skipping base javascript.js (disabled)`);
          continue;
        }

        const srcPath = path.join(presetDirectory, item);
        const dstPath = path.join(assetsDirectory, item);

        if (fs.statSync(srcPath).isFile()) {
          fs.copyFileSync(srcPath, dstPath);
          logger.debug(`Copied file: ${item} to ${dstPath}`);
        } else if (fs.statSync(srcPath).isDirectory()) {
          fs.cpSync(srcPath, dstPath, { recursive: true });
          logger.debug(`Copied directory: ${item} to ${dstPath}`);
        }
      }
      logger.debug(`Successfully copied preset files from ${presetDirectory} to ${assetsDirectory}`);

      // Append highlight.js theme to the preset stylesheet so server-side
      // syntax highlighting (marked-highlight + hljs) has matching CSS.
      const presetStylePath = path.join(assetsDirectory, 'style.css');
      if (HLJS_THEME_CSS && fs.existsSync(presetStylePath)) {
        fs.appendFileSync(
          presetStylePath,
          `\n/* highlight.js github theme */\n${HLJS_THEME_CSS}\n`
        );
      }
    } catch (error) {
      logger.error(`Error copying preset files: ${String(error)}`);
    }
  } else {
    logger.warn(`Preset directory not found at ${presetDirectory}`);
  }

  // Resolve and copy custom assets (user-provided CSS/JS that loads after base)
  const configDir = getConfigDirectory();
  const customAssets = resolveCustomAssets(configDir, bundleDirectory);

  if (customAssets.globalStyleCssPath) {
    fs.copyFileSync(customAssets.globalStyleCssPath, path.join(assetsDirectory, 'global-style.css'));
    logger.debug(`Copied global style.css from ${customAssets.globalStyleCssPath}`);
  }
  if (customAssets.bundleStyleCssPath) {
    fs.copyFileSync(customAssets.bundleStyleCssPath, path.join(assetsDirectory, 'bundle-style.css'));
    logger.debug(`Copied bundle style.css from ${customAssets.bundleStyleCssPath}`);
  }
  if (customAssets.globalJavascriptJsPath) {
    fs.copyFileSync(customAssets.globalJavascriptJsPath, path.join(assetsDirectory, 'global-javascript.js'));
    logger.debug(`Copied global javascript.js from ${customAssets.globalJavascriptJsPath}`);
  }
  if (customAssets.bundleJavascriptJsPath) {
    fs.copyFileSync(customAssets.bundleJavascriptJsPath, path.join(assetsDirectory, 'bundle-javascript.js'));
    logger.debug(`Copied bundle javascript.js from ${customAssets.bundleJavascriptJsPath}`);
  }

  // Copy extra files (images, fonts, etc.) from custom_assets dirs
  // Global first, then bundle overlay (bundle files with same name override global)
  const extraOutputDir = path.join(assetsDirectory, 'extra');
  const hasExtraFiles = customAssets.globalExtraFilesDir || customAssets.bundleExtraFilesDir;
  if (hasExtraFiles) {
    const copyExtras = (sourceDir: string) => {
      if (!fs.existsSync(sourceDir)) return;
      const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
      for (const entry of entries) {
        // Skip the known CSS/JS asset files
        if (entry.name === 'style.css' || entry.name === 'javascript.js') continue;
        const srcPath = path.join(sourceDir, entry.name);
        const dstPath = path.join(extraOutputDir, entry.name);
        if (entry.isFile()) {
          fs.mkdirSync(extraOutputDir, { recursive: true });
          fs.copyFileSync(srcPath, dstPath);
        } else if (entry.isDirectory()) {
          fs.cpSync(srcPath, dstPath, { recursive: true });
        }
      }
    };
    if (customAssets.globalExtraFilesDir) copyExtras(customAssets.globalExtraFilesDir);
    if (customAssets.bundleExtraFilesDir) copyExtras(customAssets.bundleExtraFilesDir);
  }

  // Copy mermaid.min.js from shared directory (common to all presets)
  let sharedDirectory: string;
  if (process.env.NODE_ENV === 'production' && __dirname.includes('Resources')) {
    sharedDirectory = path.join(__dirname, 'shared');
  } else {
    sharedDirectory = path.join(__dirname, 'shared');
  }

  const mermaidSrc = path.join(sharedDirectory, 'mermaid.min.js');
  const mermaidDst = path.join(assetsDirectory, 'mermaid.min.js');
  if (fs.existsSync(mermaidSrc)) {
    fs.copyFileSync(mermaidSrc, mermaidDst);
    logger.debug(`Copied mermaid.min.js to ${mermaidDst}`);
  } else {
    logger.warn(`mermaid.min.js not found at ${mermaidSrc}`);
  }

  const calloutsSrc = path.join(sharedDirectory, 'callouts.css');
  const calloutsDst = path.join(assetsDirectory, 'callouts.css');
  if (fs.existsSync(calloutsSrc)) {
    fs.copyFileSync(calloutsSrc, calloutsDst);
    logger.debug(`Copied callouts.css to ${calloutsDst}`);
  } else {
    logger.warn(`callouts.css not found at ${calloutsSrc}`);
  }

  const bundleHasStructuralPages = Object.values(bundleNodeConfs).some(
    conf => conf.bundleNodeKind !== 'file' && conf.listType === 'whitelist'
  );
  if (bundleHasStructuralPages) {
    const structuralPagesSrc = path.join(sharedDirectory, 'structural-pages.css');
    const structuralPagesDst = path.join(assetsDirectory, 'structural-pages.css');
    if (fs.existsSync(structuralPagesSrc)) {
      fs.copyFileSync(structuralPagesSrc, structuralPagesDst);
      logger.debug(`Copied structural-pages.css to ${structuralPagesDst}`);
    } else {
      logger.warn(`structural-pages.css not found at ${structuralPagesSrc}`);
    }
  }

  if (generationOptions.folderNavigationEnabled) {
    const folderNavigationDirectory = path.join(assetsDirectory, CUSTOMIZATION_ASSETS_DIRECTORY, 'folder_nav');
    fs.mkdirSync(folderNavigationDirectory, { recursive: true });
    for (const asset of [
      { source: 'folder-nav.css', target: 'folder-nav.css' },
      { source: 'folder-nav.js', target: 'folder-nav.js' },
    ]) {
      const sourcePath = path.join(sharedDirectory, asset.source);
      const targetPath = path.join(folderNavigationDirectory, asset.target);
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, targetPath);
        logger.debug(`Copied ${asset.source} to ${targetPath}`);
      } else {
        logger.warn(`${asset.source} not found at ${sourcePath}`);
      }
    }
  }

  if (generationOptions.searchEnabled) {
    copyPublishedBundleSearchAssets(sharedDirectory, assetsDirectory);
  }

  if (generationOptions.hoverPreviewEnabled) {
    const hoverPreviewDirectory = path.join(assetsDirectory, CUSTOMIZATION_ASSETS_DIRECTORY, 'hover_preview');
    fs.mkdirSync(hoverPreviewDirectory, { recursive: true });
    for (const asset of ['hover-preview.css', 'hover-preview.js']) {
      const sourcePath = path.join(sharedDirectory, asset);
      const targetPath = path.join(hoverPreviewDirectory, asset);
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, targetPath);
        logger.debug(`Copied ${asset} to ${targetPath}`);
      } else {
        logger.warn(`${asset} not found at ${sourcePath}`);
      }
    }
  }

  // Excalidraw assets — only copied for bundles that include at least one Excalidraw drawing.
  const bundleHasExcalidraw = Object.values(bundleNodeConfs).some(
    conf => conf.fileType === 'excalidraw' && conf.listType === 'whitelist'
  );
  const precompressedStaticAssetSources: Record<string, PrecompressedAssetSource> = {};
  if (bundleHasExcalidraw) {
    const precompressedExcalidrawVendor = loadPrecompressedExcalidrawVendorAsset(sharedDirectory);
    const excalidrawAssets = [
      'meadow-excalidraw.css',
      'excalidraw-vendor.js', // pre-bundled @excalidraw/excalidraw + lz-string; sets window.MeadowExcalidraw
      'meadow-excalidraw.js', // small init script that hydrates placeholder containers
    ];
    for (const asset of excalidrawAssets) {
      const src = path.join(sharedDirectory, asset);
      const dst = path.join(assetsDirectory, asset);
      if (asset === 'excalidraw-vendor.js') {
        if (precompressedExcalidrawVendor) {
          precompressedStaticAssetSources[asset] = precompressedExcalidrawVendor;
          logger.debug(`Deferred ${asset} copy until hashed gzip write`);
        } else if (fs.existsSync(src)) {
          fs.copyFileSync(src, dst);
          logger.debug(`Copied ${asset} to ${dst}`);
        } else {
          logger.warn(`${asset} not found at ${src}`);
        }
        continue;
      }
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
        logger.debug(`Copied ${asset} to ${dst}`);
      } else {
        logger.warn(`${asset} not found at ${src}`);
      }
    }
  }

  if (generationOptions.spacedRepetitionEnabled) {
    const srsAssetsDirectory = getPublishedBundleSrsAssetsPath();
    const srsOutputDirectory = path.join(
      assetsDirectory,
      CUSTOMIZATION_ASSETS_DIRECTORY,
      SPACED_REPETITION_ASSETS_DIRECTORY
    );
    fs.mkdirSync(srsOutputDirectory, { recursive: true });
    const srsAssetNames = ['srs.js', 'srs.css'];

    for (const assetName of srsAssetNames) {
      const sourcePath = path.join(srsAssetsDirectory, assetName);
      const targetPath = path.join(srsOutputDirectory, assetName);
      if (!fs.existsSync(sourcePath)) {
        logger.warn(`SRS asset not found at ${sourcePath}`);
        continue;
      }
      fs.copyFileSync(sourcePath, targetPath);
      logger.debug(`Copied SRS asset: ${assetName}`);
    }
  }
  recordStageTiming('copy_assets', copyAssetsStart, { has_excalidraw: bundleHasExcalidraw });

  // Key breadcrumbPaths by pageKey (title|directory|file_type) to handle duplicate titles correctly
  let breadcrumbPaths: { [pageKey: string]: string[] } = {};
  let breadcrumbNodeKeysByNodeKey = new Map<BundleNodeKey, BundleNodeKey[]>();
  let allLinkResolutionMaps: Map<string, Record<string, LinkResolvedInfo>> = new Map();
  // Track which pages are reachable via traversal - only these should have HTML generated
  let traversablePageKeys: Set<string> = new Set();
  let renderGraphNodes: IBundleNode[] = [];
  let structuralProjection: VisibleStructuralProjection | null = sourceStructuralProjection;

  // Generation only reads the scrubbed source directory from here on.
  // Re-run traversal after scrubbing so breadcrumbs, rendering, and exports
  // agree with the publishable content boundary.
  try {
    emitProgress({
      stage: 'computing-breadcrumbs',
      message: breadcrumbsEnabled ? 'Creating traversal and breadcrumbs...' : 'Creating traversal...'
    });
    const renderGraphData = await timeAsync(
      'bundle.generation.stage',
      { ...timingLabels, stage: 'load_render_working_graph', breadcrumbs_enabled: breadcrumbsEnabled },
      () => loadWorkingGraphData({
        graphRoot: renderContentDirectory,
        bundleNodeConfigPath: bundleNodeConfPath,
        bundleConfig,
        breadcrumbsEnabled,
      })
    );
    breadcrumbPaths = renderGraphData.breadcrumbPaths;
    breadcrumbNodeKeysByNodeKey = renderGraphData.breadcrumbNodeKeysByNodeKey;
    allLinkResolutionMaps = renderGraphData.allLinkResolutionMaps;
    traversablePageKeys = renderGraphData.traversablePageKeys;
    renderGraphNodes = renderGraphData.graphNodes;
    if (routePlan.folderDerived) {
      structuralProjection = buildVisibleStructuralProjection(
        renderGraphData.graphNodes,
        renderGraphData.graphEdges,
        bundleNodeConfigsArray,
        bundleConfig.entryBundleNodeId!,
      );
      for (const [nodeKey, structuralPath] of structuralProjection.breadcrumbNodeKeysByNodeKey) {
        breadcrumbNodeKeysByNodeKey.set(nodeKey, structuralPath);
        breadcrumbPaths[nodeKey] = structuralPath
          .map(key => renderGraphData.graphNodes.find(node => node.bundleNodeKey === key)?.bundleNodeName)
          .filter((name): name is string => Boolean(name));
      }
    }

    logger.debug(`Loaded link resolution maps for ${allLinkResolutionMaps.size} pages from working_graph`);
    if (breadcrumbsEnabled) {
      logger.debug(`Computed breadcrumb paths for ${Object.keys(breadcrumbPaths).length} pages using working graph`);
    }
    logger.debug(`Found ${traversablePageKeys.size} traversable pages (only these will have HTML generated)`);
  } catch (err) {
    if (routePlan.folderDerived) throw err;
    logger.warn(`Could not load working_graph data for link resolution and breadcrumbs (will proceed without it): ${err instanceof Error ? err.message : String(err)}`);
  }

  // Filter bundle page configs to only include pages in the working graph.
  // This ensures links to tracked-but-not-in-graph pages show as "link not tracked".
  const bundleNodeConfigsArrayForLinks = bundleNodeConfigsArray.filter(conf => {
    const key = bundleNodeConfigToKey(conf);
    return traversablePageKeys.has(key);
  });

  // Generate sources export ZIP if enabled. The ZIP is a copy of
  // scrubbed_source_content so Obsidian-compatible downloads and rendered HTML
  // share the same privacy boundary.
  let sourcesExportEnabled = false;
  if (generationOptions.sourcesExportEnabled) {
    try {
      await timeAsync('bundle.generation.stage', { ...timingLabels, stage: 'sources_export' }, async () => {
        const sourcesExportDir = BundleConfigPaths.getSourcesExportDir(bundleDirectory);
        const legacySourcesExportDir = path.join(bundleDirectory, 'build', 'markdown_export');
        const legacySourcesExportOutputDir = path.join(assetsDirectory, 'md-export');
        if (fs.existsSync(sourcesExportDir)) {
          fs.rmSync(sourcesExportDir, { recursive: true, force: true });
        }
        if (fs.existsSync(legacySourcesExportDir)) {
          fs.rmSync(legacySourcesExportDir, { recursive: true, force: true });
        }
        if (fs.existsSync(legacySourcesExportOutputDir)) {
          fs.rmSync(legacySourcesExportOutputDir, { recursive: true, force: true });
        }
        prepareSourcesExportFromScrubbedSourceDirectory(scrubbedSourceContentDirectory, sourcesExportDir);

        const sourcesExportOutputDir = path.join(
          assetsDirectory,
          CUSTOMIZATION_ASSETS_DIRECTORY,
          SOURCES_EXPORT_ASSETS_DIRECTORY
        );
        fs.mkdirSync(sourcesExportOutputDir, { recursive: true });
        const sourcesExportSlug = getArtifactArchiveSlug(bundleDirectory, bundleConfig);
        const zipResult = await createSourcesExportZip(sourcesExportDir, sourcesExportOutputDir, {
          archiveRootDirectory: sourcesExportSlug,
        });
        writeSourcesExportManifest(sourcesExportOutputDir, zipResult, {
          downloadFilename: getSourcesExportDownloadFilename(sourcesExportSlug),
        });
        if (zipResult) {
          sourcesExportEnabled = true;
          logger.info(`Generated sources export ZIP: ${zipResult}`);
        }
      });
    } catch (error) {
      logger.error(`Error generating sources export ZIP: ${String(error)}`);
    }
  } else {
    timeSync('bundle.generation.stage', { ...timingLabels, stage: 'sources_export_cleanup' }, () => {
      const sourcesExportOutputDir = path.join(
        assetsDirectory,
        CUSTOMIZATION_ASSETS_DIRECTORY,
        SOURCES_EXPORT_ASSETS_DIRECTORY
      );
      if (fs.existsSync(sourcesExportOutputDir)) {
        fs.rmSync(sourcesExportOutputDir, { recursive: true, force: true });
      }
      const legacySourcesExportOutputDir = path.join(assetsDirectory, 'md-export');
      if (fs.existsSync(legacySourcesExportOutputDir)) {
        fs.rmSync(legacySourcesExportOutputDir, { recursive: true, force: true });
      }
      // Clean up intermediate directory if it exists
      const sourcesExportDir = BundleConfigPaths.getSourcesExportDir(bundleDirectory);
      if (fs.existsSync(sourcesExportDir)) {
        fs.rmSync(sourcesExportDir, { recursive: true, force: true });
      }
      const legacySourcesExportDir = path.join(bundleDirectory, 'build', 'markdown_export');
      if (fs.existsSync(legacySourcesExportDir)) {
        fs.rmSync(legacySourcesExportDir, { recursive: true, force: true });
      }
    });
  }

  let openKnowledgeFormatEnabled = false;
  if (generationOptions.openKnowledgeFormatEnabled) {
    try {
      await timeAsync('bundle.generation.stage', { ...timingLabels, stage: 'open_knowledge_format' }, async () => {
        const entryRuntimeKey = bundleNodeConfigToKey(entryNode);
        const entryChildren = sourceStructuralProjection?.childrenByNodeKey.get(entryRuntimeKey as BundleNodeKey) ?? [];
        const generatedIndexMarkdown = entryNode.bundleNodeKind === 'file'
          ? undefined
          : `---\nokf_version: "0.1"\n---\n\n# ${entryNode.bundleNodeName}\n\n${entryChildren
              .map(childKey => sourceGraphNodes.find(node => node.bundleNodeKey === childKey))
              .filter((node): node is IBundleNode => Boolean(node))
              .map(node => `- ${node.bundleNodeName}`)
              .join('\n')}\n`;
        const result = await generatePublishedOpenKnowledgeFormatArtifacts({
          bundleDirectory,
          assetsDirectory,
          scrubbedSourceContentDirectory,
          bundleNodeConfigs: bundleNodeConfigsArrayForLinks,
          allLinkResolutionMaps,
          entryNodeName,
          entrySourceGraphSubdirectory: entryNodeSourceGraphSubdirectory,
          indexSource: openKnowledgeFormatIndexSourceFromBundleConfig(bundleConfig),
          logSource: openKnowledgeFormatLogSourceFromBundleConfig(bundleConfig),
          generatedIndexMarkdown,
          archiveRootDirectory: getArtifactArchiveSlug(bundleDirectory, bundleConfig),
        });
        if (result.enabled) {
          openKnowledgeFormatEnabled = true;
          logger.info(`Generated OKF ZIP: ${result.zipFilename}`);
        }
      });
    } catch (error) {
      logger.error(`Error generating OKF bundle: ${String(error)}`);
    }
  } else {
    timeSync('bundle.generation.stage', { ...timingLabels, stage: 'open_knowledge_format_cleanup' }, () => {
      cleanupPublishedOpenKnowledgeFormatArtifacts({ bundleDirectory, assetsDirectory });
    });
  }

  // Build the inverse_links mappings by scanning all traversable text-content
  // pages (Markdown, native HTML, and Excalidraw drawings). This excludes
  // orphaned tracked pages (isTracked: true but isInWorkingGraph: false).
  const inverseLinks: InverseLinks = {};
  const pageNameToPage: PageNameToPage = {};

  emitProgress({ stage: 'scanning-links', message: 'Scanning links for backlinks...' });
  const scanLinksStart = performance.now();
  const traversableLinkScanPageKeys = Object.keys(bundleNodeConfs).filter(pageKey => {
    const conf = bundleNodeConfs[pageKey];
    const ft = conf.fileType;
    const isScannable = conf.bundleNodeKind === 'file' && (ft === 'md' || ft === 'html' || ft === 'excalidraw');
    return isScannable && conf.listType === 'whitelist' && traversablePageKeys.has(pageKey);
  });
  for (const pageKey of traversableLinkScanPageKeys) {
    const conf = bundleNodeConfs[pageKey];
    const subdir = conf.sourceGraphSubdirectory || '';
    const filename = canonicalPageFilename(conf.bundleNodeName, conf.fileType);
    const pageContentPath = subdir
      ? path.join(renderContentDirectory, subdir, filename)
      : path.join(renderContentDirectory, filename);

    if (!fs.existsSync(pageContentPath)) {
      continue;
    }

    // Read the text content.
    const content = fs.readFileSync(pageContentPath, 'utf-8');

    // Native HTML uses the Rust graph's resolved URL-attribute map. Markdown
    // and Excalidraw retain the richer existing backlink-context extraction.
    const links = conf.fileType === 'html'
      ? [...new Set(Object.values(allLinkResolutionMaps.get(bundleNodeConfigToKey(conf)) ?? {})
          .map(resolved => resolved.link_resolved_target_path ?? '')
          .filter(targetPath => /\.(?:md|html|excalidraw)$/i.test(targetPath))
          .map(targetPath => path.posix.basename(targetPath).replace(/\.(?:md|html|excalidraw)$/i, '')))]
      : markdownContentToPageLinkFilenames(content);

    // Also capture excalidraw embeds `![[X.excalidraw]]` as inlinks to the
    // X drawing — the markdown link extractor skips them (image-typed) but we
    // want backlinks to render on the standalone Excalidraw page.
    const excalidrawEmbedRe = /!\[\[([^\]]+)\]\]/g;
    let exMatch;
    while (conf.fileType !== 'html' && (exMatch = excalidrawEmbedRe.exec(content)) !== null) {
      const inner = exMatch[1].split('|')[0]; // strip size/alias
      if (!/\.excalidraw$/i.test(inner)) continue;
      const stripped = inner.replace(/\.excalidraw$/i, '');
      const lastSlash = stripped.lastIndexOf('/');
      const title = lastSlash >= 0 ? stripped.slice(lastSlash + 1) : stripped;
      if (title && !links.includes(title)) {
        links.push(title);
      }
    }

    // Also scan for standard markdown file links [text](path.md)
    const mdLinkPattern = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;
    let mdLinkMatch;
    while (conf.fileType !== 'html' && (mdLinkMatch = mdLinkPattern.exec(content)) !== null) {
      const href = mdLinkMatch[2].trim();
      // Skip external links and anchor-only links
      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')) continue;
      // Extract the filename stem from the href (strip path and extension)
      const hrefWithoutAnchor = href.split('#')[0];
      const filename = hrefWithoutAnchor.split('/').pop() ?? '';
      const stem = filename.replace(/\.[^.]+$/, '');
      if (stem && !links.includes(stem)) {
        links.push(stem);
      }
    }

    // For each link found, add the current page to the inverse_links for that target
    for (const link of links) {
      if (!inverseLinks[link]) {
        inverseLinks[link] = [];
      }

      if (!inverseLinks[link].includes(conf.bundleNodeName)) {
        inverseLinks[link].push(conf.bundleNodeName);
      }
    }

    // Create a simple page object
    pageNameToPage[conf.bundleNodeName] = new Page();
  }
  recordStageTiming('scan_backlinks', scanLinksStart, { page_count: traversableLinkScanPageKeys.length });

  // Second pass: generate HTML for each traversable page into the current generated artifact.
  // Only pages reachable via the working graph traversal will have HTML generated
  const traversableMdPageKeys = whitelistedMdPageKeys.filter(pageKey => traversablePageKeys.has(pageKey));
  const traversableExcalidrawPageKeys = Object.keys(bundleNodeConfs).filter(key => {
    const conf = bundleNodeConfs[key];
    return conf.listType === 'whitelist' && conf.fileType === 'excalidraw' && traversablePageKeys.has(key);
  });
  const traversableHtmlPageKeys = Object.keys(bundleNodeConfs).filter(key => {
    const conf = bundleNodeConfs[key];
    return conf.bundleNodeKind === 'file'
      && conf.listType === 'whitelist'
      && conf.fileType === 'html'
      && traversablePageKeys.has(key);
  });
  const traversableAssetPageKeys = Object.keys(bundleNodeConfs).filter(key => {
    const conf = bundleNodeConfs[key];
    return conf.bundleNodeKind === 'file'
      && conf.listType === 'whitelist'
      && conf.fileType !== 'md'
      && conf.fileType !== 'html'
      && conf.fileType !== 'excalidraw'
      && traversablePageKeys.has(key);
  });
  const traversableStructuralPageKeys = Object.keys(bundleNodeConfs).filter(key => {
    const conf = bundleNodeConfs[key];
    return conf.bundleNodeKind !== 'file' && conf.listType === 'whitelist' && traversablePageKeys.has(key);
  });
  const traversableRenderablePageKeys = [
    ...traversableStructuralPageKeys,
    ...traversableMdPageKeys,
    ...traversableHtmlPageKeys,
    ...traversableExcalidrawPageKeys,
  ];
  const folderNavigationPages: FolderNavigationPage[] = generationOptions.folderNavigationEnabled
    ? [...new Map(traversableRenderablePageKeys
      .filter(pageKey => bundleNodeConfs[pageKey].sourceGraphSubdirectory !== BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR)
      .map(pageKey => {
        const conf = bundleNodeConfs[pageKey];
        const normalizedTitle = normalizePageTitle(conf.bundleNodeName, bundleConfig, bundleSlug || undefined);
        const outputPath = routeForBundleNode(conf, routePlan.routes);
        const directory = path.posix.dirname(outputPath) === '.' ? '' : path.posix.dirname(outputPath);
        if (!routePlan.folderDerived) {
          return [outputPath, { directory, normalizedTitle, outputPath }] as const;
        }
        const runtimeNode = renderGraphNodes.find(node => node.bundleNodeId === conf.bundleNodeId);
        const parentKey = runtimeNode && structuralProjection
          ? structuralProjection.parentByNodeKey.get(runtimeNode.bundleNodeKey)
          : undefined;
        const parentBundleNodeId = parentKey
          ? renderGraphNodes.find(node => node.bundleNodeKey === parentKey)?.bundleNodeId
          : undefined;
        return [outputPath, {
          directory,
          normalizedTitle,
          outputPath,
          bundleNodeId: conf.bundleNodeId,
          parentBundleNodeId,
          bundleNodeKind: conf.bundleNodeKind,
          isEntry: conf.bundleNodeId === entryNode.bundleNodeId,
        }] as const;
      })).values()]
    : [];
  const folderNavigationStorageKey = `meadow-folder-nav:${bundleConfig.bundleGuid || bundleSlug || 'bundle'}`;

  if (generationOptions.folderNavigationEnabled) {
    const folderNavigationDataPath = path.join(
      assetsDirectory,
      CUSTOMIZATION_ASSETS_DIRECTORY,
      'folder_nav',
      'folder-nav-data.js'
    );
    fs.writeFileSync(
      folderNavigationDataPath,
      renderFolderNavigationDataScript(folderNavigationPages),
      'utf8'
    );
  }

  // Hash+rename static assets after the shared folder-nav data exists
  // and before pages are rendered, so every page references the same immutable files.
  let staticAssetNames: StaticAssetNames | undefined;
  try {
    staticAssetNames = timeSync('bundle.generation.stage', { ...timingLabels, stage: 'hash_static_assets' }, () =>
      hashAndRenameStaticAssets(assetsDirectory, { precompressedSourceAssets: precompressedStaticAssetSources })
    );
  } catch (error) {
    logger.error(`Error hashing/renaming shared assets: ${String(error)}`);
    staticAssetNames = undefined;
  }

  // Determine which page to render first (for fast preview UX)
  const requestedStartTitle = options.startPage?.title;
  const requestedStartDir = options.startPage?.directory ?? '';
  const defaultStartTitle = defaultTraversalNode.bundleNodeName;
  const defaultStartDir = defaultTraversalNode.sourceGraphSubdirectory || '';

  const startTitle = requestedStartTitle || defaultStartTitle;
  const startDir = requestedStartTitle ? requestedStartDir : defaultStartDir;

  // If a startPagePath was provided (e.g. "subdir/My Page.html"), find the matching page key
  let startPageKey: string | undefined;
  if (options.startPagePath) {
    const targetPath = decodeURIComponent(options.startPagePath);
    startPageKey = traversableRenderablePageKeys.find(k => {
      const c = bundleNodeConfs[k];
      return routeForBundleNode(c, routePlan.routes) === targetPath;
    });
  }

  if (!startPageKey && startTitle) {
    startPageKey = traversableRenderablePageKeys.find(k => {
      const c = bundleNodeConfs[k];
      return c.bundleNodeName === startTitle && (c.sourceGraphSubdirectory || '') === (startDir || '');
    });
  }

  // Render start page first, then the rest deterministically.
  const mdRenderOrder: string[] = startPageKey && traversableMdPageKeys.includes(startPageKey)
    ? [startPageKey, ...traversableMdPageKeys.filter(k => k !== startPageKey)]
    : [...traversableMdPageKeys];
  const excalidrawRenderOrder: string[] = startPageKey && traversableExcalidrawPageKeys.includes(startPageKey)
    ? [startPageKey, ...traversableExcalidrawPageKeys.filter(k => k !== startPageKey)]
    : [...traversableExcalidrawPageKeys];
  const htmlRenderOrder: string[] = startPageKey && traversableHtmlPageKeys.includes(startPageKey)
    ? [startPageKey, ...traversableHtmlPageKeys.filter(k => k !== startPageKey)]
    : [...traversableHtmlPageKeys];
  const structuralRenderOrder: string[] = startPageKey && traversableStructuralPageKeys.includes(startPageKey)
    ? [startPageKey, ...traversableStructuralPageKeys.filter(key => key !== startPageKey)]
    : [...traversableStructuralPageKeys];

  const totalToRender = structuralRenderOrder.length
    + mdRenderOrder.length
    + htmlRenderOrder.length
    + excalidrawRenderOrder.length
    + traversableAssetPageKeys.length;
  let renderedOrSkipped = 0;
  let lastPercent = -1;
  emitProgress({ stage: 'rendering-pages', message: `Rendering HTML pages...`, current: 0, total: totalToRender, percent: 0 });

  const allCollectedSrsCards: Array<CollectedSrsCard & { pageId: string; pageTitle: string }> = [];

  let startPageRenderedEmitted = false;
  const renderNodeByKey = new Map(renderGraphNodes.map(node => [node.bundleNodeKey, node]));
  const configById = new Map(bundleNodeConfigsArray.map(config => [config.bundleNodeId, config]));
  const breadcrumbNodeKeysFor = (pageKey: string): BundleNodeKey[] =>
    breadcrumbNodeKeysByNodeKey.get(pageKey as BundleNodeKey) ?? [];

  const outputDirectoryForRoute = (route: string): string => {
    const directory = path.posix.dirname(route);
    return directory === '.' ? '' : directory;
  };

  const structuralChildIcon = (kind: IBundleNode['bundleNodeKind']): string => {
    if (kind === 'folder' || kind === 'collection') {
      return '<span class="structural-child-icon" aria-hidden="true">'
        + '<svg viewBox="0 0 24 24" focusable="false">'
        + '<path d="M2.75 6.75A2.75 2.75 0 0 1 5.5 4h4.1l2.1 2.25h6.8a2.75 2.75 0 0 1 2.75 2.75v8.25A2.75 2.75 0 0 1 18.5 20h-13a2.75 2.75 0 0 1-2.75-2.75Z" fill="currentColor" opacity=".18"/>'
        + '<path d="M3 7h17.5M5.5 4.25h4l2.1 2.25h6.9A2.5 2.5 0 0 1 21 9v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17V6.75a2.5 2.5 0 0 1 2.5-2.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/>'
        + '</svg></span>';
    }
    return '<span class="structural-child-icon" aria-hidden="true">'
      + '<svg viewBox="0 0 24 24" focusable="false">'
      + '<path d="M6.25 2.75h7l4.5 4.5v14h-11.5Z" fill="currentColor" opacity=".12"/>'
      + '<path d="M13.25 2.75v4.5h4.5m-11.5-4.5h7l4.5 4.5v14h-11.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/>'
      + '<path d="M9 12h6M9 15.5h6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"/>'
      + '</svg></span>';
  };

  const copyStructuralFileAsset = (config: Extract<typeof bundleNodeConfigsArray[number], { bundleNodeKind: 'file' }>): string | undefined => {
    const sourceFilename = canonicalPageFilename(config.bundleNodeName, config.fileType);
    const sourcePath = config.sourceGraphSubdirectory
      ? path.join(renderContentDirectory, ...config.sourceGraphSubdirectory.split('/'), sourceFilename)
      : path.join(renderContentDirectory, sourceFilename);
    if (!fs.existsSync(sourcePath)) return undefined;

    const digest = createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex').slice(0, 8);
    const extension = path.extname(sourceFilename);
    const outputRelativePath = path.posix.join(
      '_mw_assets',
      CUSTOMIZATION_ASSETS_DIRECTORY,
      'structural-previews',
      `${config.bundleNodeId}.${digest}${extension}`,
    );
    const outputPath = path.join(generatedHtmlDirectory, ...outputRelativePath.split('/'));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    if (!fs.existsSync(outputPath)) fs.copyFileSync(sourcePath, outputPath);
    return outputRelativePath;
  };

  const structuralBreadcrumbHtml = (bundleNodeKey: BundleNodeKey, currentRoute: string): string => {
    if (!breadcrumbsEnabled || !structuralProjection) return '';
    const keys = structuralProjection.breadcrumbNodeKeysByNodeKey.get(bundleNodeKey) ?? [];
    if (keys.length <= 1) return '';
    const currentDirectory = outputDirectoryForRoute(currentRoute);
    const items = keys.map((key, index) => {
      const node = renderNodeByKey.get(key);
      if (!node) return '';
      const label = escapeHtml(node.bundleNodeName);
      if (index === keys.length - 1) return `<span class="breadcrumb-current">${label}</span>`;
      const config = node.bundleNodeId ? configById.get(node.bundleNodeId) : undefined;
      if (!config) return '';
      const href = encodePathForUrl(calculateRelativePath(currentDirectory, routeForBundleNode(config, routePlan.routes)));
      return `<a href="${href}" class="breadcrumb-link">${label}</a>`;
    }).filter(Boolean);
    return `<nav class="breadcrumbs" aria-label="Breadcrumb">${items.join('<span class="breadcrumb-separator">→</span>')}</nav>`;
  };

  const emitRenderProgressIfChanged = () => {
    const percent = totalToRender > 0 ? Math.floor((renderedOrSkipped / totalToRender) * 100) : 100;
    if (percent !== lastPercent) {
      lastPercent = percent;
      emitProgress({
        stage: 'rendering-pages',
        message: `Rendering HTML pages...`,
        current: renderedOrSkipped,
        total: totalToRender,
        percent
      });
    }
  };

  for (const pageKey of structuralRenderOrder) {
    if (options.shouldCancel?.()) break;
    const config = bundleNodeConfs[pageKey];
    const node = renderNodeByKey.get(pageKey as BundleNodeKey);
    if (!node || !structuralProjection) {
      throw new Error(`Cannot render structural bundle node ${pageKey}: visible projection is unavailable`);
    }
    const outputRoute = routeForBundleNode(config, routePlan.routes);
    const outputDirectory = outputDirectoryForRoute(outputRoute);
    const children = (structuralProjection.childrenByNodeKey.get(node.bundleNodeKey) ?? [])
      .map(childKey => renderNodeByKey.get(childKey))
      .filter((child): child is IBundleNode => Boolean(child?.bundleNodeId && configById.has(child.bundleNodeId)));
    const childItems = children.map(child => {
      const childConfig = configById.get(child.bundleNodeId!)!;
      const pageRoute = routeForBundleNode(childConfig, routePlan.routes);
      const directAssetRoute = childConfig.bundleNodeKind === 'file'
        && childConfig.fileType !== 'md'
        && childConfig.fileType !== 'html'
        && childConfig.fileType !== 'excalidraw'
        ? copyStructuralFileAsset(childConfig)
        : undefined;
      const targetRoute = directAssetRoute ?? pageRoute;
      const href = encodePathForUrl(calculateRelativePath(outputDirectory, targetRoute));
      const imageLike = childConfig.bundleNodeKind === 'file' && isImageFileType(childConfig.fileType);
      const preview = imageLike && childConfig.fileType === 'excalidraw'
        ? `<span class="structural-child-preview structural-child-preview-excalidraw"><iframe src="${href}?meadow-thumbnail=1" title="Preview of ${escapeHtml(child.bundleNodeName)}" loading="lazy" tabindex="-1" aria-hidden="true"></iframe></span>`
        : imageLike && directAssetRoute
          ? `<span class="structural-child-preview structural-child-preview-image"><img src="${href}" alt="" loading="lazy"></span>`
          : '';
      const fileTypeAttr = childConfig.bundleNodeKind === 'file'
        ? ` data-file-type="${escapeHtml(childConfig.fileType)}"`
        : '';
      return `<li class="structural-child structural-child-${child.bundleNodeKind}${preview ? ' structural-child-has-preview' : ''}"${fileTypeAttr}>`
        + `<a class="structural-child-link" href="${href}">${structuralChildIcon(child.bundleNodeKind)}<span class="structural-child-name">${escapeHtml(child.bundleNodeName)}</span></a>`
        + preview
        + '</li>';
    });
    const bodyHtml = childItems.length > 0
        ? `<ul class="structural-children">${childItems.join('')}</ul>`
        : '<p class="structural-empty">This folder is empty.</p>';
    const htmlPath = renderGeneratedBundleNodeToHtml({
      outputRoot: generatedHtmlDirectory,
      outputRoute,
      pageTitle: config.bundleNodeName,
      bodyHtml,
      breadcrumbHtml: structuralBreadcrumbHtml(pageKey as BundleNodeKey, outputRoute),
      staticAssetNames,
      bundleConfig,
      bundleSlug: bundleSlug || undefined,
      sourcesExportEnabled,
      openKnowledgeFormatEnabled,
      searchEnabled: generationOptions.searchEnabled,
      hoverPreviewEnabled: generationOptions.hoverPreviewEnabled,
      folderNavigation: generationOptions.folderNavigationEnabled ? { storageKey: folderNavigationStorageKey } : undefined,
    });
    if (!startPageRenderedEmitted) {
      const isStart = startPageKey ? pageKey === startPageKey : renderedOrSkipped === 0;
      if (isStart && await waitForFileExists(htmlPath)) {
        startPageRenderedEmitted = true;
        options.onStartPageRendered?.({
          title: config.bundleNodeName,
          directory: config.sourceGraphSubdirectory ?? '',
          relativeHtmlPath: outputRoute,
        });
      }
    }
    renderedOrSkipped += 1;
    emitRenderProgressIfChanged();
    await delay(AFTER_HTML_GENERATION_PAUSE_MS);
  }

  // Copy traversable native assets before signaling that any native HTML page
  // is ready. Shared CSS/JS and media are therefore available on first paint.
  for (const pageKey of traversableAssetPageKeys) {
    if (options.shouldCancel?.()) break;
    const config = bundleNodeConfs[pageKey];
    if (config.bundleNodeKind !== 'file') continue;
    const sourceFilename = canonicalPageFilename(config.bundleNodeName, config.fileType);
    const relativePath = config.sourceGraphSubdirectory
      ? path.posix.join(config.sourceGraphSubdirectory, sourceFilename)
      : sourceFilename;
    const sourcePath = path.join(renderContentDirectory, ...relativePath.split('/'));
    const outputPath = path.join(generatedHtmlDirectory, ...relativePath.split('/'));
    if (fs.existsSync(sourcePath)) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.copyFileSync(sourcePath, outputPath);
    } else {
      logger.warn(`Native bundle asset not found: ${sourcePath}`);
    }
    renderedOrSkipped += 1;
    emitRenderProgressIfChanged();
  }

  const renderNativeHtmlPage = async (pageKey: string) => {
    const conf = bundleNodeConfs[pageKey];
    if (conf.bundleNodeKind !== 'file' || conf.fileType !== 'html') return;
    const subdir = conf.sourceGraphSubdirectory || '';
    const sourcePath = subdir
      ? path.join(renderContentDirectory, ...subdir.split('/'), `${conf.bundleNodeName}.html`)
      : path.join(renderContentDirectory, `${conf.bundleNodeName}.html`);
    const outputRoute = routeForBundleNode(conf, routePlan.routes);
    const outputDirectory = outputDirectoryForRoute(outputRoute);
    const outputPath = path.join(generatedHtmlDirectory, ...outputRoute.split('/'));

    if (!fs.existsSync(sourcePath)) {
      logger.warn(`Native HTML source not found for ${conf.bundleNodeName} at ${sourcePath}`);
      renderedOrSkipped += 1;
      emitRenderProgressIfChanged();
      return;
    }

    const content = fs.readFileSync(sourcePath, 'utf8');
    const rewritten = rewriteNativeHtmlUrls({
      content,
      currentOutputDirectory: outputDirectory,
      linkResolutionMap: allLinkResolutionMaps.get(bundleNodeConfigToKey(conf)),
      bundleNodeConfigs: bundleNodeConfigsArrayForLinks,
      bundleConfig,
      bundleSlug: bundleSlug || undefined,
      routeTable: routePlan.routes,
    });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, rewritten, 'utf8');

    if (!startPageRenderedEmitted && startPageKey === pageKey && await waitForFileExists(outputPath)) {
      startPageRenderedEmitted = true;
      options.onStartPageRendered?.({
        title: conf.bundleNodeName,
        directory: subdir,
        relativeHtmlPath: outputRoute,
      });
    }
    renderedOrSkipped += 1;
    emitRenderProgressIfChanged();
    await delay(AFTER_HTML_GENERATION_PAUSE_MS);
  };

  const renderNativeHtmlStart = performance.now();
  for (const pageKey of htmlRenderOrder) {
    if (options.shouldCancel?.()) break;
    await renderNativeHtmlPage(pageKey);
  }
  recordStageTiming('render_native_html_pages', renderNativeHtmlStart, { page_count: htmlRenderOrder.length });

  const renderStandaloneExcalidrawPage = async (pageKey: string) => {
    const conf = bundleNodeConfs[pageKey];
    const subdir = conf.sourceGraphSubdirectory || '';
    const outputRoute = routeForBundleNode(conf, routePlan.routes);
    const outputDirectory = outputDirectoryForRoute(outputRoute);
    // Obsidian Excalidraw drawings live on disk as `<title>.excalidraw.md`.
    const sourceMdPath = subdir
      ? path.join(renderContentDirectory, subdir, `${conf.bundleNodeName}.excalidraw.md`)
      : path.join(renderContentDirectory, `${conf.bundleNodeName}.excalidraw.md`);

    const outputSubdir = outputDirectory
      ? path.join(generatedHtmlDirectory, ...outputDirectory.split('/'))
      : generatedHtmlDirectory;
    if (outputDirectory && !fs.existsSync(outputSubdir)) {
      fs.mkdirSync(outputSubdir, { recursive: true });
    }

    const normalizedOutputFilename = path.posix.basename(outputRoute, '.html');

    // Build breadcrumb HTML inline using the same lookup as renderPageToHtml.
    const breadcrumbPath = breadcrumbPaths[pageKey] || [];
    const isEntryNode = conf.bundleNodeId === entryNode.bundleNodeId;
    const showBreadcrumbs = breadcrumbsEnabled && !isEntryNode && breadcrumbPath.length > 1;
    let breadcrumbHtml = '';
    if (showBreadcrumbs) {
      const items: string[] = [];
      for (let i = 0; i < breadcrumbPath.length; i++) {
        const t = breadcrumbPath[i];
        const isLast = i === breadcrumbPath.length - 1;
        const normTitle = normalizePageTitle(t, bundleConfig, bundleSlug || undefined);
        if (isLast) {
          items.push(`<span class="breadcrumb-current">${normTitle}</span>`);
        } else {
          const breadcrumbKey = breadcrumbNodeKeysFor(pageKey)[i];
          const breadcrumbNodeId = breadcrumbKey ? renderNodeByKey.get(breadcrumbKey)?.bundleNodeId : undefined;
          const bcConf = breadcrumbNodeId
            ? bundleNodeConfigsArrayForLinks.find(c => c.bundleNodeId === breadcrumbNodeId)
            : bundleNodeConfigsArrayForLinks.find(c => c.bundleNodeName === t);
          const bcDir = bcConf?.sourceGraphSubdirectory || '';
          const encoded = encodeURIComponent(normTitle);
          const conventionalTargetPath = bcDir ? `${bcDir}/${normTitle}.html` : `${normTitle}.html`;
          const plannedRoute = bcConf && routePlan.routes.has(bcConf.bundleNodeId)
            ? routeForBundleNode(bcConf, routePlan.routes)
            : undefined;
          const plannedTargetPath = plannedRoute !== conventionalTargetPath ? plannedRoute : undefined;
          const targetPath = plannedTargetPath ?? (bcDir ? `${bcDir}/${encoded}.html` : `${encoded}.html`);
          // Compute a relative href from this excalidraw page's directory.
          const fromDir = outputDirectory;
          const fromParts = fromDir ? fromDir.split('/').filter(Boolean) : [];
          const toParts = targetPath.split('/');
          let common = 0;
          while (common < fromParts.length && common < toParts.length - 1 && fromParts[common] === toParts[common]) common++;
          const up = '../'.repeat(fromParts.length - common);
          const relativePath = up + toParts.slice(common).join('/');
          const relative = plannedTargetPath ? encodePathForUrl(relativePath) : relativePath;
          items.push(`<a href="${relative}" class="breadcrumb-link">${normTitle}</a>`);
        }
      }
      breadcrumbHtml = `<nav class="breadcrumbs" aria-label="Breadcrumb">${items.join('<span class="breadcrumb-separator">→</span>')}</nav>`;
    }

    const backlinksHtml = generationOptions.backlinksEnabled
      ? renderSimpleBacklinksHtml(
          conf.bundleNodeName,
          subdir,
          inverseLinks,
          bundleNodeConfigsArrayForLinks,
          bundleConfig,
          bundleSlug || undefined,
          routePlan.routes,
          outputDirectory,
        )
      : '';

    // Copy the source .excalidraw.md alongside the page so the client can
    // fetch it by relative path. Embeds in other pages already trigger a
    // copy via linkOrImageHtml, but this loop covers Excalidraw pages that
    // never get embedded.
    const sourceMdDest = path.join(outputSubdir, `${conf.bundleNodeName}.excalidraw.md`);
    if (fs.existsSync(sourceMdPath) && !fs.existsSync(sourceMdDest)) {
      fs.copyFileSync(sourceMdPath, sourceMdDest);
    }
    const drawingMdHref = encodePathForUrl(`${conf.bundleNodeName}.excalidraw.md`);

    // Pre-resolve the wikilinks living inside this Excalidraw drawing using
    // the working-graph data. The client renderer reads this map to set the
    // right href on each linked text element, instead of re-implementing
    // Obsidian's link-resolution rules in JavaScript.
    const excalidrawIdent = subdir ? `${subdir}/${conf.bundleNodeName}.excalidraw` : `/${conf.bundleNodeName}.excalidraw`;
    const { tracked: clientLinkMap, untracked: clientUntrackedLinks } = buildExcalidrawClientLinkData({
      excalidrawPageIdent: excalidrawIdent,
      hostPageDirectory: outputDirectory,
      bundleNodeConfigs: bundleNodeConfigsArrayForLinks,
      allLinkResolutionMaps,
      bundleConfig,
      bundleSlug: bundleSlug || undefined,
      routeTable: routePlan.routes,
      hostOutputDirectory: outputDirectory,
    });
    const { tracked: clientEmbeddedFileMap, untracked: clientUntrackedEmbeddedFiles } = buildExcalidrawClientEmbeddedFileData({
      excalidrawPageIdent: excalidrawIdent,
      hostPageDirectory: subdir,
      bundleNodeConfigs: bundleNodeConfigsArrayForLinks,
      allLinkResolutionMaps,
    });
    copyExcalidrawEmbeddedFiles({
      excalidrawPageIdent: excalidrawIdent,
      contentDir: renderContentDirectory,
      outputDir: generatedHtmlDirectory,
      bundleNodeConfigs: bundleNodeConfigsArrayForLinks,
      allLinkResolutionMaps,
    });

    const htmlPath = renderExcalidrawPageToHtml({
      sourceMdPath,
      outputFolder: outputSubdir,
      outputFilename: normalizedOutputFilename,
      pageTitle: normalizedOutputFilename,
      currentPageDirectory: outputDirectory,
      drawingMdHref,
      clientLinkMap,
      clientUntrackedLinks,
      clientEmbeddedFileMap,
      clientUntrackedEmbeddedFiles,
      breadcrumbHtml,
      backlinksHtml,
      staticAssetNames,
      bundleConfig,
      bundleSlug: bundleSlug || undefined,
      searchEnabled: generationOptions.searchEnabled,
      folderNavigation: generationOptions.folderNavigationEnabled ? {
        storageKey: folderNavigationStorageKey,
      } : undefined,
    });

    if (!startPageRenderedEmitted) {
      const isStart = startPageKey ? pageKey === startPageKey : renderedOrSkipped === 0;
      if (isStart && htmlPath) {
        const fileExists = await waitForFileExists(htmlPath);
        if (fileExists) {
          startPageRenderedEmitted = true;
          const relativeHtmlPath = outputRoute;
          try {
            options.onStartPageRendered?.({ title: conf.bundleNodeName, directory: subdir, relativeHtmlPath });
          } catch (err) {
            logger.warn(`[generateHtmlForBundle] onStartPageRendered callback threw (ignored): ${err instanceof Error ? err.message : String(err)}`);
          }
        } else {
          logger.warn(`[generateHtmlForBundle] Timed out waiting for start page file to exist: ${htmlPath}`);
        }
      }
    }

    renderedOrSkipped += 1;
    emitRenderProgressIfChanged();

    await delay(AFTER_HTML_GENERATION_PAUSE_MS);
  };

  if (startPageKey && traversableExcalidrawPageKeys.includes(startPageKey)) {
    if (options.shouldCancel?.()) {
      logger.warn('[generateHtmlForBundle] Cancel requested; stopping render loop early');
    } else {
      await timeAsync(
        'bundle.generation.stage',
        { ...timingLabels, stage: 'render_start_excalidraw_page' },
        () => renderStandaloneExcalidrawPage(startPageKey)
      );
    }
  }

  const renderMarkdownStart = performance.now();
  for (const pageKey of mdRenderOrder) {
    if (options.shouldCancel?.()) {
      logger.warn('[generateHtmlForBundle] Cancel requested; stopping render loop early');
      break;
    }
    
    const conf = bundleNodeConfs[pageKey];
    const subdir = conf.sourceGraphSubdirectory || '';
    const outputRoute = routeForBundleNode(conf, routePlan.routes);
    const outputDirectory = outputDirectoryForRoute(outputRoute);
    const pageContentPath = subdir 
      ? path.join(renderContentDirectory, subdir, `${conf.bundleNodeName}.md`)
      : path.join(renderContentDirectory, `${conf.bundleNodeName}.md`);

    if (!fs.existsSync(pageContentPath)) {
      logger.warn(`Page content file not found for ${conf.bundleNodeName} at ${pageContentPath}`);
      renderedOrSkipped += 1;
      emitRenderProgressIfChanged();
      continue;
    }
    
    // Normalize the output filename to match how links are normalized
    const normalizedOutputFilename = path.posix.basename(outputRoute, '.html');
    
    // Create output subdirectory if needed
    const outputSubdir = outputDirectory
      ? path.join(generatedHtmlDirectory, ...outputDirectory.split('/'))
      : generatedHtmlDirectory;
    if (outputDirectory && !fs.existsSync(outputSubdir)) {
      fs.mkdirSync(outputSubdir, { recursive: true });
    }
    
    // Source directory includes subdirectory for finding the markdown file
    const sourceDir = subdir 
      ? path.join(renderContentDirectory, subdir)
      : renderContentDirectory;
    
    // Get the link resolution map for this page
    // Page ident format is "directory/title.fileType" or "/title.fileType" for root
    const pageIdent = subdir ? `${subdir}/${conf.bundleNodeName}.md` : `/${conf.bundleNodeName}.md`;
    const linkResolutionMap = allLinkResolutionMaps.get(pageIdent);

    // Determine if this is the initial page (no breadcrumbs for initial page)
    // Match by title AND directory to handle duplicate titles correctly
    const isEntryNode = conf.bundleNodeId === entryNode.bundleNodeId;
    // Look up breadcrumb path by pageKey to handle duplicate titles correctly
    const breadcrumbPath = breadcrumbPaths[pageKey] || [];
    
    // Use effective publish options (bundle override -> global -> default)
    const showBreadcrumbs = breadcrumbsEnabled && !isEntryNode && breadcrumbPath.length > 0;
    const showBacklinks = generationOptions.backlinksEnabled;

    // Generate into the current artifact (with subdirectory).
    const { htmlPath, srsCards } = renderPageToHtml(
      sourceDir,  // Source directory (includes subdir for finding the .md file)
      pageNameToPage,
      conf.bundleNodeName,  // current_page_name
      normalizedOutputFilename,  // output_filename
      outputSubdir,  // output folder (may be subdirectory)
      inverseLinks,
      bundleConfig,
      '',  // bundle_config_file
      bundleNodeConfigsArrayForLinks,
      {
        processBacklinks: showBacklinks,
        processingMode: 'each-page',
        showBacklinkContext: true,
        skipUninterestingLeafPages: false,
        preserveFrontmatter: false,
        showBreadcrumbs,
        showHoverPreview: generationOptions.hoverPreviewEnabled,
        breadcrumbPath,
        breadcrumbBundleNodeIds: breadcrumbNodeKeysFor(pageKey)
          ?.map(key => renderNodeByKey.get(key)?.bundleNodeId)
          .filter((id): id is BundleNodeId => Boolean(id)) ?? [],
        routeTable: routePlan.routes,
        currentOutputDirectory: outputDirectory,
        entryNodeName,
        staticAssetNames,
        sourcesExportEnabled,
        openKnowledgeFormatEnabled,
        srsEnabled: generationOptions.spacedRepetitionEnabled,
        searchEnabled: generationOptions.searchEnabled,
        folderNavigation: generationOptions.folderNavigationEnabled ? {
          storageKey: folderNavigationStorageKey,
        } : undefined,
      },
      bundleSlug || undefined,
      subdir,  // current page's source directory
      renderContentDirectory,  // base content directory for image lookups
      generatedHtmlDirectory,  // base output directory for image output
      linkResolutionMap,
      allLinkResolutionMaps
    );

    if (htmlPath) {
      logger.debug(`Generated HTML for: ${conf.bundleNodeName} in ${subdir || 'root'}`);
    }

    if (generationOptions.spacedRepetitionEnabled && srsCards.length > 0) {
      const srsPageId = outputRoute;
      for (const card of srsCards) {
        allCollectedSrsCards.push({
          ...card,
          pageId: srsPageId,
          pageTitle: normalizedOutputFilename,
        });
      }
    }

    // Emit callback once the first (start) page is rendered so callers can show preview immediately.
    if (!startPageRenderedEmitted) {
      const isStart = startPageKey ? pageKey === startPageKey : renderedOrSkipped === 0;
      if (isStart && htmlPath) {
        // Wait for file to actually exist on disk before signaling ready
        // This avoids race conditions where the frontend tries to load before the OS has flushed the write
        const fileExists = await waitForFileExists(htmlPath);
        if (fileExists) {
          startPageRenderedEmitted = true;
          const relativeHtmlPath = outputRoute;
          try {
            options.onStartPageRendered?.({ title: conf.bundleNodeName, directory: subdir, relativeHtmlPath });
          } catch (err) {
            logger.warn(`[generateHtmlForBundle] onStartPageRendered callback threw (ignored): ${err instanceof Error ? err.message : String(err)}`);
          }
        } else {
          logger.warn(`[generateHtmlForBundle] Timed out waiting for start page file to exist: ${htmlPath}`);
        }
      }
    }

    renderedOrSkipped += 1;
    emitRenderProgressIfChanged();

    // Yield between pages so the server can still respond to preview file requests while rendering continues.
    // Use AFTER_HTML_GENERATION_PAUSE_MS to add an artificial delay for debugging progress visualization.
    await delay(AFTER_HTML_GENERATION_PAUSE_MS);
  }
  recordStageTiming('render_markdown_pages', renderMarkdownStart, { page_count: mdRenderOrder.length });

  // Standalone Excalidraw HTML pages (so direct navigation works and breadcrumbs
  // pointing at an Excalidraw drawing resolve to a real page). The body is the
  // inline-rendered SVG; the standard page shell wraps breadcrumbs and footer.
  const renderExcalidrawStart = performance.now();
  for (const pageKey of excalidrawRenderOrder) {
    if (pageKey === startPageKey && startPageRenderedEmitted) {
      continue;
    }
    if (options.shouldCancel?.()) {
      logger.warn('[generateHtmlForBundle] Cancel requested; stopping render loop early');
      break;
    }
    await renderStandaloneExcalidrawPage(pageKey);
  }
  recordStageTiming('render_excalidraw_pages', renderExcalidrawStart, { page_count: excalidrawRenderOrder.length });

  if (generationOptions.spacedRepetitionEnabled && allCollectedSrsCards.length > 0) {
    timeSync('bundle.generation.stage', { ...timingLabels, stage: 'write_srs_manifest', card_count: allCollectedSrsCards.length }, () => {
      const bundleGuid = bundleConfig.bundleGuid || '';
      const globalCards = allCollectedSrsCards.map(c => ({
        guid: c.guid,
        kind: c.kind,
        promptHtml: c.promptHtml,
        answerHtml: c.answerHtml,
        siblingGroup: c.siblingGroup,
        pageId: c.pageId,
        pageTitle: c.pageTitle,
      }));
      const srsOutputDirectory = path.join(
        assetsDirectory,
        CUSTOMIZATION_ASSETS_DIRECTORY,
        SPACED_REPETITION_ASSETS_DIRECTORY
      );
      fs.mkdirSync(srsOutputDirectory, { recursive: true });
      fs.writeFileSync(
        path.join(srsOutputDirectory, 'srs-all-cards.json'),
        JSON.stringify({ version: 1, bundleGuid, cards: globalCards })
      );
    });
  }

  if (generationOptions.searchEnabled) {
    const searchIndexResult = timeSync(
      'bundle.generation.stage',
      { ...timingLabels, stage: 'write_search_index' },
      () => writePublishedBundleSearchIndex(generatedHtmlDirectory, assetsDirectory)
    );
    logger.info(
      `Generated search index for ${searchIndexResult.documentCount} pages in ${searchIndexResult.shardCount} shards`
    );
  }

  emitProgress({ stage: 'complete', message: 'HTML render complete', current: renderedOrSkipped, total: totalToRender, percent: 100 });
  
  // If publish flag is set, also create versioned directory
  if (options.publish) {
    const { version, directory } = timeSync('bundle.generation.stage', { ...timingLabels, stage: 'publish_to_versioned_directory' }, () =>
      publishToVersionedDirectory(bundleDirectory, bundleConfig)
    );
    logger.info(`Published to versioned directory: ${version} at ${directory}`);
  }

  // If publish-new-version flag is set, create a new version
  if (options.publishNewVersion) {
    const { version, directory } = timeSync('bundle.generation.stage', { ...timingLabels, stage: 'publish_to_new_version' }, () =>
      publishToNewVersion(bundleDirectory, bundleConfig)
    );
    logger.info(`Published to new version: ${version} at ${directory}`);
  }
} 
