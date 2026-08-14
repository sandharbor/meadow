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
import Modal from '../components/Modal';
import { API_BASE_URL } from '../utils/apiConfig';
import { getActiveFrontendProvider } from '../publishing-provider-host/providerRegistry';
import { logger } from '../utils/logger';

interface DeleteBundleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
  bundleSlug: string;
  isPublished: boolean;
}

const DeleteBundleModal: React.FC<DeleteBundleModalProps> = ({
  isOpen,
  onClose,
  onDeleted,
  bundleSlug,
  isPublished,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ stage: string; message: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [fileCounts, setFileCounts] = useState<{ htmlCount: number; otherCount: number } | null>(null);
  const [isLoadingFileCounts, setIsLoadingFileCounts] = useState(false);

  // Load file counts when modal opens for published bundles; reset on close
  useEffect(() => {
    if (isOpen && isPublished && bundleSlug) {
      setIsLoadingFileCounts(true);
      getActiveFrontendProvider()
        .then((provider) => {
          if (!provider?.fetchPublishedFileCounts) {
            setIsLoadingFileCounts(false);
            return;
          }
          return provider.fetchPublishedFileCounts(bundleSlug)
            .then((counts) => setFileCounts(counts))
            .catch((err) => logger.error('Failed to load published file counts:', err))
            .finally(() => setIsLoadingFileCounts(false));
        });
    }
    if (!isOpen) {
      setIsDeleting(false);
      setDeleteProgress(null);
      setDeleteError(null);
      setFileCounts(null);
      setIsLoadingFileCounts(false);
    }
  }, [isOpen, isPublished, bundleSlug]);

  const handleDelete = async () => {
    if (!isPublished) {
      try {
        await fetch(`${API_BASE_URL}/bundles/${bundleSlug}`, { method: 'DELETE' });
        onDeleted();
      } catch (err) {
        logger.error('Failed to delete bundle:', err);
        setDeleteError('Failed to delete bundle');
      }
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const eventSource = new EventSource(`${API_BASE_URL}/bundles/${bundleSlug}/delete-bundle-stream`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setDeleteProgress({ stage: data.stage, message: data.message });

        if (data.stage === 'complete') {
          eventSource.close();
          if (data.result?.warning) {
            logger.warn('Bundle deletion warning:', data.result.warning);
          }
          onDeleted();
        } else if (data.stage === 'error') {
          eventSource.close();
          setIsDeleting(false);
          setDeleteError(data.result?.error || data.message);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        setIsDeleting(false);
        setDeleteError('Connection lost during deletion');
      };
    } catch (err) {
      logger.error('Failed to start bundle deletion:', err);
      setIsDeleting(false);
      setDeleteError('Failed to start deletion');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isDeleting ? () => {} : onClose}
      title="Delete Bundle"
      className="w-1/3 max-w-md h-auto"
    >
      <div className="space-y-4">
        {isDeleting && deleteProgress ? (
          <div className="flex items-center space-x-3">
            <div className="animate-spin h-5 w-5 border-2 border-red-300 border-t-red-600 rounded-full"></div>
            <p className="text-gray-700">{deleteProgress.message}</p>
          </div>
        ) : (
          <>
            <p className="text-gray-700">
              Everything about this bundle will be deleted. Are you sure you want to do that?
            </p>
            {isPublished && (
              <aside data-callout="warning" className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                This bundle has been published. Both local files and published files on the web will be deleted.
                {isLoadingFileCounts && (
                  <span className="block mt-1 text-amber-600">Loading file counts...</span>
                )}
                {fileCounts && (fileCounts.htmlCount > 0 || fileCounts.otherCount > 0) && (
                  <span className="block mt-1">
                    This includes <strong>{fileCounts.htmlCount} page{fileCounts.htmlCount !== 1 ? 's' : ''}</strong> and <strong>{fileCounts.otherCount} other file{fileCounts.otherCount !== 1 ? 's' : ''}</strong> published to the web.
                  </span>
                )}
              </aside>
            )}
            <p className="text-sm text-gray-500">
              Bundle: <strong>{bundleSlug}</strong>
            </p>
            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {deleteError}
              </p>
            )}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default DeleteBundleModal;
