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

import { Graph } from '../../../shared_code/types/graph';
import { ISitePage } from '../../../shared_code/types/ISitePage';

/**
 * Calculate the detail info for outlink gap filter.
 * Returns format: "Outlinks: X (Y not in graph)"
 */
export function calculateOutlinkGapDetail(page: ISitePage, graph: Graph): string {
  const allOutlinks = graph.getAllOutlinkTargets(page.id);
  const outlinksInGraph = allOutlinks.filter(id => graph.getPage(id)).length;
  const outlinksNotInGraph = allOutlinks.length - outlinksInGraph;

  if (outlinksNotInGraph > 0) {
    return `Outlinks: ${allOutlinks.length} (${outlinksNotInGraph} not in graph)`;
  }
  return `Outlinks: ${allOutlinks.length}`;
}

/**
 * Calculate the detail info for inlink gap filter.
 * Returns format: "Inlinks: X (Y not in graph)"
 */
export function calculateInlinkGapDetail(page: ISitePage, graph: Graph): string {
  const allInlinks = graph.getAllInlinkSources(page.id);
  const inlinksInGraph = allInlinks.filter(id => graph.getPage(id)).length;
  const inlinksNotInGraph = allInlinks.length - inlinksInGraph;

  if (inlinksNotInGraph > 0) {
    return `Inlinks: ${allInlinks.length} (${inlinksNotInGraph} not in graph)`;
  }
  return `Inlinks: ${allInlinks.length}`;
}

/**
 * Calculate the detail info for overrides filter.
 * Returns format like "outlinks depth: ~~4~~ 6" using ~~ for strikethrough
 */
export function calculateOverridesDetail(page: ISitePage): string {
  const details: string[] = [];
  const traversalDetails = page.traversal_details;
  const conf = page.conf?.config;

  // Check for outlinks_depth override
  if (conf?.outlinks_depth !== undefined && traversalDetails?.outlinks_depth_inherited !== undefined) {
    details.push(`outlinks depth: ~~${traversalDetails.outlinks_depth_inherited}~~ ${conf.outlinks_depth}`);
  } else if (conf?.outlinks_depth !== undefined) {
    details.push(`outlinks depth: ${conf.outlinks_depth}`);
  }

  // Check for inlinks_depth override
  if (conf?.inlinks_depth !== undefined && traversalDetails?.inlinks_depth_inherited !== undefined) {
    details.push(`inlinks depth: ~~${traversalDetails.inlinks_depth_inherited}~~ ${conf.inlinks_depth}`);
  } else if (conf?.inlinks_depth !== undefined) {
    details.push(`inlinks depth: ${conf.inlinks_depth}`);
  }

  return details.join(', ');
}

/**
 * Main dispatcher to calculate highlight detail based on filter ID.
 */
export function calculateHighlightDetail(
  filterId: string,
  page: ISitePage,
  graph: Graph
): string | undefined {
  switch (filterId) {
    case 'outlink-gap-filter':
      return calculateOutlinkGapDetail(page, graph);
    case 'inlink-gap-filter':
      return calculateInlinkGapDetail(page, graph);
    case 'overrides-filter':
      return calculateOverridesDetail(page);
    default:
      return undefined;
  }
}
