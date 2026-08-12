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

/*
  Shared Graph Types and Class
*/
import type { ISiteNode } from './ISiteNode.js';
export type { ISiteNode } from './ISiteNode.js';

export type SiteEdgeKind = 'semanticLink' | 'directoryContainment' | 'collectionMembership';

export interface IEdge {
  source: string;
  target: string;
  siteEdgeKind: SiteEdgeKind;
  label?: string;
  isBidirectional?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: Record<string, any>;
}

export class Graph {
  private nodes: Map<string, ISiteNode>;
  private edges: IEdge[];
  private changeListeners: Set<() => void>;
  private allInlinkSources: Record<string, string[]>;
  private allOutlinkTargets: Record<string, string[]>;

  constructor() {
    this.nodes = new Map();
    this.edges = [];
    this.changeListeners = new Set();
    this.allInlinkSources = {};
    this.allOutlinkTargets = {};
  }

  notifyChange() {
    this.changeListeners.forEach(listener => listener());
  }

  subscribe(listener: () => void) {
    this.changeListeners.add(listener);
  }

  unsubscribe(listener: () => void) {
    this.changeListeners.delete(listener);
  }

  addNode(node: ISiteNode): void {
    this.nodes.set(node.siteNodeKey, node);
    this.notifyChange();
  }

  updateNode(siteNodeKey: string, node: ISiteNode): void {
    if (!this.nodes.has(siteNodeKey)) {
      throw new Error('Node does not exist');
    }
    this.nodes.set(siteNodeKey, node);
    this.notifyChange();
  }

  addEdge(edge: Omit<IEdge, 'siteEdgeKind'> & Partial<Pick<IEdge, 'siteEdgeKind'>>): void {
    if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target)) {
      throw new Error('Source or target node does not exist');
    }
    this.edges.push({ ...edge, siteEdgeKind: edge.siteEdgeKind ?? 'semanticLink' });
    this.notifyChange();
  }

  getNode(siteNodeKey: string): ISiteNode | undefined {
    return this.nodes.get(siteNodeKey);
  }

  getAllNodes(): ISiteNode[] {
    return Array.from(this.nodes.values());
  }

  getAllEdges(): IEdge[] {
    return this.edges;
  }

  getOutgoingEdges(siteNodeKey: string): IEdge[] {
    return this.edges.filter(edge => edge.source === siteNodeKey);
  }

  getIncomingEdges(siteNodeKey: string): IEdge[] {
    return this.edges.filter(edge => edge.target === siteNodeKey);
  }

  // tag-todo-depth: we don't really need to calculate distances here... we can just rely on the depth property
  // tag-todo-naming: we should just call this depth
  calculateDistances(): Map<string, number> {
    const distances = new Map<string, number>();
    this.nodes.forEach(node => {
      distances.set(node.siteNodeKey, node.depth);
    });
    return distances;
  }

  // Methods for accessing full source-graph link data, including files outside the working graph.
  setLinkSourceData(
    inlinkSources: Record<string, string[]>,
    outlinkTargets: Record<string, string[]>
  ): void {
    this.allInlinkSources = inlinkSources;
    this.allOutlinkTargets = outlinkTargets;
  }

  // Returns all source-node keys that link to this node in the source graph.
  getAllInlinkSources(siteNodeKey: string): string[] {
    return this.allInlinkSources[siteNodeKey] || [];
  }

  // Returns all target-node keys that this node links to in the source graph.
  getAllOutlinkTargets(siteNodeKey: string): string[] {
    return this.allOutlinkTargets[siteNodeKey] || [];
  }
}
