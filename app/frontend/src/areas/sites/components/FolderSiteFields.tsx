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

export interface FolderSitePreflight {
  fingerprint: string;
  plan: {
    sourceDirectory: string;
    normalizedSelectedFolders: string[];
    folderSiteNodeIds: string[];
    collectionSiteNodeId?: string;
    entrySiteNodeId: string;
    defaultOutlinksDepth: number;
    defaultInlinksDepth: number;
  };
  duplicateSelections: Array<{ inputIndex: number; normalizedFolder: string }>;
  overlaps: Array<{ ancestor: string; descendant: string }>;
  supportedSeedFileCount: number;
  requiredRawFolderNodeCount: number;
  skippedCounts: Record<string, number>;
  skippedPaths: Array<{ path: string; reason: string }>;
  skippedPathCount: number;
  predictedRawNodeCount: number;
  predictedTypedEdgeCount: number;
  sensitiveNodeCount: number;
  preferredRouteCollisions: string[];
  highImpactWarning: boolean;
}

interface FolderSiteFieldsProps {
  siteName: string;
  selectedFolders: string[];
  preflight: FolderSitePreflight | null;
  confirmHighImpact: boolean;
  onSiteNameChange: (value: string) => void;
  onAddFolders: () => void;
  onMoveFolder: (index: number, direction: -1 | 1) => void;
  onRemoveFolder: (index: number) => void;
  onConfirmHighImpactChange: (value: boolean) => void;
}

const FolderSiteFields: React.FC<FolderSiteFieldsProps> = ({
  siteName,
  selectedFolders,
  preflight,
  confirmHighImpact,
  onSiteNameChange,
  onAddFolders,
  onMoveFolder,
  onRemoveFolder,
  onConfirmHighImpactChange,
}) => (
  <>
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Site Name *</label>
        <input
          type="text"
          value={siteName}
          onChange={(event) => onSiteNameChange(event.target.value)}
          placeholder="Research site"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500 mt-1">Used for the site home when several folders are selected.</p>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700">Selected Folders *</label>
          <button type="button" onClick={onAddFolders} className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 text-gray-700 text-sm">
            Add folders
          </button>
        </div>
        {selectedFolders.length === 0 ? (
          <p className="p-3 text-sm text-gray-500 border border-dashed border-gray-300 rounded-md">
            Choose folders beneath the source directory. Their order becomes the site-home order.
          </p>
        ) : (
          <ol className="space-y-2" aria-label="Selected folders in site-home order">
            {selectedFolders.map((folder, index) => (
              <li key={`${folder}-${index}`} className="flex items-center gap-2 p-2 border border-gray-200 rounded-md">
                <span className="text-sm text-gray-500 w-5">{index + 1}.</span>
                <span className="flex-1 text-sm text-gray-800 truncate" title={folder}>{folder}</span>
                <button type="button" onClick={() => onMoveFolder(index, -1)} disabled={index === 0} aria-label={`Move ${folder} earlier`} className="px-1 disabled:opacity-30">↑</button>
                <button type="button" onClick={() => onMoveFolder(index, 1)} disabled={index === selectedFolders.length - 1} aria-label={`Move ${folder} later`} className="px-1 disabled:opacity-30">↓</button>
                <button type="button" onClick={() => onRemoveFolder(index)} aria-label={`Remove ${folder}`} className="px-1 text-red-600">×</button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>

    {preflight && (
      <section className="p-3 bg-blue-50 border border-blue-200 rounded-md" aria-label="Folder site prediction">
        <h3 className="text-sm font-semibold text-blue-900">Creation prediction</h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div><dt className="text-gray-500">Supported seed files</dt><dd className="font-medium">{preflight.supportedSeedFileCount}</dd></div>
          <div><dt className="text-gray-500">Required folder nodes</dt><dd className="font-medium">{preflight.requiredRawFolderNodeCount}</dd></div>
          <div><dt className="text-gray-500">Predicted raw nodes</dt><dd className="font-medium">{preflight.predictedRawNodeCount}</dd></div>
          <div><dt className="text-gray-500">Predicted typed edges</dt><dd className="font-medium">{preflight.predictedTypedEdgeCount}</dd></div>
        </dl>
        {preflight.overlaps.length > 0 && <p className="mt-2 text-xs text-blue-800">Overlapping selections are preserved and source nodes are deduplicated.</p>}
        {preflight.duplicateSelections.length > 0 && <p className="mt-1 text-xs text-blue-800">Duplicate selections will be represented once.</p>}
        {preflight.skippedPathCount > 0 && (
          <details className="mt-2 text-xs text-gray-700">
            <summary>{preflight.skippedPathCount} skipped paths</summary>
            <ul className="mt-1 space-y-1 max-h-28 overflow-y-auto">
              {preflight.skippedPaths.map(item => <li key={`${item.reason}-${item.path}`}>{item.path} — {item.reason}</li>)}
            </ul>
          </details>
        )}
        {preflight.highImpactWarning && (
          <label className="mt-3 flex items-start gap-2 text-sm text-amber-900">
            <input type="checkbox" checked={confirmHighImpact} onChange={event => onConfirmHighImpactChange(event.target.checked)} className="mt-0.5" />
            I reviewed this high-impact graph and want to create it.
          </label>
        )}
      </section>
    )}
  </>
);

export default FolderSiteFields;
