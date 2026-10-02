/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useState } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useFilterState, type IFilter } from '../../../../../src/areas/bundle/shared-sourcing-curation/types/filters.js';
import { saveFilterViews } from '../../../../../src/areas/bundle/shared-sourcing-curation/utils/filterViewState.js';
import { useEditorSelectionView } from '../../../../../src/areas/bundle/shared-sourcing-curation/utils/useEditorSelectionView.js';
import { readEditorView, writeEditorView } from '../../../../../src/shared/utils/editorViewStorage.js';
import { testKey } from '../../../../shared/nodeKeys.js';
import type { EncodedBundleNodeKey } from '../../../../../../../contracts/types/bundleNodeKey.js';

const contextFilter = (): IFilter => ({ id: 'source-unchanged', group: 'source-changes', name: 'Unchanged', actions: [{ type: 'fade' }], enabled: true, isSolo: false, isHidden: false,
  bundleNodeSelectors: [], selectorApplicationCriteria: 'union' });
const request = async () => new globalThis.Response(JSON.stringify({ filters: [] }));

describe('Editor view restoration', () => {
  it('restores source filters before the asynchronous configuration load without resetting their saved choices', async () => {
    saveFilterViews('garden', 'sourcing', [{ ...contextFilter(), enabled: false, actions: [], isSolo: true }]);
    const { result, rerender, unmount } = renderHook(({ ready }) => useFilterState('garden', request, 'sourcing', {
      ready, additionalFilters: () => [contextFilter()],
    }), { initialProps: { ready: false } });
    expect(result.current[0].find(filter => filter.id === 'source-unchanged')).toMatchObject({ enabled: true, actions: [{ type: 'fade' }], isSolo: true });
    rerender({ ready: true });
    await waitFor(() => expect(result.current[0].find(filter => filter.id === 'source-unchanged')).toMatchObject({ enabled: true, actions: [{ type: 'fade' }], isSolo: true }));
    act(() => result.current[1](filters => filters.map(filter => filter.id === 'source-unchanged' ? { ...filter, enabled: true, isSolo: false, isHidden: true } : filter)));
    unmount();
    const reopened = renderHook(() => useFilterState('garden', request, 'sourcing', { additionalFilters: () => [contextFilter()] }));
    expect(reopened.result.current[0].find(filter => filter.id === 'source-unchanged')).toMatchObject({ enabled: true, isSolo: false, isHidden: true, actions: [{ type: 'fade' }] });
    expect(readEditorView('garden', 'curation', 'filters', null)).toBeNull();
  });

  it('retains a collapsed sourcing selection and saves later choices without changing the curation selection', async () => {
    const accepted = { selected: [testKey('Accepted.md')], collapsed: false };
    const proposed = { selected: [testKey('Proposed.md')], collapsed: true };
    writeEditorView('garden', 'curation', 'selection', accepted);
    writeEditorView('garden', 'sourcing', 'selection', proposed);
    const { result } = renderHook(() => {
      const [selected, select] = useState(new Set<EncodedBundleNodeKey>());
      const [collapsed, collapse] = useState(false);
      useEditorSelectionView({ bundleSlug: 'garden', mode: 'sourcing', selected, collapsed, select, collapse });
      return { selected, collapsed, select, collapse };
    });
    await waitFor(() => expect([...result.current.selected]).toEqual(proposed.selected));
    expect(result.current.collapsed).toBe(true);
    act(() => { result.current.select(new Set([testKey('Next.md')])); result.current.collapse(false); });
    expect(readEditorView('garden', 'sourcing', 'selection', null)).toEqual({ selected: [testKey('Next.md')], collapsed: false });
    expect(readEditorView('garden', 'curation', 'selection', null)).toEqual(accepted);
  });
});
