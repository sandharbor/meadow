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

import { useMemo } from 'react';
import type { Graph, ISiteNode } from '../../../../../../shared_code/types/graph';

interface SiteModeNode {
  siteNodeId?: string;
  siteNodeKind: ISiteNode['siteNodeKind'];
}

export function siteIsFolderBased(nodes: readonly SiteModeNode[], entrySiteNodeId?: string): boolean {
  const entryNode = entrySiteNodeId
    ? nodes.find(node => node.siteNodeId === entrySiteNodeId)
    : undefined;
  return entryNode
    ? entryNode.siteNodeKind !== 'file'
    : nodes.some(node => node.siteNodeKind !== 'file');
}

export function useIsFolderBasedSite(
  graph: Graph,
  entrySiteNodeId: string | undefined,
  graphUpdateTrigger: number
): boolean {
  return useMemo(() => {
    void graphUpdateTrigger;
    return siteIsFolderBased(graph.getAllNodes(), entrySiteNodeId);
  }, [entrySiteNodeId, graph, graphUpdateTrigger]);
}
