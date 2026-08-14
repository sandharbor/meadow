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
import type { IBundleNode } from './IBundleNode.js';
export type { IBundleNode } from './IBundleNode.js';

export type BundleEdgeKind = 'semanticLink' | 'directoryContainment' | 'collectionMembership';

export interface IEdge {
  source: string;
  target: string;
  bundleEdgeKind: BundleEdgeKind;
  label?: string;
  isBidirectional?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: Record<string, any>;
}

export class Graph {
  private nodes: Map<string, IBundleNode>;
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

  addNode(node: IBundleNode): void {
    this.nodes.set(node.bundleNodeKey, node);
    this.notifyChange();
  }

  updateNode(bundleNodeKey: string, node: IBundleNode): void {
    if (!this.nodes.has(bundleNodeKey)) {
      throw new Error('Node does not exist');
    }
    this.nodes.set(bundleNodeKey, node);
    this.notifyChange();
  }

  addEdge(edge: Omit<IEdge, 'bundleEdgeKind'> & Partial<Pick<IEdge, 'bundleEdgeKind'>>): void {
    if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target)) {
      throw new Error('Source or target node does not exist');
    }
    this.edges.push({ ...edge, bundleEdgeKind: edge.bundleEdgeKind ?? 'semanticLink' });
    this.notifyChange();
  }

  getNode(bundleNodeKey: string): IBundleNode | undefined {
    return this.nodes.get(bundleNodeKey);
  }

  getAllNodes(): IBundleNode[] {
    return Array.from(this.nodes.values());
  }

  getAllEdges(): IEdge[] {
    return this.edges;
  }

  getOutgoingEdges(bundleNodeKey: string): IEdge[] {
    return this.edges.filter(edge => edge.source === bundleNodeKey);
  }

  getIncomingEdges(bundleNodeKey: string): IEdge[] {
    return this.edges.filter(edge => edge.target === bundleNodeKey);
  }

  // tag-todo-depth: we don't really need to calculate distances here... we can just rely on the depth property
  // tag-todo-naming: we should just call this depth
  calculateDistances(): Map<string, number> {
    const distances = new Map<string, number>();
    this.nodes.forEach(node => {
      distances.set(node.bundleNodeKey, node.depth);
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
  getAllInlinkSources(bundleNodeKey: string): string[] {
    return this.allInlinkSources[bundleNodeKey] || [];
  }

  // Returns all target-node keys that this node links to in the source graph.
  getAllOutlinkTargets(bundleNodeKey: string): string[] {
    return this.allOutlinkTargets[bundleNodeKey] || [];
  }
}
