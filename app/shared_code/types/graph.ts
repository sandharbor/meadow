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
import { ISitePage } from './ISitePage.js';

export type { ISitePage as IPage };

export interface IEdge {
  source: string;
  target: string;
  label?: string;
  isBidirectional?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: Record<string, any>;
}

export class Graph {
  private pages: Map<string, ISitePage>;
  private edges: IEdge[];
  private changeListeners: Set<() => void>;
  private allInlinkSources: Record<string, string[]>;
  private allOutlinkTargets: Record<string, string[]>;

  constructor() {
    this.pages = new Map();
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

  addPage(page: ISitePage): void {
    this.pages.set(page.id, page);
    this.notifyChange();
  }

  updatePage(id: string, page: ISitePage): void {
    if (!this.pages.has(id)) {
      throw new Error('Page does not exist');
    }
    this.pages.set(id, page);
    this.notifyChange();
  }

  addEdge(edge: IEdge): void {
    if (!this.pages.has(edge.source) || !this.pages.has(edge.target)) {
      throw new Error('Source or target page does not exist');
    }
    this.edges.push(edge);
    this.notifyChange();
  }

  getPage(id: string): ISitePage | undefined {
    return this.pages.get(id);
  }

  getAllPages(): ISitePage[] {
    return Array.from(this.pages.values());
  }

  getAllEdges(): IEdge[] {
    return this.edges;
  }

  getOutgoingEdges(pageId: string): IEdge[] {
    return this.edges.filter(edge => edge.source === pageId);
  }

  getIncomingEdges(pageId: string): IEdge[] {
    return this.edges.filter(edge => edge.target === pageId);
  }

  // tag-todo-depth: we don't really need to calculate distances here... we can just rely on the depth property
  // tag-todo-naming: we should just call this depth
  calculateDistances(): Map<string, number> {
    const distances = new Map<string, number>();
    this.pages.forEach((page, _pageId) => {
      const pageKey = `${page.sourceGraphSubdirectory}/${page.title}.${page.file_type}`;
      distances.set(pageKey, page.depth);
    });
    return distances;
  }

  // Methods for accessing full source graph link data (including pages outside working graph)
  setLinkSourceData(
    inlinkSources: Record<string, string[]>,
    outlinkTargets: Record<string, string[]>
  ): void {
    this.allInlinkSources = inlinkSources;
    this.allOutlinkTargets = outlinkTargets;
  }

  // Returns all source page IDs that link TO this page in the source graph
  getAllInlinkSources(pageId: string): string[] {
    return this.allInlinkSources[pageId] || [];
  }

  // Returns all target page IDs that this page links TO in the source graph
  getAllOutlinkTargets(pageId: string): string[] {
    return this.allOutlinkTargets[pageId] || [];
  }
}
