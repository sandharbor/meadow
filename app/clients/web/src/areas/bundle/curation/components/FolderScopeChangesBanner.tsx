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
import type { FolderScopeChangeExplanation } from '../../../../../../../contracts/types/folderScopeChanges';

const FolderScopeChangesBanner: React.FC<{ explanation?: FolderScopeChangeExplanation }> = ({ explanation }) => {
  if (!explanation || explanation.items.length === 0) return null;
  const causalCount = explanation.items.filter(item => item.category !== 'skipped').length;
  const skippedCount = explanation.items.filter(item => item.category === 'skipped').length;
  return (
    <details className="border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-950">
      <summary className="cursor-pointer font-medium">
        Folder scope changes: {causalCount} graph explanation{causalCount === 1 ? '' : 's'}
        {skippedCount > 0 ? ` · ${skippedCount} skipped-path change${skippedCount === 1 ? '' : 's'}` : ''}
        <span className="ml-2 font-normal text-blue-700">
          nodes {explanation.rawNodeDelta >= 0 ? '+' : ''}{explanation.rawNodeDelta}, edges {explanation.typedEdgeDelta >= 0 ? '+' : ''}{explanation.typedEdgeDelta}, seeds {explanation.seedDelta >= 0 ? '+' : ''}{explanation.seedDelta}
        </span>
      </summary>
      <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5">
        {explanation.items.map((item, index) => (
          <li key={`${item.code}-${item.bundleNodeKey ?? item.bundleNodeId ?? index}`}>
            <span className="font-medium capitalize">{item.category}:</span> {item.message}
          </li>
        ))}
      </ul>
    </details>
  );
};

export default FolderScopeChangesBanner;
