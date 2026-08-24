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
import type { FindInBundlesOptions } from '../../../../../../shared_code/types/findInBundlesOptions';

export interface CreateBundleForm {
  slug: string;
  sourceDirectory: string;
  entryBundleNodeName: string;
  entrySourceGraphSubdirectory: string;
  entryFileType: string;
  bundleNotes: string;
}

export type BundleModalMode = 'create' | 'edit';

export interface EditBundleDefaults {
  slug: string;
  sourceDirectory: string;
  entryBundleNodeName: string;
  entrySourceGraphSubdirectory?: string;
  entryFileType?: string;
  bundleNotes?: string;
  folderDerived?: boolean;
  defaultOutlinksDepth?: number;
  defaultInlinksDepth?: number;
}

export interface CreateOrEditBundleModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: BundleModalMode;
  onSuccess: (slug: string) => void;
  directories: string[];
  existingSlugs?: string[];
  findInBundlesOptions?: FindInBundlesOptions | null;
  editBundle?: EditBundleDefaults | null;
}

export type EntryStrategy = 'page' | 'folders';

interface EntryStrategyPickerProps {
  value: EntryStrategy;
  onChange: (value: EntryStrategy) => void;
}

export const EntryStrategyPicker: React.FC<EntryStrategyPickerProps> = ({ value, onChange }) => (
  <fieldset>
    <legend className="block text-sm font-medium text-gray-700 mb-2">Start this bundle from</legend>
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Bundle entry strategy">
      {([
        ['page', 'A page', 'Use one source page as the bundle entry.'],
        ['folders', 'One or more folders', 'Build a curated bundle from recursive folder contents.'],
      ] as const).map(([strategy, title, help]) => (
        <button
          key={strategy}
          type="button"
          role="radio"
          aria-checked={value === strategy}
          onClick={() => onChange(strategy)}
          className={`p-3 rounded-md border text-left ${value === strategy ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
        >
          <span className="block font-medium text-gray-900">{title}</span>
          <span className="block text-xs text-gray-500">{help}</span>
        </button>
      ))}
    </div>
  </fieldset>
);

interface SourceDirectoryFieldProps {
  value: string;
  directories: string[];
  isManuallyEdited: boolean;
  readOnly?: boolean;
  label?: string;
  helpText?: string;
  onStartManualEdit: () => void;
  onChange: (value: string) => void;
  onBrowse: () => void;
}

export const SourceDirectoryField: React.FC<SourceDirectoryFieldProps> = ({
  value,
  directories,
  isManuallyEdited,
  readOnly = false,
  label = 'Source Directory',
  helpText = 'The folder Meadow searches for source pages, links, and assets.',
  onStartManualEdit,
  onChange,
  onBrowse,
}) => {
  const existingDirectoryOptions = directories.filter(directory => directory && directory !== value);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label} *</label>
      {(readOnly || (!isManuallyEdited && value)) ? (
        <div className="flex items-center space-x-2">
          <div className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-700 truncate" title={value}>{value}</div>
          {!readOnly && (
            <button type="button" onClick={event => { event.stopPropagation(); onStartManualEdit(); }} className="text-blue-600 hover:text-blue-900" title="Choose a different folder">✏️</button>
          )}
        </div>
      ) : (
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={value}
            onChange={event => onChange(event.target.value)}
            placeholder="Enter a custom directory path"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
            required
          />
          <button type="button" onClick={event => { event.stopPropagation(); onBrowse(); }} className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 text-gray-700 text-sm whitespace-nowrap" title="Browse for folder">📁 Select</button>
        </div>
      )}
      <p className="text-xs text-gray-500 mt-1">{helpText}</p>
      {!readOnly && existingDirectoryOptions.length > 0 && (
        <div className="mt-2">
          <label className="block text-xs text-gray-500 mb-1">Or use a directory from another bundle:</label>
          <select
            aria-label="Use a directory from another bundle"
            value=""
            onChange={event => onChange(event.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
          >
            <option value="">Select a recent directory</option>
            {existingDirectoryOptions.map(directory => <option key={directory} value={directory}>{directory}</option>)}
          </select>
        </div>
      )}
    </div>
  );
};

interface BundleTraversalDefaultsFieldsProps {
  outlinksDepth: string;
  inlinksDepth: string;
  onOutlinksDepthChange: (value: string) => void;
  onInlinksDepthChange: (value: string) => void;
}

export const BundleTraversalDefaultsFields: React.FC<BundleTraversalDefaultsFieldsProps> = ({
  outlinksDepth,
  inlinksDepth,
  onOutlinksDepthChange,
  onInlinksDepthChange,
}) => (
  <fieldset className="rounded-md border border-gray-200 bg-gray-50 p-3">
    <legend className="px-1 text-sm font-medium text-gray-700">Default traversal depth</legend>
    <p className="mb-3 text-xs text-gray-500">
      Applied across the bundle unless a page or folder overrides it. Increasing these values can bring many more pages into the bundle.
    </p>
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-sm text-gray-700">
        <span className="mb-1 block font-medium">Outlinks</span>
        <input
          type="number"
          min="0"
          step="1"
          required
          aria-label="Default outlink depth"
          value={outlinksDepth}
          onChange={event => onOutlinksDepthChange(event.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
        />
        <span className="mt-1 block text-xs text-gray-500">Follow links from included content</span>
      </label>
      <label className="block text-sm text-gray-700">
        <span className="mb-1 block font-medium">Inlinks</span>
        <input
          type="number"
          min="0"
          step="1"
          required
          aria-label="Default inlink depth"
          value={inlinksDepth}
          onChange={event => onInlinksDepthChange(event.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
        />
        <span className="mt-1 block text-xs text-gray-500">Include content linking back in</span>
      </label>
    </div>
  </fieldset>
);

interface MoreBundleDetailsProps {
  expanded: boolean;
  isCreate: boolean;
  slug: string;
  notes: string;
  isSlugManuallyEdited: boolean;
  slugConflictError: string | null;
  onToggle: () => void;
  onStartSlugEdit: () => void;
  onSlugChange: (value: string) => void;
  onNotesChange: (value: string) => void;
}

export const MoreBundleDetails: React.FC<MoreBundleDetailsProps> = ({
  expanded,
  isCreate,
  slug,
  notes,
  isSlugManuallyEdited,
  slugConflictError,
  onToggle,
  onStartSlugEdit,
  onSlugChange,
  onNotesChange,
}) => (
  <>
    <button type="button" onClick={onToggle} className="flex items-center text-sm text-blue-600 hover:text-blue-800">
      <span className="mr-1">{expanded ? '▼' : '▶'}</span>
      {expanded ? 'Hide details' : 'More details'}
    </button>
    {expanded && (
      <div className="space-y-4 pl-4 border-l-2 border-gray-200">
        {isCreate && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bundle Config Folder Name *</label>
            {!isSlugManuallyEdited ? (
              <div className="flex items-center space-x-2">
                <div className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-700">{slug || 'will-be-auto-generated-from-title'}</div>
                <button type="button" onClick={event => { event.stopPropagation(); onStartSlugEdit(); }} className="text-blue-600 hover:text-blue-900" title="Edit manually">✏️</button>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  value={slug}
                  onChange={event => onSlugChange(event.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-inset ${slugConflictError ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
                  required
                  pattern="[a-z0-9\-]+"
                  title="Only lowercase letters, numbers, and dashes allowed"
                />
                <p className={`text-xs mt-1 ${slugConflictError ? 'text-red-600' : 'text-gray-500'}`}>
                  {slugConflictError || 'Only lowercase letters, numbers, and dashes allowed'}
                </p>
              </div>
            )}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea value={notes} onChange={event => onNotesChange(event.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500" placeholder="Enter any notes about this bundle..." />
        </div>
      </div>
    )}
  </>
);
