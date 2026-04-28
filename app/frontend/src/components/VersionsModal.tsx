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

/* global alert, confirm */
import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../utils/apiConfig';
import { getActiveFrontendProvider } from '../publishing/providerRegistry';
import Modal from './Modal';
import { logger } from '../utils/logger';
import { openExternal } from '../utils/openExternal';

interface Version {
  versionId: string;
  firstPublishedAt: string;
  lastUpdatedAt: string;
  notes: string;
  isActive: boolean;
  url?: string;
}

interface VersionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteSlug: string;
  onVersionUpdate?: () => void;
  openedFromPreview?: boolean;
}

const VersionsModal: React.FC<VersionsModalProps> = ({ 
  isOpen, 
  onClose, 
  siteSlug,
  onVersionUpdate,
  openedFromPreview = false
}) => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState('');
  const [showNewVersionModal, setShowNewVersionModal] = useState(false);
  const [newVersionNotes, setNewVersionNotes] = useState('');
  const [addPointersToOlderVersions, setAddPointersToOlderVersions] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const loadVersions = useCallback(async () => {
    if (!siteSlug) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/site/${siteSlug}/versions`);
      if (response.ok) {
        const data = await response.json();
        const provider = await getActiveFrontendProvider();
        const fetchUrl = provider?.fetchPublishedUrl;
        const versionsWithUrls = await Promise.all(
          (data.versions || []).map(async (version: Version) => {
            if (!fetchUrl) return version;
            try {
              const url = await fetchUrl(siteSlug, version.versionId);
              return { ...version, url };
            } catch (err) {
              logger.error(`Failed to fetch URL for version ${version.versionId}:`, err);
              return version;
            }
          })
        );
        setVersions(versionsWithUrls);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to load versions');
      }
    } catch (err) {
      logger.error('Failed to load versions:', err);
      setError('Failed to load versions');
    } finally {
      setLoading(false);
    }
  }, [siteSlug]);

  useEffect(() => {
    if (isOpen) {
      loadVersions();
    }
  }, [isOpen, siteSlug, loadVersions]);

  const handleSaveNotes = async (versionId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/site/${siteSlug}/versions/${versionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: editingNotes })
      });

      if (response.ok) {
        await loadVersions();
        setEditingVersion(null);
        setEditingNotes('');
        onVersionUpdate?.();
      } else {
        const errorData = await response.json();
        alert(`Failed to update notes: ${errorData.error}`);
      }
    } catch (err) {
      logger.error('Failed to update notes:', err);
      alert('Failed to update notes');
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    if (!confirm('Are you sure you want to delete this version? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/site/${siteSlug}/versions/${versionId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadVersions();
        onVersionUpdate?.();
      } else {
        const errorData = await response.json();
        alert(`Failed to delete version: ${errorData.error}`);
      }
    } catch (err) {
      logger.error('Failed to delete version:', err);
      alert('Failed to delete version');
    }
  };

  const handleOpenVersion = async (url: string) => {
    if (url) {
      await openExternal(url, 'versionsModal');
    }
  };

  const handleCreateNewVersion = async () => {
    const provider = await getActiveFrontendProvider();
    if (!provider?.publishNewVersion) {
      alert('This publishing provider does not support versioning.');
      return;
    }
    setPublishing(true);
    try {
      await provider.publishNewVersion(siteSlug, newVersionNotes, addPointersToOlderVersions);
      await loadVersions();
      setShowNewVersionModal(false);
      setNewVersionNotes('');
      setAddPointersToOlderVersions(false);
      onVersionUpdate?.();
    } catch (err) {
      logger.error('Failed to create new version:', err);
      alert(`Failed to create new version: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleSetActiveVersion = async (versionId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/site/${siteSlug}/versions/${versionId}/set-active`, {
        method: 'POST'
      });

      if (response.ok) {
        await loadVersions();
        onVersionUpdate?.();
      } else {
        const errorData = await response.json();
        alert(`Failed to set active version: ${errorData.error}`);
      }
    } catch (err) {
      logger.error('Failed to set active version:', err);
      alert('Failed to set active version');
    }
  };

  const startEditingNotes = (version: Version) => {
    setEditingVersion(version.versionId);
    setEditingNotes(version.notes);
  };

  const cancelEditingNotes = () => {
    setEditingVersion(null);
    setEditingNotes('');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const ExternalLinkIcon = () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15,3 21,3 21,9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Versions for ${siteSlug}`}
        className="w-4/5 max-w-4xl h-4/5"
      >
        <div className="flex flex-col h-full">
          {openedFromPreview && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-purple-900 mb-1">Ready to Publish New Version?</h3>
                  <p className="text-sm text-purple-700">Create a new version from your current preview</p>
                </div>
                <button
                  onClick={() => setShowNewVersionModal(true)}
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
                >
                  Publish New Version
                </button>
              </div>
            </div>
          )}
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-2 flex-1">
                <div className="flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Why create a new version?</p>
                  <p>If you&rsquo;ve published and shared your site, creating a new version preserves existing URLs while allowing you to make significant changes. This ensures shared links continue to work while you iterate on your site.</p>
                </div>
              </div>
              {!openedFromPreview && (
                <div className="flex-shrink-0 ml-4">
                  <button
                    onClick={() => setShowNewVersionModal(true)}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"
                  >
                    Publish New Version
                  </button>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">Published Versions</h3>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-500">Loading versions...</div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-300 text-red-700 p-4 rounded mb-4">
              {error}
            </div>
          )}

          {!loading && !error && versions.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No versions published yet.
            </div>
          )}

          {!loading && !error && versions.length > 0 && (
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-4">
                {[...versions].sort((a, b) => {
                  // Active version first, then by lastUpdatedAt descending
                  if (a.isActive && !b.isActive) return -1;
                  if (!a.isActive && b.isActive) return 1;
                  return new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime();
                }).map((version) => (
                  <div
                    key={version.versionId}
                    className={`border rounded-lg p-4 ${
                      version.isActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center space-x-3">
                        <span className="font-mono text-lg font-medium">
                          {version.versionId}
                        </span>
                        {version.isActive && (
                          <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        {version.url && (
                          <button
                            onClick={() => handleOpenVersion(version.url!)}
                            className="text-green-600 hover:text-green-900 flex items-center space-x-1"
                            title="Open this version in browser"
                          >
                            <ExternalLinkIcon />
                          </button>
                        )}
                        {!version.isActive && (
                          <button
                            onClick={() => handleSetActiveVersion(version.versionId)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Set as active version"
                          >
                            ⭐
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteVersion(version.versionId)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete version"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {version.url && (
                      <div className="mb-3">
                        <span className="text-xs text-gray-400 block">Published at:</span>
                        <button
                          onClick={() => handleOpenVersion(version.url!)}
                          className="text-sm text-gray-500 hover:text-gray-700 flex items-center space-x-1"
                          title="Open this version in browser"
                        >
                          <span>{version.url}</span>
                          <ExternalLinkIcon />
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-3">
                      <div>
                        <span className="font-medium">First Published:</span>
                        <div>{formatDate(version.firstPublishedAt)}</div>
                      </div>
                      <div>
                        <span className="font-medium">Last Updated:</span>
                        <div>{formatDate(version.lastUpdatedAt)}</div>
                      </div>
                    </div>

                    <div>
                      <span className="font-medium text-sm text-gray-600">Notes:</span>
                      {editingVersion === version.versionId ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={editingNotes}
                            onChange={(e) => setEditingNotes(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 text-sm"
                            placeholder="Enter notes about this version..."
                            autoFocus
                          />
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleSaveNotes(version.versionId)}
                              className="px-3 py-1 bg-btn-confirm-normal text-btn-confirm-text text-xs rounded hover:bg-btn-confirm-hover"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEditingNotes}
                              className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div 
                          className="mt-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 p-2 rounded"
                          onClick={() => startEditingNotes(version)}
                        >
                          {version.notes || 'Click to add notes...'}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* New Version Modal */}
      <Modal
        isOpen={showNewVersionModal}
        onClose={() => setShowNewVersionModal(false)}
        title="Publish New Version"
        className="w-1/2 max-w-md h-auto"
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            {openedFromPreview 
              ? "This will create a new version from your current preview and publish it to the web."
              : "This will create a new version of your site and publish it to the web."
            }
          </p>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Version Notes
            </label>
            <textarea
              value={newVersionNotes}
              onChange={(e) => setNewVersionNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              placeholder="Describe what's new in this version..."
            />
          </div>

          <label className="flex items-start space-x-3 text-sm text-gray-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={addPointersToOlderVersions}
              onChange={(e) => setAddPointersToOlderVersions(e.target.checked)}
              disabled={publishing}
            />
            <span>
              Update older published versions with a banner linking to this new version.
              <span className="block text-xs text-gray-500 mt-1">
                If a page no longer exists in the new version, the banner will link to the initial page instead.
              </span>
            </span>
          </label>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              onClick={() => setShowNewVersionModal(false)}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              disabled={publishing}
            >
              Cancel
            </button>
            <button
              onClick={handleCreateNewVersion}
              className={`px-4 py-2 text-white rounded ${
                publishing 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-green-600 hover:bg-green-700'
              }`}
              disabled={publishing}
            >
              {publishing ? 'Publishing...' : 'Publish New Version'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default VersionsModal; 