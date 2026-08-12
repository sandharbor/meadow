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
import type { SiteConfig } from '../../../../../shared_code/types/siteConfig.js';
import type { SiteNodeConfig } from '../../../../../shared_code/types/siteNodeConfig.js';
import {
  stringifySiteNodeConfig,
  validateCanonicalSiteConfiguration,
} from '../../../../../shared_code/utils/siteNodeConfigUtils.js';

interface FolderSitePersistenceInput {
  siteDirectory: string;
  stagingDirectory: string;
  siteConfig: SiteConfig;
  nodes: SiteNodeConfig[];
  commit: () => Promise<unknown>;
}

export async function persistFolderSiteAtomically(input: FolderSitePersistenceInput): Promise<void> {
  let exposed = false;
  try {
    const confDirectory = path.join(input.stagingDirectory, 'conf');
    const nodeConfigPath = path.join(confDirectory, 'site_node_config.yaml');
    const siteConfigPath = path.join(confDirectory, 'site_config.yaml');
    fs.mkdirSync(confDirectory, { recursive: true });
    validateCanonicalSiteConfiguration({
      committedNodes: input.nodes,
      siteConfig: input.siteConfig,
      committedPath: nodeConfigPath,
      siteConfigPath,
    });
    fs.writeFileSync(nodeConfigPath, stringifySiteNodeConfig(input.nodes), 'utf8');
    fs.writeFileSync(siteConfigPath, YAML.stringify(input.siteConfig), 'utf8');
    fs.renameSync(input.stagingDirectory, input.siteDirectory);
    exposed = true;
    await input.commit();
  } catch (error) {
    const cleanupTarget = exposed ? input.siteDirectory : input.stagingDirectory;
    if (fs.existsSync(cleanupTarget)) fs.rmSync(cleanupTarget, { recursive: true, force: true });
    throw error;
  }
}
