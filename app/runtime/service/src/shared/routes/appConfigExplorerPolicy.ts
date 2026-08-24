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

import path from 'path';
import type { FileNode } from '../utils/configFileExplorerUtils.js';

const ROOT_FILES = new Set([
  'app_config.yaml',
  'resources.yaml',
  'global_custom_filters.json',
]);

const HOOK_FILES = new Set([
  'pageTitleNormalization.ts',
  'markdownProcessing.ts',
  'htmlPostProcessing.ts',
]);

const CUSTOM_ASSET_FILES = new Set(['style.css', 'javascript.js']);
const PROVIDER_FILES = new Set(['pp_config.yaml', 'pp_resources.yaml']);
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

export function isReviewableAppConfigPath(appConfigDir: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(appConfigDir), path.resolve(candidatePath));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false;
  const segments = relative.split(path.sep);
  if (segments.length === 1) return ROOT_FILES.has(segments[0]);
  if (segments.length === 2 && segments[0] === 'hooks') return HOOK_FILES.has(segments[1]);
  if (segments.length === 2 && segments[0] === 'custom_assets') return CUSTOM_ASSET_FILES.has(segments[1]);
  return segments.length === 3
    && segments[0] === 'publishing_providers'
    && SAFE_SEGMENT.test(segments[1])
    && PROVIDER_FILES.has(segments[2]);
}

/** Remove every unapproved leaf and any directory left empty as a result. */
export function filterReviewableAppConfigTree(appConfigDir: string, nodes: FileNode[]): FileNode[] {
  const filtered: FileNode[] = [];
  for (const node of nodes) {
    if (node.type === 'file') {
      if (isReviewableAppConfigPath(appConfigDir, node.path)) filtered.push(node);
      continue;
    }
    const children = filterReviewableAppConfigTree(appConfigDir, node.children ?? []);
    if (children.length > 0) filtered.push({ ...node, children });
  }
  return filtered;
}
