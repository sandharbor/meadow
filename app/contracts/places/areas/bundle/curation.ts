/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { PlaceOwnerDefinition } from '../../types.js';

const node = { name: 'node', description: 'Source locator of the page the dialog describes', required: true } as const;

export const curationPlaces: PlaceOwnerDefinition = {
  owner: 'curation',
  surfaces: [
    { surface: 'node-links', page: 'bundle', title: 'Page links', dialogName: /^Links: /, history: false, parameters: [node] },
    { surface: 'traversal-details', page: 'bundle', title: 'Traversal path', dialogName: 'Traversal Path', history: false, parameters: [node] },
    {
      surface: 'custom-filter',
      page: 'bundle',
      title: 'Custom filter',
      dialogName: /^(Create|Edit) Custom Filter$/,
      history: false,
      parameters: [{ name: 'filter', description: 'Custom filter ID to edit; omitted to create one' }],
    },
    { surface: 'filter-mix', page: 'bundle', title: 'Mix the filters', dialogName: 'Mix the filters', history: false, parameters: [] },
    { surface: 'copy-selection', page: 'bundle', title: 'Copy selected pages', dialogName: 'Copy Selected Pages', history: false, parameters: [] },
  ],
  transients: [
    { dialogName: 'Heads Up', reason: 'A one-time consent shown the first time a page is marked sensitive.' },
    { dialogName: 'Tracking added pages', reason: 'A report shown right after accepting source changes.' },
  ],
};
