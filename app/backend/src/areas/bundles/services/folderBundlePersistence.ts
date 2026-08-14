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
import path from 'path';
import YAML from 'yaml';
import type { BundleConfig } from '../../../../../shared_code/types/bundleConfig.js';
import type { BundleNodeConfig } from '../../../../../shared_code/types/bundleNodeConfig.js';
import {
  stringifyBundleNodeConfig,
  validateCanonicalBundleConfiguration,
} from '../../../../../shared_code/utils/bundleNodeConfigUtils.js';

interface FolderBundlePersistenceInput {
  bundleDirectory: string;
  stagingDirectory: string;
  bundleConfig: BundleConfig;
  nodes: BundleNodeConfig[];
  commit: () => Promise<unknown>;
}

export async function persistFolderBundleAtomically(input: FolderBundlePersistenceInput): Promise<void> {
  let exposed = false;
  try {
    const configDirectory = path.join(input.stagingDirectory, 'config');
    const nodeConfigPath = path.join(configDirectory, 'bundle_node_config.yaml');
    const bundleConfigPath = path.join(configDirectory, 'bundle_config.yaml');
    fs.mkdirSync(configDirectory, { recursive: true });
    validateCanonicalBundleConfiguration({
      committedNodes: input.nodes,
      bundleConfig: input.bundleConfig,
      committedPath: nodeConfigPath,
      bundleConfigPath,
    });
    fs.writeFileSync(nodeConfigPath, stringifyBundleNodeConfig(input.nodes), 'utf8');
    fs.writeFileSync(bundleConfigPath, YAML.stringify(input.bundleConfig), 'utf8');
    fs.renameSync(input.stagingDirectory, input.bundleDirectory);
    exposed = true;
    await input.commit();
  } catch (error) {
    const cleanupTarget = exposed ? input.bundleDirectory : input.stagingDirectory;
    if (fs.existsSync(cleanupTarget)) fs.rmSync(cleanupTarget, { recursive: true, force: true });
    throw error;
  }
}
