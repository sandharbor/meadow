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

import React, { useMemo, useState } from 'react';
import { IBundleNode } from '../../../../../../shared_code/types/IBundleNode';
import { IFilter, IFolderFilterState } from '../types/filters';
import { buildFolderTree, FolderTreeNode, ROOT_FOLDER_LABEL } from '../utils/folderFilterUtils';

interface FolderFilterTreeProps {
  filter: IFilter;
  pages: IBundleNode[];
  onFilterChange: (filterId: string, changes: Partial<IFilter>) => void;
}

const EMPTY_FOLDER_STATE: IFolderFilterState = {
  showTitles: false,
  isSolo: false,
  isHidden: false
};

const isActive = (state: IFolderFilterState | undefined): boolean => Boolean(
  state?.showTitles || state?.isSolo || state?.isHidden
);

const folderDisplayName = (path: string): string => path || ROOT_FOLDER_LABEL;

const FolderFilterTree: React.FC<FolderFilterTreeProps> = ({ filter, pages, onFilterChange }) => {
  const nodes = useMemo(() => buildFolderTree(pages), [pages]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const folderStates = filter.folderStates || {};
  const hasActiveSettings = Object.values(folderStates).some(isActive);

  const toggleExpanded = (path: string) => {
    setExpandedFolders(previous => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const updateFolderState = (path: string, key: keyof IFolderFilterState) => {
    const current = folderStates[path] || EMPTY_FOLDER_STATE;
    const updated = { ...current, [key]: !current[key] };
    const nextStates = { ...folderStates };

    if (isActive(updated)) nextStates[path] = updated;
    else delete nextStates[path];

    onFilterChange(filter.id, { folderStates: nextStates });
  };

  const descendantActivity = (path: string): IFolderFilterState => {
    const descendantStates = Object.entries(folderStates)
      .filter(([candidatePath]) => candidatePath !== path && candidatePath.startsWith(`${path}/`))
      .map(([, state]) => state);

    return descendantStates.reduce<IFolderFilterState>((activity, state) => ({
      showTitles: activity.showTitles || state.showTitles,
      isSolo: activity.isSolo || state.isSolo,
      isHidden: activity.isHidden || state.isHidden
    }), { ...EMPTY_FOLDER_STATE });
  };

  const renderNode = (node: FolderTreeNode, depth: number): React.ReactNode => {
    const expanded = expandedFolders.has(node.path);
    const state = folderStates[node.path] || EMPTY_FOLDER_STATE;
    const descendantState = node.path ? descendantActivity(node.path) : EMPTY_FOLDER_STATE;
    const hasDescendantActivity = isActive(descendantState);
    const displayName = folderDisplayName(node.path);

    return (
      <React.Fragment key={node.path || '__root__'}>
        <div
          className="flex h-7 items-center gap-1 rounded px-1 hover:bg-gray-50"
          data-folder-path={node.path}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          {node.children.length > 0 ? (
            <button
              type="button"
              onClick={() => toggleExpanded(node.path)}
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700"
              title={`${expanded ? 'Collapse' : 'Expand'} folder ${displayName}`}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} folder ${displayName}`}
            >
              <svg
                className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M5.5 3.5L10 8l-4.5 4.5V3.5z" />
              </svg>
            </button>
          ) : (
            <span className="h-5 w-5 flex-shrink-0" />
          )}

          <span className="min-w-0 flex-1 truncate text-xs text-gray-700" title={displayName}>
            {node.name}
          </span>
          <span
            className="flex-shrink-0 whitespace-nowrap text-[10px] tabular-nums text-gray-400"
            title={`${node.nodeCount} ${node.nodeCount === 1 ? 'page' : 'pages'} in ${displayName}`}
          >
            {node.nodeCount}
          </span>

          {hasDescendantActivity && (
            <span
              className="flex flex-shrink-0 items-center gap-0.5 px-0.5"
              title={`Active settings in subfolders of ${displayName}`}
            >
              {descendantState.showTitles && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
              {descendantState.isSolo && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
              {descendantState.isHidden && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
            </span>
          )}

          <div className="flex flex-shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => updateFolderState(node.path, 'showTitles')}
              className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${
                state.showTitles
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
              }`}
              title={`Show titles for folder ${displayName}`}
              aria-pressed={state.showTitles}
            >
              T
            </button>
            <button
              type="button"
              onClick={() => updateFolderState(node.path, 'isSolo')}
              className={`flex h-5 w-5 items-center justify-center rounded ${
                state.isSolo
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
              }`}
              title={`Solo folder ${displayName}`}
              aria-pressed={state.isSolo}
            >
              <svg className="h-2.5 w-2.5" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="8" r="4" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => updateFolderState(node.path, 'isHidden')}
              className={`flex h-5 w-5 items-center justify-center rounded ${
                state.isHidden
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
              }`}
              title={`Hide folder ${displayName}`}
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

        {expanded && node.children.map(child => renderNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="overflow-hidden rounded border border-gray-200 bg-white">
      <div className="flex h-8 items-center justify-between border-b border-gray-100 bg-gray-50 px-2">
        <span className="text-[11px] text-gray-500">Page folders</span>
        {hasActiveSettings && (
          <button
            type="button"
            onClick={() => onFilterChange(filter.id, { folderStates: {} })}
            className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
            title="Reset folder filters"
          >
            Reset
          </button>
        )}
      </div>
      <div className="max-h-64 overflow-y-auto py-1" data-testid="folder-filter-tree">
        {nodes.map(node => renderNode(node, 0))}
      </div>
    </div>
  );
};

export default FolderFilterTree;
