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

interface SaveLocallyTabProps {
  siteSlug: string;
}

interface LocalPaths {
  rawMarkdown: string;
  previewHtml: string;
}

export const SaveLocallyTab: React.FC<SaveLocallyTabProps> = ({ siteSlug }) => {
  const [paths, setPaths] = useState<LocalPaths | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const handleSaveToDisk = async (type: 'raw' | 'html') => {
    setLoading(true);
    setMessage(null);

    try {
      const result = await window.electronAPI?.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: `Select destination for ${type === 'raw' ? 'Tracked Raw Markdown' : 'Rendered Site'}`
      });

      if (result?.canceled || !result?.filePaths?.[0]) {
        setLoading(false);
        return;
      }

      const destinationPath = result.filePaths[0];

      // Perform the export — backend handles non-empty folders by creating a slug subfolder
      const response = await fetch(`${API_BASE_URL}/site/${siteSlug}/copy-to-directory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType: type, destinationPath })
      });

      if (response.ok) {
        const { exportPath } = await response.json();
        setMessage({ type: 'success', text: `Files exported successfully to ${exportPath}` });
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.error || 'Export failed' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${error}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAsZip = async (type: 'raw' | 'html') => {
    setLoading(true);
    setMessage(null);

    try {
      const defaultName = type === 'raw' ? `${siteSlug}-raw.zip` : `${siteSlug}-html.zip`;

      const result = await window.electronAPI?.showSaveDialog({
        title: `Save ${type === 'raw' ? 'Tracked Raw Markdown' : 'Rendered Site'} as ZIP`,
        defaultPath: defaultName,
        filters: [{ name: 'ZIP files', extensions: ['zip'] }]
      });

      if (result?.canceled || !result?.filePath) {
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/site/${siteSlug}/create-zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType: type, destinationPath: result.filePath })
      });

      if (response.ok) {
        await response.json();
        setMessage({ type: 'success', text: 'Zip exported successfully!' });
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.error || 'ZIP creation failed' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${error}` });
    } finally {
      setLoading(false);
    }
  };

  const rows = [
    { label: 'Tracked Raw Markdown', type: 'raw' as const },
    { label: 'Rendered Site', type: 'html' as const },
  ];

  return (
    <div className="h-full flex flex-col p-4">
      <div className="text-sm font-medium text-neutral-700 mb-4">
        Export site content to your local file system
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded ${message.type === 'success' ? 'bg-success-50 text-success-800' : 'bg-danger-50 text-danger-800'}`}>
          {message.text}
        </div>
      )}

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-neutral-200">
            <th className="text-left py-2 px-3 text-sm font-medium text-neutral-600">Content Type</th>
            <th className="text-center py-2 px-3 text-sm font-medium text-neutral-600">Export to Disk</th>
            <th className="text-center py-2 px-3 text-sm font-medium text-neutral-600">Export as .zip</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.type} className="border-b border-neutral-100">
              <td className="py-3 px-3 text-sm text-neutral-700">{row.label}</td>
              <td className="py-3 px-3 text-center">
                <button
                  onClick={() => handleSaveToDisk(row.type)}
                  disabled={loading || !paths}
                  className="text-xl hover:opacity-70 disabled:opacity-30"
                  title={`Export ${row.label} files to a folder`}
                >
                  💾
                </button>
              </td>
              <td className="py-3 px-3 text-center">
                <button
                  onClick={() => handleSaveAsZip(row.type)}
                  disabled={loading || !paths}
                  className="text-xl hover:opacity-70 disabled:opacity-30"
                  title={`Save ${row.label} as ZIP file`}
                >
                  📦
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {loading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-neutral-500">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-main-500 border-t-transparent" />
          Processing...
        </div>
      )}
    </div>
  );
};
