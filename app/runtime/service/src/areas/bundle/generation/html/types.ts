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

import { BundleNodeConfig } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import type { BundleRouteTable } from './bundleRoutePlanner.js';
export { makeBundleNodeKey, bundleNodeConfigToKey } from '../../../../shared/bundle-node/nodeKeys.js';

export interface BundleNodeConfigMap {
  [pageKey: string]: BundleNodeConfig;
}

export interface LinkInfo {
  type: 'image' | 'page';
  filename: string;
  alternative_name?: string;
  section?: string;
  size?: string;
}

export interface InverseLinks {
  [targetPage: string]: string[];
}

export interface PageNameToPage {
  [pageName: string]: SimplePage;
}

export interface SimplePage {
  isUninterestingLeafPage(): boolean;
}

export interface RenderOptions {
  processBacklinks?: boolean;
  processingMode?: 'each-page' | 'single-page';
  showBacklinkContext?: boolean;
  skipUninterestingLeafPages?: boolean;
  preserveFrontmatter?: boolean;
  showBreadcrumbs?: boolean;
  showHoverPreview?: boolean;
  breadcrumbPath?: string[]; // Array of rendered page titles representing the traversal path
  breadcrumbBundleNodeIds?: string[];
  routeTable?: BundleRouteTable;
  currentOutputDirectory?: string;
  entryNodeName?: string;
  /**
   * The generated relative paths for shared/static assets (css/js/mermaid) that should be referenced by
   * rendered HTML pages. Most are content-addressed; intentionally mutable data assets may use stable paths.
   * When omitted, defaults to the legacy filenames (style.css, javascript.js, mermaid.min.js).
   */
  staticAssetNames?: StaticAssetNames;
  sourcesExportEnabled?: boolean;
  openKnowledgeFormatEnabled?: boolean;
  srsEnabled?: boolean;
  searchEnabled?: boolean;
  folderNavigation?: FolderNavigationRenderOptions;
}

export interface FolderNavigationPage {
  directory: string;
  normalizedTitle: string;
  outputPath: string;
  bundleNodeId?: string;
  parentBundleNodeId?: string;
  bundleNodeKind?: 'file' | 'folder' | 'collection';
  isEntry?: boolean;
}

export interface FolderNavigationRenderOptions {
  storageKey: string;
}

export interface StaticAssetNames {
  styleCss: string;
  javascriptJs: string;
  mermaidMinJs: string;
  calloutsCss: string;
  structuralPagesCss: string;
  excalidrawCss: string;
  excalidrawVendorJs: string;
  excalidrawJs: string;
  svgCss?: string;
  svgJs?: string;
  srsCss?: string;
  srsJs?: string;
  searchCss?: string;
  searchJs?: string;
  hoverPreviewCss?: string;
  hoverPreviewJs?: string;
  folderNavigationCss?: string;
  folderNavigationDataJs?: string;
  folderNavigationJs?: string;
  globalStyleCss?: string;
  bundleStyleCss?: string;
  globalJavascriptJs?: string;
  bundleJavascriptJs?: string;
}

export interface BacklinkContext {
  anchor_id: string;
  content: string;
}

export interface BlockInfo {
  type: 'header' | 'code' | 'paragraph';
  content: string;
} 
