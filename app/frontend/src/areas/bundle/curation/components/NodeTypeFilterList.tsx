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

import React from 'react';
import type { Graph } from '../../../../../../shared_code/types/graph.js';
import type { IFilter, INodeTypeFilterState, NodeTypeFilterId } from '../types/filters.js';
import { getPresentNodeTypeFilters } from '../utils/nodeTypeFilterUtils.js';

interface NodeTypeFilterListProps {
  filter: IFilter;
  graph: Graph;
  onFilterChange: (filterId: string, changes: Partial<IFilter>) => void;
}

const EMPTY_TYPE_STATE: INodeTypeFilterState = {
  showTitles: false,
  isSolo: false,
  isHidden: false,
};

const isActive = (state: INodeTypeFilterState | undefined): boolean => Boolean(
  state?.showTitles || state?.isSolo || state?.isHidden
);

const NodeTypeFilterList: React.FC<NodeTypeFilterListProps> = ({ filter, graph, onFilterChange }) => {
  const presentTypes = getPresentNodeTypeFilters(graph);
  const typeStates = filter.nodeTypeStates || {};
  const hasActiveSettings = Object.values(typeStates).some(isActive);

  const updateTypeState = (id: NodeTypeFilterId, key: keyof INodeTypeFilterState) => {
    const current = typeStates[id] || EMPTY_TYPE_STATE;
    const updated = { ...current, [key]: !current[key] };
    const nextStates = { ...typeStates };

    if (isActive(updated)) nextStates[id] = updated;
    else delete nextStates[id];

    onFilterChange(filter.id, { nodeTypeStates: nextStates });
  };

  return (
    <div className="overflow-hidden rounded border border-gray-200 bg-white">
      <div className="flex h-8 items-center justify-between border-b border-gray-100 bg-gray-50 px-2">
        <span className="text-[11px] text-gray-500">Graph types</span>
        {hasActiveSettings && (
          <button
            type="button"
            onClick={() => onFilterChange(filter.id, { nodeTypeStates: {} })}
            className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
            title="Reset type filters"
          >
            Reset
          </button>
        )}
      </div>
      <div className="py-1" data-testid="node-type-filter-list">
        {presentTypes.map(type => {
          const state = typeStates[type.id] || EMPTY_TYPE_STATE;
          return (
            <div key={type.id} className="flex h-7 items-center gap-1 rounded px-2 hover:bg-gray-50">
              <span className="min-w-0 flex-1 truncate text-xs text-gray-700" title={type.label}>
                {type.label}
              </span>
              <span
                className="flex-shrink-0 whitespace-nowrap text-[10px] tabular-nums text-gray-400"
                title={`${type.nodeCount} ${type.nodeCount === 1 ? 'node' : 'nodes'}`}
              >
                {type.nodeCount}
              </span>
              <div className="flex flex-shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => updateTypeState(type.id, 'showTitles')}
                  className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${
                    state.showTitles
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                  }`}
                  title={`Show titles for ${type.label}`}
                  aria-pressed={state.showTitles}
                >
                  T
                </button>
                <button
                  type="button"
                  onClick={() => updateTypeState(type.id, 'isSolo')}
                  className={`flex h-5 w-5 items-center justify-center rounded ${
                    state.isSolo
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                  }`}
                  title={`Solo ${type.label}`}
                  aria-pressed={state.isSolo}
                >
                  <svg className="h-2.5 w-2.5" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="8" r="4" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => updateTypeState(type.id, 'isHidden')}
                  className={`flex h-5 w-5 items-center justify-center rounded ${
                    state.isHidden
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                  }`}
                  title={`Hide ${type.label}`}
                  aria-pressed={state.isHidden}
                >
                  <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" />
                    <circle cx="10" cy="10" r="2.5" />
                    <path d="M3 17L17 3" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NodeTypeFilterList;
