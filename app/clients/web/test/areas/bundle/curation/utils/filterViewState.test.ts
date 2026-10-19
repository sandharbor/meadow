/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { beforeEach, describe, expect, it } from 'vitest';
import { restoreFilterViews, saveFilterViews } from '../../../../../src/areas/bundle/shared-sourcing-curation/utils/filterViewState.js';
import type { IFilter } from '../../../../../src/areas/bundle/shared-sourcing-curation/types/filters.js';

beforeEach(() => localStorage.clear());

describe('custom filter definition edits', () => {
  it('uses saved action edits while preserving solo and temporary title display', () => {
    const filter: IFilter = { id: 'custom-private', name: 'Private', bundleNodeSelectors: [], selectorApplicationCriteria: 'union',
      actions: [{ type: 'mark_sensitive' }], enabled: true, isSolo: true, isHidden: false };
    saveFilterViews('bundle', 'curation', [{ ...filter, actions: [...filter.actions, { type: 'show_titles' }] }]);
    const edited: IFilter = { ...filter, name: 'Renamed private', isSolo: false,
      actions: [...filter.actions, { type: 'highlight', color: '#FFD700', isDashed: false }] };
    const [restored] = restoreFilterViews('bundle', 'curation', [edited]);
    expect(restored.isSolo).toBe(true);
    expect(restored.name).toBe('Renamed private');
    expect(restored.actions).toEqual([...edited.actions, { type: 'show_titles' }]);
    saveFilterViews('bundle', 'curation', [restored]);
    const [removed] = restoreFilterViews('bundle', 'curation', [{ ...edited, actions: [] }]);
    expect(removed.actions).toEqual([{ type: 'show_titles' }]);
  });
});
