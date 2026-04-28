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
import Modal from './Modal';
import { API_BASE_URL } from '../utils/apiConfig';

interface SiteLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSiteGuidFilter?: string | null;
}

const SiteLogsModal: React.FC<SiteLogsModalProps> = ({ isOpen, onClose, initialSiteGuidFilter }) => {
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [draftFilter, setDraftFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');

  const pollingRef = useRef<number | null>(null);
  // Use refs so fetchLogs always reads current values at call time,
  // avoiding stale-closure issues with the polling interval.
  const nextSinceBytesRef = useRef(0);
  const activeFilterRef = useRef('');

  // Initialize filter when opened (runs before polling effect)
  useEffect(() => {
    if (!isOpen) return;
    const initial = (initialSiteGuidFilter || '').trim();
    setDraftFilter(initial);
    setActiveFilter(initial);
    activeFilterRef.current = initial;
    nextSinceBytesRef.current = 0;
    setLines([]);
    setError(null);
  }, [isOpen, initialSiteGuidFilter]);

  const fetchLogs = useCallback(async () => {
    if (!isOpen) return;
    const filter = activeFilterRef.current;
    try {
      const params = new URLSearchParams();
      params.set('sinceBytes', String(nextSinceBytesRef.current));
      params.set('limitLines', '1000');
      if (filter.trim()) params.set('siteFilter', filter.trim());

      const response = await fetch(`${API_BASE_URL}/logs?${params.toString()}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Failed to load logs (${response.status})`);
      }

      const data = await response.json() as { lines: string[]; nextSinceBytes: number; droppedLines?: number; truncated?: boolean };

      // Discard stale response if filter changed while fetch was in-flight
      if (activeFilterRef.current !== filter) return;

      const incoming = Array.isArray(data.lines) ? data.lines : [];

      if (incoming.length > 0) {
        setLines(prev => {
          const merged = [...prev, ...incoming];
          return merged.slice(-2000);
        });
      }

      if (typeof data.nextSinceBytes === 'number') {
        nextSinceBytesRef.current = data.nextSinceBytes;
      }
    } catch (e) {
      if (activeFilterRef.current !== filter) return;
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [isOpen]);

  // Poll while open
  useEffect(() => {
    if (!isOpen) return;
    void fetchLogs();

    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
    }
    pollingRef.current = window.setInterval(() => {
      void fetchLogs();
    }, 1000);

    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isOpen, fetchLogs]);

  const resetAndApply = (filter: string) => {
    setActiveFilter(filter);
    activeFilterRef.current = filter;
    nextSinceBytesRef.current = 0;
    setLines([]);
    setError(null);
  };

  const applyFilter = () => resetAndApply(draftFilter.trim());
  const clearFilter = () => {
    setDraftFilter('');
    resetAndApply('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Site logs"
      className="w-4/5 max-w-5xl max-h-[85vh]"
    >
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-end gap-2 mb-3">
          <div className="flex flex-col">
            <label className="text-xs text-neutral-600">Site filter (optional)</label>
            <input
              value={draftFilter}
              onChange={(e) => setDraftFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyFilter();
              }}
              className="border border-neutral-300 rounded px-2 py-1 text-sm w-60 font-mono"
              placeholder="e.g. [site a1b2c3d]"
            />
          </div>
          <button
            className="px-3 py-1.5 text-sm rounded bg-btn-standard-normal hover:bg-btn-standard-hover text-btn-standard-text"
            onClick={applyFilter}
          >
            Apply
          </button>
          <button
            className="px-3 py-1.5 text-sm rounded border border-neutral-300 hover:bg-neutral-50"
            onClick={clearFilter}
            disabled={!activeFilter}
          >
            Clear filter
          </button>
          <div className="ml-auto text-xs text-neutral-500">
            Showing {lines.length} lines{activeFilter ? ` for ${activeFilter}` : ''}
          </div>
        </div>

        {error && (
          <div className="mb-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto border border-neutral-200 rounded bg-neutral-50">
          <div className="p-3 space-y-1 font-mono text-xs">
            {lines.length === 0 ? (
              <div className="text-neutral-500">No logs yet.</div>
            ) : (
              lines.map((line, idx) => (
                <div key={`${idx}-${line.slice(0, 32)}`} className="text-neutral-800">
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default SiteLogsModal;


