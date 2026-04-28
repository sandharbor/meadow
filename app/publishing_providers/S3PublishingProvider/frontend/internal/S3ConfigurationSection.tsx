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

import React, { useCallback, useEffect, useState } from 'react';
import { logger } from '../../../../frontend/src/utils/logger';
import { s3Api } from './s3Api';

interface S3Configuration {
  s3BucketName: string;
  s3Region: string;
  s3Endpoint: string;
  s3ForcePathStyle: boolean;
  webBaseUrl: string;
  s3AccessKeyId: string;
  hasSecretAccessKey: boolean;
}

const EMPTY_CONFIG: S3Configuration = {
  s3BucketName: '',
  s3Region: '',
  s3Endpoint: '',
  s3ForcePathStyle: false,
  webBaseUrl: '',
  s3AccessKeyId: '',
  hasSecretAccessKey: false,
};

const PLACEHOLDER_SECRET = '••••••••••••••••';

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string' && body.error) return body.error;
  } catch {
    // fall through
  }
  return fallback;
}

interface S3ConfigurationSectionProps {
  /** Notify parent so it can disable the publish button while a save is in flight. */
  onBusyChange?: (busy: boolean) => void;
}

export const S3ConfigurationSection: React.FC<S3ConfigurationSectionProps> = ({ onBusyChange }) => {
  const [saved, setSaved] = useState<S3Configuration>(EMPTY_CONFIG);
  const [draft, setDraft] = useState<S3Configuration>(EMPTY_CONFIG);
  const [draftSecret, setDraftSecret] = useState<string>('');
  const [secretTouched, setSecretTouched] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const isEmpty = useCallback((cfg: S3Configuration) => {
    return !cfg.s3BucketName && !cfg.s3AccessKeyId && !cfg.hasSecretAccessKey;
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(s3Api('configuration'));
      if (!res.ok) {
        setError(await readError(res, `Failed to load configuration (${res.status})`));
        return;
      }
      const body = (await res.json()) as S3Configuration;
      setSaved(body);
      setDraft(body);
      setDraftSecret('');
      setSecretTouched(false);
      setShowSecret(false);
      setExpanded(isEmpty(body));
    } catch (err) {
      logger.error('[S3PublishingProvider] failed to load configuration:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [isEmpty]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    onBusyChange?.(isSaving);
  }, [isSaving, onBusyChange]);

  const handleRevealSecret = async () => {
    if (showSecret) {
      setShowSecret(false);
      if (!secretTouched) setDraftSecret('');
      return;
    }
    if (secretTouched) {
      setShowSecret(true);
      return;
    }
    if (!saved.hasSecretAccessKey) {
      setShowSecret(true);
      return;
    }
    setIsRevealing(true);
    setError(null);
    try {
      const res = await fetch(s3Api('configuration/secret'));
      if (!res.ok) {
        setError(await readError(res, `Failed to reveal secret (${res.status})`));
        return;
      }
      const body = (await res.json()) as { s3SecretAccessKey: string };
      setDraftSecret(body.s3SecretAccessKey);
      setShowSecret(true);
    } catch (err) {
      logger.error('[S3PublishingProvider] failed to reveal secret:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRevealing(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    setStatusMessage(null);
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        s3BucketName: draft.s3BucketName,
        s3Region: draft.s3Region,
        s3Endpoint: draft.s3Endpoint,
        s3ForcePathStyle: draft.s3ForcePathStyle,
        webBaseUrl: draft.webBaseUrl,
        s3AccessKeyId: draft.s3AccessKeyId,
      };
      if (secretTouched) {
        payload.s3SecretAccessKey = draftSecret;
      }
      const res = await fetch(s3Api('configuration'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await readError(res, `Failed to save configuration (${res.status})`));
        return;
      }
      const body = (await res.json()) as S3Configuration;
      setSaved(body);
      setDraft(body);
      setDraftSecret('');
      setSecretTouched(false);
      setShowSecret(false);
      setStatusMessage('Saved');
      window.setTimeout(() => setStatusMessage(null), 2500);
      if (!isEmpty(body)) {
        setExpanded(false);
      }
    } catch (err) {
      logger.error('[S3PublishingProvider] failed to save configuration:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(saved);
    setDraftSecret('');
    setSecretTouched(false);
    setShowSecret(false);
    setError(null);
    setStatusMessage(null);
    if (!isEmpty(saved)) setExpanded(false);
  };

  const dirty =
    secretTouched ||
    draft.s3BucketName !== saved.s3BucketName ||
    draft.s3Region !== saved.s3Region ||
    draft.s3Endpoint !== saved.s3Endpoint ||
    draft.s3ForcePathStyle !== saved.s3ForcePathStyle ||
    draft.webBaseUrl !== saved.webBaseUrl ||
    draft.s3AccessKeyId !== saved.s3AccessKeyId;

  const summary = isEmpty(saved)
    ? 'Not configured'
    : `${saved.s3BucketName || '(no bucket)'}${saved.s3Region ? ` · ${saved.s3Region}` : ''}${saved.hasSecretAccessKey ? ' · credentials saved' : ' · no credentials'}`;

  if (isLoading) {
    return (
      <div data-testid="s3-config-section" className="border border-neutral-200 rounded p-3 text-sm text-neutral-500">
        Loading configuration…
      </div>
    );
  }

  const inputClass =
    'w-full border border-neutral-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-main-500 disabled:bg-neutral-100';
  const labelClass = 'block text-xs font-medium text-neutral-700 mb-1';

  const secretFieldValue = showSecret
    ? draftSecret
    : secretTouched
      ? draftSecret
      : saved.hasSecretAccessKey
        ? PLACEHOLDER_SECRET
        : '';

  return (
    <div data-testid="s3-config-section" className="border border-neutral-200 rounded">
      <button
        type="button"
        data-testid="s3-config-toggle"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-neutral-50"
      >
        <span className="flex items-center gap-2">
          <span
            className={`inline-block transition-transform ${expanded ? 'rotate-90' : ''}`}
            aria-hidden="true"
          >
            ▶
          </span>
          <span className="font-medium">S3 configuration</span>
          {!expanded && (
            <span className="text-neutral-500" data-testid="s3-config-summary">
              {summary}
            </span>
          )}
        </span>
        {!expanded && !isEmpty(saved) && (
          <span className="text-xs text-main-600">Edit</span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-neutral-200 p-3 space-y-3">
          <div>
            <label htmlFor="s3-bucket-name" className={labelClass}>
              Bucket name
            </label>
            <input
              id="s3-bucket-name"
              data-testid="s3-bucket-name"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={draft.s3BucketName}
              onChange={(e) => setDraft({ ...draft, s3BucketName: e.target.value })}
              disabled={isSaving}
              className={inputClass}
              placeholder="my-bucket"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="s3-region" className={labelClass}>
                Region
              </label>
              <input
                id="s3-region"
                data-testid="s3-region"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={draft.s3Region}
                onChange={(e) => setDraft({ ...draft, s3Region: e.target.value })}
                disabled={isSaving}
                className={inputClass}
                placeholder="us-east-1"
              />
            </div>
            <div>
              <label htmlFor="s3-web-base-url" className={labelClass}>
                Web base URL
              </label>
              <input
                id="s3-web-base-url"
                data-testid="s3-web-base-url"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={draft.webBaseUrl}
                onChange={(e) => setDraft({ ...draft, webBaseUrl: e.target.value })}
                disabled={isSaving}
                className={inputClass}
                placeholder="https://cdn.example.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="s3-access-key-id" className={labelClass}>
              Access key id
            </label>
            <input
              id="s3-access-key-id"
              data-testid="s3-access-key-id"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={draft.s3AccessKeyId}
              onChange={(e) => setDraft({ ...draft, s3AccessKeyId: e.target.value })}
              disabled={isSaving}
              className={inputClass}
              placeholder="AKIA…"
            />
          </div>

          <div>
            <label htmlFor="s3-secret-access-key" className={labelClass}>
              Secret access key
            </label>
            <div className="flex items-center gap-2">
              <input
                id="s3-secret-access-key"
                data-testid="s3-secret-access-key"
                type={showSecret ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                value={secretFieldValue}
                onChange={(e) => {
                  setDraftSecret(e.target.value);
                  setSecretTouched(true);
                }}
                onFocus={() => {
                  if (!secretTouched && saved.hasSecretAccessKey) {
                    // Clear the placeholder dots when the user starts editing
                    setDraftSecret('');
                    setSecretTouched(true);
                  }
                }}
                disabled={isSaving}
                className={inputClass}
                placeholder={saved.hasSecretAccessKey ? '' : 'Enter secret access key'}
              />
              <button
                type="button"
                data-testid="s3-secret-toggle"
                onClick={handleRevealSecret}
                disabled={isSaving || isRevealing || (!secretTouched && !saved.hasSecretAccessKey)}
                className="px-2 py-1 text-xs border border-neutral-300 rounded text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                title={showSecret ? 'Hide secret' : 'Show secret'}
              >
                {isRevealing ? '…' : showSecret ? 'Hide' : 'Show'}
              </button>
            </div>
            {!secretTouched && saved.hasSecretAccessKey && (
              <p className="text-xs text-neutral-500 mt-1">
                Stored in <code>pp_secrets.yaml</code>. Click Show to view, or type to replace.
              </p>
            )}
          </div>

          {error && (
            <p data-testid="s3-config-error" className="text-sm text-red-600">
              {error}
            </p>
          )}
          {statusMessage && (
            <p data-testid="s3-config-status" className="text-sm text-green-700">
              {statusMessage}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            {dirty && (
              <button
                type="button"
                data-testid="s3-config-cancel"
                onClick={handleCancel}
                disabled={isSaving}
                className="px-3 py-1 text-sm text-neutral-700 border border-neutral-300 rounded hover:bg-neutral-50 disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              data-testid="s3-config-save"
              onClick={handleSave}
              disabled={!dirty || isSaving}
              className="px-3 py-1 text-sm bg-main-600 text-white rounded disabled:bg-neutral-300"
            >
              {isSaving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
