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
import { BundleConfigPaths } from '../../../../shared_code/paths/bundleConfigPaths.js';
import type { BundleConfig } from '../../../../shared_code/types/bundleConfig.js';
import type { BundleNodeConfig, BundleNodeId } from '../../../../shared_code/types/bundleNodeConfig.js';
import {
  parseBundleNodeConfig,
  resolveBundleNodeRoles,
  validateCanonicalBundleConfiguration,
} from '../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { loadBundleConfig } from '../utils/bundleConfigUtils.js';

export function loadCommittedBundleNodes(bundleDirectory: string): BundleNodeConfig[] {
  const nodeConfigPath = BundleConfigPaths.getBundleNodeConfigFile(bundleDirectory);
  return parseBundleNodeConfig(fs.readFileSync(nodeConfigPath, 'utf8'), nodeConfigPath);
}

export function loadValidatedBundleNodeConfiguration(bundleDirectory: string): {
  bundleConfig: BundleConfig & {
    entryBundleNodeId: BundleNodeId;
    defaultTraversalBundleNodeId: BundleNodeId;
  };
  nodes: BundleNodeConfig[];
  entryNode: BundleNodeConfig;
  defaultTraversalNode: BundleNodeConfig;
} {
  const bundleConfigPath = BundleConfigPaths.getBundleConfigFile(bundleDirectory);
  const nodeConfigPath = BundleConfigPaths.getBundleNodeConfigFile(bundleDirectory);
  const bundleConfig = loadBundleConfig(bundleDirectory);
  const nodes = loadCommittedBundleNodes(bundleDirectory);
  validateCanonicalBundleConfiguration({
    committedNodes: nodes,
    committedPath: nodeConfigPath,
    bundleConfig,
    bundleConfigPath,
  });
  return {
    bundleConfig: bundleConfig as BundleConfig & {
      entryBundleNodeId: BundleNodeId;
      defaultTraversalBundleNodeId: BundleNodeId;
    },
    nodes,
    ...resolveBundleNodeRoles(nodes, bundleConfig, bundleConfigPath),
  };
}
