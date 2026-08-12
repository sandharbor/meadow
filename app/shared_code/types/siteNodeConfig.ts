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

interface BaseSiteNodeConfig {
  siteNodeName: string;
  siteNodeId: SiteNodeId;
  listType: 'blacklist' | 'whitelist';
}

interface TraversalSiteNodeConfig {
  outlinksDepth?: number;
  inlinksDepth?: number;
}

export interface FileSiteNodeConfig extends BaseSiteNodeConfig, TraversalSiteNodeConfig {
  sourceGraphSubdirectory?: string;
  siteNodeKind: 'file';
  fileType: FileType;
}

export interface FolderSiteNodeConfig extends BaseSiteNodeConfig, TraversalSiteNodeConfig {
  sourceGraphSubdirectory: string;
  siteNodeKind: 'folder';
  fileType?: never;
  memberSiteNodeIds?: never;
}

export interface CollectionSiteNodeConfig extends BaseSiteNodeConfig {
  siteNodeKind: 'collection';
  sourceGraphSubdirectory?: never;
  fileType?: never;
  outlinksDepth?: never;
  inlinksDepth?: never;
  memberSiteNodeIds: SiteNodeId[];
}

export type SiteNodeConfig =
  | FileSiteNodeConfig
  | FolderSiteNodeConfig
  | CollectionSiteNodeConfig;

export type SiteNodeKind = SiteNodeConfig['siteNodeKind'];

export interface SiteNodeConfigDocument {
  nodes: SiteNodeConfig[];
}
