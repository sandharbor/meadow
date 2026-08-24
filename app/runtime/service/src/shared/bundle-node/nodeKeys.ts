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

import type { BundleNodeConfig } from '../../../../../contracts/types/bundleNodeConfig.js';

export interface BundleNodeConfigMap {
  [bundleNodeKey: string]: BundleNodeConfig;
}

/**
 * Creates the source-locator key used by raw working-graph nodes and edges.
 */
export function makeBundleNodeKey(bundleNodeName: string, fileType: string = 'md', directory: string = ''): string {
  const normalizedDir = directory.replace(/\/+$/, '');
  return normalizedDir ? `${normalizedDir}/${bundleNodeName}.${fileType}` : `/${bundleNodeName}.${fileType}`;
}

export function bundleNodeConfigToKey(conf: BundleNodeConfig): string {
  if (conf.bundleNodeKind === 'folder') return `folder:${conf.sourceGraphSubdirectory}`;
  if (conf.bundleNodeKind === 'collection') return `collection:${conf.bundleNodeId}`;
  return makeBundleNodeKey(conf.bundleNodeName, conf.fileType, conf.sourceGraphSubdirectory || '');
}
