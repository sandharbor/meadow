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

import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../../../../../shared/components/Modal';
import { API_BASE_URL } from '../../../../../shared/utils/apiConfig';
import { logger } from '../../../../../shared/utils/logger';
import type { SourcePageFileInfo } from '../../../../../../../shared_code/types/sourcePageFileInfo';

export type OpenKnowledgeFormatIndexMode = 'generated' | 'trackedPage';
export type OpenKnowledgeFormatLogMode = 'auto' | 'none' | 'trackedPage';

export interface OpenKnowledgeFormatSettings {
  index: {
    mode: OpenKnowledgeFormatIndexMode;
    sourceGraphPath: string | null;
  };
  log: {
    mode: OpenKnowledgeFormatLogMode;
    sourceGraphPath: string | null;
  };
}

interface OpenKnowledgeFormatEntryPageOptions {
  index: {
    mode: OpenKnowledgeFormatIndexMode;
    sourceGraphPath: string | null;
    defaultPage: SourcePageFileInfo | null;
    selectedPage: SourcePageFileInfo | null;
  };
  log: {
    mode: OpenKnowledgeFormatLogMode;
    sourceGraphPath: string | null;
    defaultPage: SourcePageFileInfo | null;
    selectedPage: SourcePageFileInfo | null;
  };
  pages: SourcePageFileInfo[];
  count: number;
}

interface OpenKnowledgeFormatSettingsModalProps {
  siteSlug: string;
  isOpen: boolean;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (settings: OpenKnowledgeFormatSettings) => Promise<void>;
}

const pageLabel = (page: SourcePageFileInfo | null): string => {
  if (!page) return 'No page selected';
  return page.directory ? `${page.title} (${page.directory})` : `${page.title} (root)`;
};

const pathForPage = (page: SourcePageFileInfo | null): string | null => page?.fullPath ?? null;

const getTitleHighlightParts = (title: string, query: string): Array<{ text: string; isMatch: boolean }> => {
  const q = query.trim();
  if (!q) return [{ text: title, isMatch: false }];
  const parts = q.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [{ text: title, isMatch: false }];

  const titleLower = title.toLowerCase();
  const ranges: Array<{ start: number; end: number }> = [];
  for (const part of parts) {
    const needle = part.toLowerCase();
    let from = 0;
    while (from < titleLower.length) {
      const idx = titleLower.indexOf(needle, from);
      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + needle.length });
      from = idx + Math.max(1, needle.length);
    }
  }
  if (ranges.length === 0) return [{ text: title, isMatch: false }];

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) {
      merged.push({ ...range });
    } else {
      last.end = Math.max(last.end, range.end);
    }
  }

  const result: Array<{ text: string; isMatch: boolean }> = [];
  let cursor = 0;
  for (const range of merged) {
    if (cursor < range.start) {
      result.push({ text: title.slice(cursor, range.start), isMatch: false });
    }
    result.push({ text: title.slice(range.start, range.end), isMatch: true });
    cursor = range.end;
  }
  if (cursor < title.length) {
    result.push({ text: title.slice(cursor), isMatch: false });
  }
  return result;
};

const PageOption: React.FC<{
  page: SourcePageFileInfo;
  query: string;
  onSelect: () => void;
}> = ({ page, query, onSelect }) => {
  const parts = getTitleHighlightParts(page.title, query);
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
      className="w-full rounded border border-neutral-200 bg-white p-2 text-left hover:border-main-300 hover:bg-main-50"
    >
      <div className="text-sm font-medium text-neutral-900">
        {parts.map((part, index) => part.isMatch ? (
          <span key={index} className="rounded bg-yellow-200 px-0.5">{part.text}</span>
        ) : (
          <span key={index}>{part.text}</span>
        ))}
      </div>
      <div className="text-xs text-neutral-500">{page.directory || '(root)'}</div>
    </button>
  );
};

const PagePicker: React.FC<{
  inputId: string;
  label: string;
  selectedPrefix: string;
  selectedPage: SourcePageFileInfo | null;
  query: string;
  pages: SourcePageFileInfo[];
  totalCount: number;
  isLoading: boolean;
  isSaving: boolean;
  onQueryChange: (query: string) => void;
  onSelect: (page: SourcePageFileInfo) => void;
}> = ({
  inputId,
  label,
  selectedPrefix,
  selectedPage,
  query,
  pages,
  totalCount,
  isLoading,
  isSaving,
  onQueryChange,
  onSelect,
}) => (
  <div className="mt-3 space-y-2">
    <div className="rounded border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700">
      {selectedPrefix}: <span className="font-medium">{pageLabel(selectedPage)}</span>
    </div>
    <label htmlFor={inputId} className="sr-only">{label}</label>
    <input
      id={inputId}
      type="text"
      value={query}
      onChange={(event) => onQueryChange(event.target.value)}
      placeholder="Type to search tracked pages..."
      disabled={isSaving}
      className="w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-main-500 disabled:cursor-not-allowed disabled:bg-neutral-50"
    />
    <div className="text-xs text-neutral-500">
      {isLoading ? 'Loading pages...' : `Showing ${pages.length}${totalCount > pages.length ? ` of ${totalCount}` : ''} matching pages`}
    </div>
    {pages.length > 0 ? (
      <div className="max-h-56 space-y-2 overflow-y-auto rounded border border-neutral-200 bg-neutral-50 p-2">
        {pages.map(page => (
          <PageOption
            key={page.fullPath}
            page={page}
            query={query}
            onSelect={() => onSelect(page)}
          />
        ))}
      </div>
    ) : null}
  </div>
);

const OpenKnowledgeFormatSettingsModal: React.FC<OpenKnowledgeFormatSettingsModalProps> = ({
  siteSlug,
  isOpen,
  confirmLabel,
  onClose,
  onConfirm,
}) => {
  const [indexMode, setIndexMode] = useState<OpenKnowledgeFormatIndexMode>('generated');
  const [indexSelectedPage, setIndexSelectedPage] = useState<SourcePageFileInfo | null>(null);
  const [indexQuery, setIndexQuery] = useState('');
  const [indexPages, setIndexPages] = useState<SourcePageFileInfo[]>([]);
  const [indexTotalCount, setIndexTotalCount] = useState(0);
  const [isIndexLoading, setIsIndexLoading] = useState(false);

  const [logMode, setLogMode] = useState<OpenKnowledgeFormatLogMode>('auto');
  const [logDefaultPage, setLogDefaultPage] = useState<SourcePageFileInfo | null>(null);
  const [logSelectedPage, setLogSelectedPage] = useState<SourcePageFileInfo | null>(null);
  const [logQuery, setLogQuery] = useState('');
  const [logPages, setLogPages] = useState<SourcePageFileInfo[]>([]);
  const [logTotalCount, setLogTotalCount] = useState(0);
  const [isLogLoading, setIsLogLoading] = useState(false);

  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOptions = useMemo(() => async (searchQuery: string, signal?: AbortSignal) => {
    const response = await fetch(
      `${API_BASE_URL}/sites/${siteSlug}/generation/open-knowledge-format/log-page-options?query=${encodeURIComponent(searchQuery)}&limit=25`,
      { signal }
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to load OKF page options');
    }
    return await response.json() as OpenKnowledgeFormatEntryPageOptions;
  }, [siteSlug]);

  useEffect(() => {
    if (!isOpen || !siteSlug) return;
    const controller = new AbortController();
    setIsInitialLoading(true);
    setError(null);
    setIndexQuery('');
    setLogQuery('');
    loadOptions('', controller.signal)
      .then(options => {
        setIndexMode(options.index.mode);
        setIndexSelectedPage(options.index.selectedPage);
        setIndexPages(options.pages || []);
        setIndexTotalCount(options.count || 0);

        setLogMode(options.log.mode);
        setLogDefaultPage(options.log.defaultPage);
        setLogSelectedPage(options.log.mode === 'trackedPage' ? options.log.selectedPage : options.log.defaultPage);
        setLogPages(options.pages || []);
        setLogTotalCount(options.count || 0);
      })
      .catch(err => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        logger.error('Failed to load OKF page options:', err);
        setError(err instanceof Error ? err.message : 'Failed to load OKF page options');
      })
      .finally(() => setIsInitialLoading(false));
    return () => controller.abort();
  }, [isOpen, siteSlug, loadOptions]);

  useEffect(() => {
    if (!isOpen || indexMode !== 'trackedPage') return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setIsIndexLoading(true);
      setError(null);
      loadOptions(indexQuery, controller.signal)
        .then(options => {
          setIndexPages(options.pages || []);
          setIndexTotalCount(options.count || 0);
        })
        .catch(err => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          logger.error('Failed to search OKF index pages:', err);
          setError(err instanceof Error ? err.message : 'Failed to search OKF index pages');
        })
        .finally(() => setIsIndexLoading(false));
    }, 150);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [isOpen, indexMode, indexQuery, loadOptions]);

  useEffect(() => {
    if (!isOpen || logMode !== 'trackedPage') return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setIsLogLoading(true);
      setError(null);
      loadOptions(logQuery, controller.signal)
        .then(options => {
          setLogPages(options.pages || []);
          setLogTotalCount(options.count || 0);
          setLogDefaultPage(options.log.defaultPage);
        })
        .catch(err => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          logger.error('Failed to search OKF log pages:', err);
          setError(err instanceof Error ? err.message : 'Failed to search OKF log pages');
        })
        .finally(() => setIsLogLoading(false));
    }, 150);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [isOpen, logMode, logQuery, loadOptions]);

  const canConfirm =
    (indexMode !== 'trackedPage' || !!indexSelectedPage) &&
    (logMode !== 'trackedPage' || !!logSelectedPage);

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setIsSaving(true);
    setError(null);
    try {
      await onConfirm({
        index: {
          mode: indexMode,
          sourceGraphPath: indexMode === 'trackedPage' ? pathForPage(indexSelectedPage) : null,
        },
        log: {
          mode: logMode,
          sourceGraphPath: logMode === 'trackedPage' ? pathForPage(logSelectedPage) : null,
        },
      });
      onClose();
    } catch (err) {
      logger.error('Failed to save OKF settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to save OKF settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (isSaving) return;
        onClose();
      }}
      title="Open Knowledge Format Settings"
      className="w-full max-w-3xl"
    >
      <div className="space-y-5">
        <p className="text-sm text-neutral-600">
          These settings apply to this site. Choose how OKF should fill the reserved root <code className="rounded bg-neutral-100 px-1 py-0.5">index.md</code> and <code className="rounded bg-neutral-100 px-1 py-0.5">log.md</code> files.
        </p>

        {error ? (
          <div className="rounded border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</div>
        ) : null}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-neutral-900">Root index.md</h3>
          <div className="grid gap-2">
            <label className={`rounded border p-3 ${indexMode === 'generated' ? 'border-main-300 bg-main-50' : 'border-neutral-200 bg-white'}`}>
              <div className="flex items-start gap-2">
                <input
                  type="radio"
                  name="okf-index-mode"
                  checked={indexMode === 'generated'}
                  onChange={() => setIndexMode('generated')}
                  disabled={isSaving || isInitialLoading}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-medium text-neutral-800">Generated index</div>
                  <div className="text-xs text-neutral-600">
                    Creates a minimal OKF index that links to the initial page. Source pages named index.md are renamed in the export.
                  </div>
                </div>
              </div>
            </label>

            <label className={`rounded border p-3 ${indexMode === 'trackedPage' ? 'border-main-300 bg-main-50' : 'border-neutral-200 bg-white'}`}>
              <div className="flex items-start gap-2">
                <input
                  type="radio"
                  name="okf-index-mode"
                  checked={indexMode === 'trackedPage'}
                  onChange={() => setIndexMode('trackedPage')}
                  disabled={isSaving || isInitialLoading}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-neutral-800">Use a tracked page as index.md</div>
                  <div className="text-xs text-neutral-600">Only pages currently in this site&apos;s working graph are available.</div>
                  {indexMode === 'trackedPage' ? (
                    <PagePicker
                      inputId="okf-index-page-search"
                      label="Search tracked pages for OKF index.md"
                      selectedPrefix="Selected index.md source"
                      selectedPage={indexSelectedPage}
                      query={indexQuery}
                      pages={indexPages}
                      totalCount={indexTotalCount}
                      isLoading={isInitialLoading || isIndexLoading}
                      isSaving={isSaving}
                      onQueryChange={setIndexQuery}
                      onSelect={setIndexSelectedPage}
                    />
                  ) : null}
                </div>
              </div>
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-neutral-900">Root log.md</h3>
          <div className="grid gap-2">
            <label className={`rounded border p-3 ${logMode === 'auto' ? 'border-main-300 bg-main-50' : 'border-neutral-200 bg-white'}`}>
              <div className="flex items-start gap-2">
                <input
                  type="radio"
                  name="okf-log-mode"
                  checked={logMode === 'auto'}
                  onChange={() => {
                    setLogMode('auto');
                    setLogSelectedPage(logDefaultPage);
                  }}
                  disabled={isSaving || isInitialLoading}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-medium text-neutral-800">Automatic</div>
                  <div className="text-xs text-neutral-600">
                    {logDefaultPage
                      ? `Uses ${pageLabel(logDefaultPage)} when OKF is generated.`
                      : 'No reachable log.md page was found; OKF will not include a log.md unless you choose one.'}
                  </div>
                </div>
              </div>
            </label>

            <label className={`rounded border p-3 ${logMode === 'trackedPage' ? 'border-main-300 bg-main-50' : 'border-neutral-200 bg-white'}`}>
              <div className="flex items-start gap-2">
                <input
                  type="radio"
                  name="okf-log-mode"
                  checked={logMode === 'trackedPage'}
                  onChange={() => {
                    setLogMode('trackedPage');
                    setLogSelectedPage(current => current ?? logDefaultPage);
                  }}
                  disabled={isSaving || isInitialLoading}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-neutral-800">Use a tracked page as log.md</div>
                  <div className="text-xs text-neutral-600">Only pages currently in this site&apos;s working graph are available.</div>
                  {logMode === 'trackedPage' ? (
                    <PagePicker
                      inputId="okf-log-page-search"
                      label="Search tracked pages for OKF log.md"
                      selectedPrefix="Selected log.md source"
                      selectedPage={logSelectedPage}
                      query={logQuery}
                      pages={logPages}
                      totalCount={logTotalCount}
                      isLoading={isInitialLoading || isLogLoading}
                      isSaving={isSaving}
                      onQueryChange={setLogQuery}
                      onSelect={setLogSelectedPage}
                    />
                  ) : null}
                </div>
              </div>
            </label>

            <label className={`rounded border p-3 ${logMode === 'none' ? 'border-main-300 bg-main-50' : 'border-neutral-200 bg-white'}`}>
              <div className="flex items-start gap-2">
                <input
                  type="radio"
                  name="okf-log-mode"
                  checked={logMode === 'none'}
                  onChange={() => setLogMode('none')}
                  disabled={isSaving || isInitialLoading}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-medium text-neutral-800">Do not include log.md</div>
                  <div className="text-xs text-neutral-600">Reserved source pages named log.md will be renamed in the OKF export.</div>
                </div>
              </div>
            </label>
          </div>
        </section>

        <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSaving || isInitialLoading || !canConfirm}
            className="rounded bg-btn-confirm-normal px-4 py-2 text-sm text-btn-confirm-text hover:bg-btn-confirm-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default OpenKnowledgeFormatSettingsModal;
