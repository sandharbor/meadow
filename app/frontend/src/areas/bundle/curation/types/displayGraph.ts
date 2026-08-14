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

import { Graph } from '../../../../../../shared_code/types/graph';
import { IBundleNode } from '../../../../../../shared_code/types/IBundleNode.js';
import { FileType } from '../../../../../../shared_code/types/FileType.js';
import type { BundleNodeKind } from '../../../../../../shared_code/types/bundleNodeConfig.js';
import { IFilter, IBundleNodeSelector } from './filters';
import { logger } from '../../../../shared/utils/logger';
import { calculateHighlightDetail } from '../utils/highlightDetailCalculators';
import {
  FilterExpression,
  createDefaultFilterExpression,
  evaluateFilterExpression,
  getActiveFilterExpressionTerms
} from './filterExpression';

export interface Highlight {
  color: string;
  isDashed: boolean;
  filterId: string;
  filterName: string;
  detailInfo?: string;
}

export class DisplayNode {
  private _node: IBundleNode;
  private _isVisible: boolean = true;
  private _isSelected: boolean = false;
  private _isEffectivelySensitive: boolean = false;
  private _highlights: Highlight[] = [];
  private _distance: number | undefined;
  private _showLabel: boolean = false;
  private _showTitle: boolean = false;
  private _titleFilterColors: string[] = [];

  constructor(node: IBundleNode) {
    this._node = node;
  }

  get bundleNodeKey(): string {
    return this._node.bundleNodeKey;
  }

  get label(): string {
    return this._node.label;
  }

  get bundleNodeName(): string {
    return this._node.bundleNodeName || 'Untitled';
  }

  get fileType(): FileType {
    return this._node.fileType ?? 'other';
  }

  get bundleNodeKind(): BundleNodeKind {
    return this._node.bundleNodeKind;
  }

  get sourceGraphSubdirectory(): string {
    return this._node.sourceGraphSubdirectory ?? '';
  }

  get isVisible(): boolean {
    return this._isVisible;
  }

  get isSelected(): boolean {
    return this._isSelected;
  }

  get isEffectivelySensitive(): boolean {
    return this._isEffectivelySensitive;
  }

  get highlights(): Highlight[] {
    return [...this._highlights];
  }

  get distance(): number | undefined {
    return this._distance;
  }

  get showLabel(): boolean {
    return this._showLabel;
  }

  get showTitle(): boolean {
    return this._showTitle;
  }

  get titleFilterColors(): string[] {
    return [...this._titleFilterColors];
  }

  get underlyingNode(): IBundleNode {
    return this._node;
  }

  get isFrontierNode(): boolean {
    return this._node.isFrontierNode || false;
  }

  get isFrontierImageExtension(): boolean {
    return this._node.isFrontierImageExtension || false;
  }

  get tracked(): boolean {
    return this._node.tracked || false;
  }

  setVisible(visible: boolean): void {
    this._isVisible = visible;
  }

  setSelected(selected: boolean): void {
    this._isSelected = selected;
  }

  setEffectivelySensitive(sensitive: boolean): void {
    this._isEffectivelySensitive = sensitive;
  }

  setHighlights(highlights: Highlight[]): void {
    this._highlights = [...highlights];
  }

  setDistance(distance: number | undefined): void {
    this._distance = distance;
  }

  setShowLabel(show: boolean): void {
    this._showLabel = show;
  }

  setShowTitle(show: boolean): void {
    this._showTitle = show;
  }

  addTitleFilterColor(color: string): void {
    if (!this._titleFilterColors.includes(color)) {
      this._titleFilterColors.push(color);
    }
  }

  clearTitleFilterColors(): void {
    this._titleFilterColors = [];
  }
}

export class DisplayGraph {
  private _graph: Graph;
  private _displayNodes: Map<string, DisplayNode>;
  private _filters: IFilter[];
  private _filterExpression: FilterExpression | null;

  constructor(graph: Graph) {
    this._graph = graph;
    this._displayNodes = new Map();
    this._filters = [];
    this._filterExpression = null;

    // Initialize display nodes
    for (const node of graph.getAllNodes()) {
      this._displayNodes.set(node.bundleNodeKey, new DisplayNode(node));
    }
  }

  get allDisplayNodes(): DisplayNode[] {
    return Array.from(this._displayNodes.values());
  }

  get visibleDisplayNodes(): DisplayNode[] {
    return this.allDisplayNodes.filter(node => node.isVisible);
  }

  get underlyingGraph(): Graph {
    return this._graph;
  }

  getDisplayNode(id: string): DisplayNode | undefined {
    return this._displayNodes.get(id);
  }

  setFilters(filters: IFilter[], filterExpression: FilterExpression | null = null): void {
    this._filters = filters;
    this._filterExpression = filterExpression;
    this.applyFilters();
  }

  setEntryNode(bundleNodeId: string): void {
    logger.debug(`[DisplayGraph] setEntryNode called with bundle node ID: ${bundleNodeId}`);

    const entryNode = this._graph.getAllNodes().find(node => node.bundleNodeId === bundleNodeId);

    if (!entryNode) {
      logger.warn(`[DisplayGraph] Entry node '${bundleNodeId}' not found in underlying graph for distance calculation.`);
      this._displayNodes.forEach(displayNode => {
        displayNode.setDistance(undefined);
      });
      return;
    }

    // Use the depth property directly from each node — it already represents
    // the hop count from the entry node (see tag-todo-depth in graph.ts).
    this._displayNodes.forEach(displayNode => {
      displayNode.setDistance(displayNode.underlyingNode.depth);
    });
  }

  setSelectedNodeKeys(bundleNodeKeys: Set<string>): void {
    this._displayNodes.forEach(displayNode => {
      displayNode.setSelected(bundleNodeKeys.has(displayNode.bundleNodeKey));
    });
  }

  private applyFilters(): void {
    const activeTerms = getActiveFilterExpressionTerms(this._filters);
    const activeFilterIds = new Set(activeTerms.map(term => term.filterId));
    const filterMatches = new Map<string, Set<string>>();

    this._filters.forEach(filter => {
      if (!activeFilterIds.has(filter.id) || filterMatches.has(filter.id)) return;
      const selectedNodeKeys = filter.bundleNodeSelectors.map((selector: IBundleNodeSelector) => selector.select(this._graph));
      const matches = new Set<string>();
      this._displayNodes.forEach(displayNode => {
        const isSelected = filter.selectorApplicationCriteria === 'union'
          ? selectedNodeKeys.some((nodeKeys: Set<string>) => nodeKeys.has(displayNode.bundleNodeKey))
          : selectedNodeKeys.every((nodeKeys: Set<string>) => nodeKeys.has(displayNode.bundleNodeKey));
        if (isSelected) matches.add(displayNode.bundleNodeKey);
      });
      filterMatches.set(filter.id, matches);
    });

    const expression = this._filterExpression || createDefaultFilterExpression(activeTerms);
    const allBundleNodeKeys = new Set(this._displayNodes.keys());
    const visibleBundleNodeKeys = evaluateFilterExpression(expression, activeTerms, filterMatches, allBundleNodeKeys);

    // Reset node presentation and apply the visibility expression.
    this._displayNodes.forEach(displayNode => {
      displayNode.setVisible(visibleBundleNodeKeys.has(displayNode.bundleNodeKey));
      displayNode.setHighlights([]);
      displayNode.setShowLabel(false);
      displayNode.setShowTitle(false);
      displayNode.clearTitleFilterColors();
      // Set effectively sensitive based on underlying node sensitivity
      displayNode.setEffectivelySensitive(displayNode.underlyingNode.sensitive || false);
    });

    // Apply other filter actions (highlights, sensitivity, labels, titles)
    this._filters.forEach((filter: IFilter) => {
      if (!filter.enabled) return;

      const selectedNodeKeys = filter.bundleNodeSelectors.map((selector: IBundleNodeSelector) => selector.select(this._graph));

      this._displayNodes.forEach((displayNode: DisplayNode) => {
        const isSelected = filter.selectorApplicationCriteria === 'union'
          ? selectedNodeKeys.some((nodeKeys: Set<string>) => nodeKeys.has(displayNode.bundleNodeKey))
          : selectedNodeKeys.every((nodeKeys: Set<string>) => nodeKeys.has(displayNode.bundleNodeKey));

        if (isSelected) {
          // Process mark_sensitive before highlight so sensitivity state is set
          // before checking whether to apply a sensitivity-gated highlight.
          const sortedActions = [...filter.actions].sort((a, b) =>
            (a.type === 'mark_sensitive' ? 0 : 1) - (b.type === 'mark_sensitive' ? 0 : 1)
          );
          sortedActions.forEach(action => {
            switch (action.type) {
              case 'highlight': {
                // Add highlight if either:
                // 1. The node is effectively sensitive and this highlight is from a sensitivity-related action
                // 2. This is a regular highlight action
                const isSensitivityHighlight = action.color === '#ff69b4' && action.isDashed;
                if (!isSensitivityHighlight || displayNode.isEffectivelySensitive) {
                  const detailInfo = calculateHighlightDetail(
                    filter.id,
                    displayNode.underlyingNode,
                    this._graph
                  );
                  displayNode.setHighlights([
                    ...displayNode.highlights,
                    {
                      color: action.color,
                      isDashed: action.isDashed,
                      filterId: filter.id,
                      filterName: filter.name,
                      detailInfo
                    }
                  ]);
                }
                break;
              }
              case 'mark_sensitive': {
                displayNode.setEffectivelySensitive(true);
                break;
              }
              case 'show_labels': {
                displayNode.setShowLabel(true);
                break;
              }
              case 'show_titles': {
                displayNode.setShowTitle(true);
                const highlightAction = filter.actions.find(a => a.type === 'highlight');
                if (highlightAction && highlightAction.type === 'highlight') {
                  displayNode.addTitleFilterColor(highlightAction.color);
                }
                break;
              }
            }
          });
        }
      });
    });
  }
}
