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
import { ISitePage } from '../../../../../../shared_code/types/ISitePage.js';
import { FileType } from '../../../../../../shared_code/types/FileType.js';
import { IFilter, IPageSelector } from './filters';
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

export class DisplayPage {
  private _page: ISitePage;
  private _isVisible: boolean = true;
  private _isSelected: boolean = false;
  private _isEffectivelySensitive: boolean = false;
  private _highlights: Highlight[] = [];
  private _distance: number | undefined;
  private _showLabel: boolean = false;
  private _showTitle: boolean = false;
  private _titleFilterColors: string[] = [];

  constructor(page: ISitePage) {
    this._page = page;
  }

  get id(): string {
    return this._page.id;
  }

  get label(): string {
    return this._page.label;
  }

  get title(): string {
    return this._page.title || 'Untitled';
  }

  get file_type(): FileType {
    return this._page.file_type;
  }

  get sourceGraphSubdirectory(): string {
    return this._page.sourceGraphSubdirectory;
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

  get underlyingPage(): ISitePage {
    return this._page;
  }

  get isFrontierPage(): boolean {
    return this._page.isFrontierPage || false;
  }

  get isFrontierImageExtension(): boolean {
    return this._page.isFrontierImageExtension || false;
  }

  get tracked(): boolean {
    return this._page.tracked || false;
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
  private _displayPages: Map<string, DisplayPage>;
  private _filters: IFilter[];
  private _filterExpression: FilterExpression | null;

  constructor(graph: Graph) {
    this._graph = graph;
    this._displayPages = new Map();
    this._filters = [];
    this._filterExpression = null;

    // Initialize display pages
    for (const page of graph.getAllPages()) {
      this._displayPages.set(page.id, new DisplayPage(page));
    }
  }

  get allDisplayPages(): DisplayPage[] {
    return Array.from(this._displayPages.values());
  }

  get visibleDisplayPages(): DisplayPage[] {
    return this.allDisplayPages.filter(page => page.isVisible);
  }

  getDisplayPage(id: string): DisplayPage | undefined {
    return this._displayPages.get(id);
  }

  setFilters(filters: IFilter[], filterExpression: FilterExpression | null = null): void {
    this._filters = filters;
    this._filterExpression = filterExpression;
    this.applyFilters();
  }

  setInitialPage(pageIdAsTitle: string): void {
    logger.debug(`[DisplayGraph] setInitialPage called with title: ${pageIdAsTitle}`);

    // Find the actual page in the graph by its title
    const targetPage = this._graph.getAllPages().find(page => page.title === pageIdAsTitle);

    if (!targetPage) {
      logger.warn(`[DisplayGraph] Page with title '${pageIdAsTitle}' not found in underlying graph for distance calculation.`);
      this._displayPages.forEach(displayPage => {
        displayPage.setDistance(undefined);
      });
      return;
    }

    // Use the depth property directly from each page — it already represents
    // the hop count from the initial page (see tag-todo-depth in graph.ts).
    this._displayPages.forEach(displayPage => {
      displayPage.setDistance(displayPage.underlyingPage.depth);
    });
  }

  setSelectedPages(pageIds: Set<string>): void {
    this._displayPages.forEach(displayPage => {
      displayPage.setSelected(pageIds.has(displayPage.id));
    });
  }

  private applyFilters(): void {
    const activeTerms = getActiveFilterExpressionTerms(this._filters);
    const activeFilterIds = new Set(activeTerms.map(term => term.filterId));
    const filterMatches = new Map<string, Set<string>>();

    this._filters.forEach(filter => {
      if (!activeFilterIds.has(filter.id) || filterMatches.has(filter.id)) return;
      const selectedPages = filter.pageSelectors.map((selector: IPageSelector) => selector.select(this._graph));
      const matches = new Set<string>();
      this._displayPages.forEach(displayPage => {
        const isSelected = filter.selectorApplicationCriteria === 'union'
          ? selectedPages.some((pages: Set<string>) => pages.has(displayPage.id))
          : selectedPages.every((pages: Set<string>) => pages.has(displayPage.id));
        if (isSelected) matches.add(displayPage.id);
      });
      filterMatches.set(filter.id, matches);
    });

    const expression = this._filterExpression || createDefaultFilterExpression(activeTerms);
    const allPageIds = new Set(this._displayPages.keys());
    const visiblePageIds = evaluateFilterExpression(expression, activeTerms, filterMatches, allPageIds);

    // Reset page presentation and apply the visibility expression.
    this._displayPages.forEach(displayPage => {
      displayPage.setVisible(visiblePageIds.has(displayPage.id));
      displayPage.setHighlights([]);
      displayPage.setShowLabel(false);
      displayPage.setShowTitle(false);
      displayPage.clearTitleFilterColors();
      // Set effectively sensitive based on underlying page sensitivity
      displayPage.setEffectivelySensitive(displayPage.underlyingPage.sensitive || false);
    });

    // Apply other filter actions (highlights, sensitivity, labels, titles)
    this._filters.forEach((filter: IFilter) => {
      if (!filter.enabled) return;

      const selectedPages = filter.pageSelectors.map((selector: IPageSelector) => selector.select(this._graph));

      this._displayPages.forEach((displayPage: DisplayPage) => {
        const isSelected = filter.selectorApplicationCriteria === 'union'
          ? selectedPages.some((pages: Set<string>) => pages.has(displayPage.id))
          : selectedPages.every((pages: Set<string>) => pages.has(displayPage.id));

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
                // 1. The page is effectively sensitive and this highlight is from a sensitivity-related action
                // 2. This is a regular highlight action
                const isSensitivityHighlight = action.color === '#ff69b4' && action.isDashed;
                if (!isSensitivityHighlight || displayPage.isEffectivelySensitive) {
                  const detailInfo = calculateHighlightDetail(
                    filter.id,
                    displayPage.underlyingPage,
                    this._graph
                  );
                  displayPage.setHighlights([
                    ...displayPage.highlights,
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
                displayPage.setEffectivelySensitive(true);
                break;
              }
              case 'show_labels': {
                displayPage.setShowLabel(true);
                break;
              }
              case 'show_titles': {
                displayPage.setShowTitle(true);
                const highlightAction = filter.actions.find(a => a.type === 'highlight');
                if (highlightAction && highlightAction.type === 'highlight') {
                  displayPage.addTitleFilterColor(highlightAction.color);
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
