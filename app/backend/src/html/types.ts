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

import { SitePageConfig } from '../../../shared_code/types/sitePageConfig.js';

export interface SitePageConfigs {
  [pageKey: string]: SitePageConfig;
}

/**
 * Creates a unique key for a page based on title, file_type, and directory.
 * This handles the case where the same title exists in multiple directories.
 * Format: "directory:title.file_type" or "title.file_type" if no directory
 */
export function makePageKey(title: string, fileType: string = 'md', directory: string = ''): string {
  const normalizedDir = directory.replace(/\/+$/, '');
  return normalizedDir ? `${normalizedDir}:${title}.${fileType}` : `${title}.${fileType}`;
}

/**
 * Creates a unique key from a SitePageConfig object.
 */
export function pageConfigToKey(conf: SitePageConfig): string {
  return makePageKey(conf.title, conf.file_type || 'md', conf.source_graph_subdirectory || '');
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
  breadcrumbPath?: string[]; // Array of page titles representing the path from initial page
  initialPageTitle?: string; // The initial/root page title
  /**
   * The hashed basenames for shared/static assets (css/js/mermaid) that should be referenced by
   * rendered HTML pages. When omitted, defaults to the legacy filenames (style.css, javascript.js, mermaid.min.js).
   */
  staticAssetNames?: StaticAssetNames;
  markdownZipEnabled?: boolean;
  srsEnabled?: boolean;
}

export interface StaticAssetNames {
  styleCss: string;
  javascriptJs: string;
  mermaidMinJs: string;
  calloutsCss: string;
  excalidrawCss: string;
  excalidrawVendorJs: string;
  excalidrawJs: string;
  srsCss?: string;
  srsJs?: string;
  globalStyleCss?: string;
  siteStyleCss?: string;
  globalJavascriptJs?: string;
  siteJavascriptJs?: string;
}

export interface BacklinkContext {
  anchor_id: string;
  content: string;
}

export interface BlockInfo {
  type: 'header' | 'code' | 'paragraph';
  content: string;
} 
