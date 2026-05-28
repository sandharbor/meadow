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

/**
 * Type definitions for the pagespecs system tests.
 *
 * Pagespecs are YAML blocks at the end of source pages that define
 * expected test outcomes per-site (working graph inclusion, filter states, link paths).
 */

export interface PagespecLinkSpec {
  linkPath: string;      // e.g., "/some filename.md"
  isInGraph: boolean;
}

export interface PagespecLinks {
  outlinks?: PagespecLinkSpec[];
  inlinks?: PagespecLinkSpec[];
}

export interface BacklinkContextEmbeddedLink {
  linkName: string;
  linkRelativePath: string;
}

export interface BacklinkContextSpec {
  seeInContextLinkRelativePath: string;
  embeddedLinks: BacklinkContextEmbeddedLink[];
}

export interface HtmlRenderedLinkSpec {
  relativeLinkPath: string;  // e.g., "../t002 ---- dup.png"
  backlinkContexts?: BacklinkContextSpec[];  // optional during migration
}

export interface HtmlRenderedLinks {
  mainSectionLinks: HtmlRenderedLinkSpec[];
  footerSectionBacklinks: HtmlRenderedLinkSpec[];
}

export type PagespecFiltersSelected = Record<string, boolean>;

export interface PagespecCurationInWorkingGraph {
  isTracked: boolean;
  isInWorkingGraph: true;
  filtersSelected?: PagespecFiltersSelected;
  links?: PagespecLinks;
}

export interface PagespecCurationNotInWorkingGraph {
  isTracked: boolean;
  isInWorkingGraph: false;
  frontierDepthOrNullForOrphan: number | null;
}

export type PagespecCuration = PagespecCurationInWorkingGraph | PagespecCurationNotInWorkingGraph;

export interface PagespecGeneration {
  htmlRenderedLinks: HtmlRenderedLinks;
}

export interface PagespecInWorkingGraph {
  site: string;
  curation: PagespecCurationInWorkingGraph;
  generation: PagespecGeneration;
}

export interface PagespecNotInWorkingGraph {
  site: string;
  curation: PagespecCurationNotInWorkingGraph;
  generation: PagespecGeneration;
}

export type PagespecEntry = PagespecInWorkingGraph | PagespecNotInWorkingGraph;

export interface PagespecsBlock {
  pagespecs: PagespecEntry[];
}

/**
 * Type guard to check if a pagespec entry indicates the page is in the working graph.
 */
export function isPagespecInWorkingGraph(spec: PagespecEntry): spec is PagespecInWorkingGraph {
  return spec.curation.isInWorkingGraph === true;
}

/**
 * Type guard to check if a pagespec entry indicates the page is NOT in the working graph.
 */
export function isPagespecNotInWorkingGraph(spec: PagespecEntry): spec is PagespecNotInWorkingGraph {
  return spec.curation.isInWorkingGraph === false;
}
