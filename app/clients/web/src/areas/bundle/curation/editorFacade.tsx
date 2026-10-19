/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import React, { useMemo } from 'react';
import { CurationComponentEditor, useCurationStateFilters, curationQueryCreateUntrackedNodeSelector } from '../shared-sourcing-curation/exported.js';
import type { CurationTypeEditorOperations } from '../shared-sourcing-curation/exported.js';
import { apiRequest } from '../../../shared/utils/apiClient.js';

function useCurationOperations(bundleSlug: string): CurationTypeEditorOperations {
  return useMemo(() => ({ mode: 'curation', request: async (operation, options) => {
    const response = await apiRequest(`bundles/${encodeURIComponent(bundleSlug)}/curation/${operation}`, options);
    if (response.ok && (options?.method === 'POST' || options?.method === 'DELETE') && (operation.startsWith('custom-filters') || operation.startsWith('disabled-global-filters/')))
      window.dispatchEvent(new CustomEvent('meadow-filter-policy-changed', { detail: bundleSlug }));
    return response;
  } }), [bundleSlug]);
}

export function CurationEditor(props: Omit<React.ComponentProps<typeof CurationComponentEditor>, 'operations'>) {
  const operations = useCurationOperations(props.bundleSlug);
  return <CurationComponentEditor {...props} operations={operations} />;
}

export function useFilterState(bundleSlug: string) {
  const operations = useCurationOperations(bundleSlug);
  return useCurationStateFilters(bundleSlug, operations.request);
}

export function createUntrackedNodeSelector() { return curationQueryCreateUntrackedNodeSelector(); }
