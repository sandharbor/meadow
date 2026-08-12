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

import type { FileType } from './FileType.js';

declare const siteNodeIdBrand: unique symbol;
declare const siteNodeKeyBrand: unique symbol;

/** Stable identity assigned only when a node is configured. */
export type SiteNodeId = string & { readonly [siteNodeIdBrand]: true };

/** Locator-derived key used by the current working graph and its edges. */
export type SiteNodeKey = string & { readonly [siteNodeKeyBrand]: true };

export interface FileSiteNodeConfig {
  siteNodeName: string;
  sourceGraphSubdirectory?: string;
  siteNodeKind: 'file';
  fileType: FileType;
  siteNodeId: SiteNodeId;
  listType: 'blacklist' | 'whitelist';
  outlinksDepth?: number;
  inlinksDepth?: number;
}

/** Phase 1 accepts only file nodes at runtime. */
export type SiteNodeConfig = FileSiteNodeConfig;

export interface SiteNodeConfigDocument {
  nodes: SiteNodeConfig[];
}

