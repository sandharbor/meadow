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
import { SiteConfigPaths } from '../../../../shared_code/paths/siteConfigPaths.js';
import type { SiteConfig } from '../../../../shared_code/types/siteConfig.js';
import type { SiteNodeConfig, SiteNodeId } from '../../../../shared_code/types/siteNodeConfig.js';
import {
  parseSiteNodeConfig,
  resolveSiteNodeRoles,
  validateCanonicalSiteConfiguration,
} from '../../../../shared_code/utils/siteNodeConfigUtils.js';
import { loadSiteConfig } from '../utils/siteConfigUtils.js';

export function loadCommittedSiteNodes(siteDirectory: string): SiteNodeConfig[] {
  const nodeConfigPath = SiteConfigPaths.getSiteNodeConfigFile(siteDirectory);
  return parseSiteNodeConfig(fs.readFileSync(nodeConfigPath, 'utf8'), nodeConfigPath);
}

export function loadValidatedSiteNodeConfiguration(siteDirectory: string): {
  siteConfig: SiteConfig & {
    entrySiteNodeId: SiteNodeId;
    defaultTraversalSiteNodeId: SiteNodeId;
  };
  nodes: SiteNodeConfig[];
  entryNode: SiteNodeConfig;
  defaultTraversalNode: SiteNodeConfig;
} {
  const siteConfigPath = SiteConfigPaths.getSiteConfigFile(siteDirectory);
  const nodeConfigPath = SiteConfigPaths.getSiteNodeConfigFile(siteDirectory);
  const siteConfig = loadSiteConfig(siteDirectory);
  const nodes = loadCommittedSiteNodes(siteDirectory);
  validateCanonicalSiteConfiguration({
    committedNodes: nodes,
    committedPath: nodeConfigPath,
    siteConfig,
    siteConfigPath,
  });
  return {
    siteConfig: siteConfig as SiteConfig & {
      entrySiteNodeId: SiteNodeId;
      defaultTraversalSiteNodeId: SiteNodeId;
    },
    nodes,
    ...resolveSiteNodeRoles(nodes, siteConfig, siteConfigPath),
  };
}
