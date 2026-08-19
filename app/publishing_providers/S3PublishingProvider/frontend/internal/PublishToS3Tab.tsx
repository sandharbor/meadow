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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PublishTabProps } from '../../../../frontend/src/shared/publishing-provider-host/IPublishingProviderFrontend';
import { logger } from '../../../../frontend/src/shared/utils/logger';
import { apiRequest } from '../../../../frontend/src/shared/utils/apiClient';
import { openExternal } from '../../../../frontend/src/shared/utils/openExternal';
import { s3Api } from './s3Api';
import { S3ConfigurationSection } from './S3ConfigurationSection';

const SLUG_PATTERN = /^[a-z0-9-]+$/;

interface FileCounts {
  htmlCount: number;
  otherCount: number;
}

interface PublicationStateView {
  status: { kind: 'not-published' | 'published-current' | 'update-available' | 'imported-unknown' | 'removed' };
  events: Array<{ eventType: string; versionId: string; timestamp: string; publicUrl?: string }>;
  remotelyPresentVersionIds: string[];
}

export function s3PublishAction(statusKind: PublicationStateView['status']['kind']): {
  label: string;
  requiresConfirmation: boolean;
} {
  const requiresConfirmation = statusKind === 'update-available' || statusKind === 'imported-unknown';
  return {
    requiresConfirmation,
    label: statusKind === 'published-current'
      ? 'Republish'
      : requiresConfirmation ? 'Update Published Version…' : 'Publish',
  };
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string' && body.error) return body.error;
  } catch {
    // fall through
  }
  return fallback;
}

export const PublishToS3Tab: React.FC<PublishTabProps> = ({ bundleSlug, selectedVersionId, onBusyChange, onPublishSuccess, onViewChanges }) => {
  const [publishSlug, setPublishSlug] = useState('');
  const [draftSlug, setDraftSlug] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfigSaving, setIsConfigSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [filesUploaded, setFilesUploaded] = useState<number | null>(null);
  const [hasPublishedFiles, setHasPublishedFiles] = useState(false);
  const [fileCounts, setFileCounts] = useState<FileCounts | null>(null);
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [publicationState, setPublicationState] = useState<PublicationStateView | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const configRevisionRef = useRef(0);

  const loadConfig = useCallback(async () => {
    const requestRevision = configRevisionRef.current;
    try {
      const res = await apiRequest(s3Api(`bundles/${bundleSlug}/provider-config`));
      if (!res.ok) return;
      const body = await res.json() as { publishSlug?: string | null };
      if (requestRevision !== configRevisionRef.current) return;
      const value = body.publishSlug ?? '';
      setPublishSlug(value);
      setDraftSlug(value || bundleSlug);
    } catch (err) {
      logger.error('[S3PublishingProvider] failed to load bundle config:', err);
    }
  }, [bundleSlug]);

  const loadFileCounts = useCallback(async () => {
    try {
      const res = await apiRequest(s3Api(`bundles/${bundleSlug}/published-file-counts`));
      if (!res.ok) return;
      const body = await res.json() as FileCounts;
      setFileCounts(body);
      setHasPublishedFiles(body.htmlCount > 0 || body.otherCount > 0);
    } catch (err) {
      logger.error('[S3PublishingProvider] failed to load file counts:', err);
    }
  }, [bundleSlug]);

  const loadPublicationState = useCallback(async () => {
    if (!selectedVersionId) return;
    try {
      const query = new URLSearchParams({ versionId: selectedVersionId });
      const res = await apiRequest(s3Api(`bundles/${bundleSlug}/publication-state?${query}`));
      if (!res.ok) return;
      const body = await res.json() as PublicationStateView;
      setPublicationState(body);
      setHasPublishedFiles(body.remotelyPresentVersionIds.includes(selectedVersionId));
    } catch (err) {
      logger.error('[S3PublishingProvider] failed to load publication state:', err);
    }
  }, [bundleSlug, selectedVersionId]);

  useEffect(() => {
    loadConfig();
    loadFileCounts();
  }, [loadConfig, loadFileCounts]);

  // A selected-version change only affects publication state. Reloading the
  // bundle config here can race a publish-slug edit and replace the draft (or
  // even the value returned by a successful save) with an older GET result.
  useEffect(() => {
    loadPublicationState();
  }, [loadPublicationState]);

  useEffect(() => {
    onBusyChange(isSaving || isPublishing || isDeleting || isConfigSaving);
  }, [isSaving, isPublishing, isDeleting, isConfigSaving, onBusyChange]);

  useEffect(() => {
    if (!settingsDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) {
        setSettingsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [settingsDropdownOpen]);

  const handleSaveSlug = async () => {
    setError(null);
    if (!SLUG_PATTERN.test(draftSlug)) {
      setError('publishSlug must contain only lowercase letters, numbers, and dashes');
      return;
    }
    // Invalidate any config GET that began before this user edit/save. A slow
    // initial response must not overwrite a successfully persisted slug.
    const saveRevision = ++configRevisionRef.current;
    setIsSaving(true);
    try {
      const res = await apiRequest(s3Api(`bundles/${bundleSlug}/provider-config`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publishSlug: draftSlug }),
      });
      if (!res.ok) {
        setError(await readError(res, 'Failed to save publishSlug'));
        return;
      }
      const body = await res.json() as { publishSlug: string };
      if (saveRevision !== configRevisionRef.current) return;
      setPublishSlug(body.publishSlug);
      setDraftSlug(body.publishSlug);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    setError(null);
    setPublishedUrl(null);
    setFilesUploaded(null);
    setIsPublishing(true);
    try {
      const res = await apiRequest(s3Api(`bundles/${bundleSlug}/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: selectedVersionId }),
      });
      if (!res.ok) {
        setError(await readError(res, `Publish failed (${res.status})`));
        return;
      }
      const body = await res.json() as {
        success?: boolean;
        publishedUrl?: string;
        filesUploaded?: number;
      };
      setPublishedUrl(body.publishedUrl ?? null);
      setFilesUploaded(body.filesUploaded ?? null);
      if (body.success) onPublishSuccess?.();
      await loadFileCounts();
      await loadPublicationState();
    } catch (err) {
      logger.error('[S3PublishingProvider] publish failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    setError(null);
    setIsDeleting(true);
    try {
      const res = await apiRequest(s3Api(`bundles/${bundleSlug}/published`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: selectedVersionId }),
      });
      if (!res.ok) {
        setError(await readError(res, `Delete failed (${res.status})`));
        return;
      }
      setPublishedUrl(null);
      setFilesUploaded(null);
      setHasPublishedFiles(false);
      setFileCounts({ htmlCount: 0, otherCount: 0 });
      await loadPublicationState();
    } catch (err) {
      logger.error('[S3PublishingProvider] delete-published failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeleting(false);
    }
  };

  const slugChanged = draftSlug !== publishSlug;
  const canPublish = !!selectedVersionId && !!publishSlug && !slugChanged && !isSaving && !isPublishing && !isDeleting;
  const canOpenSettings = !!publishSlug;
  const statusKind = publicationState?.status.kind ?? 'not-published';
  const { label: publishButtonLabel, requiresConfirmation: requiresUpdateConfirmation } = s3PublishAction(statusKind);

  return (
    <div data-testid="s3-publish-tab" className="h-full overflow-y-auto p-4 space-y-4 relative">
      {canOpenSettings && (
        <div className="absolute top-2 right-2" ref={settingsMenuRef}>
          <button
            data-testid="s3-settings-button"
            onClick={() => setSettingsDropdownOpen((v) => !v)}
            disabled={isDeleting}
            className="text-neutral-400 hover:text-neutral-600 p-1 rounded hover:bg-neutral-100 disabled:opacity-50"
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          {settingsDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[220px]">
              <button
                data-testid="s3-delete-published-option"
                disabled={!hasPublishedFiles}
                onClick={() => {
                  setSettingsDropdownOpen(false);
                  setShowDeleteConfirm(true);
                }}
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:text-neutral-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              >
                Delete bundle&apos;s published files
              </button>
            </div>
          )}
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold">Publish to S3</h3>
        <p className="text-sm text-neutral-600">
          Publishes the selected saved version to an S3-compatible bucket. Files land under
          <code>{'<bucket>/<publishSlug>-<versionId>/...'}</code>.
        </p>
      </div>

      <S3ConfigurationSection onBusyChange={setIsConfigSaving} />

      <div className="space-y-2">
        <label htmlFor="s3-publish-slug" className="block text-sm font-medium">
          Publish slug
        </label>
        <div className="flex items-center gap-2">
          <input
            id="s3-publish-slug"
            data-testid="s3-publish-slug-input"
            className="border border-neutral-300 rounded px-2 py-1 text-sm"
            value={draftSlug}
            onChange={(e) => {
              configRevisionRef.current += 1;
              setDraftSlug(e.target.value);
            }}
            disabled={isSaving || isPublishing || isDeleting}
          />
          <button
            data-testid="s3-save-slug"
            onClick={handleSaveSlug}
            disabled={!slugChanged || isSaving}
            className="px-3 py-1 text-sm bg-main-600 text-white rounded disabled:bg-neutral-300"
          >
            {isSaving ? 'Saving…' : slugChanged ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>

      <button
        data-testid="s3-publish-button"
        onClick={() => requiresUpdateConfirmation ? setShowUpdateConfirm(true) : void handlePublish()}
        disabled={!canPublish}
        className="px-4 py-2 bg-main-600 text-white rounded disabled:bg-neutral-300"
      >
        {isPublishing ? 'Publishing…' : publishButtonLabel}
      </button>

      {selectedVersionId && publicationState && (
        <div className="rounded border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <div className="font-medium text-neutral-800">
            {publicationState.status.kind === 'published-current' ? 'Published'
              : publicationState.status.kind === 'update-available' ? 'Update available'
                : publicationState.status.kind === 'imported-unknown' ? 'Published — freshness unknown'
                  : publicationState.status.kind === 'removed' ? 'Removed from this destination'
                    : 'Not published to this destination'}
          </div>
          <details className="mt-2 text-xs text-neutral-600">
            <summary className="cursor-pointer">Successful publication history ({publicationState.events.filter(event => event.eventType !== 'remote-deletion-success').length})</summary>
            <ul className="mt-2 space-y-1">
              {publicationState.events.map((event, index) => (
                <li key={`${event.timestamp}-${index}`}>{new Date(event.timestamp).toLocaleString()} — {event.eventType} — {event.versionId}</li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {error && (
        <p data-testid="s3-publish-error" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {publishedUrl && !error && (
        <p data-testid="s3-publish-success" className="text-sm text-green-700">
          Published to{' '}
          <a
            href={publishedUrl}
            onClick={(e) => {
              e.preventDefault();
              void openExternal(publishedUrl, 's3Publish');
            }}
            className="underline"
          >
            {publishedUrl}
          </a>
          {filesUploaded !== null && ` (${filesUploaded} files)`}
        </p>
      )}
      {isDeleting && (
        <p data-testid="s3-delete-status" className="text-sm text-neutral-600">
          Deleting published files…
        </p>
      )}

      {showDeleteConfirm && (
        <div
          data-testid="s3-delete-confirm"
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        >
          <div
            className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2 text-neutral-800">
              Delete selected remote version?
            </h3>
            <p className="text-sm text-neutral-600 mb-4">
              This removes remote files for <code>{selectedVersionId}</code> from this S3 destination.
              {fileCounts && (fileCounts.htmlCount > 0 || fileCounts.otherCount > 0) && (
                <> This includes <strong>{fileCounts.htmlCount} page{fileCounts.htmlCount !== 1 ? 's' : ''}</strong>
                {' '}and <strong>{fileCounts.otherCount} other file{fileCounts.otherCount !== 1 ? 's' : ''}</strong>.</>
              )}
              {' '}Your local files will not be affected.
            </p>
            <div className="flex justify-end gap-3">
              <button
                data-testid="s3-delete-cancel"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-800 rounded border border-neutral-300 hover:border-neutral-400"
              >
                Cancel
              </button>
              <button
                data-testid="s3-delete-confirm-button"
                onClick={handleDelete}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded font-medium"
              >
                Delete Remote Files
              </button>
            </div>
          </div>
        </div>
      )}
      {showUpdateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-neutral-800">Update existing version URLs?</h3>
            <p className="mb-4 text-sm text-neutral-600">
              This saved generation differs from the last known publication. Updating changes the content served at the existing version URLs. Create a new version in Review if those URLs should keep their current content.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowUpdateConfirm(false)} className="rounded bg-neutral-200 px-4 py-2 text-sm">Cancel</button>
              <button
                onClick={() => { setShowUpdateConfirm(false); onViewChanges(); }}
                className="rounded bg-btn-standard-normal px-4 py-2 text-sm text-btn-standard-text"
              >
                Create New Version
              </button>
              <button
                onClick={() => { setShowUpdateConfirm(false); void handlePublish(); }}
                className="rounded bg-main-600 px-4 py-2 text-sm text-white"
              >
                Update Published Version
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
