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

import { SitePageConfig } from './sitePageConfig.js';
import { FileType } from './FileType.js';
import { PageTraversalDetails } from '../../backend/types/pageFileGraph.js';

export interface LinkResolvedInfo {
  link_resolved_target_directory: string;
  link_resolved_target_path: string | null;
}

export interface ISitePage {
  id: string;
  label: string; // Auto-generated short identifier (A, B, C, ... Z, AA, AB, etc)
  title: string; // The main title of the note
  sourceGraphSubdirectory: string; // The directory path within the source graph
  file_type: FileType;
  body?: string; // The content/body of the note
  tracked?: boolean;
  blacklisted?: boolean;
  sensitive?: boolean;
  offTopic?: boolean; // Whether the AI has marked this page as potentially off topic
  conf?: SitePageConfig; // Configuration for the page

  depth: number;
  remaining_depth: number;
  remaining_inlinks_depth?: number;
  path?: string[]; // Traversal path from the root page to this page
  traversal_details?: PageTraversalDetails;
  isFrontierPage?: boolean; // True if this page is beyond the normal working area boundary
  isFrontierImageExtension?: boolean; // True if this image was included because it was linked from a frontier-edge page

  // Map from link_original_text to resolved target info
  linkResolutionMap?: Record<string, LinkResolvedInfo>;

  // Additional metadata can still be stored in data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: Record<string, any>;

  getIdent(): string;
}
