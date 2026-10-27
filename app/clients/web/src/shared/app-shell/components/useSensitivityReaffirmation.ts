/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../utils/apiClient';
import { logger } from '../../utils/logger';

/**
 * Count the tracked pages that became sensitive since they were tracked, and
 * ask for their review on a bundle's first visit or when its filter policy changes.
 */
export function useSensitivityReaffirmation({ slug, enabled, sourcingOpen, onPolicyChanged }: {
  slug: string | undefined;
  enabled: boolean;
  sourcingOpen: boolean;
  onPolicyChanged: () => void;
}) {
  const [sensitivityReviewTrigger, setSensitivityReviewTrigger] = useState(0);
  const [sensitivityCount, setSensitivityCount] = useState(0);
  const assessedSlug = useRef<string>();
  useEffect(() => {
    if (!slug || !enabled) return;
    const controller = new AbortController();
    // Navigation cancels the request; treat that like unmounting rather than a failed check.
    const abort = () => controller.abort();
    window.addEventListener('pagehide', abort);
    const assess = async (openReview: boolean) => {
      try {
        const response = await apiRequest(`bundles/${encodeURIComponent(slug)}/curation/changes-since-tracking`, { signal: controller.signal });
        if (!response.ok || controller.signal.aborted) return;
        const result = await response.json() as { reviewRequest?: { findings: Array<{ code: string }> } | null };
        if (controller.signal.aborted) return;
        const count = result.reviewRequest?.findings.filter(finding => finding.code === 'sensitivity-reaffirmation-required').length ?? 0;
        setSensitivityCount(count);
        if (count && openReview && !sourcingOpen) setSensitivityReviewTrigger(value => value + 1);
      } catch (error) {
        if (!controller.signal.aborted) logger.error('Could not assess changes since tracking', error);
      }
    };
    const firstVisit = assessedSlug.current !== slug;
    assessedSlug.current = slug;
    void assess(firstVisit);
    const policyChanged = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== slug) return;
      onPolicyChanged();
      void assess(true);
    };
    const completed = (event: Event) => { if ((event as CustomEvent<string>).detail === slug) void assess(true); };
    window.addEventListener('command-filter-completed', completed);
    window.addEventListener('meadow-filter-policy-changed', policyChanged);
    return () => {
      controller.abort();
      window.removeEventListener('pagehide', abort);
      window.removeEventListener('command-filter-completed', completed);
      window.removeEventListener('meadow-filter-policy-changed', policyChanged);
    };
  }, [slug, enabled, sourcingOpen, onPolicyChanged]);
  return { sensitivityCount, sensitivityReviewTrigger, setSensitivityReviewTrigger };
}
