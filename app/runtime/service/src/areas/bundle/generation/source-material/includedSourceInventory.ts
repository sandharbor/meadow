/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'fs';
import path from 'path';
import type { BundleNodeId } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import type { IncludedSourceEntry } from '../../../../../../../contracts/types/generatedOutputIdentity.js';
import { parseBundleNodeConfig } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { sourceGraphPath } from '../../../../../../../shared_code/utils/bundleSourceUtils.js';
import { sourceFileCandidateFilenames } from '../../../../../../../shared_code/utils/fileTypeUtils.js';

/**
 * Locate the original captured files behind the configured nodes a generation
 * admitted. Locators come from the accepted snapshot and the unprojected node
 * configuration: output projection changes directories and removes source
 * identities, and a drawing's physical filename can differ from its title.
 */
export function includedSourceInventory(input: {
  acceptedSourceDirectory: string;
  nodeConfig: string;
  includedBundleNodeIds: readonly BundleNodeId[];
}): IncludedSourceEntry[] {
  const included = new Set(input.includedBundleNodeIds);
  const entries: IncludedSourceEntry[] = [];
  for (const config of parseBundleNodeConfig(input.nodeConfig)) {
    if (config.bundleNodeKind !== 'file' || !included.has(config.bundleNodeId)) continue;
    const directory = config.sourceGraphSubdirectory ?? '';
    const snapshotDirectory = path.join(input.acceptedSourceDirectory, sourceGraphPath(config.sourceId, directory));
    const filename = sourceFileCandidateFilenames(config.bundleNodeName, config.fileType)
      .find(candidate => fs.existsSync(path.join(snapshotDirectory, candidate)));
    if (!filename) continue;
    entries.push({
      sourceId: config.sourceId ?? null,
      path: directory ? path.posix.join(directory, filename) : filename,
      bundleNodeId: config.bundleNodeId,
    });
  }
  return entries;
}
