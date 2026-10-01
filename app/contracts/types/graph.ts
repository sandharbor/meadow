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
import type { BundleSource } from './bundleConfig.js';
import type { SourceReferenceDiagnostic } from './sourcing.js';
import type { IBundleNode } from './IBundleNode.js';
import type { BundleNodeKey, EncodedBundleNodeKey } from './bundleNodeKey.js';
import { serializeBundleNodeKey, encodedBundleNodeKey } from '../../shared_code/utils/bundleNodeKey.js';
export type { IBundleNode } from './IBundleNode.js';

export type BundleEdgeKind = 'semanticLink' | 'directoryContainment' | 'collectionMembership';

export interface IEdge {
  source: EncodedBundleNodeKey;
  target: EncodedBundleNodeKey;
  bundleEdgeKind: BundleEdgeKind;
  label?: string;
  isBidirectional?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: Record<string, any>;
}

export class Graph {
  sources: BundleSource[] = [];
  sourceDiagnostics: SourceReferenceDiagnostic[] = [];
  ignoredSourceNames: string[] = [];
  sourceContentView: 'accepted' | 'live' = 'accepted';
  private nodes: Map<EncodedBundleNodeKey, IBundleNode>;
  private edges: IEdge[];
  private changeListeners: Set<() => void>;
  private allInlinkSources: Record<EncodedBundleNodeKey, EncodedBundleNodeKey[]>;
  private allOutlinkTargets: Record<EncodedBundleNodeKey, EncodedBundleNodeKey[]>;

  constructor() {
    this.nodes = new Map();
    this.edges = [];
    this.changeListeners = new Set();
    this.allInlinkSources = {};
    this.allOutlinkTargets = {};
  }

  private key(key: BundleNodeKey | EncodedBundleNodeKey): EncodedBundleNodeKey {
    return typeof key === 'string' ? encodedBundleNodeKey(key) : serializeBundleNodeKey(key);
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
    this.nodes.set(encodedBundleNodeKey(node.bundleNodeKey), node);
    this.notifyChange();
  }

  updateNode(bundleNodeKey: BundleNodeKey | EncodedBundleNodeKey, node: IBundleNode): void {
    if (!this.nodes.has(this.key(bundleNodeKey))) {
      throw new Error('Node does not exist');
    }
    this.nodes.set(this.key(bundleNodeKey), node);
    this.notifyChange();
  }

  addEdge(edge: Omit<IEdge, 'bundleEdgeKind'> & Partial<Pick<IEdge, 'bundleEdgeKind'>>): void {
    if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target)) {
      throw new Error('Source or target node does not exist');
    }
    this.edges.push({ ...edge, bundleEdgeKind: edge.bundleEdgeKind ?? 'semanticLink' });
    this.notifyChange();
  }

  getNode(bundleNodeKey: BundleNodeKey | EncodedBundleNodeKey): IBundleNode | undefined {
    return this.nodes.get(this.key(bundleNodeKey));
  }

  getAllNodes(): IBundleNode[] {
    return Array.from(this.nodes.values());
  }

  getAllEdges(): IEdge[] {
    return this.edges;
  }

  getOutgoingEdges(bundleNodeKey: BundleNodeKey | EncodedBundleNodeKey): IEdge[] {
    const key = this.key(bundleNodeKey);
    return this.edges.filter(edge => edge.source === key);
  }

  getIncomingEdges(bundleNodeKey: BundleNodeKey | EncodedBundleNodeKey): IEdge[] {
    const key = this.key(bundleNodeKey);
    return this.edges.filter(edge => edge.target === key);
  }

  // tag-todo-depth: we don't really need to calculate distances here... we can just rely on the depth property
  // tag-todo-naming: we should just call this depth
  calculateDistances(): Map<EncodedBundleNodeKey, number> {
    const distances = new Map<EncodedBundleNodeKey, number>();
    this.nodes.forEach(node => {
      distances.set(node.bundleNodeKey, node.depth);
    });
    return distances;
  }

  // Methods for accessing full source-graph link data, including files outside the working graph.
  setLinkSourceData(
    inlinkSources: Record<EncodedBundleNodeKey, EncodedBundleNodeKey[]>,
    outlinkTargets: Record<EncodedBundleNodeKey, EncodedBundleNodeKey[]>
  ): void {
    this.allInlinkSources = inlinkSources;
    this.allOutlinkTargets = outlinkTargets;
  }

  // Returns all source-node keys that link to this node in the source graph.
  getAllInlinkSources(bundleNodeKey: BundleNodeKey | EncodedBundleNodeKey): EncodedBundleNodeKey[] {
    return this.allInlinkSources[this.key(bundleNodeKey)] || [];
  }

  // Returns all target-node keys that this node links to in the source graph.
  getAllOutlinkTargets(bundleNodeKey: BundleNodeKey | EncodedBundleNodeKey): EncodedBundleNodeKey[] {
    return this.allOutlinkTargets[this.key(bundleNodeKey)] || [];
  }
}

import type { bundleNodeKey, ParticipatesIn } from '../../concepts/index.js';
export type GraphKeysMeadowConceptParticipations = [
  ParticipatesIn<typeof bundleNodeKey, 'graph-lookup', Graph['getNode']>,
];
