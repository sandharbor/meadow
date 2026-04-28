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
import Modal from './Modal';
import { IPage } from '../../../shared_code/types/graph';

type CopyFormat = 'titles' | 'paths' | 'json' | 'yaml';
type PathsVariant = 'space-separated' | 'separate-lines';

interface CopySelectedPagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPages: IPage[];
}

// Common presenter for site page details (used by both JSON and YAML)
const presentSitePageDetails = (page: IPage): Record<string, unknown> => {
  const details: Record<string, unknown> = {
    title: page.title,
    sourceGraphSubdirectory: page.sourceGraphSubdirectory,
    file_type: page.file_type,
  };
  if (page.tracked) details.tracked = true;
  if (page.blacklisted) details.blacklisted = true;
  if (page.sensitive) details.sensitive = true;
  if (page.offTopic) details.offTopic = true;
  if (page.depth !== undefined) details.depth = page.depth;
  if (page.isFrontierPage) details.isFrontierPage = true;
  if (page.isFrontierImageExtension) details.isFrontierImageExtension = true;
  return details;
};

// Build the file path for a page
const getPagePath = (page: IPage): string => {
  const parts = [];
  if (page.sourceGraphSubdirectory) {
    parts.push(page.sourceGraphSubdirectory);
  }
  parts.push(`${page.title}.${page.file_type}`);
  return parts.join('/');
};

// Quote a path for unix (always quote for consistency)
const quotePathForUnix = (path: string): string => {
  return `"${path}"`;
};

// Format page details as YAML
const formatPageDetailsAsYaml = (details: Record<string, unknown>): string => {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'string') {
      lines.push(`  ${key}: "${value}"`);
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      lines.push(`  ${key}: ${value}`);
    }
  }
  return '- ' + lines.join('\n  ').replace(/^ {2}/, '');
};

const CopySelectedPagesModal: React.FC<CopySelectedPagesModalProps> = ({
  isOpen,
  onClose,
  selectedPages,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<CopyFormat>('paths');
  const [pathsVariant, setPathsVariant] = useState<PathsVariant>('space-separated');

  const getFormattedContent = (): string => {
    if (selectedPages.length === 0) return '';

    switch (selectedFormat) {
      case 'titles':
        return selectedPages.map(page => page.title).join('\n');
      case 'paths': {
        const paths = selectedPages.map(page => quotePathForUnix(getPagePath(page)));
        return pathsVariant === 'space-separated' ? paths.join(' ') : paths.join('\n');
      }
      case 'json': {
        const details = selectedPages.map(presentSitePageDetails);
        return JSON.stringify(details, null, 2);
      }
      case 'yaml':
        return selectedPages.map(page => formatPageDetailsAsYaml(presentSitePageDetails(page))).join('\n');
    }
  };

  const handleCopy = () => {
    const content = getFormattedContent();
    window.navigator.clipboard.writeText(content);
    onClose();
  };

  const formats: { id: CopyFormat; label: string }[] = [
    { id: 'titles', label: 'Titles' },
    { id: 'paths', label: 'Paths' },
    { id: 'json', label: 'JSON' },
    { id: 'yaml', label: 'YAML' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Copy Selected Pages"
      className="w-[600px] max-w-[90vw]"
    >
      <div className="flex flex-col gap-4">
        {/* Format selection */}
        <div className="flex gap-2">
          {formats.map(format => (
            <button
              key={format.id}
              onClick={() => setSelectedFormat(format.id)}
              className={`px-3 py-1.5 text-sm rounded border ${
                selectedFormat === format.id
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
              }`}
            >
              {format.label}
            </button>
          ))}
        </div>

        {/* Paths variant options */}
        {selectedFormat === 'paths' && (
          <div className="flex items-center gap-4 text-sm text-neutral-600">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="pathsVariant"
                checked={pathsVariant === 'space-separated'}
                onChange={() => setPathsVariant('space-separated')}
                className="cursor-pointer"
              />
              Space-separated
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="pathsVariant"
                checked={pathsVariant === 'separate-lines'}
                onChange={() => setPathsVariant('separate-lines')}
                className="cursor-pointer"
              />
              Separate lines
            </label>
          </div>
        )}

        {/* Preview */}
        <div className="flex-1 min-h-0">
          <div className="text-xs text-neutral-500 mb-1">Preview:</div>
          <pre className="p-3 bg-neutral-100 text-neutral-700 text-xs rounded font-mono whitespace-pre-wrap overflow-auto max-h-[300px] border border-neutral-200">
            {getFormattedContent()}
          </pre>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={handleCopy}
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Copy
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default CopySelectedPagesModal;
