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
import type { MatchingFilter } from '../types/displayGraph';

interface BundleNodeHoverCardProps {
  title: string;
  matchingFilters: MatchingFilter[];
  style?: React.CSSProperties;
}

/**
 * Parses text with ~~strikethrough~~ markers and returns React elements
 * with clear override styling: "OVERRIDE" label, strikethrough old value, arrow, new value.
 * For example: "outlinks depth: ~~4~~ 6" becomes "outlinks depth: OVERRIDE 4̶ → 6"
 */
function renderWithStrikethrough(text: string): React.ReactNode {
  const parts = text.split(/(~~[^~]+~~)/g);
  const hasOverride = parts.some(p => p.startsWith('~~') && p.endsWith('~~'));

  return parts.map((part, index) => {
    if (part.startsWith('~~') && part.endsWith('~~')) {
      const struckText = part.slice(2, -2);
      return (
        <React.Fragment key={index}>
          <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-600 mr-0.5">override</span>
          <span className="line-through decoration-2 text-gray-400">{struckText}</span>
          <span className="text-amber-500 mx-0.5">→</span>
        </React.Fragment>
      );
    }
    if (hasOverride && index === parts.length - 1 && part.trim()) {
      // The last part after the strikethrough is the override value — bold it
      return <span key={index} className="font-semibold text-gray-700">{part}</span>;
    }
    return part;
  });
}

const BundleNodeHoverCard: React.FC<BundleNodeHoverCardProps> = ({
  title,
  matchingFilters,
  style,
}) => {
  return (
    <div
      data-testid="bundle-node-hover-card"
      style={{
        pointerEvents: 'none',
        zIndex: 10,
        minWidth: 80,
        textAlign: 'center',
        ...style,
      }}
      className="bg-gray-50 text-gray-800 text-xs rounded px-2 py-1 shadow-lg border border-gray-200"
    >
      <div className="font-medium">{title}</div>
      {matchingFilters.length > 0 && (
        <div className="mt-1 pt-1 border-t border-gray-200 text-left">
          {matchingFilters.map(filter => (
            <div key={filter.filterId} data-testid="node-hover-filter" className="py-0.5">
              <div className="flex items-center gap-1.5">
                {filter.color && <span
                  data-testid="filter-highlight-color"
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: filter.color,
                    border: filter.isDashed ? '1px dashed #374151' : 'none',
                  }}
                />}
                <span className="text-gray-600">{filter.filterName}</span>
                {filter.marksSensitive && <span className="text-gray-600">+ sensitive</span>}
              </div>
              {filter.detailInfo && (
                <div className={`text-[11px] text-gray-500 ${filter.color ? 'ml-3.5' : ''}`}>
                  {renderWithStrikethrough(filter.detailInfo)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BundleNodeHoverCard;
