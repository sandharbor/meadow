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
 * Type definitions for the nodespecs system tests.
 *
 * Node specs are paired <full-source-filename>.nodespec.yaml files that define
 * expected test outcomes per-bundle (working graph inclusion, filter states, link paths).
 */

export interface NodespecLinkSpec {
  source?: string;      // Canonical registered source name; omission means the tested node's own source.
  linkPath: string;      // e.g., "/some filename.md"
  isInGraph: boolean;
}

export interface NodespecLinks {
  outlinks?: NodespecLinkSpec[];
  inlinks?: NodespecLinkSpec[];
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

export type NodespecFiltersSelected = Record<string, boolean>;

export interface NodespecSourcingInWorkingGraph {
  isInWorkingGraph: true;
  links?: NodespecLinks;
}

export interface NodespecSourcingNotInWorkingGraph {
  isInWorkingGraph: false;
  frontierDepthOrNullForOrphan: number | null;
}

export type NodespecSourcing = NodespecSourcingInWorkingGraph | NodespecSourcingNotInWorkingGraph;

export interface NodespecCuration {
  isTracked: boolean;
  filtersSelected?: NodespecFiltersSelected;
}

export interface NodespecGeneration {
  htmlRenderedLinks: HtmlRenderedLinks;
}

export interface NodespecInWorkingGraph {
  bundle: string;
  sourcing: NodespecSourcingInWorkingGraph;
  curation: NodespecCuration;
  generation: NodespecGeneration;
}

export interface NodespecNotInWorkingGraph {
  bundle: string;
  sourcing: NodespecSourcingNotInWorkingGraph;
  curation: NodespecCuration;
  generation: NodespecGeneration;
}

export type NodespecEntry = NodespecInWorkingGraph | NodespecNotInWorkingGraph;

export interface NodespecsBlock {
  nodespecs: NodespecEntry[];
}

/**
 * Type guard to check if a nodespec entry indicates the page is in the working graph.
 */
export function isNodespecInWorkingGraph(spec: NodespecEntry): spec is NodespecInWorkingGraph {
  return spec.sourcing.isInWorkingGraph === true;
}

/**
 * Type guard to check if a nodespec entry indicates the page is NOT in the working graph.
 */
export function isNodespecNotInWorkingGraph(spec: NodespecEntry): spec is NodespecNotInWorkingGraph {
  return spec.sourcing.isInWorkingGraph === false;
}
