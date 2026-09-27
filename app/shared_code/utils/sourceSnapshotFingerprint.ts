/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BundleSource } from '../../contracts/types/bundleConfig.js';

/** Stable checksum of the captured files, directories, and source registry. */
export function sourceInventory(files: Record<string, { digest: string; size: number }>, directories: string[], sources?: BundleSource[]) {
  const sortedFiles = Object.fromEntries(Object.keys(files).sort().map(filename => [filename, { digest: files[filename].digest, size: files[filename].size }]));
  const sortedDirectories = [...new Set(directories)].sort();
  return { files: sortedFiles, directories: sortedDirectories, fileCount: Object.keys(sortedFiles).length,
    digest: createHash('sha256').update(JSON.stringify({ files: sortedFiles, directories: sortedDirectories, ...(sources && { sources }) })).digest('hex') };
}

/** Detect edits made since a source-settings proposal was prepared. */
export function sourceConfigFingerprint(bundleDirectory: string): string {
  return createHash('sha256').update(['bundle_config.yaml', 'bundle_node_config.yaml', 'draft_bundle_node_config.yaml']
    .map(name => {
      const filename = path.join(bundleDirectory, 'config', name);
      return fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : '';
    }).join('\0')).digest('hex');
}
