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
import type { FolderBundleSelectionValidation } from '../../../../../../contracts/types/folderBundleSelection';

interface FolderBundleFieldsProps {
  bundleName: string;
  selectedFolders: string[];
  validation: FolderBundleSelectionValidation & { isChecking: boolean };
  onBundleNameChange: (value: string) => void;
  onAddFolders: () => void;
  onMoveFolder: (index: number, direction: -1 | 1) => void;
  onRemoveFolder: (index: number) => void;
}

const FolderBundleFields: React.FC<FolderBundleFieldsProps> = ({
  bundleName,
  selectedFolders,
  validation,
  onBundleNameChange,
  onAddFolders,
  onMoveFolder,
  onRemoveFolder,
}) => (
  <div className="space-y-3">
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
          {selectedFolders.map((folder, index) => {
            const error = validation.folderErrors.find(item => item.folder === folder)?.message;
            return (
              <li key={`${folder}-${index}`} className={`flex items-center gap-2 p-2 border rounded-md ${error ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                <span className="text-sm text-gray-500 w-5">{index + 1}.</span>
                <div className="flex-1 min-w-0">
                  <span className="block text-sm text-gray-800 truncate" title={folder}>{folder}</span>
                  {error && <p role="alert" className="text-xs text-red-700 mt-1">{error}</p>}
                </div>
                <button type="button" onClick={() => onMoveFolder(index, -1)} disabled={index === 0} aria-label={`Move ${folder} earlier`} className="px-1 disabled:opacity-30">↑</button>
                <button type="button" onClick={() => onMoveFolder(index, 1)} disabled={index === selectedFolders.length - 1} aria-label={`Move ${folder} later`} className="px-1 disabled:opacity-30">↓</button>
                <button type="button" onClick={() => onRemoveFolder(index)} aria-label={`Remove ${folder}`} className="px-1 text-red-600">×</button>
              </li>
            );
          })}
        </ol>
      )}
      {validation.selectionError && <p role="alert" className="mt-2 text-sm text-red-700">{validation.selectionError}</p>}
      {validation.isChecking && <p role="status" className="mt-2 text-xs text-gray-500">Checking folders…</p>}
    </div>
    {selectedFolders.length > 1 && (
      <div>
        <label htmlFor="bundle-home-title" className="block text-sm font-medium text-gray-700 mb-1">Home Page Title *</label>
        <input
          id="bundle-home-title"
          type="text"
          value={bundleName}
          onChange={(event) => onBundleNameChange(event.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
          aria-describedby="bundle-home-title-help"
        />
        <p id="bundle-home-title-help" className="text-xs text-gray-500 mt-1">
          The title of the published home page that brings these folders together. Suggested from the first folder; you can change it.
        </p>
      </div>
    )}
    {selectedFolders.length === 1 && (
      <p className="text-xs text-gray-500">The published home page uses the folder name as its title.</p>
    )}
  </div>
);

export default FolderBundleFields;
