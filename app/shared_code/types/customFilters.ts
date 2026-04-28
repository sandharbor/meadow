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

export type CustomFilterScope = 'global' | 'site';

export type SelectorField = 'title' | 'path' | 'content';
export type SelectorMatchType = 'substring' | 'regex';

export interface CustomPageSelectorConfig {
  field: SelectorField;
  matchType: SelectorMatchType;
  value: string;
  caseSensitive?: boolean;
}

export interface CustomFilterConfig {
  id: string;
  name: string;
  note?: string;
  scope: CustomFilterScope;
  selectors: CustomPageSelectorConfig[];
  selectorApplicationCriteria: 'union' | 'intersection';
  actions: CustomFilterAction[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomFilterAction {
  type: 'highlight' | 'mark_sensitive';
  color?: string; // for highlight
  isDashed?: boolean; // for highlight
}

export interface GlobalCustomFiltersConfig {
  filters: CustomFilterConfig[];
  version: string;
}

export interface SiteCustomFiltersConfig {
  filters: CustomFilterConfig[];
  version: string;
} 