/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SourcingReview } from '../../../../../../../contracts/types/sourcing.js';
import { apiRequest } from '../../../../shared/utils/apiClient.js';

export function useSourceStatus(bundleSlug: string, onPendingChanges?: (pending: boolean) => void) {
  const [review, setReview] = useState<SourcingReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [background, setBackground] = useState(false);
  const [noChanges, setNoChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ slug: string; foreground: boolean; minimumUntil: number }>();
  const activeSlug = useRef(bundleSlug);
  activeSlug.current = bundleSlug;
  useEffect(() => { setReview(null); setNoChanges(false); setError(null); }, [bundleSlug]);
  const scan = useCallback(async (quiet = false, rebuildIndex = false, manual = false) => {
    if (request.current?.slug === bundleSlug) {
      if (!quiet) {
        request.current.foreground = true;
        request.current.minimumUntil = Math.max(request.current.minimumUntil, Date.now() + (manual ? 125 : 0));
        setBusy(true); setBackground(false);
      }
      return;
    }
    const operation = { slug: bundleSlug, foreground: !quiet, minimumUntil: Date.now() + (manual ? 125 : 0) };
    request.current = operation;
    if (quiet) setBackground(true); else { setBusy(true); setNoChanges(false); }
    setError(null);
    try {
      const response = await apiRequest(`bundles/${encodeURIComponent(bundleSlug)}/sourcing/scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ replaceCandidate: true, ...(rebuildIndex && { rebuildIndex: true }) }),
      });
      const value = await response.json() as SourcingReview & { error?: string };
      if (!response.ok) throw new Error(value.error ?? 'Source update failed');
      const remaining = operation.minimumUntil - Date.now();
      if (remaining > 0) await new Promise(resolve => window.setTimeout(resolve, remaining));
      if (activeSlug.current !== bundleSlug || request.current !== operation) return;
      setReview(value); onPendingChanges?.(Boolean(value.candidate || value.orphans.length));
      setNoChanges(operation.foreground && !value.candidate && !value.orphans.length);
    } catch (err) { if (activeSlug.current === bundleSlug && request.current === operation) setError(String(err)); }
    finally {
      if (activeSlug.current === bundleSlug && request.current === operation) { request.current = undefined; setBusy(false); setBackground(false); }
    }
  }, [bundleSlug, onPendingChanges]);
  useEffect(() => {
    if (!noChanges) return;
    const timer = window.setTimeout(() => setNoChanges(false), 2000);
    return () => window.clearTimeout(timer);
  }, [noChanges]);
  return { review, busy, setBusy, background, noChanges, error, setError, scan };
}
