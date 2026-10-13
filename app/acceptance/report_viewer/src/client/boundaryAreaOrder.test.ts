/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { expect, test } from 'vitest';
import { compareBoundaryAreas } from './boundaryAreaOrder';

test('finishes each workflow area and its combinations before moving to the next area', () => {
  const entry = (name: string, areas: string[]) => ({ name, id: name, file: '', areaIds: areas.map(area => `bundle/${area}`) });
  const entries = [
    entry('Curation through Review', ['curation', 'generation', 'review']),
    entry('Sourcing and Generation', ['generation', 'sourcing']),
    entry('Review', ['review']),
    entry('Sourcing through Generation', ['generation', 'sourcing', 'curation']),
    entry('Curation', ['curation']),
    entry('Sourcing and Curation', ['curation', 'sourcing']),
    entry('Sourcing', ['sourcing']),
    entry('Sourcing and Sharing', ['sourcing', 'sharing']),
  ];
  expect(entries.sort(compareBoundaryAreas).map(entry => entry.name)).toEqual([
    'Sourcing', 'Sourcing and Curation', 'Sourcing through Generation', 'Sourcing and Generation',
    'Sourcing and Sharing', 'Curation', 'Curation through Review', 'Review',
  ]);
});

test('additional participants do not change lane ordering and equal combinations sort by name', () => {
  const entries = [
    { id: 'z', name: 'Zebra', file: '', areaIds: ['bundles', 'bundle/curation', 'bundle/sourcing'] },
    { id: 'a', name: 'Alpha', file: '', areaIds: ['bundle/sourcing', 'bundle/curation', 'appShell'] },
  ];
  expect(entries.sort(compareBoundaryAreas).map(entry => entry.name)).toEqual(['Alpha', 'Zebra']);
});
