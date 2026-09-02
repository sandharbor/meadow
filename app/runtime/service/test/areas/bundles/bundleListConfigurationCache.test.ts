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
import os from 'os';
import path from 'path';
import YAML from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import type { BundleConfig } from '../../../../../contracts/types/bundleConfig.js';
import type { BundleNodeConfig, BundleNodeId } from '../../../../../contracts/types/bundleNodeConfig.js';
import { stringifyBundleNodeConfig } from '../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { BundleListConfigurationCache } from '../../../src/areas/bundles/services/bundleListConfigurationCache.js';

const temporaryDirectories: string[] = [];

function fixture(): { bundleDirectory: string; nodeConfigPath: string; nodes: BundleNodeConfig[] } {
  const bundleDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-bundle-list-cache-'));
  temporaryDirectories.push(bundleDirectory);
  const configDirectory = path.join(bundleDirectory, 'config');
  fs.mkdirSync(configDirectory);
  const entryBundleNodeId = 'a1b2c3d4e5f6' as BundleNodeId;
  const nodes: BundleNodeConfig[] = [{
    bundleNodeName: 'First',
    sourceGraphSubdirectory: '',
    fileType: 'md',
    bundleNodeKind: 'file',
    bundleNodeId: entryBundleNodeId,
    listType: 'whitelist',
  }];
  const bundleConfig: BundleConfig = {
    sourceDirectory: bundleDirectory,
    entryBundleNodeId,
    defaultTraversalBundleNodeId: entryBundleNodeId,
  };
  const nodeConfigPath = path.join(configDirectory, 'bundle_node_config.yaml');
  fs.writeFileSync(nodeConfigPath, stringifyBundleNodeConfig(nodes), 'utf8');
  fs.writeFileSync(
    path.join(configDirectory, 'bundle_config.yaml'),
    YAML.stringify(bundleConfig),
    'utf8',
  );
  return { bundleDirectory, nodeConfigPath, nodes };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('BundleListConfigurationCache', () => {
  it('reuses unchanged parsed configuration and invalidates it after a file change', () => {
    const { bundleDirectory, nodeConfigPath, nodes } = fixture();
    const cache = new BundleListConfigurationCache();

    const first = cache.load(bundleDirectory);
    expect(cache.load(bundleDirectory)).toBe(first);

    nodes[0] = { ...nodes[0], bundleNodeName: 'Other' };
    fs.writeFileSync(nodeConfigPath, stringifyBundleNodeConfig(nodes), 'utf8');
    const changedTime = new Date(Date.now() + 2_000);
    fs.utimesSync(nodeConfigPath, changedTime, changedTime);

    const changed = cache.load(bundleDirectory);
    expect(changed).not.toBe(first);
    expect(changed.entryNode.bundleNodeName).toBe('Other');

    cache.prune([]);
    expect(cache.load(bundleDirectory)).not.toBe(changed);
  });
});
