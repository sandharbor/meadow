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

import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../utils/apiConfig';
import { logger } from '../utils/logger';

interface AdvancedTabProps {
  siteSlug: string;
}

interface LocalPaths {
  appConfigFile: string;
  rawMarkdown: string;
  previewHtml: string;
  siteConfigFile: string;
  sitePageConfigFile: string;
}

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await window.navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      logger.error('Failed to copy to clipboard');
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-2 px-2 py-0.5 text-xs rounded border border-neutral-300 text-neutral-600 hover:bg-neutral-100 transition-colors shrink-0"
      title="Copy path to clipboard"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
};

export const AdvancedTab: React.FC<AdvancedTabProps> = ({ siteSlug }) => {
  const [paths, setPaths] = useState<LocalPaths | null>(null);

  useEffect(() => {
    const fetchPaths = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/site/${siteSlug}/local-paths`);
        if (response.ok) {
          setPaths(await response.json());
        }
      } catch (error) {
        logger.error('Failed to fetch paths:', error);
      }
    };
    fetchPaths();
  }, [siteSlug]);

  if (!paths) {
    return (
      <div className="p-4 text-sm text-neutral-500">Loading paths...</div>
    );
  }

  const pathRows = [
    { label: 'App Config', path: paths.appConfigFile },
    { label: 'Site Config', path: paths.siteConfigFile },
    { label: 'Site Page Config', path: paths.sitePageConfigFile },
    { label: 'Raw Markdown', path: paths.rawMarkdown },
    { label: 'Rendered Preview Site', path: paths.previewHtml },
  ];

  return (
    <div className="h-full flex flex-col p-4">
      <div className="text-sm font-medium text-neutral-700 mb-4">
        File paths for use in scripts and external tools
      </div>

      <div className="space-y-3">
        {pathRows.map((row) => (
          <div key={row.label}>
            <div className="text-xs font-medium text-neutral-500 mb-1">{row.label}</div>
            <div className="flex items-center bg-neutral-50 rounded border border-neutral-200 px-3 py-2">
              <code className="text-sm text-neutral-700 break-all min-w-0 flex-1">&quot;{row.path}&quot;</code>
              <CopyButton text={`"${row.path}"`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
