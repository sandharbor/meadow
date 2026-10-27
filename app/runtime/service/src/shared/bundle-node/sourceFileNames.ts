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

// A file node's name in source material. Obsidian's Excalidraw plugin saves a
// drawing as `<title>.excalidraw.md`, but a drawing saved as plain `<title>.md`
// is a drawing too: its frontmatter, not its name, says so. Meadow's copies of
// source material keep whichever name the source uses, so links resolve in a
// copy exactly as they do in the source, and a file's type comes from its
// configured node rather than from its suffix alone.

import fs from 'fs';
import path from 'path';
import type { BundleNodeConfig } from '../../../../../contracts/types/shared/bundle-graph/bundleNodeConfig.js';
import type { EncodedBundleNodeKey } from '../../../../../contracts/types/shared/bundle-graph/bundleNodeKey.js';
import { sourceGraphPath } from '../../../../../shared_code/utils/bundleSourceUtils.js';
import {
  canonicalPageFilename,
  sourceFileCandidateFilenames,
} from '../../../../../shared_code/utils/fileTypeUtils.js';
import { bundleNodeConfigToKey } from './nodeKeys.js';

interface FileNodeName {
  bundleNodeName: string;
  fileType?: string;
}

interface FileNodeLocation extends FileNodeName {
  sourceId?: string;
  sourceGraphSubdirectory?: string;
}

/** The node's file name in `directory`, whichever name it has there; undefined when absent. */
export function sourceFilenameIn(directory: string, node: FileNodeName): string | undefined {
  return sourceFileCandidateFilenames(node.bundleNodeName, node.fileType)
    .find(filename => fs.existsSync(path.join(directory, filename)));
}

/** The node's file under `root`, by its name there, or by its canonical name when absent. */
export function sourceFilePathIn(root: string, node: FileNodeLocation): string {
  const directory = path.join(root, sourceGraphPath(node.sourceId, node.sourceGraphSubdirectory ?? ''));
  return path.join(directory, sourceFilenameIn(directory, node) ?? canonicalPageFilename(node.bundleNodeName, node.fileType));
}

/**
 * The titles and file types a source file can have. A plain `.md` file is a
 * note or a drawing saved as plain Markdown; the configured node says which.
 */
export function fileNodeNamesFor(filename: string): Array<{ title: string; fileType: string }> {
  if (filename.endsWith('.excalidraw.md')) {
    return [{ title: filename.slice(0, -'.excalidraw.md'.length), fileType: 'excalidraw' }];
  }
  if (filename.endsWith('.md')) {
    const title = filename.slice(0, -'.md'.length);
    return [{ title, fileType: 'md' }, { title, fileType: 'excalidraw' }];
  }
  const extension = path.extname(filename);
  return extension ? [{ title: path.basename(filename, extension), fileType: extension.slice(1) }] : [];
}

/**
 * Each configured file's node key by its path in a copy of source material,
 * `root`, whose directories follow `sourceGraphSubdirectory`.
 */
export function fileNodeKeysByCopiedPath(root: string, configs: BundleNodeConfig[]): Map<string, EncodedBundleNodeKey> {
  const keys = new Map<string, EncodedBundleNodeKey>();
  for (const config of configs) {
    if (config.bundleNodeKind !== 'file') continue;
    const directory = config.sourceGraphSubdirectory ?? '';
    const filename = sourceFilenameIn(path.join(root, ...directory.split('/')), config);
    if (filename) keys.set(directory ? `${directory}/${filename}` : filename, bundleNodeConfigToKey(config));
  }
  return keys;
}
