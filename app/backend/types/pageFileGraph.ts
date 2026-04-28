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

import { PageFile } from '../models/pageFile.js';

export type PageFilePage = {
  file: PageFile;
  depth: number;
  remaining_depth: number;
  remaining_inlinks_depth: number;
  path: string[];
  traversal_details?: PageTraversalDetails;
  isFrontierPage?: boolean;
  isFrontierImageExtension?: boolean; // True if this image was included because it was linked from a frontier-edge page
};

export type PageTraversalDetails = {
  outlinks_depth_set_first_time?: number;
  outlinks_depth_inherited?: number;
  outlinks_depth_overridden?: number;
  inlinks_depth_set_first_time?: number;
  inlinks_depth_inherited?: number;
  inlinks_depth_overridden?: number;
  link_type?: 'start' | 'outlink' | 'inlink' | 'bidirectional';
};

export type PageFileEdge = {
  from: PageFilePage;
  to: PageFilePage;
  isBidirectional?: boolean;
  isTraversalOnly?: boolean; // True for edges created for inlink traversal (not real source links)
};

export type PageFileGraph = {
  pages: PageFilePage[];
  edges: PageFileEdge[];
  traverse(from: PageFile): PageFilePage[];
}; 