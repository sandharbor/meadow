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

import React, { useState } from 'react';
import { SitePageConfig } from '../../../../../../shared_code/types/sitePageConfig';
import { getPageKey } from '../../../../../../shared_code/utils/sitePageConfigUtils';

interface OrphansViewProps {
  orphanConfigs: SitePageConfig[];
  onRemoveConfig: (config: SitePageConfig) => Promise<void>;
  onRemoveAllConfigs: () => Promise<void>;
}

const OrphansView: React.FC<OrphansViewProps> = ({
  orphanConfigs,
  onRemoveConfig,
  onRemoveAllConfigs,
}) => {
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [removingAll, setRemovingAll] = useState(false);

  const handleRemove = async (config: SitePageConfig) => {
    const key = getPageKey(config.title, config.source_graph_subdirectory, config.file_type);
    setRemovingKey(key);
    try {
      await onRemoveConfig(config);
    } finally {
      setRemovingKey(null);
    }
  };

  const handleRemoveAll = async () => {
    setRemovingAll(true);
    try {
      await onRemoveAllConfigs();
    } finally {
      setRemovingAll(false);
    }
  };

  if (orphanConfigs.length === 0) {
    return (
      <div className="py-8 text-center" data-testid="orphans-empty-state">
        <p className="text-gray-600 text-sm">
          No orphaned pages. Every page in your site configuration is reachable from the current graph.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="orphans-view">
      <div className="mb-4 flex items-start justify-between gap-4">
        <p className="text-sm text-gray-600">
          These pages are in your site configuration but are no longer reachable in the graph.
          They may have lost their link path after a source graph change.
        </p>
        <button
          onClick={handleRemoveAll}
          disabled={removingAll || removingKey !== null}
          className="flex-shrink-0 px-3 py-1.5 text-sm rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50"
          data-testid="remove-all-orphans"
        >
          {removingAll ? 'Removing all…' : 'Remove all from config'}
        </button>
      </div>
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Directory
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tracked
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {orphanConfigs.map(config => {
              const key = getPageKey(config.title, config.source_graph_subdirectory, config.file_type);
              const isRemoving = removingKey === key;
              const tracked = config.config.tracked !== false;

              return (
                <tr key={key} data-testid={`orphan-row-${config.title}`}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {config.title}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {config.source_graph_subdirectory || '(root)'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {config.file_type || 'md'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {tracked ? 'Yes' : 'No'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <button
                      onClick={() => handleRemove(config)}
                      disabled={isRemoving || removingAll}
                      className="px-3 py-1 text-xs rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50"
                      data-testid={`remove-orphan-${config.title}`}
                    >
                      {isRemoving ? 'Removing…' : 'Remove from config'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OrphansView;
