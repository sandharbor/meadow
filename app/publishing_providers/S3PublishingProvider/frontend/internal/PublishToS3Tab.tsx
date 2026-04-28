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
import type { PublishTabProps } from '../../../../frontend/src/publishing/IPublishingProviderFrontend';
import { logger } from '../../../../frontend/src/utils/logger';
import { openExternal } from '../../../../frontend/src/utils/openExternal';
import { s3Api } from './s3Api';
import { S3ConfigurationSection } from './S3ConfigurationSection';

const SLUG_PATTERN = /^[a-z0-9-]+$/;

interface FileCounts {
  htmlCount: number;
  otherCount: number;
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

export const PublishToS3Tab: React.FC<PublishTabProps> = ({ siteSlug, onBusyChange, onPublishSuccess }) => {
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
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(s3Api(`sites/${siteSlug}/provider-config`));
      if (!res.ok) return;
      const body = await res.json() as { publishSlug?: string | null };
      const value = body.publishSlug ?? '';
      setPublishSlug(value);
      setDraftSlug(value || siteSlug);
    } catch (err) {
      logger.error('[S3PublishingProvider] failed to load site config:', err);
    }
  }, [siteSlug]);

  const loadFileCounts = useCallback(async () => {
    try {
      const res = await fetch(s3Api(`sites/${siteSlug}/published-file-counts`));
      if (!res.ok) return;
      const body = await res.json() as FileCounts;
      setFileCounts(body);
      setHasPublishedFiles(body.htmlCount > 0 || body.otherCount > 0);
    } catch (err) {
      logger.error('[S3PublishingProvider] failed to load file counts:', err);
    }
  }, [siteSlug]);

  useEffect(() => {
    loadConfig();
    loadFileCounts();
  }, [loadConfig, loadFileCounts]);

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
    setIsSaving(true);
    try {
      const res = await fetch(s3Api(`sites/${siteSlug}/provider-config`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publishSlug: draftSlug }),
      });
      if (!res.ok) {
        setError(await readError(res, 'Failed to save publishSlug'));
        return;
      }
      const body = await res.json() as { publishSlug: string };
      setPublishSlug(body.publishSlug);
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
      const res = await fetch(s3Api(`sites/${siteSlug}/publish`), { method: 'POST' });
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
      const res = await fetch(s3Api(`sites/${siteSlug}/published`), { method: 'DELETE' });
      if (!res.ok) {
        setError(await readError(res, `Delete failed (${res.status})`));
        return;
      }
      setPublishedUrl(null);
      setFilesUploaded(null);
      setHasPublishedFiles(false);
      setFileCounts({ htmlCount: 0, otherCount: 0 });
    } catch (err) {
      logger.error('[S3PublishingProvider] delete-published failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeleting(false);
    }
  };

  const slugChanged = draftSlug !== publishSlug;
  const canPublish = !!publishSlug && !slugChanged && !isSaving && !isPublishing && !isDeleting;
  const canOpenSettings = !!publishSlug;

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
                Delete site&apos;s published files
              </button>
            </div>
          )}
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold">Publish to S3</h3>
        <p className="text-sm text-neutral-600">
          Uploads the current preview to an S3-compatible bucket. Set a publish slug — files
          land under <code>{'<bucket>/<publishSlug>/...'}</code>.
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
            onChange={(e) => setDraftSlug(e.target.value)}
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
        onClick={handlePublish}
        disabled={!canPublish}
        className="px-4 py-2 bg-main-600 text-white rounded disabled:bg-neutral-300"
      >
        {isPublishing ? 'Publishing…' : 'Publish'}
      </button>

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
              Delete site&apos;s published files?
            </h3>
            <p className="text-sm text-neutral-600 mb-4">
              This will permanently remove every object under <code>{publishSlug}/</code> from
              the configured S3 bucket.
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
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
