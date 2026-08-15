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

interface FolderBundleFieldsProps {
  bundleName: string;
  selectedFolders: string[];
  onBundleNameChange: (value: string) => void;
  onAddFolders: () => void;
  onMoveFolder: (index: number, direction: -1 | 1) => void;
  onRemoveFolder: (index: number) => void;
}

const FolderBundleFields: React.FC<FolderBundleFieldsProps> = ({
  bundleName,
  selectedFolders,
  onBundleNameChange,
  onAddFolders,
  onMoveFolder,
  onRemoveFolder,
}) => (
  <div className="space-y-3">
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Bundle Name *</label>
      <input
        type="text"
        value={bundleName}
        onChange={(event) => onBundleNameChange(event.target.value)}
        placeholder="Research bundle"
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
      />
      <p className="text-xs text-gray-500 mt-1">Used for the bundle home when several folders are selected.</p>
    </div>
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-gray-700">Folders to Include *</label>
        <button type="button" onClick={onAddFolders} className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 text-gray-700 text-sm">
          Add folders
        </button>
      </div>
      {selectedFolders.length === 0 ? (
        <p className="p-3 text-sm text-gray-500 border border-dashed border-gray-300 rounded-md">
          Choose the folders whose contents should start this bundle. Their order becomes the bundle-home order.
        </p>
      ) : (
        <ol className="space-y-2" aria-label="Selected folders in bundle-home order">
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
);

export default FolderBundleFields;
