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

import type { SiteNodeConfig } from '../../../../shared_code/types/siteNodeConfig.js';

export interface SiteNodeConfigMap {
  [siteNodeKey: string]: SiteNodeConfig;
}

/**
 * Creates the source-locator key used by raw working-graph nodes and edges.
 */
export function makeSiteNodeKey(siteNodeName: string, fileType: string = 'md', directory: string = ''): string {
  const normalizedDir = directory.replace(/\/+$/, '');
  return normalizedDir ? `${normalizedDir}/${siteNodeName}.${fileType}` : `/${siteNodeName}.${fileType}`;
}

export function siteNodeConfigToKey(conf: SiteNodeConfig): string {
  return makeSiteNodeKey(conf.siteNodeName, conf.fileType, conf.sourceGraphSubdirectory || '');
}
