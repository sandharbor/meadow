/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import type { BundleConfig } from '../../../../../../../contracts/types/bundleConfig.js';
import type { BundleNodeConfig } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import { BundleConfigPaths } from '../../../../../../../shared_code/paths/bundleConfigPaths.js';
import { sourceGraphPath, sourceOutputDirectory, splitSourceGraphPath } from '../../../../../../../shared_code/utils/bundleSourceUtils.js';
import { canonicalPageFilename } from '../../../../../../../shared_code/utils/fileTypeUtils.js';

/** The same mapping owns source-derived output directories in every format. */
export function projectSourceOutputNode(node: BundleNodeConfig, config: BundleConfig): BundleNodeConfig {
  if (!node.sourceId) return node;
  const { sourceId, ...projected } = node;
  const directory = sourceOutputDirectory(config, sourceId, node.sourceGraphSubdirectory ?? '');
  return { ...projected, sourceGraphSubdirectory: directory,
    ...(node.bundleNodeKind === 'folder' && directory && { bundleNodeName: path.posix.basename(directory) }) };
}

/** Recover source identity only from directories produced by the output mapping. */
export function sourceForOutputPath(config: BundleConfig, outputPath: string): { sourceId: string; relativePath: string } {
  for (const source of config.sources ?? []) {
    const root = sourceOutputDirectory(config, source.id, '');
    if (!root || outputPath === root || outputPath.startsWith(`${root}/`)) {
      return { sourceId: source.id, relativePath: root ? outputPath.slice(root.length).replace(/^\//, '') : outputPath };
    }
  }
  // Tag pages belong to the bundle; their temporary analysis copy lives in the
  // first source so links to them still use the normal resolver.
  if (outputPath === BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR || outputPath.startsWith(`${BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR}/`)) {
    return { sourceId: config.sources![0].id, relativePath: outputPath };
  }
  throw new Error(`Generated source path has no source: ${outputPath}`);
}

export function sourceOutputGraphPath(config: BundleConfig, graphPath: string): string {
  if (!config.sources || graphPath.startsWith('collection:')) return graphPath;
  const folder = graphPath.startsWith('folder:');
  const { sourceId, relativePath } = splitSourceGraphPath(folder ? graphPath.slice(7) : graphPath, config.sources);
  const tagRoot = BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR;
  const projected = sourceId === config.sources[0].id && (relativePath === tagRoot || relativePath.startsWith(`${tagRoot}/`))
    ? relativePath : sourceOutputDirectory(config, sourceId, relativePath);
  return `${folder ? 'folder:' : ''}${projected}`;
}

/** Raw tracked bytes retain stable identities. Only this generation copy uses names. */
export function projectTrackedSourceOutput(config: BundleConfig, nodes: BundleNodeConfig[], trackedRoot: string, outputRoot: string): BundleNodeConfig[] {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  const projected: BundleNodeConfig[] = [];
  for (const node of nodes) {
    if (node.bundleNodeKind === 'collection') { projected.push(node); continue; }
    if (!config.sources?.some(source => source.id === node.sourceId)) continue;
    const directory = sourceGraphPath(node.sourceId, node.sourceGraphSubdirectory ?? '');
    const relative = node.bundleNodeKind === 'file' ? path.posix.join(directory, canonicalPageFilename(node.bundleNodeName, node.fileType)) : directory;
    if (!fs.existsSync(path.join(trackedRoot, relative))) continue;
    const outputNode = projectSourceOutputNode(node, config);
    const destination = path.join(outputRoot, outputNode.sourceGraphSubdirectory ?? '', node.bundleNodeKind === 'file' ? canonicalPageFilename(node.bundleNodeName, node.fileType) : '');
    fs.mkdirSync(node.bundleNodeKind === 'file' ? path.dirname(destination) : destination, { recursive: true });
    if (node.bundleNodeKind === 'file') fs.copyFileSync(path.join(trackedRoot, relative), destination);
    projected.push(outputNode);
  }
  for (const source of config.sources ?? []) fs.mkdirSync(path.join(outputRoot, sourceOutputDirectory(config, source.id, '')), { recursive: true });
  return projected;
}
