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

import type { CustomFilterConfig } from '../../../../../../../contracts/types/customFilters.js';
import { Graph, type IEdge } from '../../../../../../../contracts/types/graph.js';
import type {
  IBundleNode,
} from '../../../../../../../contracts/types/IBundleNode.js';
import type {
  GraphDescription,
  GraphDescriptionEdge,
  GraphDescriptionNode,
  GraphFilterApplication,
  GraphFilterCombination,
  GraphInspectionScope,
} from '../../../../../../../contracts/types/graphInspection.js';
import {
  GRAPH_DESCRIPTION_EDGE_FIELDS,
  GRAPH_DESCRIPTION_NODE_FIELDS,
} from '../../../../../../../contracts/types/graphInspection.js';
import { selectGraphNodeKeys } from './graphFilterService.js';

interface GraphLinkData {
  allInlinkSources: Record<string, string[]>;
  allOutlinkTargets: Record<string, string[]>;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pickFields(value: object, fields: readonly PropertyKey[]): Record<PropertyKey, unknown> {
  const source = value as Record<PropertyKey, unknown>;
  const result: Record<PropertyKey, unknown> = {};
  for (const field of fields) {
    if (source[field] !== undefined) result[field] = source[field];
  }
  return result;
}

function serializeNode(node: IBundleNode): GraphDescriptionNode {
  return pickFields(node, GRAPH_DESCRIPTION_NODE_FIELDS) as GraphDescriptionNode;
}

function serializeEdge(edge: IEdge): GraphDescriptionEdge {
  return pickFields(edge, GRAPH_DESCRIPTION_EDGE_FIELDS) as GraphDescriptionEdge;
}

export function describeWorkingGraph(options: {
  bundleSlug: string;
  scope: GraphInspectionScope;
  applications: GraphFilterApplication[];
  combine: GraphFilterCombination;
  nodes: IBundleNode[];
  edges: IEdge[];
  linkData: GraphLinkData;
  customFilters: CustomFilterConfig[];
}): GraphDescription {
  const graph = new Graph();
  options.nodes.forEach(node => graph.addNode(node));
  options.edges.forEach(edge => graph.addEdge(edge));
  graph.setLinkSourceData(
    options.linkData.allInlinkSources,
    options.linkData.allOutlinkTargets,
  );

  const filterVisibleKeys = selectGraphNodeKeys(
    graph,
    options.customFilters,
    options.applications,
    options.combine,
  );
  const visibleNodes = options.nodes.filter(node => (
    filterVisibleKeys.has(node.bundleNodeKey)
    && (
      options.scope === 'all'
      || (node.tracked === true && node.blacklisted !== true && node.isFrontierNode !== true)
    )
  ));
  const visibleKeys = new Set<string>(visibleNodes.map(node => node.bundleNodeKey));

  return {
    bundleSlug: options.bundleSlug,
    scope: options.scope,
    filtering: {
      combine: options.combine,
      applications: options.applications,
    },
    nodes: visibleNodes
      .map(serializeNode)
      .sort((left, right) => compareText(left.bundleNodeKey, right.bundleNodeKey)),
    edges: options.edges
      .filter(edge => visibleKeys.has(edge.source) && visibleKeys.has(edge.target))
      .map(serializeEdge)
      .sort((left, right) => compareText(
        `${left.bundleEdgeKind}:${left.source}->${left.target}`,
        `${right.bundleEdgeKind}:${right.source}->${right.target}`,
      )),
  };
}
