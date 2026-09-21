/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { discoverSourceSnapshot } from '../../../shared/source-snapshot/sourceSnapshots.js';
import { forgetLiveSourceLinks } from '../../../shared/source-snapshot/sourceDiscovery.js';
import { FOLDER_BUNDLE_MAX_RAW_NODES, FOLDER_BUNDLE_MAX_TYPED_EDGES } from '../../../shared/bundle-config/folderBundleSource.js';
import path from 'node:path';
import type { BundleSource, BundleConfig } from '../../../../../../contracts/types/bundleConfig.js';
import type { StartingSelection } from '../../../../../../contracts/types/startingSelection.js';
import { applyStartingSelections } from '../../../../../../shared_code/utils/startingSelectionUtils.js';
import { validateBundleSources } from '../../../../../../shared_code/utils/bundleSourceUtils.js';
import { generateBundleGuid } from '../../../../../../shared_code/utils/bundleGuidUtils.js';
import { AppConfigGitUtils, GIT_AUTHORS } from '../../../../../../shared_code/utils/appConfigGitUtils.js';
import { getBundleDirectory, getBundlesDirectory, getConfigDirectory } from '../../../shared/bundle-config/bundleConfigPaths.js';
import { clearBundleGuidCache } from '../../../shared/utils/logging/bundleLogger.js';
import { persistFolderBundleAtomically } from './folderBundlePersistence.js';
import { resolveDefaultDepth } from './bundleTraversalDefaults.js';

export interface CreateMultiSourceBundleInput {
  slug: string;
  bundleName: string;
  sources: BundleSource[];
  startingSelections: StartingSelection[];
  bundleNotes?: string;
  defaultOutlinksDepth?: number;
  defaultInlinksDepth?: number;
}

/** Initial capture uses the same atomic bundle installation as folder setup. */
export async function createMultiSourceBundle(input: CreateMultiSourceBundleInput): Promise<string> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) throw new Error('Choose a bundle name containing lowercase letters, numbers, and single dashes.');
  validateBundleSources(input.sources);
  const sources = input.sources.map(source => ({ ...source, directory: fs.realpathSync(source.directory) }));
  const outlinks = resolveDefaultDepth(input.defaultOutlinksDepth, 3);
  const inlinks = resolveDefaultDepth(input.defaultInlinksDepth, 1);
  if (outlinks === null || inlinks === null) throw new Error('Traversal depths must be non-negative integers.');
  let slug = input.slug;
  for (let suffix = 2; fs.existsSync(getBundleDirectory(slug)); suffix += 1) slug = `${input.slug}-${suffix}`;
  const selected = applyStartingSelections({ sources, selections: input.startingSelections, nodes: [], bundleName: input.bundleName || slug });
  const now = new Date().toISOString();
  const config: BundleConfig = {
    bundleGuid: generateBundleGuid(), sources, ...(sources.length > 1 && { sourceOutputLayout: 'multi' }),
    entryBundleNodeId: selected.entryBundleNodeId, defaultTraversalBundleNodeId: selected.defaultTraversalBundleNodeId,
    defaultOutlinksDepth: outlinks, defaultInlinksDepth: inlinks, generationFolderNavigationEnabled: true,
    archivedAt: null, bundleCreatedAt: now, bundleUpdatedAt: now, bundleNotes: input.bundleNotes ?? '',
  };
  const destination = getBundleDirectory(slug);
  const stagingDirectory = path.join(getBundlesDirectory(), `.${slug}.creating-${generateBundleGuid()}`);
  const discovery = await discoverSourceSnapshot(stagingDirectory, false, { config, nodes: selected.nodes });
  forgetLiveSourceLinks(stagingDirectory);
  if ((discovery.graph?.nodes.length ?? 0) >= FOLDER_BUNDLE_MAX_RAW_NODES || (discovery.graph?.edges.length ?? 0) >= FOLDER_BUNDLE_MAX_TYPED_EDGES) throw new Error('This starting selection is too large. Narrow the folders or traversal depths.');
  const git = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, getConfigDirectory());
  await persistFolderBundleAtomically({ bundleDirectory: destination, stagingDirectory, bundleConfig: config, nodes: selected.nodes,
    commit: () => git.commitFiles([`bundles/${slug}/config`, `bundles/${slug}/raw/sourcing`], `create source bundle ${slug}`),
  });
  clearBundleGuidCache(slug);
  return slug;
}
